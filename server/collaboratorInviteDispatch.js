import { getEmailConfig, getInviteRedirectTo } from './email/emailConfig.js';
import { generatePasswordSetupLink, sendUserInviteEmail } from './email/sendUserInviteEmail.js';
import { sendSupabaseAuthRecoveryEmail } from './email/sendSupabaseAuthEmail.js';
import { logAccessEmailAudit } from './email/accessEmailAudit.js';
import {
  findAuthUserByEmail,
  isUserAlreadyRegisteredError,
  reinviteStaleAuthUser,
} from './email/accessEmailHelpers.js';

async function tryInviteUserByEmail(supabase, email, { redirectTo, metadata }) {
  return supabase.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo,
  });
}

export async function dispatchCollaboratorInvite(supabase, {
  email,
  tenantId,
  role,
  collaboratorId,
  collaboratorName,
  userName,
  profileRole,
}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const redirectTo = getInviteRedirectTo();
  const metadata = {
    tenant_id: tenantId,
    role,
    collaborator_id: collaboratorId || null,
    collaborator_name: collaboratorName || '',
  };
  const auditBase = {
    tenantId,
    collaboratorId,
    email: normalizedEmail,
    requestedAction: 'invite',
  };

  // 1) E-mail transacional (Resend/SendGrid) — entrega mais confiável
  if (getEmailConfig().isConfigured) {
    let authUser = await findAuthUserByEmail(supabase, normalizedEmail);
    if (!authUser?.id) {
      const { error: inviteError } = await tryInviteUserByEmail(supabase, normalizedEmail, {
        redirectTo,
        metadata,
      });
      if (inviteError && !isUserAlreadyRegisteredError(inviteError)) {
        throw inviteError;
      }
      if (inviteError && isUserAlreadyRegisteredError(inviteError)) {
        await reinviteStaleAuthUser(supabase, normalizedEmail);
        await tryInviteUserByEmail(supabase, normalizedEmail, { redirectTo, metadata });
      }
      authUser = await findAuthUserByEmail(supabase, normalizedEmail);
    }

    const setupLink = await generatePasswordSetupLink(supabase, {
      email: normalizedEmail,
      redirectTo,
      data: metadata,
      existingUser: Boolean(authUser?.id),
    });

    await sendUserInviteEmail(supabase, {
      tenantId,
      email: normalizedEmail,
      userName: userName || collaboratorName || normalizedEmail,
      profileRole: profileRole || role,
      setupLink,
    });

    logAccessEmailAudit({
      ...auditBase,
      authUserFound: Boolean(authUser?.id),
      authUserId: authUser?.id || null,
      linkType: 'recovery',
      inviteSent: true,
      emailDelivery: 'backend_resend',
      finalStatus: 'invite_sent',
    });

    return {
      emailDelivery: 'backend_resend',
      user: authUser,
      setupLink: null,
    };
  }

  // 2) Convite Supabase Auth (SMTP configurado no painel Supabase)
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

  if (!inviteError) {
    let user = inviteData?.user || null;
    if (!user?.id) {
      user = await findAuthUserByEmail(supabase, normalizedEmail);
    }
    logAccessEmailAudit({
      ...auditBase,
      authUserFound: Boolean(user?.id),
      authUserId: user?.id || null,
      linkType: 'invite',
      inviteSent: true,
      emailDelivery: 'supabase_auth',
      finalStatus: 'invite_sent',
    });
    return {
      emailDelivery: 'supabase_auth',
      user,
      setupLink: null,
    };
  }

  if (!isUserAlreadyRegisteredError(inviteError)) {
    logAccessEmailAudit({
      ...auditBase,
      inviteSent: false,
      finalStatus: 'invite_failed',
      error: inviteError?.message || String(inviteError),
    });
    throw inviteError;
  }

  // 3) Usuário já existe — recovery via anon key (dispara SMTP Supabase)
  const existingUser = await findAuthUserByEmail(supabase, normalizedEmail);

  try {
    await sendSupabaseAuthRecoveryEmail(supabase, {
      email: normalizedEmail,
      redirectTo,
    });
    logAccessEmailAudit({
      ...auditBase,
      authUserFound: Boolean(existingUser?.id),
      authUserId: existingUser?.id || null,
      linkType: 'supabase_recovery',
      inviteSent: true,
      emailDelivery: 'supabase_auth',
      finalStatus: 'invite_sent',
    });
    return {
      emailDelivery: 'supabase_auth',
      user: existingUser,
      setupLink: null,
    };
  } catch (supabaseEmailErr) {
    const setupLink = await generatePasswordSetupLink(supabase, {
      email: normalizedEmail,
      redirectTo,
      data: metadata,
      existingUser: Boolean(existingUser?.id),
    });

    logAccessEmailAudit({
      ...auditBase,
      authUserFound: Boolean(existingUser?.id),
      authUserId: existingUser?.id || null,
      inviteSent: false,
      emailDelivery: 'setup_link',
      finalStatus: 'setup_link_only',
      error: supabaseEmailErr?.message || String(supabaseEmailErr),
    });

    const err = new Error(
      supabaseEmailErr?.message
      || 'Não foi possível enviar o convite por e-mail. Configure SUPABASE_ANON_KEY e SMTP do Supabase Auth no Railway.',
    );
    err.code = 'INVITE_EMAIL_NOT_SENT';
    err.setupLink = setupLink;
    err.emailDelivery = 'setup_link';
    throw err;
  }
}
