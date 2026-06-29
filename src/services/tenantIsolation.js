import { emitStabilityLog } from './stabilityLogService.js';
import { isSaasModeEnabled } from './saasAuthService.js';
import { tenantAudit } from './tenantAuditLog.js';

const NO_TENANT_MESSAGE =
  'Usuário sem vínculo com clínica. Entre em contato com o administrador.';

export class TenantIsolationError extends Error {
  constructor(message = NO_TENANT_MESSAGE, code = 'TENANT_REQUIRED') {
    super(message);
    this.name = 'TenantIsolationError';
    this.code = code;
  }
}

export function normalizeTenantId(value) {
  const id = String(value || '').trim();
  return id || null;
}

/** Tenant ativo da sessão — nunca faz fallback para primeira clínica. */
export function requireSessionTenantId(user) {
  const tenantId = normalizeTenantId(
    user?.tenantId || user?.tenant_id || user?.tenant?.id,
  );
  if (!tenantId) {
    throw new TenantIsolationError();
  }
  return tenantId;
}

/** Impede leitura/gravação cross-tenant no frontend. */
export function assertSameTenant(user, targetTenantId, { action = 'access' } = {}) {
  const sessionTenantId = requireSessionTenantId(user);
  const normalizedTarget = normalizeTenantId(targetTenantId);
  if (!normalizedTarget) {
    throw new TenantIsolationError('Operação exige tenant_id da clínica atual.');
  }
  if (sessionTenantId !== normalizedTarget) {
    const err = new TenantIsolationError(
      'Acesso negado: dados de outra clínica.',
      'TENANT_MISMATCH',
    );
    err.sessionTenantId = sessionTenantId;
    err.targetTenantId = normalizedTarget;
    err.action = action;
    throw err;
  }
  return sessionTenantId;
}

/** Filtra coleções locais por tenant_id quando presente no registro. */
export function filterRecordsByTenant(records, tenantId) {
  const tid = normalizeTenantId(tenantId);
  if (!tid || !Array.isArray(records)) return [];
  return records.filter((row) => {
    const rowTenant = normalizeTenantId(row?.tenant_id || row?.tenantId);
    if (!rowTenant) return false;
    return rowTenant === tid;
  });
}

/** Log de auditoria de acesso por tenant (SaaS). */
export function auditTenantAccess(user, {
  source = 'app',
  linkStatus = 'active',
  extra = {},
} = {}) {
  const payload = {
    user_id: user?.id || null,
    email: user?.email || null,
    tenant_id: requireSessionTenantId(user),
    role: user?.role || user?.saasAppRole || null,
    source,
    link_status: linkStatus,
    auth_mode: user?.authMode || (isSaasModeEnabled() ? 'saas' : 'local'),
    at: new Date().toISOString(),
    ...extra,
  };
  tenantAudit('TENANT_VALIDATION', {
    user_id: payload.user_id,
    email: payload.email,
    tenant_id: payload.tenant_id,
    role: payload.role,
    source: payload.source,
    status: linkStatus,
    extra: { auth_mode: payload.auth_mode },
  });
  if (import.meta.env?.DEV) {
    console.debug('[TENANT_AUDIT]', payload);
  }
  emitStabilityLog('TENANT_ACCESS_AUDIT', payload);
  return payload;
}

export { NO_TENANT_MESSAGE };
