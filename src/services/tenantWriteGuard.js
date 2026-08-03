import { assertSameTenant, requireSessionTenantId, TenantIsolationError } from './tenantIsolation.js';

const normalizeTenant = (value) => {
  if (value === null || value === undefined) return '';
  const normalized = String(value).trim();
  return normalized;
};

/** Tenant ativo da sessão (leitura — não exige clínica para listagens). */
export const resolveUserTenantId = (user) => {
  const fromUser =
    normalizeTenant(user?.tenant_id) ||
    normalizeTenant(user?.tenantId) ||
    normalizeTenant(user?.tenant?.id);
  return fromUser || null;
};

export const resolveTenantIdForWrite = (user, payloadTenantId = '') => {
  const sessionTenantId = requireSessionTenantId(user);
  const fromPayload = normalizeTenant(payloadTenantId);

  if (fromPayload) {
    assertSameTenant(user, fromPayload, { action: 'write' });
    return fromPayload;
  }

  return sessionTenantId;
};

export { TenantIsolationError, requireSessionTenantId, assertSameTenant };
