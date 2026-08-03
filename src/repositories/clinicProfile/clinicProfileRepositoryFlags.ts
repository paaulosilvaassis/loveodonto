/**
 * @module repositories/clinicProfile/clinicProfileRepositoryFlags
 * @description Feature flags Clinic Profile V3 — Phase 5.5 read cutover.
 * Defaults: IndexedDB authority. Produção trava flags perigosas.
 */

export const CLINIC_PROFILE_FLAG_KEYS = {
  CLINIC_PROFILE_READ: 'CLINIC_PROFILE_READ',
  CLINIC_PROFILE_READ_PRIMARY: 'CLINIC_PROFILE_READ_PRIMARY',
  CLINIC_PROFILE_WRITE: 'CLINIC_PROFILE_WRITE',
  CLINIC_PROFILE_SHADOW_READ: 'CLINIC_PROFILE_SHADOW_READ',
  CLINIC_PROFILE_COMPARE_IDB_REMOTE: 'CLINIC_PROFILE_COMPARE_IDB_REMOTE',
} as const;

export type ClinicProfileRepositoryFlagKey = keyof typeof CLINIC_PROFILE_FLAG_KEYS;

export interface ClinicProfileRepositoryFlags {
  CLINIC_PROFILE_READ: boolean;
  CLINIC_PROFILE_READ_PRIMARY: boolean;
  CLINIC_PROFILE_WRITE: boolean;
  CLINIC_PROFILE_SHADOW_READ: boolean;
  CLINIC_PROFILE_COMPARE_IDB_REMOTE: boolean;
}

export interface ClinicProfileRepositoryFlagsInput {
  tenantFlags?: Record<string, unknown>;
  overrides?: Partial<ClinicProfileRepositoryFlags>;
}

export const CLINIC_PROFILE_REPOSITORY_FLAG_DEFAULTS: Readonly<ClinicProfileRepositoryFlags> = {
  CLINIC_PROFILE_READ: false,
  CLINIC_PROFILE_READ_PRIMARY: false,
  CLINIC_PROFILE_WRITE: false,
  CLINIC_PROFILE_SHADOW_READ: false,
  CLINIC_PROFILE_COMPARE_IDB_REMOTE: false,
};

export const CLINIC_PROFILE_PRODUCTION_LOCKED_FLAGS: readonly ClinicProfileRepositoryFlagKey[] = [
  'CLINIC_PROFILE_READ',
  'CLINIC_PROFILE_READ_PRIMARY',
  'CLINIC_PROFILE_WRITE',
  'CLINIC_PROFILE_SHADOW_READ',
  'CLINIC_PROFILE_COMPARE_IDB_REMOTE',
];

export class ClinicProfileRepositoryFlagsValidationError extends Error {
  readonly code = 'CLINIC_PROFILE_REPOSITORY_FLAGS_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ClinicProfileRepositoryFlagsValidationError';
  }
}

const ENV_KEY_MAP: Record<ClinicProfileRepositoryFlagKey, string> = {
  CLINIC_PROFILE_READ: 'VITE_CLINIC_PROFILE_READ',
  CLINIC_PROFILE_READ_PRIMARY: 'VITE_CLINIC_PROFILE_READ_PRIMARY',
  CLINIC_PROFILE_WRITE: 'VITE_CLINIC_PROFILE_WRITE',
  CLINIC_PROFILE_SHADOW_READ: 'VITE_CLINIC_PROFILE_SHADOW_READ',
  CLINIC_PROFILE_COMPARE_IDB_REMOTE: 'VITE_CLINIC_PROFILE_COMPARE_IDB_REMOTE',
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

function readEnvFlag(key: ClinicProfileRepositoryFlagKey, fallback: boolean): boolean {
  const envKey = ENV_KEY_MAP[key];
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  if (!env) return fallback;
  return parseBooleanLike(env[envKey], fallback);
}

function readTenantFlag(
  tenantFlags: Record<string, unknown> | undefined,
  key: ClinicProfileRepositoryFlagKey,
  fallback: boolean,
): boolean {
  if (!tenantFlags || !(key in tenantFlags)) return fallback;
  return parseBooleanLike(tenantFlags[key], fallback);
}

function isProductionRuntime(): boolean {
  return Boolean(typeof import.meta !== 'undefined' && import.meta.env?.PROD);
}

export function lockDangerousClinicProfileRepositoryFlags(
  flags: ClinicProfileRepositoryFlags,
): ClinicProfileRepositoryFlags {
  const locked: ClinicProfileRepositoryFlags = { ...flags };
  for (const key of CLINIC_PROFILE_PRODUCTION_LOCKED_FLAGS) {
    locked[key] = false;
  }
  return locked;
}

export function applyProductionSafeLocks(
  flags: ClinicProfileRepositoryFlags,
): ClinicProfileRepositoryFlags {
  let locked = flags;
  if (isProductionRuntime()) {
    locked = lockDangerousClinicProfileRepositoryFlags(flags);
  }
  if (isProductionSupabaseHostConfigured() && locked.CLINIC_PROFILE_READ_PRIMARY) {
    locked = { ...locked, CLINIC_PROFILE_READ_PRIMARY: false };
  }
  return locked;
}

export function validateClinicProfileRepositoryFlags(flags: ClinicProfileRepositoryFlags): void {
  if (flags.CLINIC_PROFILE_READ_PRIMARY && !flags.CLINIC_PROFILE_READ) {
    throw new ClinicProfileRepositoryFlagsValidationError(
      'CLINIC_PROFILE_READ_PRIMARY=true exige CLINIC_PROFILE_READ=true.',
    );
  }

  if (flags.CLINIC_PROFILE_WRITE && !flags.CLINIC_PROFILE_READ) {
    throw new ClinicProfileRepositoryFlagsValidationError(
      'CLINIC_PROFILE_WRITE=true exige CLINIC_PROFILE_READ=true.',
    );
  }

  const hasReadPath =
    flags.CLINIC_PROFILE_READ
    || flags.CLINIC_PROFILE_READ_PRIMARY
    || flags.CLINIC_PROFILE_SHADOW_READ;

  if (flags.CLINIC_PROFILE_COMPARE_IDB_REMOTE && !hasReadPath) {
    throw new ClinicProfileRepositoryFlagsValidationError(
      'CLINIC_PROFILE_COMPARE_IDB_REMOTE=true exige CLINIC_PROFILE_READ, CLINIC_PROFILE_READ_PRIMARY ou CLINIC_PROFILE_SHADOW_READ.',
    );
  }
}

function resolveRawFlags(input: ClinicProfileRepositoryFlagsInput = {}): ClinicProfileRepositoryFlags {
  const { tenantFlags, overrides } = input;
  const base = { ...CLINIC_PROFILE_REPOSITORY_FLAG_DEFAULTS };

  const fromSources: ClinicProfileRepositoryFlags = {
    CLINIC_PROFILE_READ: readTenantFlag(
      tenantFlags,
      'CLINIC_PROFILE_READ',
      readEnvFlag('CLINIC_PROFILE_READ', base.CLINIC_PROFILE_READ),
    ),
    CLINIC_PROFILE_READ_PRIMARY: readTenantFlag(
      tenantFlags,
      'CLINIC_PROFILE_READ_PRIMARY',
      readEnvFlag('CLINIC_PROFILE_READ_PRIMARY', base.CLINIC_PROFILE_READ_PRIMARY),
    ),
    CLINIC_PROFILE_WRITE: readTenantFlag(
      tenantFlags,
      'CLINIC_PROFILE_WRITE',
      readEnvFlag('CLINIC_PROFILE_WRITE', base.CLINIC_PROFILE_WRITE),
    ),
    CLINIC_PROFILE_SHADOW_READ: readTenantFlag(
      tenantFlags,
      'CLINIC_PROFILE_SHADOW_READ',
      readEnvFlag('CLINIC_PROFILE_SHADOW_READ', base.CLINIC_PROFILE_SHADOW_READ),
    ),
    CLINIC_PROFILE_COMPARE_IDB_REMOTE: readTenantFlag(
      tenantFlags,
      'CLINIC_PROFILE_COMPARE_IDB_REMOTE',
      readEnvFlag('CLINIC_PROFILE_COMPARE_IDB_REMOTE', base.CLINIC_PROFILE_COMPARE_IDB_REMOTE),
    ),
  };

  const merged = { ...fromSources, ...(overrides || {}) };
  validateClinicProfileRepositoryFlags(merged);
  return applyProductionSafeLocks(merged);
}

export function getClinicProfileRepositoryFlags(
  input: ClinicProfileRepositoryFlagsInput = {},
): ClinicProfileRepositoryFlags {
  return resolveRawFlags(input);
}

export function isClinicProfileReadPrimaryEnabled(
  input: ClinicProfileRepositoryFlagsInput = {},
): boolean {
  const flags = getClinicProfileRepositoryFlags(input);
  return flags.CLINIC_PROFILE_READ && flags.CLINIC_PROFILE_READ_PRIMARY;
}

export function shouldCompareClinicProfileIdbVsRemote(
  input: ClinicProfileRepositoryFlagsInput = {},
): boolean {
  const flags = getClinicProfileRepositoryFlags(input);
  return flags.CLINIC_PROFILE_COMPARE_IDB_REMOTE;
}

export function isClinicProfileWriteEnabled(
  input: ClinicProfileRepositoryFlagsInput = {},
): boolean {
  const flags = getClinicProfileRepositoryFlags(input);
  return flags.CLINIC_PROFILE_WRITE;
}
