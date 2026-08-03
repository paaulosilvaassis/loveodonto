/**
 * @module repositories/collaborator/collaboratorRepositoryFlags
 * @description Feature flags oficiais da consolidação RH V3 (Love Odonto).
 *
 * **Ticket:** Sprint 1A — 1.3
 * **Status:** Camada isolada — **único consumidor futuro:** `collaboratorRepository.ts`.
 *
 * **Regras:**
 * - Defaults preservam comportamento atual (IndexedDB authority).
 * - Em produção, flags perigosas são forçadas `false` mesmo via env.
 * - Nenhuma leitura de storage do browser neste módulo (env + tenant.flags futuro).
 * - Telas e services **não** devem importar este arquivo até wiring explícito.
 *
 * **Flag temporária:**
 * - `RH_ALLOW_SYNTHETIC_STUBS` default `true` — compatibilidade `col-saas-*`.
 *   Remover após Sprint 1D (RH_V3_BLUEPRINT L-02).
 *
 * @see docs/reports/RH_V3_BLUEPRINT.md §10 Feature Flags
 */

// ---------------------------------------------------------------------------
// Chaves oficiais
// ---------------------------------------------------------------------------

export const RH_FLAG_KEYS = {
  RH_SUPABASE_READ: 'RH_SUPABASE_READ',
  RH_SUPABASE_READ_PRIMARY: 'RH_SUPABASE_READ_PRIMARY',
  RH_SUPABASE_WRITE: 'RH_SUPABASE_WRITE',
  RH_IDB_WRITE_DISABLED: 'RH_IDB_WRITE_DISABLED',
  RH_ALLOW_SYNTHETIC_STUBS: 'RH_ALLOW_SYNTHETIC_STUBS',
  RH_SHADOW_READ: 'RH_SHADOW_READ',
  RH_COMPARE_IDB_SUPABASE: 'RH_COMPARE_IDB_SUPABASE',
} as const;

export type CollaboratorRepositoryFlagKey = keyof typeof RH_FLAG_KEYS;

/** Shape resolvido e validado das flags RH. */
export interface CollaboratorRepositoryFlags {
  RH_SUPABASE_READ: boolean;
  RH_SUPABASE_READ_PRIMARY: boolean;
  RH_SUPABASE_WRITE: boolean;
  RH_IDB_WRITE_DISABLED: boolean;
  /** @deprecatedTransitório Sprint 1D — stubs col-saas-* */
  RH_ALLOW_SYNTHETIC_STUBS: boolean;
  RH_SHADOW_READ: boolean;
  RH_COMPARE_IDB_SUPABASE: boolean;
}

/** Entrada opcional para resolução (tenant-context futuro + testes). */
export interface CollaboratorRepositoryFlagsInput {
  /** Snapshot `tenant.flags` — prioridade sobre env quando presente. */
  tenantFlags?: Record<string, unknown>;
  /** Overrides explícitos — apenas testes internos. */
  overrides?: Partial<CollaboratorRepositoryFlags>;
}

/** Documentação de defaults seguros (comportamento atual = IDB authority). */
export const COLLABORATOR_REPOSITORY_FLAG_DEFAULTS: Readonly<CollaboratorRepositoryFlags> = {
  RH_SUPABASE_READ: false,
  RH_SUPABASE_READ_PRIMARY: false,
  RH_SUPABASE_WRITE: false,
  RH_IDB_WRITE_DISABLED: false,
  /** Temporário: mantém criação de stubs col-saas-* até cutover Supabase. */
  RH_ALLOW_SYNTHETIC_STUBS: true,
  RH_SHADOW_READ: false,
  RH_COMPARE_IDB_SUPABASE: false,
};

/** Flags consideradas perigosas — forçadas false em produção. */
export const COLLABORATOR_REPOSITORY_PRODUCTION_LOCKED_FLAGS: readonly CollaboratorRepositoryFlagKey[] = [
  'RH_SUPABASE_READ',
  'RH_SUPABASE_READ_PRIMARY',
  'RH_SUPABASE_WRITE',
  'RH_IDB_WRITE_DISABLED',
  'RH_SHADOW_READ',
  'RH_COMPARE_IDB_SUPABASE',
];

/** Aviso exportado para QA/docs — stub sintético é transitório. */
export const RH_ALLOW_SYNTHETIC_STUBS_TRANSITION_NOTICE =
  'RH_ALLOW_SYNTHETIC_STUBS está true por compatibilidade com col-saas-* (remoção Sprint 1D).';

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export class CollaboratorRepositoryFlagsValidationError extends Error {
  readonly code = 'COLLABORATOR_REPOSITORY_FLAGS_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'CollaboratorRepositoryFlagsValidationError';
  }
}

// ---------------------------------------------------------------------------
// Resolução (env → tenant → overrides)
// ---------------------------------------------------------------------------

const ENV_KEY_MAP: Record<CollaboratorRepositoryFlagKey, string> = {
  RH_SUPABASE_READ: 'VITE_RH_SUPABASE_READ',
  RH_SUPABASE_READ_PRIMARY: 'VITE_RH_SUPABASE_READ_PRIMARY',
  RH_SUPABASE_WRITE: 'VITE_RH_SUPABASE_WRITE',
  RH_IDB_WRITE_DISABLED: 'VITE_RH_IDB_WRITE_DISABLED',
  RH_ALLOW_SYNTHETIC_STUBS: 'VITE_RH_ALLOW_SYNTHETIC_STUBS',
  RH_SHADOW_READ: 'VITE_RH_SHADOW_READ',
  RH_COMPARE_IDB_SUPABASE: 'VITE_RH_COMPARE_IDB_SUPABASE',
};

/** Host Supabase produção — READ_PRIMARY nunca ativo (RC-02). */
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

function readEnvFlag(key: CollaboratorRepositoryFlagKey, fallback: boolean): boolean {
  const envKey = ENV_KEY_MAP[key];
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  if (!env) return fallback;
  return parseBooleanLike(env[envKey], fallback);
}

function readTenantFlag(
  tenantFlags: Record<string, unknown> | undefined,
  key: CollaboratorRepositoryFlagKey,
  fallback: boolean,
): boolean {
  if (!tenantFlags || !(key in tenantFlags)) return fallback;
  return parseBooleanLike(tenantFlags[key], fallback);
}

function isProductionRuntime(): boolean {
  return Boolean(typeof import.meta !== 'undefined' && import.meta.env?.PROD);
}

/**
 * Força flags perigosas para false (usado em produção).
 */
export function lockDangerousCollaboratorRepositoryFlags(
  flags: CollaboratorRepositoryFlags,
): CollaboratorRepositoryFlags {
  const locked: CollaboratorRepositoryFlags = { ...flags };
  for (const key of COLLABORATOR_REPOSITORY_PRODUCTION_LOCKED_FLAGS) {
    locked[key] = false;
  }
  return locked;
}

/**
 * Aplica lock de produção — flags perigosas não podem ser true em prod via env/tenant.
 */
export function applyProductionSafeLocks(
  flags: CollaboratorRepositoryFlags,
): CollaboratorRepositoryFlags {
  let locked = flags;
  if (isProductionRuntime()) {
    locked = lockDangerousCollaboratorRepositoryFlags(flags);
  }
  if (isProductionSupabaseHostConfigured() && locked.RH_SUPABASE_READ_PRIMARY) {
    locked = { ...locked, RH_SUPABASE_READ_PRIMARY: false };
  }
  return locked;
}

/**
 * Valida combinações proibidas. Lança se inválido.
 * @throws {CollaboratorRepositoryFlagsValidationError}
 */
export function validateCollaboratorRepositoryFlags(flags: CollaboratorRepositoryFlags): void {
  if (flags.RH_SUPABASE_WRITE && !flags.RH_SUPABASE_READ) {
    throw new CollaboratorRepositoryFlagsValidationError(
      'RH_SUPABASE_WRITE=true exige RH_SUPABASE_READ=true.',
    );
  }

  if (flags.RH_IDB_WRITE_DISABLED && !flags.RH_SUPABASE_WRITE) {
    throw new CollaboratorRepositoryFlagsValidationError(
      'RH_IDB_WRITE_DISABLED=true exige RH_SUPABASE_WRITE=true.',
    );
  }

  if (flags.RH_SUPABASE_READ_PRIMARY && !flags.RH_SUPABASE_READ) {
    throw new CollaboratorRepositoryFlagsValidationError(
      'RH_SUPABASE_READ_PRIMARY=true exige RH_SUPABASE_READ=true.',
    );
  }

  const hasReadPath =
    flags.RH_SUPABASE_READ || flags.RH_SUPABASE_READ_PRIMARY || flags.RH_SHADOW_READ;

  if (flags.RH_COMPARE_IDB_SUPABASE && !hasReadPath) {
    throw new CollaboratorRepositoryFlagsValidationError(
      'RH_COMPARE_IDB_SUPABASE=true exige RH_SUPABASE_READ, RH_SUPABASE_READ_PRIMARY ou RH_SHADOW_READ.',
    );
  }
}

function resolveRawFlags(input: CollaboratorRepositoryFlagsInput = {}): CollaboratorRepositoryFlags {
  const { tenantFlags, overrides } = input;
  const base = { ...COLLABORATOR_REPOSITORY_FLAG_DEFAULTS };

  const fromSources: CollaboratorRepositoryFlags = {
    RH_SUPABASE_READ: readTenantFlag(
      tenantFlags,
      'RH_SUPABASE_READ',
      readEnvFlag('RH_SUPABASE_READ', base.RH_SUPABASE_READ),
    ),
    RH_SUPABASE_READ_PRIMARY: readTenantFlag(
      tenantFlags,
      'RH_SUPABASE_READ_PRIMARY',
      readEnvFlag('RH_SUPABASE_READ_PRIMARY', base.RH_SUPABASE_READ_PRIMARY),
    ),
    RH_SUPABASE_WRITE: readTenantFlag(
      tenantFlags,
      'RH_SUPABASE_WRITE',
      readEnvFlag('RH_SUPABASE_WRITE', base.RH_SUPABASE_WRITE),
    ),
    RH_IDB_WRITE_DISABLED: readTenantFlag(
      tenantFlags,
      'RH_IDB_WRITE_DISABLED',
      readEnvFlag('RH_IDB_WRITE_DISABLED', base.RH_IDB_WRITE_DISABLED),
    ),
    RH_ALLOW_SYNTHETIC_STUBS: readTenantFlag(
      tenantFlags,
      'RH_ALLOW_SYNTHETIC_STUBS',
      readEnvFlag('RH_ALLOW_SYNTHETIC_STUBS', base.RH_ALLOW_SYNTHETIC_STUBS),
    ),
    RH_SHADOW_READ: readTenantFlag(
      tenantFlags,
      'RH_SHADOW_READ',
      readEnvFlag('RH_SHADOW_READ', base.RH_SHADOW_READ),
    ),
    RH_COMPARE_IDB_SUPABASE: readTenantFlag(
      tenantFlags,
      'RH_COMPARE_IDB_SUPABASE',
      readEnvFlag('RH_COMPARE_IDB_SUPABASE', base.RH_COMPARE_IDB_SUPABASE),
    ),
  };

  const merged: CollaboratorRepositoryFlags = {
    ...fromSources,
    ...overrides,
  };

  return applyProductionSafeLocks(merged);
}

/**
 * Resolve flags oficiais validadas.
 * @throws {CollaboratorRepositoryFlagsValidationError}
 */
export function getCollaboratorRepositoryFlags(
  input: CollaboratorRepositoryFlagsInput = {},
): CollaboratorRepositoryFlags {
  const flags = resolveRawFlags(input);
  validateCollaboratorRepositoryFlags(flags);
  return flags;
}

// ---------------------------------------------------------------------------
// Helpers (único ponto de leitura para o Repository futuro)
// ---------------------------------------------------------------------------

export function isRhSupabaseReadEnabled(
  input: CollaboratorRepositoryFlagsInput = {},
): boolean {
  const flags = getCollaboratorRepositoryFlags(input);
  return flags.RH_SUPABASE_READ || flags.RH_SUPABASE_READ_PRIMARY;
}

export function isRhSupabaseWriteEnabled(
  input: CollaboratorRepositoryFlagsInput = {},
): boolean {
  return getCollaboratorRepositoryFlags(input).RH_SUPABASE_WRITE;
}

export function isRhShadowReadEnabled(
  input: CollaboratorRepositoryFlagsInput = {},
): boolean {
  return getCollaboratorRepositoryFlags(input).RH_SHADOW_READ;
}

/**
 * Compare IDB vs Supabase — depende de shadow/read habilitado.
 */
export function shouldCompareIdbVsSupabase(
  input: CollaboratorRepositoryFlagsInput = {},
): boolean {
  const flags = getCollaboratorRepositoryFlags(input);
  if (!flags.RH_COMPARE_IDB_SUPABASE) return false;
  return (
    flags.RH_SHADOW_READ || flags.RH_SUPABASE_READ || flags.RH_SUPABASE_READ_PRIMARY
  );
}

export function shouldAllowSyntheticStubs(
  input: CollaboratorRepositoryFlagsInput = {},
): boolean {
  return getCollaboratorRepositoryFlags(input).RH_ALLOW_SYNTHETIC_STUBS;
}

/** Leitura primária Supabase (cutover) — distinto de shadow-only. */
export function isRhSupabaseReadPrimaryEnabled(
  input: CollaboratorRepositoryFlagsInput = {},
): boolean {
  return getCollaboratorRepositoryFlags(input).RH_SUPABASE_READ_PRIMARY;
}

/** IDB core write desabilitado — cache only. */
export function isRhIdbWriteDisabled(
  input: CollaboratorRepositoryFlagsInput = {},
): boolean {
  return getCollaboratorRepositoryFlags(input).RH_IDB_WRITE_DISABLED;
}

/**
 * Shadow read ativo sem promover Supabase a primary — não altera autoridade de leitura atual.
 */
export function isRhShadowReadWithoutPrimary(
  input: CollaboratorRepositoryFlagsInput = {},
): boolean {
  const flags = getCollaboratorRepositoryFlags(input);
  return flags.RH_SHADOW_READ && !flags.RH_SUPABASE_READ_PRIMARY;
}
