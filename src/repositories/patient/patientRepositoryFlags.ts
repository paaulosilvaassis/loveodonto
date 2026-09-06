/**
 * @module repositories/patient/patientRepositoryFlags
 * @description Feature flags Pacientes V3 — Phase 9.4A / CLOUD.3 / CLOUD.9D.1.
 * Defaults: IndexedDB authority. Produção trava apenas flags de WRITE.
 * READ/SHADOW/COMPARE/READ_PRIMARY são configuráveis via env (default false).
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

export const PATIENTS_FLAG_KEYS = {
  PATIENTS_READ: 'PATIENTS_READ',
  PATIENTS_READ_PRIMARY: 'PATIENTS_READ_PRIMARY',
  PATIENTS_SHADOW: 'PATIENTS_SHADOW',
  PATIENTS_COMPARE: 'PATIENTS_COMPARE',
  PATIENTS_WRITE: 'PATIENTS_WRITE',
  PATIENTS_WRITE_PRIMARY: 'PATIENTS_WRITE_PRIMARY',
  PATIENTS_DUAL_WRITE: 'PATIENTS_DUAL_WRITE',
  PATIENTS_WRITE_COMPARE: 'PATIENTS_WRITE_COMPARE',
} as const;

export type PatientRepositoryFlagKey = keyof typeof PATIENTS_FLAG_KEYS;

/**
 * Aliases documentais PATIENT_REMOTE_* → PATIENTS_* (mesmas chaves canônicas).
 * Env opcional: VITE_PATIENT_REMOTE_* também é lido como fallback.
 */
export const PATIENT_REMOTE_FLAG_ALIASES = {
  PATIENT_REMOTE_READ: PATIENTS_FLAG_KEYS.PATIENTS_READ,
  PATIENT_REMOTE_READ_SHADOW: PATIENTS_FLAG_KEYS.PATIENTS_SHADOW,
  PATIENT_REMOTE_READ_PRIMARY: PATIENTS_FLAG_KEYS.PATIENTS_READ_PRIMARY,
  PATIENT_REMOTE_WRITE: PATIENTS_FLAG_KEYS.PATIENTS_WRITE,
  PATIENT_REMOTE_WRITE_PRIMARY: PATIENTS_FLAG_KEYS.PATIENTS_WRITE_PRIMARY,
} as const;

/** @deprecated Prefer PATIENTS_READ — alias documental. */
export const PATIENT_REMOTE_READ = PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_READ;
/** @deprecated Prefer PATIENTS_SHADOW — alias documental. */
export const PATIENT_REMOTE_READ_SHADOW = PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_READ_SHADOW;
/** @deprecated Prefer PATIENTS_READ_PRIMARY — alias documental. */
export const PATIENT_REMOTE_READ_PRIMARY = PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_READ_PRIMARY;
/** @deprecated Prefer PATIENTS_WRITE — alias documental. */
export const PATIENT_REMOTE_WRITE = PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_WRITE;
/** @deprecated Prefer PATIENTS_WRITE_PRIMARY — alias documental. */
export const PATIENT_REMOTE_WRITE_PRIMARY = PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_WRITE_PRIMARY;

export interface PatientRepositoryFlags {
  PATIENTS_READ: boolean;
  PATIENTS_READ_PRIMARY: boolean;
  PATIENTS_SHADOW: boolean;
  PATIENTS_COMPARE: boolean;
  PATIENTS_WRITE: boolean;
  PATIENTS_WRITE_PRIMARY: boolean;
  PATIENTS_DUAL_WRITE: boolean;
  PATIENTS_WRITE_COMPARE: boolean;
}

export interface PatientRepositoryFlagsInput {
  tenantFlags?: Record<string, unknown>;
  overrides?: Partial<PatientRepositoryFlags>;
}

/** Defaults seguros — IndexedDB permanece SSOT. */
export const PATIENTS_REPOSITORY_FLAG_DEFAULTS: Readonly<PatientRepositoryFlags> = {
  PATIENTS_READ: false,
  PATIENTS_READ_PRIMARY: false,
  PATIENTS_SHADOW: false,
  PATIENTS_COMPARE: false,
  PATIENTS_WRITE: false,
  PATIENTS_WRITE_PRIMARY: false,
  PATIENTS_DUAL_WRITE: false,
  PATIENTS_WRITE_COMPARE: false,
};

/**
 * CLOUD.9D.1 — production runtime lock aplica-se somente a mutação remota.
 * Flags de leitura remota permanecem default-false e configuráveis via env.
 */
export const PATIENTS_PRODUCTION_LOCKED_FLAGS: readonly PatientRepositoryFlagKey[] = [
  'PATIENTS_WRITE',
  'PATIENTS_WRITE_PRIMARY',
  'PATIENTS_DUAL_WRITE',
  'PATIENTS_WRITE_COMPARE',
];

export const PRODUCTION_SUPABASE_PROJECT_REF = REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF;

export class PatientRepositoryFlagsValidationError extends Error {
  readonly code = 'PATIENT_REPOSITORY_FLAGS_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'PatientRepositoryFlagsValidationError';
  }
}

const ENV_KEY_MAP: Record<PatientRepositoryFlagKey, string> = {
  PATIENTS_READ: 'VITE_PATIENTS_READ',
  PATIENTS_READ_PRIMARY: 'VITE_PATIENTS_READ_PRIMARY',
  PATIENTS_SHADOW: 'VITE_PATIENTS_SHADOW',
  PATIENTS_COMPARE: 'VITE_PATIENTS_COMPARE',
  PATIENTS_WRITE: 'VITE_PATIENTS_WRITE',
  PATIENTS_WRITE_PRIMARY: 'VITE_PATIENTS_WRITE_PRIMARY',
  PATIENTS_DUAL_WRITE: 'VITE_PATIENTS_DUAL_WRITE',
  PATIENTS_WRITE_COMPARE: 'VITE_PATIENTS_WRITE_COMPARE',
};

/** Env aliases VITE_PATIENT_REMOTE_* (fallback quando VITE_PATIENTS_* ausente). */
const ENV_ALIAS_KEY_MAP: Partial<Record<PatientRepositoryFlagKey, string>> = {
  PATIENTS_READ: 'VITE_PATIENT_REMOTE_READ',
  PATIENTS_READ_PRIMARY: 'VITE_PATIENT_REMOTE_READ_PRIMARY',
  PATIENTS_SHADOW: 'VITE_PATIENT_REMOTE_READ_SHADOW',
  PATIENTS_WRITE: 'VITE_PATIENT_REMOTE_WRITE',
  PATIENTS_WRITE_PRIMARY: 'VITE_PATIENT_REMOTE_WRITE_PRIMARY',
};

function readFlagEnv(key: PatientRepositoryFlagKey, fallback: boolean): boolean {
  const primary = readEnvFlag(ENV_KEY_MAP[key], fallback);
  const aliasKey = ENV_ALIAS_KEY_MAP[key];
  if (!aliasKey) return primary;
  // Aceita VITE_PATIENT_REMOTE_* como OR quando a chave canônica não está true
  if (primary) return true;
  return readEnvFlag(aliasKey, fallback);
}

export function lockDangerousPatientRepositoryFlags(
  flags: PatientRepositoryFlags,
): PatientRepositoryFlags {
  return lockDangerousFlags(
    flags as unknown as Record<string, boolean>,
    PATIENTS_PRODUCTION_LOCKED_FLAGS as readonly string[],
  ) as unknown as PatientRepositoryFlags;
}

export function applyProductionSafeLocks(
  flags: PatientRepositoryFlags,
): PatientRepositoryFlags {
  return applyProductionSafeLocksGeneric(
    flags as unknown as Record<string, boolean>,
    PATIENTS_PRODUCTION_LOCKED_FLAGS as readonly string[],
    {
      // Host de produção bloqueia apenas mutação; READ_PRIMARY é env-gated (CLOUD.9D.1).
      supabaseHostLockedKeys: [
        'PATIENTS_WRITE',
        'PATIENTS_WRITE_PRIMARY',
        'PATIENTS_DUAL_WRITE',
        'PATIENTS_WRITE_COMPARE',
      ],
    },
  ) as unknown as PatientRepositoryFlags;
}

export function validatePatientRepositoryFlags(flags: PatientRepositoryFlags): void {
  if (flags.PATIENTS_READ_PRIMARY && !flags.PATIENTS_READ) {
    throw new PatientRepositoryFlagsValidationError(
      'PATIENTS_READ_PRIMARY=true exige PATIENTS_READ=true.',
    );
  }

  if (flags.PATIENTS_WRITE && !flags.PATIENTS_READ) {
    throw new PatientRepositoryFlagsValidationError(
      'PATIENTS_WRITE=true exige PATIENTS_READ=true.',
    );
  }

  if (flags.PATIENTS_DUAL_WRITE && !flags.PATIENTS_WRITE) {
    throw new PatientRepositoryFlagsValidationError(
      'PATIENTS_DUAL_WRITE=true exige PATIENTS_WRITE=true.',
    );
  }

  if (flags.PATIENTS_WRITE_PRIMARY && !flags.PATIENTS_WRITE) {
    throw new PatientRepositoryFlagsValidationError(
      'PATIENTS_WRITE_PRIMARY=true exige PATIENTS_WRITE=true.',
    );
  }

  const hasReadPath =
    flags.PATIENTS_READ
    || flags.PATIENTS_READ_PRIMARY
    || flags.PATIENTS_SHADOW;

  if (flags.PATIENTS_COMPARE && !hasReadPath) {
    throw new PatientRepositoryFlagsValidationError(
      'PATIENTS_COMPARE=true exige PATIENTS_READ, PATIENTS_READ_PRIMARY ou PATIENTS_SHADOW.',
    );
  }

  const hasWritePath = flags.PATIENTS_WRITE || flags.PATIENTS_DUAL_WRITE;
  if (flags.PATIENTS_WRITE_COMPARE && !hasWritePath) {
    throw new PatientRepositoryFlagsValidationError(
      'PATIENTS_WRITE_COMPARE=true exige PATIENTS_WRITE ou PATIENTS_DUAL_WRITE.',
    );
  }
}

function resolveRawFlags(input: PatientRepositoryFlagsInput = {}): PatientRepositoryFlags {
  const { tenantFlags, overrides } = input;
  const base = { ...PATIENTS_REPOSITORY_FLAG_DEFAULTS };

  const fromSources: PatientRepositoryFlags = {
    PATIENTS_READ: readTenantFlag(
      tenantFlags,
      'PATIENTS_READ',
      readFlagEnv('PATIENTS_READ', base.PATIENTS_READ),
    ),
    PATIENTS_READ_PRIMARY: readTenantFlag(
      tenantFlags,
      'PATIENTS_READ_PRIMARY',
      readFlagEnv('PATIENTS_READ_PRIMARY', base.PATIENTS_READ_PRIMARY),
    ),
    PATIENTS_SHADOW: readTenantFlag(
      tenantFlags,
      'PATIENTS_SHADOW',
      readFlagEnv('PATIENTS_SHADOW', base.PATIENTS_SHADOW),
    ),
    PATIENTS_COMPARE: readTenantFlag(
      tenantFlags,
      'PATIENTS_COMPARE',
      readFlagEnv('PATIENTS_COMPARE', base.PATIENTS_COMPARE),
    ),
    PATIENTS_WRITE: readTenantFlag(
      tenantFlags,
      'PATIENTS_WRITE',
      readFlagEnv('PATIENTS_WRITE', base.PATIENTS_WRITE),
    ),
    PATIENTS_WRITE_PRIMARY: readTenantFlag(
      tenantFlags,
      'PATIENTS_WRITE_PRIMARY',
      readFlagEnv('PATIENTS_WRITE_PRIMARY', base.PATIENTS_WRITE_PRIMARY),
    ),
    PATIENTS_DUAL_WRITE: readTenantFlag(
      tenantFlags,
      'PATIENTS_DUAL_WRITE',
      readFlagEnv('PATIENTS_DUAL_WRITE', base.PATIENTS_DUAL_WRITE),
    ),
    PATIENTS_WRITE_COMPARE: readTenantFlag(
      tenantFlags,
      'PATIENTS_WRITE_COMPARE',
      readFlagEnv('PATIENTS_WRITE_COMPARE', base.PATIENTS_WRITE_COMPARE),
    ),
  };

  const merged = { ...fromSources, ...(overrides || {}) };
  validatePatientRepositoryFlags(merged);
  return applyProductionSafeLocks(merged);
}

export function getPatientRepositoryFlags(
  input: PatientRepositoryFlagsInput = {},
): PatientRepositoryFlags {
  return resolveRawFlags(input);
}

export function isPatientsReadEnabled(
  input: PatientRepositoryFlagsInput = {},
): boolean {
  return getPatientRepositoryFlags(input).PATIENTS_READ;
}

export function isPatientsReadPrimaryEnabled(
  input: PatientRepositoryFlagsInput = {},
): boolean {
  const flags = getPatientRepositoryFlags(input);
  return flags.PATIENTS_READ && flags.PATIENTS_READ_PRIMARY;
}

export function shouldRunPatientsShadowRead(
  input: PatientRepositoryFlagsInput = {},
): boolean {
  return getPatientRepositoryFlags(input).PATIENTS_SHADOW;
}

export function shouldComparePatientsIdbVsRemote(
  input: PatientRepositoryFlagsInput = {},
): boolean {
  const flags = getPatientRepositoryFlags(input);
  return flags.PATIENTS_COMPARE || flags.PATIENTS_SHADOW;
}

export function isPatientsWriteEnabled(
  input: PatientRepositoryFlagsInput = {},
): boolean {
  return getPatientRepositoryFlags(input).PATIENTS_WRITE;
}

export function isPatientsDualWriteEnabled(
  input: PatientRepositoryFlagsInput = {},
): boolean {
  const flags = getPatientRepositoryFlags(input);
  return flags.PATIENTS_READ && flags.PATIENTS_WRITE && flags.PATIENTS_DUAL_WRITE;
}

/** Dual-write shadow only — desliga quando WRITE_PRIMARY está ativo. */
export function isPatientsDualWriteOnlyEnabled(
  input: PatientRepositoryFlagsInput = {},
): boolean {
  const flags = getPatientRepositoryFlags(input);
  return isPatientsDualWriteEnabled(input) && !flags.PATIENTS_WRITE_PRIMARY;
}

export function isPatientsWritePrimaryEnabled(
  input: PatientRepositoryFlagsInput = {},
): boolean {
  const flags = getPatientRepositoryFlags(input);
  return flags.PATIENTS_WRITE && flags.PATIENTS_WRITE_PRIMARY;
}

export function shouldComparePatientsWriteResults(
  input: PatientRepositoryFlagsInput = {},
): boolean {
  return getPatientRepositoryFlags(input).PATIENTS_WRITE_COMPARE;
}
