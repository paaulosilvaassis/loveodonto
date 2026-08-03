/**
 * Phase 4.10 Wave 3H — filtro de tenant_users ativos para membership.
 */

export function isActiveTenantUserRow(row) {
  const status = String(row?.status || '').toLowerCase();
  if (status === 'inactive') return false;
  if (row?.is_active === false) return false;
  if (row?.has_system_access === false) return false;
  return Boolean(row?.tenant_id);
}
