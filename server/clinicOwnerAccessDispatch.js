import { getEmailConfig } from './email/emailConfig.js';
import { emailAudit } from './email/emailAuditLog.js';
import { sendClinicOwnerAccessEmail } from './email/sendClinicOwnerAccessEmail.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function findAuthUserByEmail(supabase, email) {
  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((user) => normalizeEmail(user?.email) === target);
    if (match) return match;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function syncAuthUserAppMetadata(supabase, authUserId, { tenantId, roleSlug, fullName }) {
  await supabase.auth.admin.updateUserById(authUserId, {
    app_metadata: {
      tenant_id: tenantId,
      role: roleSlug,
    },
    user_metadata: {
      full_name: fullName,
    },
  });
}

async function linkTenantUser(supabase, {
  tenantId,
  authUserId,
  email,
  fullName,
  roleSlug = 'master',
  cpf = '',
  phone = '',
}) {
  const normalizedEmail = normalizeEmail(email);
  const tenantUserPayload = {
    tenant_id: tenantId,
    email: normalizedEmail,
    full_name: fullName,
    user_id: authUserId,
    role: roleSlug,
    role_slug: roleSlug,
    is_active: true,
    status: 'active',
    ...(cpf ? { cpf } : {}),
    ...(phone ? { phone } : {}),
  };

  const { data: existingTenantUser, error: existingTenantUserError } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (existingTenantUserError) throw existingTenantUserError;

  let tenantUserQuery;
  if (existingTenantUser?.id) {
    tenantUserQuery = supabase
      .from('tenant_users')
      .update(tenantUserPayload)
      .eq('id', existingTenantUser.id);
  } else {
    tenantUserQuery = supabase
      .from('tenant_users')
      .insert(tenantUserPayload);
  }

  const { data: tenantUser, error: tenantUserError } = await tenantUserQuery
    .select('id, tenant_id, user_id, email, full_name, role, role_slug, is_active, status')
    .single();
  if (tenantUserError) throw tenantUserError;
  if (!tenantUser?.user_id) {
    throw new Error('Falha crítica: tenant_users persistido sem user_id.');
  }

  console.log('[ProvisionUser] tenant_users atualizado com user_id', {
    tenantUserId: tenantUser.id,
    userId: tenantUser.user_id,
    tenantId,
  });

  return tenantUser;
}

async function createAuthUserWithPassword(supabase, {
  email,
  password,
  fullName,
  tenantId,
  roleSlug = 'master',
  cpf = '',
  phone = '',
}) {
  const normalizedEmail = normalizeEmail(email);
  emailAudit('criando usuário com senha explícita (createUser — não envia e-mail)', {
    email: normalizedEmail,
    tenantId,
  });

  const { data: authCreateData, error: authCreateError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { tenant_id: tenantId, role: roleSlug },
  });
  if (authCreateError || !authCreateData?.user?.id) {
    emailAudit('erro completo', { step: 'createUser', error: authCreateError || 'sem user id' });
    throw authCreateError || new Error('Falha ao criar usuário no Supabase Auth.');
  }

  const authUserId = authCreateData.user.id;
  emailAudit('usuário criado', {
    authUserId,
    email: normalizedEmail,
    method: 'createUser',
    invitedAt: authCreateData.user.invited_at || null,
  });

  await syncAuthUserAppMetadata(supabase, authUserId, { tenantId, roleSlug, fullName });

  const tenantUser = await linkTenantUser(supabase, {
    tenantId,
    authUserId,
    email: normalizedEmail,
    fullName,
    roleSlug,
    cpf,
    phone,
  });

  return {
    authUserId,
    tenantUser,
    emailDelivery: 'password_set',
    accessEmailSent: false,
    setupLink: null,
  };
}

export async function provisionClinicOwnerAccess(supabase, {
  email,
  password: _ignoredPassword,
  fullName,
  tenantId,
  roleSlug = 'master',
  cpf = '',
  phone = '',
  passwordWasGenerated: _passwordWasGenerated = false,
}) {
  const normalizedEmail = normalizeEmail(email);

  emailAudit('iniciando provisionamento', {
    email: normalizedEmail,
    tenantId,
    mode: 'invite_email_only',
    resendConfigured: getEmailConfig().isConfigured,
  });

  const emailResult = await sendClinicOwnerAccessEmail(supabase, {
    tenantId,
    email: normalizedEmail,
    fullName,
    roleSlug,
    allowInvite: true,
  });

  let authUserId = emailResult.authUserId || null;
  if (!authUserId) {
    const authUser = await findAuthUserByEmail(supabase, normalizedEmail);
    authUserId = authUser?.id || null;
  }
  if (!authUserId) {
    emailAudit('erro completo', {
      email: normalizedEmail,
      reason: 'Usuário não encontrado após tentativa de convite',
      emailResult,
    });
    throw new Error('Não foi possível criar ou localizar o usuário de acesso no Auth.');
  }

  await syncAuthUserAppMetadata(supabase, authUserId, { tenantId, roleSlug, fullName });

  const tenantUser = await linkTenantUser(supabase, {
    tenantId,
    authUserId,
    email: normalizedEmail,
    fullName,
    roleSlug,
    cpf,
    phone,
  });

  emailAudit('provisionamento acesso concluído', {
    authUserId,
    email: normalizedEmail,
    emailDelivery: emailResult.emailDelivery,
    accessEmailSent: emailResult.accessEmailSent,
    hasSetupLink: Boolean(emailResult.setupLink),
  });

  return {
    authUserId,
    tenantUser,
    emailDelivery: emailResult.emailDelivery,
    accessEmailSent: emailResult.accessEmailSent,
    setupLink: emailResult.setupLink || null,
    message: emailResult.message || null,
  };
}

export async function resendClinicOwnerAccess(supabase, {
  tenantId,
  email,
  fullName,
  roleSlug = 'master',
}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error('E-mail de acesso é obrigatório.');
  if (!tenantId) throw new Error('tenant_id é obrigatório.');

  emailAudit('iniciando reenvio acesso master', { email: normalizedEmail, tenantId });

  const authUser = await findAuthUserByEmail(supabase, normalizedEmail);

  if (!authUser?.id) {
    return provisionClinicOwnerAccess(supabase, {
      email: normalizedEmail,
      password: '',
      fullName,
      tenantId,
      roleSlug,
      passwordWasGenerated: true,
    }).then((result) => ({
      sent: Boolean(result.accessEmailSent),
      setupLink: result.setupLink || null,
      emailDelivery: result.emailDelivery,
      accessEmailSent: Boolean(result.accessEmailSent),
      accessEmail: normalizedEmail,
      authUserId: result.authUserId,
      message: result.message,
    }));
  }

  await syncAuthUserAppMetadata(supabase, authUser.id, { tenantId, roleSlug, fullName });

  const { data: existingTenantUser, error: existingTenantUserError } = await supabase
    .from('tenant_users')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (existingTenantUserError) throw existingTenantUserError;

  if (!existingTenantUser?.id) {
    await linkTenantUser(supabase, {
      tenantId,
      authUserId: authUser.id,
      email: normalizedEmail,
      fullName,
      roleSlug,
    });
  }

  const shouldInvite = !authUser.last_sign_in_at;
  const emailResult = await sendClinicOwnerAccessEmail(supabase, {
    tenantId,
    email: normalizedEmail,
    fullName,
    roleSlug,
    allowInvite: shouldInvite,
  });

  const finalAuthUserId = emailResult.authUserId || authUser.id;
  await syncAuthUserAppMetadata(supabase, finalAuthUserId, { tenantId, roleSlug, fullName });

  if (existingTenantUser?.id && finalAuthUserId) {
    await supabase
      .from('tenant_users')
      .update({
        role: roleSlug,
        role_slug: roleSlug,
        has_system_access: true,
        is_active: true,
        status: 'active',
        user_id: finalAuthUserId,
      })
      .eq('id', existingTenantUser.id);
  }

  return {
    sent: Boolean(emailResult.sent),
    setupLink: emailResult.setupLink || null,
    emailDelivery: emailResult.emailDelivery,
    accessEmailSent: Boolean(emailResult.accessEmailSent),
    accessEmail: normalizedEmail,
    authUserId: finalAuthUserId,
    message: emailResult.message,
  };
}
