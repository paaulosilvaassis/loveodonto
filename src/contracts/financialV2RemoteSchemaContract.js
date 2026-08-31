/**
 * PHASE 11.J — contrato de schema remoto financial_v2.
 * SSOT de flags/ambiente. Não liga writers. Não faz backfill.
 */
import {
  DELETE_POLICY,
  FINANCING_IDEMPOTENCY_CONSTRAINT,
  PAYMENT_IDEMPOTENCY_CONSTRAINT,
  RECEIVABLE_IDEMPOTENCY_CONSTRAINT,
  RECEIVABLE_STATUSES,
  RBAC_SERVER_BOUNDARY,
  TARGET_TABLES,
  TARGET_MONEY_STORAGE_MODEL,
  TARGET_TENANT_MODEL,
} from './financialCoreV2PersistenceContract.js';
import { FINANCIAL_REPOSITORY_FLAG_DEFAULTS } from '../repositories/financial/financialRepositoryFlags.ts';

export const PHASE_11J_GATE = 'FINANCIAL_V2_REMOTE_SCHEMA_VALIDATED';

export const PRODUCTION_SUPABASE_PROJECT_REF = 'uoepkwhqztmsjnzirpev';
export const STAGING_SUPABASE_PROJECT_REF = 'tckdjyunwmdpqmewrwvt';

export const PHASE_11J_RUNTIME = {
  TARGET_DB_ENVIRONMENT: 'STAGING',
  REMOTE_SCHEMA_ENVIRONMENT: STAGING_SUPABASE_PROJECT_REF,
  PRODUCTION_DATABASE_CHANGED: false,
  FINANCIAL_V2_SCHEMA_APPLIED: true,
  MIGRATION_APPLIED: true,
  BACKFILL_APPLIED: false,
  SHADOW_WRITE_ENABLED: false,
  DUAL_WRITE_ENABLED: false,
  FINANCIAL_SERVER_READ_ENABLED: false,
  FINANCIAL_SERVER_WRITE_ENABLED: false,
  HISTORICAL_DATA_CHANGED: false,
  OLD_FINANCIAL_021_CHANGED: false,
  APPLY_COMMAND: 'mcp apply_migration project_id=tckdjyunwmdpqmewrwvt name=financial_core_v2',
};

export const FINANCIAL_V2_MIGRATION_FILE = 'supabase/migrations/041_financial_core_v2.sql';
export const FINANCIAL_V2_DRAFT_FILE = 'docs/design/drafts/041_financial_core_v2.sql';
export const FINANCIAL_021_MIGRATION_FILE = 'supabase/migrations/021_app_financial_core.sql';

export const CURRENT_TENANT_ID_FORMAT = 'UUID_SAAS_SESSION_OR_OPAQUE_IDB_LEGACY';
export const SUPABASE_TENANT_ID_FORMAT = 'UUID';
export const FINANCIAL_V2_TENANT_ID_TYPE = 'UUID';
export const TENANT_ID_MAPPING_REQUIRED = 'YES_FOR_NON_UUID_IDB_QUARANTINE_ONLY';
export const TENANT_ID_TYPE_RESOLVED = true;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFinancialV2TenantId(value) {
  return UUID_RE.test(String(value || '').trim());
}

export const V2_TABLES = [
  'financial_v2_receivables',
  'financial_v2_payments',
  'financial_v2_financings',
  'financial_v2_financing_installments',
  'financial_v2_charges',
  'financial_v2_boleto_charges',
  'financial_v2_boleto_reminder_events',
];

export const V2_MONEY_COLUMNS = {
  financial_v2_receivables: ['original_cents', 'discount_cents', 'interest_cents', 'fine_cents', 'total_cents'],
  financial_v2_payments: ['amount_cents'],
  financial_v2_financings: ['total_cents', 'entry_cents', 'interest_cents', 'fee_cents', 'discount_cents', 'total_payable_cents'],
  financial_v2_financing_installments: ['amount_cents'],
  financial_v2_charges: ['amount_cents'],
  financial_v2_boleto_charges: ['amount_cents'],
};

export const V2_CANONICAL_RECEIVABLE_STATUSES = RECEIVABLE_STATUSES;
export const V2_FORBIDDEN_RECEIVABLE_STATUSES = ['open', 'partial', 'cancelled', 'pending_approval', 'completed'];

export const V2_SQL_CONTRACT_PARITY_NOTES = {
  draftQuarantineTable: 'OMITTED_FROM_APPLIED_MIGRATION',
  draftQuarantineReason: 'Phase 11.I quarantine is in-memory/report-only',
  installmentAmountCents: 'ADDED vs draft — projection field, not obligation SSOT',
  paymentAmountPositive: 'TIGHTENED vs draft (>=0 → >0)',
  installmentNumberNonneg: 'ADDED vs draft',
  rls: 'IMPLEMENTED vs draft sketch',
};

export {
  DELETE_POLICY,
  FINANCING_IDEMPOTENCY_CONSTRAINT,
  PAYMENT_IDEMPOTENCY_CONSTRAINT,
  RECEIVABLE_IDEMPOTENCY_CONSTRAINT,
  RBAC_SERVER_BOUNDARY,
  TARGET_TABLES,
  TARGET_MONEY_STORAGE_MODEL,
  TARGET_TENANT_MODEL,
  FINANCIAL_REPOSITORY_FLAG_DEFAULTS,
};

export const REVERSAL_SQL_INVARIANTS = [
  'FK RESTRICT same tenant (tenant_id, reverses_payment_id)',
  'CHECK kind=payment XOR reverses_payment_id NOT NULL',
  'CHECK reverses_payment_id IS DISTINCT FROM source_id',
  'UNIQUE (tenant_id, reverses_payment_id) WHERE kind = reversal',
  'trigger: reversal target must be kind=payment',
];

export const REVERSAL_SERVICE_INVARIANTS = [
  'cannot reverse a reversal',
  'reversal.amount_cents === original.amount_cents',
  'no circular graph beyond self-check',
];

export const V2_DESTRUCTIVE_CASCADE_PATHS = 'NONE';
