export function logIdentityAudit(fields = {}) {
  const payload = {
    env: process.env.NODE_ENV || 'development',
    at: new Date().toISOString(),
    tenantId: fields.tenantId ?? null,
    identityId: fields.identityId ?? null,
    collaboratorId: fields.collaboratorId ?? null,
    email: fields.email ?? null,
    action: fields.action ?? null,
    previousStatus: fields.previousStatus ?? null,
    newStatus: fields.newStatus ?? null,
    health: fields.health ?? null,
    authUserId: fields.authUserId ?? null,
    tenantUserId: fields.tenantUserId ?? null,
    result: fields.result ?? 'success',
    error: fields.error ?? null,
  };
  console.log('[IDENTITY_AUDIT]', payload);
  return payload;
}
