/**
 * Phase 4.10 Wave 3F — resolve Auth user + convite para provisionamento.
 */

import { dispatchCollaboratorInvite } from '../../collaboratorInviteDispatch.js';
import { identityLog } from '../../identity/identityProvisionLog.js';

export function createResolveAuthUserForInvite(deps) {
  const {
    supabase,
    lookupAuthUserByEmail,
    requireAuthUserId,
    createAuthUserForCollaboratorInvite,
  } = deps;

  return async function resolveAuthUserForInvite({
    normalizedEmail,
    sendInvite,
    tenantId,
    role,
    collaboratorId,
    collaboratorFullName,
    requestedAction = 'provision',
  }) {
    let authUser = await lookupAuthUserByEmail(supabase, normalizedEmail);
    const authUserExisted = Boolean(authUser?.id);
    let inviteDelivery = null;
    const inviteMode = requestedAction === 'resend' || authUserExisted ? 'resend' : 'invite';

    if (sendInvite) {
      identityLog('iniciando envio de acesso', {
        tenantId,
        collaboratorId,
        authUserExisted,
        mode: inviteMode,
      });
      inviteDelivery = await dispatchCollaboratorInvite(supabase, {
        email: normalizedEmail,
        tenantId,
        role,
        collaboratorId,
        collaboratorName: collaboratorFullName,
        userName: collaboratorFullName || normalizedEmail,
        profileRole: role,
      }, { mode: inviteMode });

      authUser = await requireAuthUserId(supabase, normalizedEmail, {
        explicitUser: inviteDelivery?.user || authUser,
      });
    } else if (!authUser?.id) {
      authUser = await createAuthUserForCollaboratorInvite({
        normalizedEmail,
        tenantId,
        role,
        collaboratorId,
        collaboratorFullName,
      });
      authUser = await requireAuthUserId(supabase, normalizedEmail, { explicitUser: authUser });
    } else {
      identityLog('user_id encontrado', { userId: authUser.id, sendInvite: false });
    }

    return { authUser, inviteDelivery, authUserExisted };
  };
}
