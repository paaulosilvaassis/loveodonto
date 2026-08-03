/**
 * Auditoria unificada do fluxo de e-mail de acesso a colaboradores.
 * Prefixo obrigatório: [ACCESS_EMAIL_AUDIT]
 */

export function logAccessEmailAudit(fields = {}) {
  const payload = {
    env: process.env.NODE_ENV || 'development',
    at: new Date().toISOString(),
    tenantId: fields.tenantId ?? null,
    collaboratorId: fields.collaboratorId ?? null,
    email: fields.email ?? null,
    requestedAction: fields.requestedAction ?? null,
    existingTenantUserId: fields.existingTenantUserId ?? null,
    existingCollaboratorAccessUserId: fields.existingCollaboratorAccessUserId ?? null,
    authUserFound: fields.authUserFound ?? null,
    authUserId: fields.authUserId ?? null,
    linkType: fields.linkType ?? null,
    inviteSent: fields.inviteSent ?? null,
    recoverySent: fields.recoverySent ?? null,
    repairedBrokenLink: fields.repairedBrokenLink ?? null,
    finalStatus: fields.finalStatus ?? null,
    error: fields.error ?? null,
    emailDelivery: fields.emailDelivery ?? null,
  };

  console.log('[ACCESS_EMAIL_AUDIT]', payload);
  return payload;
}
