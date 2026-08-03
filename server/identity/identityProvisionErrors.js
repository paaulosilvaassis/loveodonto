export class IdentityProvisionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'IdentityProvisionError';
    this.code = code;
    this.details = details;
  }
}

export function isIdentityProvisionError(err) {
  return err instanceof IdentityProvisionError || err?.name === 'IdentityProvisionError';
}

export function assertAuthUserIdForTenantWrite(authUserId, context = {}) {
  const id = String(authUserId || '').trim();
  if (!id) {
    throw new IdentityProvisionError(
      'AUTH_USER_NOT_FOUND',
      'Conta Auth obrigatória antes de gravar tenant_users.',
      context,
    );
  }
  return id;
}
