import { getTenantContext } from './tenantContextService.js';

const BLOCKED_STATUSES = new Set(['blocked', 'billing_blocked', 'suspended', 'inactive', 'canceled']);

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

export async function readTenantAccessSnapshot(tenantId) {
  const context = await getTenantContext(tenantId);
  const tenantStatus = normalizeStatus(context?.tenant?.status);
  const billingStatus = normalizeStatus(context?.tenant?.billing_status || context?.subscription?.status);
  return {
    tenant: context?.tenant || null,
    modules: context?.modules || {},
    flags: context?.flags || {},
    subscription: context?.subscription || null,
    limits: context?.limits || {},
    warnings: Array.isArray(context?.warnings) ? context.warnings : [],
    tenantStatus,
    billingStatus,
    isTenantBlocked: BLOCKED_STATUSES.has(tenantStatus),
    isOverdue: billingStatus === 'overdue' || billingStatus === 'past_due',
    currentUser: context?.currentUser || null,
    teamRoster: Array.isArray(context?.teamRoster) ? context.teamRoster : [],
  };
}

export async function assertTenantAllowed(tenantId) {
  const snapshot = await readTenantAccessSnapshot(tenantId);
  if (snapshot.isTenantBlocked) {
    throw new Error('Acesso bloqueado: o status da clínica não permite uso do sistema.');
  }
  return snapshot;
}

