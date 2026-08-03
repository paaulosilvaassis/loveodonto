import { getEmailConfig, getInviteRedirectTo } from './emailConfig.js';
import { emailAudit } from './emailAuditLog.js';
import { findAuthUserByEmail, isUserAlreadyRegisteredError } from './accessEmailHelpers.js';
import { generatePasswordSetupLink, sendUserInviteEmail } from './sendUserInviteEmail.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function tryInviteUserByEmail(supabase, email, { redirectTo, metadata }) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo,
  });
  emailAudit('resposta Supabase inviteUserByEmail', {
    email,
    ok: !error,
    userId: data?.user?.id || null,
    invitedAt: data?.user?.invited_at || null,
    error: error?.message || null,
  });
  return { data, error };
}

/**
 * Envia e-mail de primeiro acesso do responsável master.
 * 1) Resend/transacional (EMAIL_API_KEY) — entrega confiável
 * 2) inviteUserByEmail (Supabase Auth SMTP)
 * 3) generateLink — retorna setupLink para a Console copiar manualmente
 */
export async function sendClinicOwnerAccessEmail(supabase, {
  tenantId,
  email,
  fullName,
  roleSlug = 'master',
  allowInvite = true,
  /** Quando true, força recovery/magiclink (Auth já existe; convite expirado). */
  preferRecovery = false,
  redirectTo: redirectToOverride = null,
}) {
  const normalizedEmail = normalizeEmail(email);
  const redirectTo = String(redirectToOverride || '').trim() || getInviteRedirectTo();
  const metadata = {
    tenant_id: tenantId,
    role: roleSlug,
    full_name: fullName,
  };
  const resendConfigured = getEmailConfig().isConfigured;
  const forceRecovery = Boolean(preferRecovery) || !allowInvite;

  emailAudit('enviando convite', {
    email: normalizedEmail,
    tenantId,
    redirectTo,
    allowInvite,
    preferRecovery: forceRecovery,
    resendConfigured,
  });

  let inviteFailedBecauseExists = false;

  // Caminho prioritário: Resend/transacional com link invite OU recovery.
  if (resendConfigured) {
    emailAudit('envio prioritário via transacional (Resend)', { email: normalizedEmail });
    let existingUser = forceRecovery;
    if (!existingUser && allowInvite) {
      const existing = await findAuthUserByEmail(supabase, normalizedEmail);
      if (existing?.id) existingUser = true;
    }

    const setupLink = await generatePasswordSetupLink(supabase, {
      email: normalizedEmail,
      redirectTo,
      data: metadata,
      existingUser,
    });

    const delivery = await sendUserInviteEmail(supabase, {
      tenantId,
      email: normalizedEmail,
      userName: fullName || normalizedEmail,
      profileRole: roleSlug,
      setupLink,
    });

    const authUser = await findAuthUserByEmail(supabase, normalizedEmail);

    emailAudit('resposta transacional', {
      email: normalizedEmail,
      provider: delivery.provider,
      messageId: delivery.messageId,
      authUserId: authUser?.id || null,
      existingUser,
    });

    return {
      emailDelivery: 'backend_resend',
      accessEmailSent: true,
      authUserId: authUser?.id || null,
      setupLink,
      sent: true,
      provider: delivery.provider,
      messageId: delivery.messageId,
    };
  }

  // Sem Resend: invite só se Auth ainda não existe e não pedimos recovery.
  if (allowInvite && !forceRecovery) {
    let { data: inviteData, error: inviteError } = await tryInviteUserByEmail(
      supabase,
      normalizedEmail,
      { redirectTo, metadata },
    );

    if (inviteError && isUserAlreadyRegisteredError(inviteError)) {
      // Não apaga usuário com last_sign_in — cai no generateLink recovery abaixo.
      inviteFailedBecauseExists = true;
      emailAudit('inviteUserByEmail: usuário já existe — fallback recovery', {
        email: normalizedEmail,
        error: inviteError.message,
      });
    } else if (!inviteError && inviteData?.user?.id) {
      return {
        emailDelivery: 'supabase_auth',
        accessEmailSent: true,
        authUserId: inviteData.user.id,
        setupLink: null,
        sent: true,
      };
    } else if (inviteError) {
      throw inviteError;
    }
  }

  const existingUser = forceRecovery || inviteFailedBecauseExists || !allowInvite;

  // Sem Resend: para Auth existente, dispara recovery pelo SMTP do Supabase Auth
  // (resetPasswordForEmail envia o e-mail; generateLink sozinho não envia).
  if (existingUser) {
    emailAudit('enviando recovery via Supabase Auth SMTP', {
      email: normalizedEmail,
      redirectTo,
    });
    const { error: recoverError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });
    const authUser = await findAuthUserByEmail(supabase, normalizedEmail);
    if (!recoverError) {
      emailAudit('recovery enviado via Supabase Auth', {
        email: normalizedEmail,
        authUserId: authUser?.id || null,
      });
      return {
        emailDelivery: 'supabase_auth_recovery',
        accessEmailSent: true,
        authUserId: authUser?.id || null,
        setupLink: null,
        sent: true,
        message: `Novo e-mail de acesso enviado com sucesso para ${normalizedEmail}.`,
      };
    }
    emailAudit('recovery Supabase Auth falhou — fallback generateLink', {
      email: normalizedEmail,
      error: recoverError.message,
    });
  }

  emailAudit('fallback generateLink', {
    email: normalizedEmail,
    existingUser,
    forceRecovery,
  });

  const setupLink = await generatePasswordSetupLink(supabase, {
    email: normalizedEmail,
    redirectTo,
    data: metadata,
    existingUser: true,
  });

  const authUser = await findAuthUserByEmail(supabase, normalizedEmail);

  emailAudit('link gerado sem envio automático', {
    email: normalizedEmail,
    reason: 'SMTP/Resend e recovery Auth indisponíveis — link operacional gerado',
    setupLinkGenerated: Boolean(setupLink),
    authUserId: authUser?.id || null,
  });

  return {
    emailDelivery: 'setup_link',
    accessEmailSent: false,
    authUserId: authUser?.id || null,
    setupLink,
    sent: false,
    message:
      'Não foi possível enviar o e-mail automaticamente. '
      + 'Verifique o SMTP do Supabase Auth ou configure EMAIL_API_KEY (Resend).',
  };
}
