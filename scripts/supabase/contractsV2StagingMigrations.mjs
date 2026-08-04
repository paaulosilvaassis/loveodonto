/**
 * Contracts V2 — conjuntos de migrations staging vs local-only.
 * SSOT para preflight dry-run e remote validate (Phase 10.13D).
 */

export const STAGING_CONTRACTS_V2_MIGRATIONS = [
  '028_app_contracts_v2_foundation.sql',
  '029_app_contracts_v2_rls.sql',
  '030_app_contract_ledger.sql',
  '031_app_contract_number_sequences.sql',
  '032_app_signature_sessions_and_challenges.sql',
  '034_app_signature_delivery_attempts.sql',
  '035_app_contract_private_storage_staging.sql',
];

/** Local disposable only — never apply on staging/production. */
export const LOCAL_ONLY_CONTRACTS_V2_MIGRATION = '033_app_contract_private_storage_local.sql';

/** Local pipeline mirrors (include 033; exclude staging-only 035). */
export const LOCAL_MIRROR_CONTRACTS_V2_MIGRATIONS = [
  '028_app_contracts_v2_foundation.sql',
  '029_app_contracts_v2_rls.sql',
  '030_app_contract_ledger.sql',
  '031_app_contract_number_sequences.sql',
  '032_app_signature_sessions_and_challenges.sql',
  '033_app_contract_private_storage_local.sql',
  '034_app_signature_delivery_attempts.sql',
];

export const STAGING_PRIVATE_BUCKET = 'contracts-v2-private-staging';
export const STAGING_BUCKET_MAX_BYTES = 20_971_520;

export const STAGING_BUCKET_MIME_ALLOWLIST = [
  'application/pdf',
  'application/json',
  'image/png',
  'image/webp',
  'image/jpeg',
  'text/plain',
];

export function migrationVersion(fileName) {
  return String(fileName).split('_')[0];
}

export const STAGING_EXPECTED_VERSIONS = STAGING_CONTRACTS_V2_MIGRATIONS.map(migrationVersion);
export const LOCAL_ONLY_VERSION = migrationVersion(LOCAL_ONLY_CONTRACTS_V2_MIGRATION);
