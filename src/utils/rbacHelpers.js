/**
 * Utilitários compartilhados de RBAC (menu, rotas, guards).
 * Usuários provisionados pela Console SaaS recebem role master/owner/admin.
 */
const PRIVILEGED_ROLES = new Set(['admin', 'owner', 'master']);

export function isMasterMembershipRole(role) {
  return PRIVILEGED_ROLES.has(String(role || '').toLowerCase());
}

export function isPrivilegedUser(user) {
  if (!user) return false;
  if (user.isMaster === true) return true;
  return isMasterMembershipRole(user.role);
}

/** Reaplica privilégios master em cache de UI (sessões antigas sem isMaster). */
export function enrichSaasUserPrivileges(user) {
  if (!user) return user;
  if (!isPrivilegedUser(user)) return user;
  return { ...user, isMaster: true };
}

export function isRoutePermissionAllowed(user, permission, canFn) {
  if (isPrivilegedUser(user)) return true;
  if (!permission) return true;
  return canFn(user, permission);
}
