/**
 * @module repositories/crm/crmRepositoryFlags
 * @description Feature flags CRM/Kanban V3 — Phase 6.1 read + Phase 6.3 write.
 * Defaults: IndexedDB authority. Produção trava flags perigosas.
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

export const CRM_FLAG_KEYS = {
  CRM_READ: 'CRM_READ',
  CRM_READ_PRIMARY: 'CRM_READ_PRIMARY',
  CRM_SHADOW: 'CRM_SHADOW',
  CRM_COMPARE: 'CRM_COMPARE',
  CRM_WRITE: 'CRM_WRITE',
  CRM_WRITE_PRIMARY: 'CRM_WRITE_PRIMARY',
  CRM_DUAL_WRITE: 'CRM_DUAL_WRITE',
  CRM_WRITE_COMPARE: 'CRM_WRITE_COMPARE',
} as const;

export type CrmRepositoryFlagKey = keyof typeof CRM_FLAG_KEYS;

export interface CrmRepositoryFlags {
  CRM_READ: boolean;
  CRM_READ_PRIMARY: boolean;
  CRM_SHADOW: boolean;
  CRM_COMPARE: boolean;
  CRM_WRITE: boolean;
  CRM_WRITE_PRIMARY: boolean;
  CRM_DUAL_WRITE: boolean;
  CRM_WRITE_COMPARE: boolean;
}

export interface CrmRepositoryFlagsInput {
  tenantFlags?: Record<string, unknown>;
  overrides?: Partial<CrmRepositoryFlags>;
}

export const CRM_REPOSITORY_FLAG_DEFAULTS: Readonly<CrmRepositoryFlags> = {
  CRM_READ: false,
  CRM_READ_PRIMARY: false,
  CRM_SHADOW: false,
  CRM_COMPARE: false,
  CRM_WRITE: false,
  CRM_WRITE_PRIMARY: false,
  CRM_DUAL_WRITE: false,
  CRM_WRITE_COMPARE: false,
};

export const CRM_PRODUCTION_LOCKED_FLAGS: readonly CrmRepositoryFlagKey[] = [
  'CRM_READ',
  'CRM_READ_PRIMARY',
  'CRM_SHADOW',
  'CRM_COMPARE',
  'CRM_WRITE',
  'CRM_WRITE_PRIMARY',
  'CRM_DUAL_WRITE',
  'CRM_WRITE_COMPARE',
];

export const PRODUCTION_SUPABASE_PROJECT_REF = REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF;

export class CrmRepositoryFlagsValidationError extends Error {
  readonly code = 'CRM_REPOSITORY_FLAGS_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'CrmRepositoryFlagsValidationError';
  }
}

const ENV_KEY_MAP: Record<CrmRepositoryFlagKey, string> = {
  CRM_READ: 'VITE_CRM_READ',
  CRM_READ_PRIMARY: 'VITE_CRM_READ_PRIMARY',
  CRM_SHADOW: 'VITE_CRM_SHADOW',
  CRM_COMPARE: 'VITE_CRM_COMPARE',
  CRM_WRITE: 'VITE_CRM_WRITE',
  CRM_WRITE_PRIMARY: 'VITE_CRM_WRITE_PRIMARY',
  CRM_DUAL_WRITE: 'VITE_CRM_DUAL_WRITE',
  CRM_WRITE_COMPARE: 'VITE_CRM_WRITE_COMPARE',
};

export function lockDangerousCrmRepositoryFlags(flags: CrmRepositoryFlags): CrmRepositoryFlags {
  return lockDangerousFlags(flags, CRM_PRODUCTION_LOCKED_FLAGS);
}

export function applyProductionSafeLocks(flags: CrmRepositoryFlags): CrmRepositoryFlags {
  return applyProductionSafeLocksGeneric(flags, CRM_PRODUCTION_LOCKED_FLAGS, {
    supabaseHostLockedKeys: [
      'CRM_READ_PRIMARY',
      'CRM_WRITE',
      'CRM_WRITE_PRIMARY',
      'CRM_DUAL_WRITE',
      'CRM_WRITE_COMPARE',
    ],
  });
}

export function validateCrmRepositoryFlags(flags: CrmRepositoryFlags): void {
  if (flags.CRM_READ_PRIMARY && !flags.CRM_READ) {
    throw new CrmRepositoryFlagsValidationError(
      'CRM_READ_PRIMARY=true exige CRM_READ=true.',
    );
  }

  if (flags.CRM_WRITE && !flags.CRM_READ) {
    throw new CrmRepositoryFlagsValidationError(
      'CRM_WRITE=true exige CRM_READ=true.',
    );
  }

  if (flags.CRM_DUAL_WRITE && !flags.CRM_WRITE) {
    throw new CrmRepositoryFlagsValidationError(
      'CRM_DUAL_WRITE=true exige CRM_WRITE=true.',
    );
  }

  if (flags.CRM_WRITE_PRIMARY && !flags.CRM_WRITE) {
    throw new CrmRepositoryFlagsValidationError(
      'CRM_WRITE_PRIMARY=true exige CRM_WRITE=true.',
    );
  }

  const hasReadPath =
    flags.CRM_READ
    || flags.CRM_READ_PRIMARY
    || flags.CRM_SHADOW;

  if (flags.CRM_COMPARE && !hasReadPath) {
    throw new CrmRepositoryFlagsValidationError(
      'CRM_COMPARE=true exige CRM_READ, CRM_READ_PRIMARY ou CRM_SHADOW.',
    );
  }

  const hasWritePath = flags.CRM_WRITE || flags.CRM_DUAL_WRITE;
  if (flags.CRM_WRITE_COMPARE && !hasWritePath) {
    throw new CrmRepositoryFlagsValidationError(
      'CRM_WRITE_COMPARE=true exige CRM_WRITE ou CRM_DUAL_WRITE.',
    );
  }
}

function resolveRawFlags(input: CrmRepositoryFlagsInput = {}): CrmRepositoryFlags {
  const { tenantFlags, overrides } = input;
  const base = { ...CRM_REPOSITORY_FLAG_DEFAULTS };

  const fromSources: CrmRepositoryFlags = {
    CRM_READ: readTenantFlag(
      tenantFlags,
      'CRM_READ',
      readEnvFlag(ENV_KEY_MAP.CRM_READ, base.CRM_READ),
    ),
    CRM_READ_PRIMARY: readTenantFlag(
      tenantFlags,
      'CRM_READ_PRIMARY',
      readEnvFlag(ENV_KEY_MAP.CRM_READ_PRIMARY, base.CRM_READ_PRIMARY),
    ),
    CRM_SHADOW: readTenantFlag(
      tenantFlags,
      'CRM_SHADOW',
      readEnvFlag(ENV_KEY_MAP.CRM_SHADOW, base.CRM_SHADOW),
    ),
    CRM_COMPARE: readTenantFlag(
      tenantFlags,
      'CRM_COMPARE',
      readEnvFlag(ENV_KEY_MAP.CRM_COMPARE, base.CRM_COMPARE),
    ),
    CRM_WRITE: readTenantFlag(
      tenantFlags,
      'CRM_WRITE',
      readEnvFlag(ENV_KEY_MAP.CRM_WRITE, base.CRM_WRITE),
    ),
    CRM_WRITE_PRIMARY: readTenantFlag(
      tenantFlags,
      'CRM_WRITE_PRIMARY',
      readEnvFlag(ENV_KEY_MAP.CRM_WRITE_PRIMARY, base.CRM_WRITE_PRIMARY),
    ),
    CRM_DUAL_WRITE: readTenantFlag(
      tenantFlags,
      'CRM_DUAL_WRITE',
      readEnvFlag(ENV_KEY_MAP.CRM_DUAL_WRITE, base.CRM_DUAL_WRITE),
    ),
    CRM_WRITE_COMPARE: readTenantFlag(
      tenantFlags,
      'CRM_WRITE_COMPARE',
      readEnvFlag(ENV_KEY_MAP.CRM_WRITE_COMPARE, base.CRM_WRITE_COMPARE),
    ),
  };

  const merged = { ...fromSources, ...(overrides || {}) };
  validateCrmRepositoryFlags(merged);
  return applyProductionSafeLocks(merged);
}

export function getCrmRepositoryFlags(
  input: CrmRepositoryFlagsInput = {},
): CrmRepositoryFlags {
  return resolveRawFlags(input);
}

export function isCrmReadPrimaryEnabled(
  input: CrmRepositoryFlagsInput = {},
): boolean {
  const flags = getCrmRepositoryFlags(input);
  return flags.CRM_READ && flags.CRM_READ_PRIMARY;
}

export function shouldCompareCrmIdbVsRemote(
  input: CrmRepositoryFlagsInput = {},
): boolean {
  return getCrmRepositoryFlags(input).CRM_COMPARE;
}

export function shouldRunCrmShadowRead(
  input: CrmRepositoryFlagsInput = {},
): boolean {
  return getCrmRepositoryFlags(input).CRM_SHADOW;
}

export function isCrmReadEnabled(
  input: CrmRepositoryFlagsInput = {},
): boolean {
  return getCrmRepositoryFlags(input).CRM_READ;
}

export function isCrmDualWriteEnabled(
  input: CrmRepositoryFlagsInput = {},
): boolean {
  const flags = getCrmRepositoryFlags(input);
  return flags.CRM_READ && flags.CRM_WRITE && flags.CRM_DUAL_WRITE;
}

export function isCrmDualWriteOnlyEnabled(
  input: CrmRepositoryFlagsInput = {},
): boolean {
  const flags = getCrmRepositoryFlags(input);
  return isCrmDualWriteEnabled(input) && !flags.CRM_WRITE_PRIMARY;
}

export function isCrmWriteEnabled(
  input: CrmRepositoryFlagsInput = {},
): boolean {
  return getCrmRepositoryFlags(input).CRM_WRITE;
}

export function shouldCompareCrmWriteResults(
  input: CrmRepositoryFlagsInput = {},
): boolean {
  return getCrmRepositoryFlags(input).CRM_WRITE_COMPARE;
}

export function isCrmWritePrimaryEnabled(
  input: CrmRepositoryFlagsInput = {},
): boolean {
  const flags = getCrmRepositoryFlags(input);
  return flags.CRM_WRITE && flags.CRM_WRITE_PRIMARY;
}
