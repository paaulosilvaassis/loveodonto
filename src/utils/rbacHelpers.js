/**
 * Utilitários compartilhados de RBAC (menu, rotas, guards).
 * Usuários provisionados pela Console SaaS recebem role master/owner/admin.
 */
import { getMembership } from '../services/membershipService.js';
import { ROLE_MASTER } from '../constants/tenantRoles.js';

const PRIVILEGED_ROLES = new Set(['admin', 'owner', 'master']);

export function isMasterMembershipRole(role) {
  return PRIVILEGED_ROLES.has(String(role || '').toLowerCase());
}

/** Normaliza role vinda do tenant_users / app_metadata para o app. */
export function normalizeSaasBootstrapRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (!role) return 'recepcao';
  if (isMasterMembershipRole(role)) return 'admin';
  if (['manager', 'gerente'].includes(role)) return 'gerente';
  if (['finance', 'financial', 'financeiro'].includes(role)) return 'financeiro';
  if (['sales', 'commercial', 'comercial'].includes(role)) return 'comercial';
  if (['doctor', 'dentist', 'dentista', 'professional', 'profissional'].includes(role)) return 'profissional';
  if (['reception', 'recepcao', 'atendimento', 'support'].includes(role)) return 'recepcao';
  return role;
}

export function isPrivilegedUser(user) {
  if (!user) return false;
  if (user.isMaster === true) return true;
  if (isMasterMembershipRole(user.role)) return true;
  if (isMasterMembershipRole(user.saasAppRole)) return true;
  return false;
}

/** Reaplica privilégios master em cache de UI (sessões antigas sem isMaster). */
export function enrichSaasUserPrivileges(user) {
  if (!user) return user;
  if (!isPrivilegedUser(user)) return user;
  return { ...user, isMaster: true };
}

/**
 * Pode gerenciar usuários da clínica (Console master ou membership local master).
 * @param {object|null|undefined} backendCurrentUser — currentUser do tenant-context (fonte servidor).
 */
export function canManageTenantUsers(user, tenantId, backendCurrentUser = null) {
  if (isPrivilegedUser(user)) return true;
  if (backendCurrentUser?.role && isMasterMembershipRole(backendCurrentUser.role)) return true;
  const tid = String(tenantId || user?.tenantId || '').trim();
  const uid = user?.id;
  if (tid && uid) {
    const membership = getMembership(tid, uid);
    if (membership?.role === ROLE_MASTER) return true;
  }
  return false;
}

export function isRoutePermissionAllowed(user, permission, canFn) {
  if (isPrivilegedUser(user)) return true;
  if (!permission) return true;
  return canFn(user, permission);
}
