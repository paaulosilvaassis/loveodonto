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
  const fromPayload = normalizeTenant(payloadTenantId);
  if (fromPayload) return fromPayload;

  const fromUser = resolveUserTenantId(user);
  if (fromUser) return fromUser;

  const error = new Error('Clínica obrigatória: selecione uma clínica antes de salvar.');
  error.code = 'TENANT_REQUIRED';
  throw error;
};

