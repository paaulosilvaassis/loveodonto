/**
 * @module repositories/financial/financialRepositoryFlags
 * @description Feature flags Financeiro V3 — Phase 5.11 foundation.
 * Defaults: IndexedDB authority. Produção trava flags perigosas.
 */

export const FINANCIAL_FLAG_KEYS = {
  FINANCIAL_READ: 'FINANCIAL_READ',
  FINANCIAL_READ_PRIMARY: 'FINANCIAL_READ_PRIMARY',
  FINANCIAL_SHADOW: 'FINANCIAL_SHADOW',
  FINANCIAL_COMPARE: 'FINANCIAL_COMPARE',
  FINANCIAL_WRITE: 'FINANCIAL_WRITE',
  FINANCIAL_WRITE_PRIMARY: 'FINANCIAL_WRITE_PRIMARY',
  FINANCIAL_DUAL_WRITE: 'FINANCIAL_DUAL_WRITE',
  FINANCIAL_WRITE_COMPARE: 'FINANCIAL_WRITE_COMPARE',
} as const;

export type FinancialRepositoryFlagKey = keyof typeof FINANCIAL_FLAG_KEYS;

export interface FinancialRepositoryFlags {
  FINANCIAL_READ: boolean;
  FINANCIAL_READ_PRIMARY: boolean;
  FINANCIAL_SHADOW: boolean;
  FINANCIAL_COMPARE: boolean;
  FINANCIAL_WRITE: boolean;
  FINANCIAL_WRITE_PRIMARY: boolean;
  FINANCIAL_DUAL_WRITE: boolean;
  FINANCIAL_WRITE_COMPARE: boolean;
}

export interface FinancialRepositoryFlagsInput {
  tenantFlags?: Record<string, unknown>;
  overrides?: Partial<FinancialRepositoryFlags>;
}

export const FINANCIAL_REPOSITORY_FLAG_DEFAULTS: Readonly<FinancialRepositoryFlags> = {
  FINANCIAL_READ: false,
  FINANCIAL_READ_PRIMARY: false,
  FINANCIAL_SHADOW: false,
  FINANCIAL_COMPARE: false,
  FINANCIAL_WRITE: false,
  FINANCIAL_WRITE_PRIMARY: false,
  FINANCIAL_DUAL_WRITE: false,
  FINANCIAL_WRITE_COMPARE: false,
};

export const FINANCIAL_PRODUCTION_LOCKED_FLAGS: readonly FinancialRepositoryFlagKey[] = [
  'FINANCIAL_READ',
  'FINANCIAL_READ_PRIMARY',
  'FINANCIAL_SHADOW',
  'FINANCIAL_COMPARE',
  'FINANCIAL_WRITE',
  'FINANCIAL_WRITE_PRIMARY',
  'FINANCIAL_DUAL_WRITE',
  'FINANCIAL_WRITE_COMPARE',
];

export class FinancialRepositoryFlagsValidationError extends Error {
  readonly code = 'FINANCIAL_REPOSITORY_FLAGS_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'FinancialRepositoryFlagsValidationError';
  }
}

const ENV_KEY_MAP: Record<FinancialRepositoryFlagKey, string> = {
  FINANCIAL_READ: 'VITE_FINANCIAL_READ',
  FINANCIAL_READ_PRIMARY: 'VITE_FINANCIAL_READ_PRIMARY',
  FINANCIAL_SHADOW: 'VITE_FINANCIAL_SHADOW',
  FINANCIAL_COMPARE: 'VITE_FINANCIAL_COMPARE',
  FINANCIAL_WRITE: 'VITE_FINANCIAL_WRITE',
  FINANCIAL_WRITE_PRIMARY: 'VITE_FINANCIAL_WRITE_PRIMARY',
  FINANCIAL_DUAL_WRITE: 'VITE_FINANCIAL_DUAL_WRITE',
  FINANCIAL_WRITE_COMPARE: 'VITE_FINANCIAL_WRITE_COMPARE',
};

export const PRODUCTION_SUPABASE_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

function extractSupabaseProjectRef(url: unknown): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

function resolveConfiguredSupabaseProjectRef(): string {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  if (!env) return '';
  const url =
    env.VITE_SUPABASE_APP_URL
    || env.VITE_SUPABASE_URL
    || env.VITE_SUPABASE_PLATFORM_URL
    || '';
  return extractSupabaseProjectRef(url);
}

function isProductionSupabaseHostConfigured(): boolean {
  return resolveConfiguredSupabaseProjectRef() === PRODUCTION_SUPABASE_PROJECT_REF;
}

function parseBooleanLike(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readEnvFlag(key: FinancialRepositoryFlagKey, fallback: boolean): boolean {
  const envKey = ENV_KEY_MAP[key];
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  if (!env) return fallback;
  return parseBooleanLike(env[envKey], fallback);
}

function readTenantFlag(
  tenantFlags: Record<string, unknown> | undefined,
  key: FinancialRepositoryFlagKey,
  fallback: boolean,
): boolean {
  if (!tenantFlags || !(key in tenantFlags)) return fallback;
  return parseBooleanLike(tenantFlags[key], fallback);
}

function isProductionRuntime(): boolean {
  return Boolean(typeof import.meta !== 'undefined' && import.meta.env?.PROD);
}

export function lockDangerousFinancialRepositoryFlags(
  flags: FinancialRepositoryFlags,
): FinancialRepositoryFlags {
  const locked: FinancialRepositoryFlags = { ...flags };
  for (const key of FINANCIAL_PRODUCTION_LOCKED_FLAGS) {
    locked[key] = false;
  }
  return locked;
}

export function applyProductionSafeLocks(flags: FinancialRepositoryFlags): FinancialRepositoryFlags {
  let locked = flags;
  if (isProductionRuntime()) {
    locked = lockDangerousFinancialRepositoryFlags(flags);
  }
  if (isProductionSupabaseHostConfigured()) {
    if (locked.FINANCIAL_READ_PRIMARY) {
      locked = { ...locked, FINANCIAL_READ_PRIMARY: false };
    }
    if (locked.FINANCIAL_READ) {
      locked = { ...locked, FINANCIAL_READ: false };
    }
    if (locked.FINANCIAL_SHADOW) {
      locked = { ...locked, FINANCIAL_SHADOW: false };
    }
    if (locked.FINANCIAL_WRITE) {
      locked = { ...locked, FINANCIAL_WRITE: false };
    }
    if (locked.FINANCIAL_WRITE_PRIMARY) {
      locked = { ...locked, FINANCIAL_WRITE_PRIMARY: false };
    }
    if (locked.FINANCIAL_DUAL_WRITE) {
      locked = { ...locked, FINANCIAL_DUAL_WRITE: false };
    }
    if (locked.FINANCIAL_WRITE_COMPARE) {
      locked = { ...locked, FINANCIAL_WRITE_COMPARE: false };
    }
  }
  return locked;
}

export function validateFinancialRepositoryFlags(flags: FinancialRepositoryFlags): void {
  if (flags.FINANCIAL_READ_PRIMARY && !flags.FINANCIAL_READ) {
    throw new FinancialRepositoryFlagsValidationError(
      'FINANCIAL_READ_PRIMARY=true exige FINANCIAL_READ=true.',
    );
  }

  const hasReadPath =
    flags.FINANCIAL_READ
    || flags.FINANCIAL_READ_PRIMARY
    || flags.FINANCIAL_SHADOW;

  if (flags.FINANCIAL_COMPARE && !hasReadPath) {
    throw new FinancialRepositoryFlagsValidationError(
      'FINANCIAL_COMPARE=true exige FINANCIAL_READ, FINANCIAL_READ_PRIMARY ou FINANCIAL_SHADOW.',
    );
  }

  if (flags.FINANCIAL_WRITE && !flags.FINANCIAL_READ) {
    throw new FinancialRepositoryFlagsValidationError(
      'FINANCIAL_WRITE=true exige FINANCIAL_READ=true.',
    );
  }

  if (flags.FINANCIAL_DUAL_WRITE && !flags.FINANCIAL_WRITE) {
    throw new FinancialRepositoryFlagsValidationError(
      'FINANCIAL_DUAL_WRITE=true exige FINANCIAL_WRITE=true.',
    );
  }

  if (flags.FINANCIAL_WRITE_PRIMARY && !flags.FINANCIAL_WRITE) {
    throw new FinancialRepositoryFlagsValidationError(
      'FINANCIAL_WRITE_PRIMARY=true exige FINANCIAL_WRITE=true.',
    );
  }

  const hasWritePath = flags.FINANCIAL_WRITE || flags.FINANCIAL_DUAL_WRITE;
  if (flags.FINANCIAL_WRITE_COMPARE && !hasWritePath) {
    throw new FinancialRepositoryFlagsValidationError(
      'FINANCIAL_WRITE_COMPARE=true exige FINANCIAL_WRITE ou FINANCIAL_DUAL_WRITE.',
    );
  }
}

function resolveRawFlags(input: FinancialRepositoryFlagsInput = {}): FinancialRepositoryFlags {
  const { tenantFlags, overrides } = input;
  const base = { ...FINANCIAL_REPOSITORY_FLAG_DEFAULTS };

  const fromSources: FinancialRepositoryFlags = {
    FINANCIAL_READ: readTenantFlag(
      tenantFlags,
      'FINANCIAL_READ',
      readEnvFlag('FINANCIAL_READ', base.FINANCIAL_READ),
    ),
    FINANCIAL_READ_PRIMARY: readTenantFlag(
      tenantFlags,
      'FINANCIAL_READ_PRIMARY',
      readEnvFlag('FINANCIAL_READ_PRIMARY', base.FINANCIAL_READ_PRIMARY),
    ),
    FINANCIAL_SHADOW: readTenantFlag(
      tenantFlags,
      'FINANCIAL_SHADOW',
      readEnvFlag('FINANCIAL_SHADOW', base.FINANCIAL_SHADOW),
    ),
    FINANCIAL_COMPARE: readTenantFlag(
      tenantFlags,
      'FINANCIAL_COMPARE',
      readEnvFlag('FINANCIAL_COMPARE', base.FINANCIAL_COMPARE),
    ),
    FINANCIAL_WRITE: readTenantFlag(
      tenantFlags,
      'FINANCIAL_WRITE',
      readEnvFlag('FINANCIAL_WRITE', base.FINANCIAL_WRITE),
    ),
    FINANCIAL_WRITE_PRIMARY: readTenantFlag(
      tenantFlags,
      'FINANCIAL_WRITE_PRIMARY',
      readEnvFlag('FINANCIAL_WRITE_PRIMARY', base.FINANCIAL_WRITE_PRIMARY),
    ),
    FINANCIAL_DUAL_WRITE: readTenantFlag(
      tenantFlags,
      'FINANCIAL_DUAL_WRITE',
      readEnvFlag('FINANCIAL_DUAL_WRITE', base.FINANCIAL_DUAL_WRITE),
    ),
    FINANCIAL_WRITE_COMPARE: readTenantFlag(
      tenantFlags,
      'FINANCIAL_WRITE_COMPARE',
      readEnvFlag('FINANCIAL_WRITE_COMPARE', base.FINANCIAL_WRITE_COMPARE),
    ),
  };

  const merged = { ...fromSources, ...(overrides || {}) };
  validateFinancialRepositoryFlags(merged);
  return applyProductionSafeLocks(merged);
}

export function getFinancialRepositoryFlags(
  input: FinancialRepositoryFlagsInput = {},
): FinancialRepositoryFlags {
  return resolveRawFlags(input);
}

export function isFinancialReadPrimaryEnabled(
  input: FinancialRepositoryFlagsInput = {},
): boolean {
  const flags = getFinancialRepositoryFlags(input);
  return flags.FINANCIAL_READ && flags.FINANCIAL_READ_PRIMARY;
}

export function shouldCompareFinancialIdbVsRemote(
  input: FinancialRepositoryFlagsInput = {},
): boolean {
  return getFinancialRepositoryFlags(input).FINANCIAL_COMPARE;
}

export function isFinancialShadowEnabled(
  input: FinancialRepositoryFlagsInput = {},
): boolean {
  return getFinancialRepositoryFlags(input).FINANCIAL_SHADOW;
}

export function shouldRunFinancialShadowOrCompare(
  input: FinancialRepositoryFlagsInput = {},
): boolean {
  const flags = getFinancialRepositoryFlags(input);
  return flags.FINANCIAL_SHADOW || flags.FINANCIAL_COMPARE;
}

export function isFinancialDualWriteEnabled(
  input: FinancialRepositoryFlagsInput = {},
): boolean {
  const flags = getFinancialRepositoryFlags(input);
  return flags.FINANCIAL_READ && flags.FINANCIAL_WRITE && flags.FINANCIAL_DUAL_WRITE;
}

export function isFinancialDualWriteOnlyEnabled(
  input: FinancialRepositoryFlagsInput = {},
): boolean {
  const flags = getFinancialRepositoryFlags(input);
  return isFinancialDualWriteEnabled(input) && !flags.FINANCIAL_WRITE_PRIMARY;
}

export function isFinancialWriteEnabled(
  input: FinancialRepositoryFlagsInput = {},
): boolean {
  return getFinancialRepositoryFlags(input).FINANCIAL_WRITE;
}

export function shouldCompareFinancialWriteResults(
  input: FinancialRepositoryFlagsInput = {},
): boolean {
  return getFinancialRepositoryFlags(input).FINANCIAL_WRITE_COMPARE;
}

export function isFinancialWritePrimaryEnabled(
  input: FinancialRepositoryFlagsInput = {},
): boolean {
  const flags = getFinancialRepositoryFlags(input);
  return flags.FINANCIAL_WRITE && flags.FINANCIAL_WRITE_PRIMARY;
}
