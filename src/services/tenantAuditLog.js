/**
 * Logs temporários de auditoria do fluxo tenant/auth (DEV + buffer em memória).
 * Tags: TENANT_BOOTSTRAP | TENANT_VALIDATION | TENANT_CONTEXT | TENANT_GUARD | TENANT_AUTH | TENANT_API
 */

const ALLOWED_TAGS = new Set([
  'TENANT_BOOTSTRAP',
  'TENANT_VALIDATION',
  'TENANT_CONTEXT',
  'TENANT_GUARD',
  'TENANT_AUTH',
  'TENANT_API',
]);

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function tenantAudit(tag, {
  user_id = null,
  email = null,
  tenant_id = null,
  role = null,
  source = null,
  duration_ms = null,
  status = null,
  error = null,
  extra = {},
} = {}) {
  if (!ALLOWED_TAGS.has(tag)) return null;

  const entry = {
    tag,
    at: new Date().toISOString(),
    user_id,
    email,
    tenant_id,
    role,
    source,
    duration_ms: duration_ms != null ? Math.round(duration_ms) : null,
    status,
    error: error ? String(error) : null,
    ...extra,
  };

  if (typeof window !== 'undefined') {
    if (!window.__TENANT_AUDIT_LOGS__) {
      window.__TENANT_AUDIT_LOGS__ = [];
    }
    window.__TENANT_AUDIT_LOGS__.push(entry);
  }

  if (import.meta.env?.DEV) {
    console.debug(`[${tag}]`, entry);
  }

  return entry;
}

export function startTenantAuditTimer() {
  const started = nowMs();
  return () => Math.round(nowMs() - started);
}

export function getTenantAuditLogs() {
  if (typeof window === 'undefined') return [];
  return Array.isArray(window.__TENANT_AUDIT_LOGS__) ? [...window.__TENANT_AUDIT_LOGS__] : [];
}

export function clearTenantAuditLogs() {
  if (typeof window !== 'undefined') {
    window.__TENANT_AUDIT_LOGS__ = [];
  }
}
