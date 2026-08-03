/**
 * Phase 4.10 Wave 3I — chaves de dependência externa para createPlatformDependencies.
 */

export const PLATFORM_EXTERNAL_DEP_KEYS = [
  'supabase',
  'normalizeText',
  'normalizeEmail',
  'normalizeDatabaseError',
  'explainJwtVerifyFailure',
  'normalizeStatus',
  'normalizePlanCode',
  'assertAuthUserIdForTenantWrite',
  'identityLog',
  'isIdentityProvisionError',
  'planConfig',
  'platformApiKey',
  'ensureConsoleAdminCredentials',
  'nodeEnv',
];

export function assertPlatformExternalDeps(deps, { keys = PLATFORM_EXTERNAL_DEP_KEYS } = {}) {
  const missing = keys.filter((key) => deps[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`createPlatformDependencies: deps ausentes: ${missing.join(', ')}`);
  }
}
