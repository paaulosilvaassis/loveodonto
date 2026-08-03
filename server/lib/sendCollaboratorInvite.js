/**
 * Phase 4.10 Wave 3E — dispatch de convite de colaborador (identity/provisionamento).
 */

import { dispatchCollaboratorInvite } from '../collaboratorInviteDispatch.js';

export function createSendCollaboratorInvite(deps) {
  const { supabase } = deps;

  return async function sendCollaboratorInvite({
    email,
    tenantId,
    role,
    collaboratorId,
    collaboratorName,
    userName,
    profileRole,
    mode = 'resend',
  }) {
    return dispatchCollaboratorInvite(supabase, {
      email,
      tenantId,
      role,
      collaboratorId,
      collaboratorName,
      userName,
      profileRole: profileRole || role,
    }, { mode });
  };
}
