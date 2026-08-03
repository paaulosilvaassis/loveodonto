/**
 * Phase 4.10 Wave 3F/3G — chaves de dependência externa para createProvisioningDependencies.
 * Usado para documentação e validação mínima no bootstrap.
 */

export const PROVISIONING_EXTERNAL_DEP_KEYS = [
  'supabase',
  'getTenantAdminActorOrThrow',
  'normalizeText',
  'normalizeEmail',
  'normalizeRoleValue',
  'normalizeInvitationStatus',
  'maskEmail',
  'appendAccessAuditToAuthUser',
  'logAccessEmailAudit',
  'getPasswordResetRedirectTo',
];

export function assertProvisioningExternalDeps(deps, { keys = PROVISIONING_EXTERNAL_DEP_KEYS } = {}) {
  const missing = keys.filter((key) => deps[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`createProvisioningDependencies: deps ausentes: ${missing.join(', ')}`);
  }
}
