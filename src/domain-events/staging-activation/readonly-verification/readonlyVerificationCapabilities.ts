/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationCapabilities
 */

import type { ReadonlyVerificationCapabilities } from './readonlyVerificationTypes.js';

export function buildSafeReadonlyCapabilities(
  overrides: Partial<ReadonlyVerificationCapabilities> = {},
): ReadonlyVerificationCapabilities {
  const caps: ReadonlyVerificationCapabilities = {
    canReadEnvironmentIdentity: overrides.canReadEnvironmentIdentity ?? true,
    canReadFlagResolution: overrides.canReadFlagResolution ?? true,
    canReadTenantExistence: overrides.canReadTenantExistence ?? true,
    canReadHealth: overrides.canReadHealth ?? true,
    canReadInspector: overrides.canReadInspector ?? true,
    canWriteDatabase: overrides.canWriteDatabase ?? false,
    canRunMigration: overrides.canRunMigration ?? false,
    canWriteStorage: overrides.canWriteStorage ?? false,
    canChangeEnvironmentVariables: overrides.canChangeEnvironmentVariables ?? false,
    canRevealSecrets: overrides.canRevealSecrets ?? false,
    readOnlyGuaranteed: false,
  };
  const writesBlocked = caps.canWriteDatabase === false
    && caps.canRunMigration === false
    && caps.canWriteStorage === false
    && caps.canChangeEnvironmentVariables === false
    && caps.canRevealSecrets === false;
  const readsOk = caps.canReadEnvironmentIdentity
    && caps.canReadFlagResolution
    && caps.canReadTenantExistence;
  return Object.freeze({
    ...caps,
    readOnlyGuaranteed: writesBlocked && readsOk && overrides.readOnlyGuaranteed !== false
      ? (overrides.readOnlyGuaranteed ?? true)
      : false,
  });
}

export function validateReadonlyCapabilities(
  caps: ReadonlyVerificationCapabilities,
): { ok: boolean; blockers: readonly string[] } {
  const blockers: string[] = [];
  if (caps.canWriteDatabase) blockers.push('canWriteDatabase=true');
  if (caps.canRunMigration) blockers.push('canRunMigration=true');
  if (caps.canWriteStorage) blockers.push('canWriteStorage=true');
  if (caps.canChangeEnvironmentVariables) blockers.push('canChangeEnvironmentVariables=true');
  if (caps.canRevealSecrets) blockers.push('canRevealSecrets=true');
  if (!caps.readOnlyGuaranteed) blockers.push('readOnlyGuaranteed=false');
  return { ok: blockers.length === 0, blockers };
}
