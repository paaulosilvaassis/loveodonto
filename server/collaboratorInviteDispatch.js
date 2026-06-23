import { getEmailConfig, getInviteRedirectTo } from './email/emailConfig.js';
import { generatePasswordSetupLink, sendUserInviteEmail } from './email/sendUserInviteEmail.js';

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
    return {
      emailDelivery: 'supabase_auth',
      user: inviteData?.user || null,
      setupLink: null,
    };
  }

  if (!isUserAlreadyRegisteredError(inviteError)) {
    throw inviteError;
  }

  const setupLink = await generatePasswordSetupLink(supabase, {
    email: normalizedEmail,
    redirectTo,
    data: metadata,
  });

  if (getEmailConfig().isConfigured) {
    await sendUserInviteEmail(supabase, {
      tenantId,
      email: normalizedEmail,
      userName: userName || collaboratorName || normalizedEmail,
      profileRole: profileRole || role,
      setupLink,
    });
    return {
      emailDelivery: 'backend_resend',
      user: null,
      setupLink: null,
    };
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug(
      '[dispatchCollaboratorInvite] usuário já existe no Auth — link gerado sem envio automático:',
      normalizedEmail,
    );
  }

  return {
    emailDelivery: 'setup_link',
    user: null,
    setupLink,
    message:
      'Este e-mail já está cadastrado no Auth. O Supabase não reenvia convite automaticamente — copie o link e envie manualmente, ou configure EMAIL_API_KEY no backend.',
  };
}
