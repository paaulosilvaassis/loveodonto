/**
 * @module repositories/crm/crmActivityFlags
 * @description Feature flags CRM Activity Stream — Phase 6.6 read + Phase 6.7 write.
 * Defaults OFF. Produção bloqueada.
 */

import {
  readEnvFlag,
  readTenantFlag,
  REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF,
} from '../shared/repositoryV3FlagHelpers.js';
import {
  applyProductionSafeLocksGeneric,
  lockDangerousFlags,
} from '../shared/repositoryV3ProductionGuards.js';

export const CRM_ACTIVITY_FLAG_KEYS = {
  CRM_ACTIVITY_READ: 'CRM_ACTIVITY_READ',
  CRM_ACTIVITY_READ_PRIMARY: 'CRM_ACTIVITY_READ_PRIMARY',
  CRM_ACTIVITY_SHADOW: 'CRM_ACTIVITY_SHADOW',
  CRM_ACTIVITY_COMPARE: 'CRM_ACTIVITY_COMPARE',
  CRM_ACTIVITY_WRITE: 'CRM_ACTIVITY_WRITE',
  CRM_ACTIVITY_WRITE_PRIMARY: 'CRM_ACTIVITY_WRITE_PRIMARY',
  CRM_ACTIVITY_DUAL_WRITE: 'CRM_ACTIVITY_DUAL_WRITE',
  CRM_ACTIVITY_WRITE_COMPARE: 'CRM_ACTIVITY_WRITE_COMPARE',
} as const;

export type CrmActivityFlagKey = keyof typeof CRM_ACTIVITY_FLAG_KEYS;

export interface CrmActivityFlags {
  CRM_ACTIVITY_READ: boolean;
  CRM_ACTIVITY_READ_PRIMARY: boolean;
  CRM_ACTIVITY_SHADOW: boolean;
  CRM_ACTIVITY_COMPARE: boolean;
  CRM_ACTIVITY_WRITE: boolean;
  CRM_ACTIVITY_WRITE_PRIMARY: boolean;
  CRM_ACTIVITY_DUAL_WRITE: boolean;
  CRM_ACTIVITY_WRITE_COMPARE: boolean;
}

export interface CrmActivityFlagsInput {
  tenantFlags?: Record<string, unknown>;
  overrides?: Partial<CrmActivityFlags>;
}

export const CRM_ACTIVITY_FLAG_DEFAULTS: Readonly<CrmActivityFlags> = {
  CRM_ACTIVITY_READ: false,
  CRM_ACTIVITY_READ_PRIMARY: false,
  CRM_ACTIVITY_SHADOW: false,
  CRM_ACTIVITY_COMPARE: false,
  CRM_ACTIVITY_WRITE: false,
  CRM_ACTIVITY_WRITE_PRIMARY: false,
  CRM_ACTIVITY_DUAL_WRITE: false,
  CRM_ACTIVITY_WRITE_COMPARE: false,
};

export const CRM_ACTIVITY_PRODUCTION_LOCKED_FLAGS: readonly CrmActivityFlagKey[] = [
  'CRM_ACTIVITY_READ',
  'CRM_ACTIVITY_READ_PRIMARY',
  'CRM_ACTIVITY_SHADOW',
  'CRM_ACTIVITY_COMPARE',
  'CRM_ACTIVITY_WRITE',
  'CRM_ACTIVITY_WRITE_PRIMARY',
  'CRM_ACTIVITY_DUAL_WRITE',
  'CRM_ACTIVITY_WRITE_COMPARE',
];

export const PRODUCTION_SUPABASE_PROJECT_REF = REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF;

export class CrmActivityFlagsValidationError extends Error {
  readonly code = 'CRM_ACTIVITY_FLAGS_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'CrmActivityFlagsValidationError';
  }
}

const ENV_KEY_MAP: Record<CrmActivityFlagKey, string> = {
  CRM_ACTIVITY_READ: 'VITE_CRM_ACTIVITY_READ',
  CRM_ACTIVITY_READ_PRIMARY: 'VITE_CRM_ACTIVITY_READ_PRIMARY',
  CRM_ACTIVITY_SHADOW: 'VITE_CRM_ACTIVITY_SHADOW',
  CRM_ACTIVITY_COMPARE: 'VITE_CRM_ACTIVITY_COMPARE',
  CRM_ACTIVITY_WRITE: 'VITE_CRM_ACTIVITY_WRITE',
  CRM_ACTIVITY_WRITE_PRIMARY: 'VITE_CRM_ACTIVITY_WRITE_PRIMARY',
  CRM_ACTIVITY_DUAL_WRITE: 'VITE_CRM_ACTIVITY_DUAL_WRITE',
  CRM_ACTIVITY_WRITE_COMPARE: 'VITE_CRM_ACTIVITY_WRITE_COMPARE',
};

export function lockDangerousCrmActivityFlags(flags: CrmActivityFlags): CrmActivityFlags {
  return lockDangerousFlags(flags, CRM_ACTIVITY_PRODUCTION_LOCKED_FLAGS);
}

export function applyProductionSafeLocks(flags: CrmActivityFlags): CrmActivityFlags {
  return applyProductionSafeLocksGeneric(flags, CRM_ACTIVITY_PRODUCTION_LOCKED_FLAGS, {
    supabaseHostLockedKeys: [
      'CRM_ACTIVITY_READ_PRIMARY',
      'CRM_ACTIVITY_SHADOW',
      'CRM_ACTIVITY_COMPARE',
      'CRM_ACTIVITY_WRITE',
      'CRM_ACTIVITY_WRITE_PRIMARY',
      'CRM_ACTIVITY_DUAL_WRITE',
      'CRM_ACTIVITY_WRITE_COMPARE',
    ],
  });
}

export function validateCrmActivityFlags(flags: CrmActivityFlags): void {
  if (flags.CRM_ACTIVITY_READ_PRIMARY && !flags.CRM_ACTIVITY_READ) {
    throw new CrmActivityFlagsValidationError(
      'CRM_ACTIVITY_READ_PRIMARY=true exige CRM_ACTIVITY_READ=true.',
    );
  }

  if (flags.CRM_ACTIVITY_WRITE && !flags.CRM_ACTIVITY_READ) {
    throw new CrmActivityFlagsValidationError(
      'CRM_ACTIVITY_WRITE=true exige CRM_ACTIVITY_READ=true.',
    );
  }

  if (flags.CRM_ACTIVITY_DUAL_WRITE && !flags.CRM_ACTIVITY_WRITE) {
    throw new CrmActivityFlagsValidationError(
      'CRM_ACTIVITY_DUAL_WRITE=true exige CRM_ACTIVITY_WRITE=true.',
    );
  }

  if (flags.CRM_ACTIVITY_WRITE_PRIMARY && !flags.CRM_ACTIVITY_WRITE) {
    throw new CrmActivityFlagsValidationError(
      'CRM_ACTIVITY_WRITE_PRIMARY=true exige CRM_ACTIVITY_WRITE=true.',
    );
  }

  const hasReadPath =
    flags.CRM_ACTIVITY_READ
    || flags.CRM_ACTIVITY_READ_PRIMARY
    || flags.CRM_ACTIVITY_SHADOW;

  if (flags.CRM_ACTIVITY_COMPARE && !hasReadPath) {
    throw new CrmActivityFlagsValidationError(
      'CRM_ACTIVITY_COMPARE=true exige CRM_ACTIVITY_READ, CRM_ACTIVITY_READ_PRIMARY ou CRM_ACTIVITY_SHADOW.',
    );
  }

  const hasWritePath = flags.CRM_ACTIVITY_WRITE || flags.CRM_ACTIVITY_DUAL_WRITE;
  if (flags.CRM_ACTIVITY_WRITE_COMPARE && !hasWritePath) {
    throw new CrmActivityFlagsValidationError(
      'CRM_ACTIVITY_WRITE_COMPARE=true exige CRM_ACTIVITY_WRITE ou CRM_ACTIVITY_DUAL_WRITE.',
    );
  }
}

function resolveRawFlags(input: CrmActivityFlagsInput = {}): CrmActivityFlags {
  const { tenantFlags, overrides } = input;
  const base = { ...CRM_ACTIVITY_FLAG_DEFAULTS };

  const fromSources: CrmActivityFlags = {
    CRM_ACTIVITY_READ: readTenantFlag(
      tenantFlags,
      'CRM_ACTIVITY_READ',
      readEnvFlag(ENV_KEY_MAP.CRM_ACTIVITY_READ, base.CRM_ACTIVITY_READ),
    ),
    CRM_ACTIVITY_READ_PRIMARY: readTenantFlag(
      tenantFlags,
      'CRM_ACTIVITY_READ_PRIMARY',
      readEnvFlag(ENV_KEY_MAP.CRM_ACTIVITY_READ_PRIMARY, base.CRM_ACTIVITY_READ_PRIMARY),
    ),
    CRM_ACTIVITY_SHADOW: readTenantFlag(
      tenantFlags,
      'CRM_ACTIVITY_SHADOW',
      readEnvFlag(ENV_KEY_MAP.CRM_ACTIVITY_SHADOW, base.CRM_ACTIVITY_SHADOW),
    ),
    CRM_ACTIVITY_COMPARE: readTenantFlag(
      tenantFlags,
      'CRM_ACTIVITY_COMPARE',
      readEnvFlag(ENV_KEY_MAP.CRM_ACTIVITY_COMPARE, base.CRM_ACTIVITY_COMPARE),
    ),
    CRM_ACTIVITY_WRITE: readTenantFlag(
      tenantFlags,
      'CRM_ACTIVITY_WRITE',
      readEnvFlag(ENV_KEY_MAP.CRM_ACTIVITY_WRITE, base.CRM_ACTIVITY_WRITE),
    ),
    CRM_ACTIVITY_WRITE_PRIMARY: readTenantFlag(
      tenantFlags,
      'CRM_ACTIVITY_WRITE_PRIMARY',
      readEnvFlag(ENV_KEY_MAP.CRM_ACTIVITY_WRITE_PRIMARY, base.CRM_ACTIVITY_WRITE_PRIMARY),
    ),
    CRM_ACTIVITY_DUAL_WRITE: readTenantFlag(
      tenantFlags,
      'CRM_ACTIVITY_DUAL_WRITE',
      readEnvFlag(ENV_KEY_MAP.CRM_ACTIVITY_DUAL_WRITE, base.CRM_ACTIVITY_DUAL_WRITE),
    ),
    CRM_ACTIVITY_WRITE_COMPARE: readTenantFlag(
      tenantFlags,
      'CRM_ACTIVITY_WRITE_COMPARE',
      readEnvFlag(ENV_KEY_MAP.CRM_ACTIVITY_WRITE_COMPARE, base.CRM_ACTIVITY_WRITE_COMPARE),
    ),
  };

  const merged = { ...fromSources, ...(overrides || {}) };
  validateCrmActivityFlags(merged);
  return applyProductionSafeLocks(merged);
}

export function getCrmActivityFlags(input: CrmActivityFlagsInput = {}): CrmActivityFlags {
  return resolveRawFlags(input);
}

export function isCrmActivityReadEnabled(input: CrmActivityFlagsInput = {}): boolean {
  return getCrmActivityFlags(input).CRM_ACTIVITY_READ;
}

export function isCrmActivityReadPrimaryEnabled(input: CrmActivityFlagsInput = {}): boolean {
  const flags = getCrmActivityFlags(input);
  return flags.CRM_ACTIVITY_READ && flags.CRM_ACTIVITY_READ_PRIMARY;
}

export function shouldRunCrmActivityShadowRead(input: CrmActivityFlagsInput = {}): boolean {
  return getCrmActivityFlags(input).CRM_ACTIVITY_SHADOW;
}

export function shouldCompareCrmActivity(input: CrmActivityFlagsInput = {}): boolean {
  return getCrmActivityFlags(input).CRM_ACTIVITY_COMPARE;
}

export function isCrmActivityWriteEnabled(input: CrmActivityFlagsInput = {}): boolean {
  return getCrmActivityFlags(input).CRM_ACTIVITY_WRITE;
}

export function isCrmActivityDualWriteEnabled(input: CrmActivityFlagsInput = {}): boolean {
  const flags = getCrmActivityFlags(input);
  return flags.CRM_ACTIVITY_READ && flags.CRM_ACTIVITY_WRITE && flags.CRM_ACTIVITY_DUAL_WRITE;
}

/** Dual-write only — Primary Write (6.8) desativa este path. */
export function isCrmActivityDualWriteOnlyEnabled(input: CrmActivityFlagsInput = {}): boolean {
  const flags = getCrmActivityFlags(input);
  return isCrmActivityDualWriteEnabled(input) && !flags.CRM_ACTIVITY_WRITE_PRIMARY;
}

export function isCrmActivityWritePrimaryEnabled(input: CrmActivityFlagsInput = {}): boolean {
  const flags = getCrmActivityFlags(input);
  return flags.CRM_ACTIVITY_WRITE && flags.CRM_ACTIVITY_WRITE_PRIMARY;
}

export function shouldCompareCrmActivityWrite(input: CrmActivityFlagsInput = {}): boolean {
  return getCrmActivityFlags(input).CRM_ACTIVITY_WRITE_COMPARE;
}
