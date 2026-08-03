/**
 * Phase 4.10 Wave 3C/3D — selects e helpers tenant_users (legado).
 */

export const TENANT_USER_SELECT_BASE =
  'id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status';

export const TENANT_USER_SELECT_BASE_LEGACY =
  'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status';

export const TENANT_USER_SELECT_WITH_ACCESS = `${TENANT_USER_SELECT_BASE}, has_system_access`;

export function omitHasSystemAccess(payload = {}) {
  const cloned = { ...(payload || {}) };
  delete cloned.has_system_access;
  return cloned;
}

export function omitInvitationStatus(payload = {}) {
  const cloned = { ...(payload || {}) };
  delete cloned.invitation_status;
  return cloned;
}

export function omitCollaboratorId(payload = {}) {
  const cloned = { ...(payload || {}) };
  delete cloned.collaborator_id;
  return cloned;
}
