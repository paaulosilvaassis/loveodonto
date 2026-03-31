const normalizeTenant = (value) => {
  if (value === null || value === undefined) return '';
  const normalized = String(value).trim();
  return normalized;
};

export const resolveTenantIdForWrite = (user, payloadTenantId = '') => {
  const fromPayload = normalizeTenant(payloadTenantId);
  if (fromPayload) return fromPayload;

  const fromUser =
    normalizeTenant(user?.tenant_id) ||
    normalizeTenant(user?.tenantId) ||
    normalizeTenant(user?.tenant?.id);
  if (fromUser) return fromUser;

  const error = new Error('Clínica obrigatória: selecione uma clínica antes de salvar.');
  error.code = 'TENANT_REQUIRED';
  throw error;
};

