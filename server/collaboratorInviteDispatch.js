import { getEmailConfig, getInviteRedirectTo } from './email/emailConfig.js';
import { generatePasswordSetupLink, sendUserInviteEmail } from './email/sendUserInviteEmail.js';
import { sendSupabaseAuthRecoveryEmail } from './email/sendSupabaseAuthEmail.js';
import { logAccessEmailAudit } from './email/accessEmailAudit.js';

function isUserAlreadyRegisteredError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    message.includes('already registered')
    || message.includes('already exists')
    || message.includes('user already')
    || message.includes('email address has already been registered')
    || code.includes('email_exists')
    || error?.status === 422
  );
}

async function findAuthUserByEmail(supabase, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((u) => String(u?.email || '').trim().toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
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

  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    normalizedEmail,
    {
      data: metadata,
      redirectTo,
    },
  );

  if (!inviteError) {
    let user = inviteData?.user || null;
    if (!user?.id) {
      user = await findAuthUserByEmail(supabase, normalizedEmail);
    }
    return {
      emailDelivery: 'supabase_auth',
      user,
      setupLink: null,
    };
  }

  if (!isUserAlreadyRegisteredError(inviteError)) {
    throw inviteError;
  }

  const existingUser = await findAuthUserByEmail(supabase, normalizedEmail);
  const setupLink = await generatePasswordSetupLink(supabase, {
    email: normalizedEmail,
    redirectTo,
    data: metadata,
    existingUser: Boolean(existingUser?.id),
  });

  if (getEmailConfig().isConfigured) {
    await sendUserInviteEmail(supabase, {
      tenantId,
      email: normalizedEmail,
      userName: userName || collaboratorName || normalizedEmail,
      profileRole: profileRole || role,
      setupLink,
    });
    logAccessEmailAudit({
      tenantId,
      collaboratorId,
      email: normalizedEmail,
      requestedAction: 'invite_existing_user',
      authUserFound: true,
      authUserId: existingUser?.id || null,
      linkType: 'recovery',
      inviteSent: true,
      emailDelivery: 'backend_resend',
      finalStatus: 'invite_sent',
    });
    return {
      emailDelivery: 'backend_resend',
      user: existingUser,
      setupLink: null,
    };
  }

  try {
    await sendSupabaseAuthRecoveryEmail(supabase, {
      email: normalizedEmail,
      redirectTo,
    });
    logAccessEmailAudit({
      tenantId,
      collaboratorId,
      email: normalizedEmail,
      requestedAction: 'invite_existing_user',
      authUserFound: true,
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
    logAccessEmailAudit({
      tenantId,
      collaboratorId,
      email: normalizedEmail,
      requestedAction: 'invite_existing_user',
      authUserFound: true,
      authUserId: existingUser?.id || null,
      inviteSent: false,
      emailDelivery: 'setup_link',
      finalStatus: 'setup_link_only',
      error: supabaseEmailErr?.message || String(supabaseEmailErr),
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug(
      '[dispatchCollaboratorInvite] usuário já existe — link gerado para envio manual:',
      normalizedEmail,
    );
  }

  return {
    emailDelivery: 'setup_link',
    user: existingUser,
    setupLink,
    message:
      'Link de acesso gerado. Se o e-mail não chegar em alguns minutos, copie o link e envie manualmente ao colaborador.',
  };
}
