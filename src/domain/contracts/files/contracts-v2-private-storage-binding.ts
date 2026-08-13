/**
 * @module domain/contracts/files/contracts-v2-private-storage-binding
 * @description Bind fail-closed de bucket privado Contracts V2 — Phase 10.21AI.
 * Sem fallback local/staging/público. Sem seleção automática por uma única env.
 */

export const CONTRACTS_V2_PRIVATE_LOCAL_BUCKET = 'contracts-v2-private-local';
export const CONTRACTS_V2_PRIVATE_STAGING_BUCKET = 'contracts-v2-private-staging';
export const CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET = 'contracts-v2-private-production';

export const CONTRACTS_V2_PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';
export const CONTRACTS_V2_STAGING_PROJECT_REF = 'tckdjyunwmdpqmewrwvt';

export const CONTRACTS_V2_STORAGE_MODES = [
  'unavailable',
  'memory',
  'private-local',
  'private-staging-configured',
  'private-production',
] as const;

export type ContractsV2StorageModeBinding = (typeof CONTRACTS_V2_STORAGE_MODES)[number];

export const CONTRACTS_V2_PRIVATE_STORAGE_ADAPTER_MODES = [
  'local-test',
  'private-staging-configured',
  'private-production',
] as const;

export type ContractsV2PrivateStorageAdapterMode =
  (typeof CONTRACTS_V2_PRIVATE_STORAGE_ADAPTER_MODES)[number];

export const CONTRACTS_V2_PACKAGE_ARTIFACT_KINDS = [
  'CONTRACT_FINAL',
  'TCLE_SNAPSHOT',
  'LGPD_SNAPSHOT',
  'EVIDENCE',
  'SIGNED_PACKAGE_REPORT',
] as const;

export type ContractsV2PackageArtifactKind =
  (typeof CONTRACTS_V2_PACKAGE_ARTIFACT_KINDS)[number];

export interface ContractsV2PrivateStorageBinding {
  ok: boolean;
  bound: boolean;
  storageMode: string;
  bucket: string | null;
  projectRef: string | null;
  code: string | null;
  reasons: string[];
}

const BUCKET_BY_STORAGE_MODE: Record<string, string | null> = {
  unavailable: null,
  memory: null,
  'private-local': CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
  'private-staging-configured': CONTRACTS_V2_PRIVATE_STAGING_BUCKET,
  'private-production': CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET,
};

const BUCKET_BY_ADAPTER_MODE: Record<ContractsV2PrivateStorageAdapterMode, string> = {
  'local-test': CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
  'private-staging-configured': CONTRACTS_V2_PRIVATE_STAGING_BUCKET,
  'private-production': CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET,
};

const ARTIFACT_FILE_TYPE: Record<ContractsV2PackageArtifactKind, string> = {
  CONTRACT_FINAL: 'GENERATED_PDF',
  TCLE_SNAPSHOT: 'GENERATED_PDF',
  LGPD_SNAPSHOT: 'GENERATED_PDF',
  EVIDENCE: 'EVIDENCE_REPORT',
  SIGNED_PACKAGE_REPORT: 'INTEGRITY_MANIFEST',
};

function readTrimmed(env: NodeJS.ProcessEnv, key: string): string | null {
  const raw = env[key];
  if (raw == null) return null;
  const value = String(raw).trim();
  return value || null;
}

export function extractSupabaseProjectRef(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = readTrimmed(env, 'SUPABASE_PROJECT_REF') || readTrimmed(env, 'SUPABASE_PROJECT_ID');
  if (explicit) return explicit.toLowerCase();

  const hay = [
    readTrimmed(env, 'SUPABASE_URL'),
    readTrimmed(env, 'SUPABASE_STORAGE_URL'),
  ].filter(Boolean).join(' ');
  const match = hay.match(/([a-z0-9]{20})\.supabase\.co/i);
  return match?.[1]?.toLowerCase() || null;
}

function envHaystack(env: NodeJS.ProcessEnv): string {
  return [
    readTrimmed(env, 'SUPABASE_PROJECT_REF'),
    readTrimmed(env, 'SUPABASE_PROJECT_ID'),
    readTrimmed(env, 'SUPABASE_URL'),
    readTrimmed(env, 'SUPABASE_STORAGE_URL'),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function requiredBucketForStorageMode(storageMode: string): string | null {
  if (Object.prototype.hasOwnProperty.call(BUCKET_BY_STORAGE_MODE, storageMode)) {
    return BUCKET_BY_STORAGE_MODE[storageMode];
  }
  return null;
}

export function requiredBucketForAdapterMode(mode: ContractsV2PrivateStorageAdapterMode): string {
  return BUCKET_BY_ADAPTER_MODE[mode];
}

export function assertPrivateStorageAdapterBinding(
  mode: string,
  bucket: string,
): { mode: ContractsV2PrivateStorageAdapterMode; bucket: string } {
  if (!(CONTRACTS_V2_PRIVATE_STORAGE_ADAPTER_MODES as readonly string[]).includes(mode)) {
    throw Object.assign(new Error('Modo de storage adapter inválido.'), {
      code: 'CONTRACTS_V2_STORAGE_MODE_INVALID',
    });
  }
  const typed = mode as ContractsV2PrivateStorageAdapterMode;
  const expected = requiredBucketForAdapterMode(typed);
  if (String(bucket || '').trim() !== expected) {
    throw Object.assign(new Error('Bucket fora do allowlist do modo.'), {
      code: 'CONTRACT_STORAGE_BUCKET_UNAVAILABLE',
    });
  }
  return { mode: typed, bucket: expected };
}

export function resolveContractsV2PrivateStorageBinding(
  env: NodeJS.ProcessEnv = process.env,
): ContractsV2PrivateStorageBinding {
  const reasons: string[] = [];
  const storageMode = String(env.CONTRACTS_V2_STORAGE_MODE || 'unavailable').trim().toLowerCase()
    || 'unavailable';
  const configuredBucket = readTrimmed(env, 'CONTRACTS_V2_PRIVATE_BUCKET');
  const projectRef = extractSupabaseProjectRef(env);
  const hay = envHaystack(env);
  const hasProductionRef = hay.includes(CONTRACTS_V2_PRODUCTION_PROJECT_REF)
    || projectRef === CONTRACTS_V2_PRODUCTION_PROJECT_REF;
  const hasStagingRef = hay.includes(CONTRACTS_V2_STAGING_PROJECT_REF)
    || projectRef === CONTRACTS_V2_STAGING_PROJECT_REF;

  const fail = (code: string, extra: string[] = []): ContractsV2PrivateStorageBinding => ({
    ok: false,
    bound: false,
    storageMode,
    bucket: configuredBucket,
    projectRef,
    code,
    reasons: [...reasons, ...extra],
  });

  if (!(CONTRACTS_V2_STORAGE_MODES as readonly string[]).includes(storageMode)) {
    return fail('CONTRACTS_V2_STORAGE_MODE_INVALID', [`storage_mode_invalid:${storageMode}`]);
  }

  if (hasStagingRef && storageMode === 'private-production') {
    return fail('CONTRACTS_V2_STAGING_REF_IN_PRODUCTION', ['staging_project_in_production_mode']);
  }
  if (hasProductionRef && storageMode === 'private-staging-configured') {
    return fail('CONTRACTS_V2_PRODUCTION_PROJECT_MISMATCH', ['production_project_with_staging_storage']);
  }
  if (hasProductionRef && storageMode === 'private-local') {
    return fail('CONTRACTS_V2_PRODUCTION_PROJECT_MISMATCH', ['production_project_with_local_storage']);
  }

  if (configuredBucket === CONTRACTS_V2_PRIVATE_LOCAL_BUCKET && storageMode === 'private-production') {
    return fail('CONTRACTS_V2_PRIVATE_BUCKET_MISMATCH', ['production_mode_local_bucket']);
  }
  if (configuredBucket === CONTRACTS_V2_PRIVATE_STAGING_BUCKET && storageMode === 'private-production') {
    return fail('CONTRACTS_V2_PRIVATE_BUCKET_MISMATCH', ['production_mode_staging_bucket']);
  }
  if (configuredBucket === CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET && storageMode !== 'private-production') {
    return fail('CONTRACTS_V2_PRIVATE_BUCKET_PRODUCTION_ONLY', ['production_bucket_without_production_mode']);
  }
  if (configuredBucket === CONTRACTS_V2_PRIVATE_STAGING_BUCKET && storageMode !== 'private-staging-configured') {
    return fail('CONTRACTS_V2_PRIVATE_BUCKET_STAGING_ONLY', ['staging_bucket_without_staging_mode']);
  }
  if (configuredBucket === CONTRACTS_V2_PRIVATE_LOCAL_BUCKET && storageMode !== 'private-local') {
    return fail('CONTRACTS_V2_PRIVATE_BUCKET_LOCAL_ONLY', ['local_bucket_without_local_mode']);
  }

  if (storageMode === 'private-production') {
    if (!configuredBucket) {
      return fail('CONTRACTS_V2_PRODUCTION_BUCKET_REQUIRED', ['production_bucket_missing']);
    }
    if (configuredBucket !== CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET) {
      return fail('CONTRACTS_V2_PRIVATE_BUCKET_MISMATCH', ['production_bucket_mismatch']);
    }
    if (!hasProductionRef || projectRef !== CONTRACTS_V2_PRODUCTION_PROJECT_REF) {
      return fail('CONTRACTS_V2_PRODUCTION_PROJECT_MISMATCH', ['production_project_required']);
    }
    return {
      ok: true,
      bound: true,
      storageMode,
      bucket: CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET,
      projectRef,
      code: null,
      reasons: [],
    };
  }

  if (storageMode === 'private-staging-configured') {
    if (!configuredBucket) {
      return fail('CONTRACTS_V2_STAGING_BUCKET_REQUIRED', ['staging_bucket_missing']);
    }
    if (configuredBucket !== CONTRACTS_V2_PRIVATE_STAGING_BUCKET) {
      return fail('CONTRACTS_V2_PRIVATE_BUCKET_MISMATCH', ['staging_bucket_mismatch']);
    }
    if (hasProductionRef) {
      return fail('CONTRACTS_V2_PRODUCTION_PROJECT_MISMATCH', ['production_project_with_staging_storage']);
    }
    return {
      ok: true,
      bound: true,
      storageMode,
      bucket: CONTRACTS_V2_PRIVATE_STAGING_BUCKET,
      projectRef,
      code: null,
      reasons: [],
    };
  }

  if (storageMode === 'private-local') {
    if (!configuredBucket) {
      return fail('CONTRACTS_V2_LOCAL_BUCKET_REQUIRED', ['local_bucket_missing']);
    }
    if (configuredBucket !== CONTRACTS_V2_PRIVATE_LOCAL_BUCKET) {
      return fail('CONTRACTS_V2_PRIVATE_BUCKET_MISMATCH', ['local_bucket_mismatch']);
    }
    return {
      ok: true,
      bound: true,
      storageMode,
      bucket: CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
      projectRef,
      code: null,
      reasons: [],
    };
  }

  return {
    ok: true,
    bound: false,
    storageMode,
    bucket: configuredBucket,
    projectRef,
    code: storageMode === 'unavailable' || storageMode === 'memory' ? null : 'CONTRACTS_V2_STORAGE_UNBOUND',
    reasons: [],
  };
}

export function resolvePackageArtifactStorageTarget(
  binding: ContractsV2PrivateStorageBinding,
  kind: ContractsV2PackageArtifactKind,
): { bucket: string; fileType: string; kind: ContractsV2PackageArtifactKind } {
  if (!binding.ok || !binding.bound || !binding.bucket) {
    throw Object.assign(new Error('Storage privado não está bound.'), {
      code: binding.code || 'CONTRACTS_V2_STORAGE_UNBOUND',
    });
  }
  return {
    bucket: binding.bucket,
    fileType: ARTIFACT_FILE_TYPE[kind],
    kind,
  };
}

export function toPublicStorageBindingPayload(binding: ContractsV2PrivateStorageBinding) {
  return {
    mode: binding.storageMode,
    bucket: binding.bound ? binding.bucket : null,
    bound: binding.bound,
    ok: binding.ok,
    code: binding.ok ? null : binding.code,
  };
}
