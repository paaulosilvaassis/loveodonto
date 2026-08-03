/**
 * Reenvio explícito de convite/acesso master (Platform Console).
 * - Auth inexistente → convite (invite)
 * - Auth existente → recovery/magiclink (nunca duplica usuário)
 * - Invalida convites anteriores na tabela invitations
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function classifyResendError(err) {
  const message = String(err?.message || err || '');
  const lower = message.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('email_exists')) {
    return {
      code: 'AUTH_USER_EXISTS',
      message: 'Este e-mail já existe no Auth. Foi gerado um novo link de ativação/recuperação (sem duplicar usuário).',
      retryable: true,
    };
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return { code: 'RATE_LIMIT', message: 'Limite de envio atingido. Aguarde alguns minutos e tente novamente.', retryable: true };
  }
  if (lower.includes('smtp') || lower.includes('resend') || lower.includes('email')) {
    return { code: 'SMTP_UNAVAILABLE', message: message || 'Falha no envio de e-mail (SMTP/Resend).', retryable: true };
  }
  if (lower.includes('redirect')) {
    return { code: 'INVALID_REDIRECT', message: message || 'URL de redirect inválida.', retryable: false };
  }
  return { code: 'RESEND_FAILED', message: message || 'Falha ao reenviar acesso.', retryable: false };
}

async function expirePreviousInvitations(supabase, { tenantId, email, tenantUserId }) {
  const nowIso = new Date().toISOString();
  let query = supabase
    .from('invitations')
    .update({
      status: 'expired',
      updated_at: nowIso,
    })
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'sent', 'queued']);

  if (email) query = query.eq('email', email);
  const { error } = await query;
  if (error && !String(error.message || '').includes('invitations')) {
    // coluna/status ausente — não bloqueia reenvio
    console.warn('[resendAccessInvite] expire invitations:', error.message);
  }

  if (tenantUserId) {
    await supabase
      .from('invitations')
      .update({ status: 'expired', updated_at: nowIso })
      .eq('tenant_id', tenantId)
      .eq('tenant_user_id', tenantUserId)
      .in('status', ['pending', 'sent', 'queued']);
  }
}

async function insertSentInvitation(supabase, {
  tenantId,
  tenantUserId,
  email,
  roleSlug,
  createdBy,
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  const row = {
    tenant_id: tenantId,
    tenant_user_id: tenantUserId || null,
    email,
    profile_role: roleSlug || 'master',
    status: 'sent',
    sent_at: now.toISOString(),
    expires_at: expiresAt,
    accepted_at: null,
    created_by: createdBy || null,
    updated_at: now.toISOString(),
  };
  const { data, error } = await supabase.from('invitations').insert(row).select('id, status, sent_at, expires_at').maybeSingle();
  if (error) {
    console.warn('[resendAccessInvite] insert invitation:', error.message);
    return { id: null, status: 'sent', sent_at: row.sent_at, expires_at: expiresAt };
  }
  return data || { id: null, status: 'sent', sent_at: row.sent_at, expires_at: expiresAt };
}

async function updateTenantUserInviteState(supabase, tenantUserId, authUserId) {
  if (!tenantUserId) return;
  const payload = {
    invitation_status: 'sent',
    has_system_access: true,
    is_active: true,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
  if (authUserId) payload.user_id = authUserId;
  const { error } = await supabase.from('tenant_users').update(payload).eq('id', tenantUserId);
  if (error) throw error;
}

/**
 * @param {object} deps
 * @param {import('@supabase/supabase-js').SupabaseClient} deps.supabase
 * @param {Function} deps.sendClinicOwnerAccessEmail
 * @param {Function} deps.provisionClinicOwnerAccess
 * @param {Function} [deps.findAuthUserByEmail]
 */
export async function resendAccessInvite(deps, input) {
  const {
    supabase,
    sendClinicOwnerAccessEmail,
    provisionClinicOwnerAccess,
    findAuthUserByEmail,
  } = deps;

  const tenantId = normalizeText(input.tenantId);
  const email = normalizeEmail(input.email);
  const fullName = normalizeText(input.fullName) || email;
  const roleSlug = normalizeText(input.roleSlug) || 'master';
  const tenantUserId = normalizeText(input.tenantUserId) || null;
  const actorUserId = input.actorUserId || null;
  const redirectTo = normalizeText(input.redirectTo) || null;

  if (!tenantId) {
    const err = new Error('tenantId é obrigatório.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!email) {
    const err = new Error('E-mail de acesso é obrigatório.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, status, trade_name, legal_name, owner_email')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant?.id) {
    const err = new Error('Clínica não encontrada neste projeto Supabase da Admin API.');
    err.code = 'TENANT_NOT_FOUND';
    throw err;
  }
  const tenantStatus = String(tenant.status || '').toLowerCase();
  if (['suspended', 'cancelled', 'canceled', 'blocked'].includes(tenantStatus)) {
    const err = new Error(`Clínica com status "${tenant.status}" — reative antes de reenviar acesso.`);
    err.code = 'TENANT_INACTIVE';
    throw err;
  }

  let tenantUserQuery = supabase
    .from('tenant_users')
    .select('id, tenant_id, user_id, email, full_name, role, role_slug, status, is_active, has_system_access, invitation_status')
    .eq('tenant_id', tenantId);

  if (tenantUserId) {
    tenantUserQuery = tenantUserQuery.eq('id', tenantUserId);
  } else {
    tenantUserQuery = tenantUserQuery.eq('email', email);
  }

  const { data: tenantUser, error: tuError } = await tenantUserQuery.maybeSingle();
  if (tuError) throw tuError;
  if (!tenantUser?.id) {
    const err = new Error('Usuário não pertence a esta clínica (tenant_users).');
    err.code = 'MEMBERSHIP_NOT_FOUND';
    throw err;
  }
  if (normalizeEmail(tenantUser.email) !== email) {
    const err = new Error('E-mail não corresponde ao vínculo tenant_users desta clínica.');
    err.code = 'EMAIL_MISMATCH';
    throw err;
  }

  // Garante que o e-mail não está master em outro tenant
  const { data: otherLinks, error: otherErr } = await supabase
    .from('tenant_users')
    .select('id, tenant_id')
    .eq('email', email)
    .neq('tenant_id', tenantId)
    .limit(5);
  if (otherErr) throw otherErr;
  if ((otherLinks || []).length > 0) {
    const err = new Error('Este e-mail está vinculado a outra clínica. Reenvio bloqueado.');
    err.code = 'OTHER_TENANT_LINK';
    throw err;
  }

  const authUser = findAuthUserByEmail
    ? await findAuthUserByEmail(supabase, email)
    : null;

  await expirePreviousInvitations(supabase, {
    tenantId,
    email,
    tenantUserId: tenantUser.id,
  });

  let emailResult;
  try {
    if (!authUser?.id) {
      emailResult = await provisionClinicOwnerAccess(supabase, {
        email,
        password: '',
        fullName: tenantUser.full_name || fullName,
        tenantId,
        roleSlug: tenantUser.role_slug || tenantUser.role || roleSlug,
        passwordWasGenerated: true,
      });
      emailResult = {
        sent: Boolean(emailResult.accessEmailSent),
        accessEmailSent: Boolean(emailResult.accessEmailSent),
        emailDelivery: emailResult.emailDelivery,
        setupLink: emailResult.setupLink || null,
        authUserId: emailResult.authUserId,
        message: emailResult.message || null,
        strategy: 'invite_new_auth_user',
      };
    } else {
      // Usuário Auth existe (convite expirado, link usado ou ativação incompleta):
      // gera recovery — NÃO cria outro auth.users e NÃO usa inviteUserByEmail.
      emailResult = await sendClinicOwnerAccessEmail(supabase, {
        tenantId,
        email,
        fullName: tenantUser.full_name || fullName,
        roleSlug: tenantUser.role_slug || tenantUser.role || roleSlug,
        allowInvite: false,
        preferRecovery: true,
        redirectTo: redirectTo || undefined,
      });
      emailResult = {
        sent: Boolean(emailResult.sent || emailResult.accessEmailSent),
        accessEmailSent: Boolean(emailResult.accessEmailSent),
        emailDelivery: emailResult.emailDelivery,
        setupLink: emailResult.setupLink || null,
        authUserId: emailResult.authUserId || authUser.id,
        message: emailResult.message || null,
        strategy: 'recovery_existing_auth_user',
      };
    }
  } catch (err) {
    const classified = classifyResendError(err);
    const wrapped = new Error(classified.message);
    wrapped.code = classified.code;
    wrapped.cause = err;
    throw wrapped;
  }

  await updateTenantUserInviteState(
    supabase,
    tenantUser.id,
    emailResult.authUserId || authUser?.id || null,
  );

  const invitation = await insertSentInvitation(supabase, {
    tenantId,
    tenantUserId: tenantUser.id,
    email,
    roleSlug: tenantUser.role_slug || tenantUser.role || roleSlug,
    createdBy: actorUserId,
  });

  return {
    success: true,
    accessEmail: email,
    tenantId,
    tenantUserId: tenantUser.id,
    authUserId: emailResult.authUserId || null,
    strategy: emailResult.strategy,
    emailDelivery: emailResult.emailDelivery,
    accessEmailSent: Boolean(emailResult.accessEmailSent),
    sent: Boolean(emailResult.sent || emailResult.accessEmailSent),
    invitationStatus: 'sent',
    invitationSentAt: invitation.sent_at,
    invitationExpiresAt: invitation.expires_at,
    previousInvitesInvalidated: true,
    // Só devolve link quando o e-mail automático falhou (cópia manual operacional).
    setupLink: emailResult.accessEmailSent ? null : (emailResult.setupLink || null),
    message: emailResult.accessEmailSent
      ? `Novo e-mail de acesso enviado com sucesso para ${email}.`
      : (emailResult.message || 'Link gerado; e-mail automático indisponível.'),
  };
}

export { classifyResendError, INVITE_TTL_MS };
