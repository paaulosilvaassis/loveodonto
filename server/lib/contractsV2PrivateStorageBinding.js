/**
 * Bind fail-closed de bucket privado Contracts V2 — Phase 10.21AI.
 * Espelho server-side do domínio (Railway não importa TypeScript).
 */

export const CONTRACTS_V2_PRIVATE_LOCAL_BUCKET = 'contracts-v2-private-local';
export const CONTRACTS_V2_PRIVATE_STAGING_BUCKET = 'contracts-v2-private-staging';
export const CONTRACTS_V2_PRIVATE_PRODUCTION_BUCKET = 'contracts-v2-private-production';

export const CONTRACTS_V2_PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';
export const CONTRACTS_V2_STAGING_PROJECT_REF = 'tckdjyunwmdpqmewrwvt';

const STORAGE_MODES = new Set([
  'unavailable',
  'memory',
  'private-local',
  'private-staging-configured',
  'private-production',
]);

function readTrimmed(env, key) {
  const raw = env?.[key];
  if (raw == null) return null;
  const value = String(raw).trim();
  return value || null;
}

export function extractSupabaseProjectRef(env = process.env) {
  const explicit = readTrimmed(env, 'SUPABASE_PROJECT_REF') || readTrimmed(env, 'SUPABASE_PROJECT_ID');
  if (explicit) return explicit.toLowerCase();
  const hay = [
    readTrimmed(env, 'SUPABASE_URL'),
    readTrimmed(env, 'SUPABASE_STORAGE_URL'),
  ].filter(Boolean).join(' ');
  const match = hay.match(/([a-z0-9]{20})\.supabase\.co/i);
  return match?.[1]?.toLowerCase() || null;
}

function envHaystack(env) {
  return [
    readTrimmed(env, 'SUPABASE_PROJECT_REF'),
    readTrimmed(env, 'SUPABASE_PROJECT_ID'),
    readTrimmed(env, 'SUPABASE_URL'),
    readTrimmed(env, 'SUPABASE_STORAGE_URL'),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function resolveContractsV2PrivateStorageBinding(env = process.env) {
  const storageMode = String(env.CONTRACTS_V2_STORAGE_MODE || 'unavailable').trim().toLowerCase()
    || 'unavailable';
  const configuredBucket = readTrimmed(env, 'CONTRACTS_V2_PRIVATE_BUCKET');
  const projectRef = extractSupabaseProjectRef(env);
  const hay = envHaystack(env);
  const hasProductionRef = hay.includes(CONTRACTS_V2_PRODUCTION_PROJECT_REF)
    || projectRef === CONTRACTS_V2_PRODUCTION_PROJECT_REF;
  const hasStagingRef = hay.includes(CONTRACTS_V2_STAGING_PROJECT_REF)
    || projectRef === CONTRACTS_V2_STAGING_PROJECT_REF;

  const fail = (code, extra = []) => ({
    ok: false,
    bound: false,
    storageMode,
    bucket: configuredBucket,
    projectRef,
    code,
    reasons: extra,
  });

  if (!STORAGE_MODES.has(storageMode)) {
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
    code: null,
    reasons: [],
  };
}

export function toPublicStorageBindingPayload(binding) {
  return {
    mode: binding.storageMode,
    bucket: binding.bound ? binding.bucket : null,
    bound: binding.bound,
    ok: binding.ok,
    code: binding.ok ? null : binding.code,
  };
}
