/**
 * Phase 4.10 Wave 0 — Papéis e membership (primitives RBAC).
 */

export const ADMIN_ROLES = Object.freeze(['owner', 'admin', 'master']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function normalizeRoleValue(value, fallback = 'atendimento') {
  const role = normalizeText(value).toLowerCase();
  return role || fallback;
}

export function isOwner(role) {
  return normalizeRoleValue(role, '') === 'owner';
}

export function isAdmin(role) {
  return normalizeRoleValue(role, '') === 'admin';
}

export function isMaster(role) {
  return normalizeRoleValue(role, '') === 'master';
}

export function isTenantAdminRole(role) {
  return ADMIN_ROLES.includes(normalizeRoleValue(role, ''));
}

export function isActiveMembership(tenantUser) {
  if (!tenantUser?.tenant_id) return false;
  if (tenantUser.is_active === false) return false;
  const status = normalizeText(tenantUser.status).toLowerCase();
  if (status === 'inactive' || status === 'inativo') return false;
  return true;
}
