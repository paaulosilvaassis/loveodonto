/**
 * @module repositories/contracts/contractPersistenceTables
 * @description Nomes das tabelas V2 — namespace app_contract_* (evita colisão com 006).
 */

export const CONTRACT_V2_TABLES = {
  SIGNATURE_POLICIES: 'app_signature_policies',
  TEMPLATES: 'app_contract_templates',
  TEMPLATE_VERSIONS: 'app_contract_template_versions',
  CONTRACTS: 'app_contracts',
  VERSIONS: 'app_contract_versions',
  PARTIES: 'app_contract_parties',
  TREATMENTS: 'app_contract_treatments',
  ODONTOGRAM_SNAPSHOTS: 'app_contract_odontogram_snapshots',
  FINANCIAL_SNAPSHOTS: 'app_contract_financial_snapshots',
  CONSENTS: 'app_contract_consents',
  PACKAGES: 'app_contract_packages',
  PACKAGE_ITEMS: 'app_contract_package_items',
  ENVELOPES: 'app_signature_envelopes',
  SIGNERS: 'app_signature_signers',
  FILES: 'app_contract_files',
  AUDIT_EVENTS: 'app_contract_audit_events',
  IDEMPOTENCY_KEYS: 'app_contract_idempotency_keys',
  LEDGER: 'app_contract_ledger',
  NUMBER_SEQUENCES: 'app_contract_number_sequences',
  SIGNATURE_SESSIONS: 'app_signature_sessions',
  SIGNATURE_CHALLENGES: 'app_signature_challenges',
  SIGNATURE_RATE_LIMITS: 'app_signature_rate_limits',
  DELIVERY_ATTEMPTS: 'app_signature_delivery_attempts',
  STORAGE_OPS: 'app_contract_storage_ops',
} as const;

/** Bucket privado exclusivamente local — Phase 10.10. */
export const CONTRACTS_V2_PRIVATE_LOCAL_BUCKET = 'contracts-v2-private-local';

/** Tabelas legado 006 — NÃO usar nestes repositories. */
export const CONTRACT_LEGACY_TABLES = {
  TEMPLATES: 'contract_templates',
  BLOCKS: 'contract_blocks',
  GENERATED: 'generated_contracts',
  AUDIT_LOGS: 'contract_audit_logs',
} as const;
