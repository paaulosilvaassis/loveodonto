/**
 * @module repositories/agenda/agendaRepositoryFlags
 * @description Feature flags Agenda V3 — Phase 5.7 foundation.
 * Defaults: IndexedDB authority. Produção trava flags perigosas.
 */

export const AGENDA_FLAG_KEYS = {
  AGENDA_READ: 'AGENDA_READ',
  AGENDA_READ_PRIMARY: 'AGENDA_READ_PRIMARY',
  AGENDA_WRITE: 'AGENDA_WRITE',
  AGENDA_SHADOW: 'AGENDA_SHADOW',
  AGENDA_COMPARE: 'AGENDA_COMPARE',
} as const;

export type AgendaRepositoryFlagKey = keyof typeof AGENDA_FLAG_KEYS;

export interface AgendaRepositoryFlags {
  AGENDA_READ: boolean;
  AGENDA_READ_PRIMARY: boolean;
  AGENDA_WRITE: boolean;
  AGENDA_SHADOW: boolean;
  AGENDA_COMPARE: boolean;
}

export interface AgendaRepositoryFlagsInput {
  tenantFlags?: Record<string, unknown>;
  overrides?: Partial<AgendaRepositoryFlags>;
}

export const AGENDA_REPOSITORY_FLAG_DEFAULTS: Readonly<AgendaRepositoryFlags> = {
  AGENDA_READ: false,
  AGENDA_READ_PRIMARY: false,
  AGENDA_WRITE: false,
  AGENDA_SHADOW: false,
  AGENDA_COMPARE: false,
};

export const AGENDA_PRODUCTION_LOCKED_FLAGS: readonly AgendaRepositoryFlagKey[] = [
  'AGENDA_READ',
  'AGENDA_READ_PRIMARY',
  'AGENDA_WRITE',
  'AGENDA_SHADOW',
  'AGENDA_COMPARE',
];

export class AgendaRepositoryFlagsValidationError extends Error {
  readonly code = 'AGENDA_REPOSITORY_FLAGS_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'AgendaRepositoryFlagsValidationError';
  }
}

const ENV_KEY_MAP: Record<AgendaRepositoryFlagKey, string> = {
  AGENDA_READ: 'VITE_AGENDA_READ',
  AGENDA_READ_PRIMARY: 'VITE_AGENDA_READ_PRIMARY',
  AGENDA_WRITE: 'VITE_AGENDA_WRITE',
  AGENDA_SHADOW: 'VITE_AGENDA_SHADOW',
  AGENDA_COMPARE: 'VITE_AGENDA_COMPARE',
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

function readEnvFlag(key: AgendaRepositoryFlagKey, fallback: boolean): boolean {
  const envKey = ENV_KEY_MAP[key];
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  if (!env) return fallback;
  return parseBooleanLike(env[envKey], fallback);
}

function readTenantFlag(
  tenantFlags: Record<string, unknown> | undefined,
  key: AgendaRepositoryFlagKey,
  fallback: boolean,
): boolean {
  if (!tenantFlags || !(key in tenantFlags)) return fallback;
  return parseBooleanLike(tenantFlags[key], fallback);
}

function isProductionRuntime(): boolean {
  return Boolean(typeof import.meta !== 'undefined' && import.meta.env?.PROD);
}

export function lockDangerousAgendaRepositoryFlags(
  flags: AgendaRepositoryFlags,
): AgendaRepositoryFlags {
  const locked: AgendaRepositoryFlags = { ...flags };
  for (const key of AGENDA_PRODUCTION_LOCKED_FLAGS) {
    locked[key] = false;
  }
  return locked;
}

export function applyProductionSafeLocks(flags: AgendaRepositoryFlags): AgendaRepositoryFlags {
  let locked = flags;
  if (isProductionRuntime()) {
    locked = lockDangerousAgendaRepositoryFlags(flags);
  }
  if (isProductionSupabaseHostConfigured()) {
    if (locked.AGENDA_READ_PRIMARY) {
      locked = { ...locked, AGENDA_READ_PRIMARY: false };
    }
    if (locked.AGENDA_WRITE) {
      locked = { ...locked, AGENDA_WRITE: false };
    }
  }
  return locked;
}

export function validateAgendaRepositoryFlags(flags: AgendaRepositoryFlags): void {
  if (flags.AGENDA_READ_PRIMARY && !flags.AGENDA_READ) {
    throw new AgendaRepositoryFlagsValidationError(
      'AGENDA_READ_PRIMARY=true exige AGENDA_READ=true.',
    );
  }

  if (flags.AGENDA_WRITE && !flags.AGENDA_READ) {
    throw new AgendaRepositoryFlagsValidationError(
      'AGENDA_WRITE=true exige AGENDA_READ=true.',
    );
  }

  const hasReadPath =
    flags.AGENDA_READ
    || flags.AGENDA_READ_PRIMARY
    || flags.AGENDA_SHADOW;

  if (flags.AGENDA_COMPARE && !hasReadPath) {
    throw new AgendaRepositoryFlagsValidationError(
      'AGENDA_COMPARE=true exige AGENDA_READ, AGENDA_READ_PRIMARY ou AGENDA_SHADOW.',
    );
  }
}

function resolveRawFlags(input: AgendaRepositoryFlagsInput = {}): AgendaRepositoryFlags {
  const { tenantFlags, overrides } = input;
  const base = { ...AGENDA_REPOSITORY_FLAG_DEFAULTS };

  const fromSources: AgendaRepositoryFlags = {
    AGENDA_READ: readTenantFlag(
      tenantFlags,
      'AGENDA_READ',
      readEnvFlag('AGENDA_READ', base.AGENDA_READ),
    ),
    AGENDA_READ_PRIMARY: readTenantFlag(
      tenantFlags,
      'AGENDA_READ_PRIMARY',
      readEnvFlag('AGENDA_READ_PRIMARY', base.AGENDA_READ_PRIMARY),
    ),
    AGENDA_WRITE: readTenantFlag(
      tenantFlags,
      'AGENDA_WRITE',
      readEnvFlag('AGENDA_WRITE', base.AGENDA_WRITE),
    ),
    AGENDA_SHADOW: readTenantFlag(
      tenantFlags,
      'AGENDA_SHADOW',
      readEnvFlag('AGENDA_SHADOW', base.AGENDA_SHADOW),
    ),
    AGENDA_COMPARE: readTenantFlag(
      tenantFlags,
      'AGENDA_COMPARE',
      readEnvFlag('AGENDA_COMPARE', base.AGENDA_COMPARE),
    ),
  };

  const merged = { ...fromSources, ...(overrides || {}) };
  validateAgendaRepositoryFlags(merged);
  return applyProductionSafeLocks(merged);
}

export function getAgendaRepositoryFlags(
  input: AgendaRepositoryFlagsInput = {},
): AgendaRepositoryFlags {
  return resolveRawFlags(input);
}

export function isAgendaReadPrimaryEnabled(
  input: AgendaRepositoryFlagsInput = {},
): boolean {
  const flags = getAgendaRepositoryFlags(input);
  return flags.AGENDA_READ && flags.AGENDA_READ_PRIMARY;
}

export function shouldCompareAgendaIdbVsRemote(
  input: AgendaRepositoryFlagsInput = {},
): boolean {
  return getAgendaRepositoryFlags(input).AGENDA_COMPARE;
}

export function isAgendaWriteEnabled(
  input: AgendaRepositoryFlagsInput = {},
): boolean {
  const flags = getAgendaRepositoryFlags(input);
  return flags.AGENDA_READ && flags.AGENDA_WRITE;
}
