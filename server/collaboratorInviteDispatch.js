import { getEmailConfig, getInviteRedirectTo } from './email/emailConfig.js';
import { generatePasswordSetupLink, sendUserInviteEmail } from './email/sendUserInviteEmail.js';
import { sendSupabaseAuthRecoveryEmail } from './email/sendSupabaseAuthEmail.js';
import { logAccessEmailAudit } from './email/accessEmailAudit.js';
import {
  findAuthUserByEmail,
  isUserAlreadyRegisteredError,
} from './email/accessEmailHelpers.js';
import {
  lookupAuthUserByEmail,
  recoverAuthUserAfterEmailExists,
  requireAuthUserId,
} from './identity/identityAuthResolver.js';
import { identityLog } from './identity/identityProvisionLog.js';

async function tryInviteUserByEmail(supabase, email, { redirectTo, metadata }) {
  return supabase.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo,
  });
}

async function sendRecoveryForExistingUser(supabase, {
  email,
  redirectTo,
  auditBase,
  authUser,
}) {
  try {
    await sendSupabaseAuthRecoveryEmail(supabase, { email, redirectTo });
    identityLog('recovery enviado', { userId: authUser.id });
    logAccessEmailAudit({
      ...auditBase,
      authUserFound: true,
      authUserId: authUser.id,
      linkType: 'supabase_recovery',
      inviteSent: true,
      emailDelivery: 'supabase_auth',
      finalStatus: 'invite_sent',
    });
    return {
      emailDelivery: 'supabase_auth',
      user: authUser,
      setupLink: null,
      recoverySent: true,
    };
  } catch (supabaseEmailErr) {
    const setupLink = await generatePasswordSetupLink(supabase, {
      email,
      redirectTo,
      data: auditBase.metadata || {},
      existingUser: true,
    });
    logAccessEmailAudit({
      ...auditBase,
      authUserFound: true,
      authUserId: authUser.id,
      inviteSent: false,
      emailDelivery: 'setup_link',
      finalStatus: 'setup_link_only',
      error: supabaseEmailErr?.message || String(supabaseEmailErr),
    });
    return {
      emailDelivery: 'setup_link',
      user: authUser,
      setupLink,
      recoverySent: false,
      message: supabaseEmailErr?.message || String(supabaseEmailErr),
    };
  }
}

/**
 * Fail-safe: nunca chama inviteUserByEmail se auth.users já existir.
 * Resend/recovery para usuários existentes — sem inviteUserByEmail.
 */
export async function dispatchCollaboratorInvite(supabase, {
  email,
  tenantId,
  role,
  collaboratorId,
  collaboratorName,
  userName,
  profileRole,
}, { mode = 'invite' } = {}) {
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
    requestedAction: mode === 'resend' ? 'resend' : 'invite',
    metadata,
  };

  // ── 1) Sempre buscar auth.users antes de invite ──────────────────────────
  let authUser = await lookupAuthUserByEmail(supabase, normalizedEmail);

  if (authUser?.id) {
    // ── 6) Usuário existente: recovery, NUNCA inviteUserByEmail ───────────
    if (getEmailConfig().isConfigured) {
      const setupLink = await generatePasswordSetupLink(supabase, {
        email: normalizedEmail,
        redirectTo,
        data: metadata,
        existingUser: true,
      });
      await sendUserInviteEmail(supabase, {
        tenantId,
        email: normalizedEmail,
        userName: userName || collaboratorName || normalizedEmail,
        profileRole: profileRole || role,
        setupLink,
      });
      identityLog('recovery enviado', { userId: authUser.id, delivery: 'backend_resend' });
      logAccessEmailAudit({
        ...auditBase,
        authUserFound: true,
        authUserId: authUser.id,
        linkType: 'recovery',
        inviteSent: true,
        emailDelivery: 'backend_resend',
        finalStatus: 'invite_sent',
      });
      return { emailDelivery: 'backend_resend', user: authUser, setupLink: null, recoverySent: true };
    }

    return sendRecoveryForExistingUser(supabase, {
      email: normalizedEmail,
      redirectTo,
      auditBase,
      authUser,
    });
  }

  // ── 2) Usuário novo: inviteUserByEmail (ou transacional) ─────────────────
  if (getEmailConfig().isConfigured) {
    const { error: inviteError } = await tryInviteUserByEmail(supabase, normalizedEmail, {
      redirectTo,
      metadata,
    });

    if (inviteError && isUserAlreadyRegisteredError(inviteError)) {
      authUser = await recoverAuthUserAfterEmailExists(supabase, normalizedEmail);
      return sendRecoveryForExistingUser(supabase, {
        email: normalizedEmail,
        redirectTo,
        auditBase,
        authUser,
      });
    }
    if (inviteError) throw inviteError;

    authUser = await requireAuthUserId(supabase, normalizedEmail);
    const setupLink = await generatePasswordSetupLink(supabase, {
      email: normalizedEmail,
      redirectTo,
      data: metadata,
      existingUser: false,
    });
    await sendUserInviteEmail(supabase, {
      tenantId,
      email: normalizedEmail,
      userName: userName || collaboratorName || normalizedEmail,
      profileRole: profileRole || role,
      setupLink,
    });
    identityLog('invite enviado', { userId: authUser.id, delivery: 'backend_resend' });
    logAccessEmailAudit({
      ...auditBase,
      authUserFound: true,
      authUserId: authUser.id,
      linkType: 'invite',
      inviteSent: true,
      emailDelivery: 'backend_resend',
      finalStatus: 'invite_sent',
    });
    return { emailDelivery: 'backend_resend', user: authUser, setupLink: null };
  }

  const { data: inviteData, error: inviteError } = await tryInviteUserByEmail(
    supabase,
    normalizedEmail,
    { redirectTo, metadata },
  );

  if (!inviteError) {
    authUser = inviteData?.user || await findAuthUserByEmail(supabase, normalizedEmail);
    authUser = await requireAuthUserId(supabase, normalizedEmail, { explicitUser: authUser });
    identityLog('invite enviado', { userId: authUser.id, delivery: 'supabase_auth' });
    logAccessEmailAudit({
      ...auditBase,
      authUserFound: true,
      authUserId: authUser.id,
      linkType: 'invite',
      inviteSent: true,
      emailDelivery: 'supabase_auth',
      finalStatus: 'invite_sent',
    });
    return { emailDelivery: 'supabase_auth', user: authUser, setupLink: null };
  }

  // ── 3) email_exists: buscar user.id e continuar (sem erro) ───────────────
  if (isUserAlreadyRegisteredError(inviteError)) {
    authUser = await recoverAuthUserAfterEmailExists(supabase, normalizedEmail);
    return sendRecoveryForExistingUser(supabase, {
      email: normalizedEmail,
      redirectTo,
      auditBase,
      authUser,
    });
  }

  logAccessEmailAudit({
    ...auditBase,
    inviteSent: false,
    finalStatus: 'invite_failed',
    error: inviteError?.message || String(inviteError),
  });
  throw inviteError;
}
