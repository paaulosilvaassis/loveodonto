import { getEmailConfig, getInviteRedirectTo } from './emailConfig.js';
import { emailAudit } from './emailAuditLog.js';
import { findAuthUserByEmail, isUserAlreadyRegisteredError, reinviteStaleAuthUser } from './accessEmailHelpers.js';
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
}) {
  const normalizedEmail = normalizeEmail(email);
  const redirectTo = getInviteRedirectTo();
  const metadata = {
    tenant_id: tenantId,
    role: roleSlug,
    full_name: fullName,
  };
  const resendConfigured = getEmailConfig().isConfigured;

  emailAudit('enviando convite', {
    email: normalizedEmail,
    tenantId,
    redirectTo,
    allowInvite,
    resendConfigured,
  });

  let inviteFailedBecauseExists = false;

  if (resendConfigured) {
    emailAudit('envio prioritário via transacional (Resend)', { email: normalizedEmail });
    let existingUser = !allowInvite;
    if (allowInvite) {
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

  if (allowInvite) {
    let { data: inviteData, error: inviteError } = await tryInviteUserByEmail(
      supabase,
      normalizedEmail,
      { redirectTo, metadata },
    );

    if (inviteError && isUserAlreadyRegisteredError(inviteError)) {
      await reinviteStaleAuthUser(supabase, normalizedEmail);
      ({ data: inviteData, error: inviteError } = await tryInviteUserByEmail(
        supabase,
        normalizedEmail,
        { redirectTo, metadata },
      ));
    }

    if (!inviteError && inviteData?.user?.id) {
      return {
        emailDelivery: 'supabase_auth',
        accessEmailSent: true,
        authUserId: inviteData.user.id,
        setupLink: null,
        sent: true,
      };
    }

    if (inviteError && isUserAlreadyRegisteredError(inviteError)) {
      inviteFailedBecauseExists = true;
    } else if (inviteError) {
      throw inviteError;
    }
  } else if (inviteFailedBecauseExists === false) {
    const existing = await findAuthUserByEmail(supabase, normalizedEmail);
    if (existing?.id && !existing.invited_at && !existing.last_sign_in_at) {
      await reinviteStaleAuthUser(supabase, normalizedEmail);
      const { data: inviteData, error: inviteError } = await tryInviteUserByEmail(
        supabase,
        normalizedEmail,
        { redirectTo, metadata },
      );
      if (!inviteError && inviteData?.user?.id) {
        return {
          emailDelivery: 'supabase_auth',
          accessEmailSent: true,
          authUserId: inviteData.user.id,
          setupLink: null,
          sent: true,
        };
      }
      if (inviteError && !isUserAlreadyRegisteredError(inviteError)) throw inviteError;
      inviteFailedBecauseExists = true;
    }
  }

  const existingUser = !allowInvite || inviteFailedBecauseExists;
  emailAudit('fallback generateLink sem transacional', {
    email: normalizedEmail,
    existingUser,
  });

  const setupLink = await generatePasswordSetupLink(supabase, {
    email: normalizedEmail,
    redirectTo,
    data: metadata,
    existingUser,
  });

  const authUser = await findAuthUserByEmail(supabase, normalizedEmail);

  emailAudit('link gerado sem envio automático', {
    email: normalizedEmail,
    reason: 'Convite Supabase indisponível ou usuário já existente — use reenvio ou link manual',
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
      'E-mail não enviado automaticamente. Use "Enviar acesso master" na Console ou copie o link abaixo.',
  };
}
