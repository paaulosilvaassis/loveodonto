/**
 * PHASE 11.H — contrato executável de persistência financeira v2.
 * DESIGN ONLY. Não aplica SQL. Não habilita dual-write.
 *
 * MONEY_CONVERSION_RULE = SAME_AS_11G_TO_CENTS
 */
import { toCents } from '../services/receivableMoney.js';

export const PHASE_11H_GATE = 'FINANCIAL_PERSISTENCE_CUTOVER_DESIGNED';

export const PHASE_11H_RUNTIME = {
  APPLY_SQL: false,
  REMOTE_DATABASE_CHANGED: false,
  MIGRATION_APPLIED: false,
  BACKFILL_APPLIED: false,
  DUAL_WRITE_ENABLED: false,
  SUPABASE_CUTOVER: false,
  HISTORICAL_DATA_CHANGED: false,
  FORBIDDEN_COMMANDS: [
    'supabase db push',
    'supabase db reset',
    'supabase migration up',
    'supabase db execute',
  ],
  DRAFT_SQL_PATH: 'docs/design/drafts/041_financial_core_v2.sql',
  DRAFT_SQL_MUST_NOT_LIVE_UNDER: 'supabase/migrations',
};

export const CURRENT_FINANCIAL_SSOT = 'INDEXEDDB_LEGACY_SERVICES';
export const TARGET_FINANCIAL_SSOT = 'SUPABASE_FINANCIAL_V2_NOT_YET_AUTHORITATIVE';

export const TARGET_MONEY_STORAGE_MODEL = 'INTEGER_CENTS';
export const TARGET_TENANT_MODEL = 'TENANT_ID_NOT_NULL';
export const MONEY_CONVERSION_RULE = 'SAME_AS_11G_TO_CENTS';

export function roundToCentsForPersistence(value) {
  return toCents(value);
}

export const EXISTING_SCHEMA_CLASSIFICATION = {
  financial_accounts_receivable: 'INCOMPATIBLE',
  financial_payables: 'UNUSED',
  financial_financings: 'INCOMPATIBLE',
  financial_receivable_payments: 'MISSING',
  financial_financing_installments: 'MISSING',
  financial_receivable_charges: 'MISSING',
  financial_boleto_charges: 'MISSING',
  financial_boleto_reminder_events: 'MISSING',
};

export const EXISTING_SUPABASE_SCHEMA_COMPATIBILITY = 'INCOMPATIBLE';

export const RECEIVABLE_STATUSES = [
  'pending', 'due_today', 'upcoming', 'overdue', 'partially_paid', 'paid', 'canceled', 'renegotiated',
];

export const FINANCING_STATUSES = [
  'draft', 'pending_analysis', 'approved', 'active', 'partially_paid', 'paid_off',
  'overdue', 'renegotiated', 'canceled', 'defaulted',
];

export const PAYMENT_KINDS = ['payment', 'reversal'];
export const PAYMENT_STATUSES = ['applied', 'reversed'];

export const OBLIGATION_ORIGIN_TYPES = ['treatment_plan', 'financing'];

export const RECEIVABLE_IDEMPOTENCY_CONSTRAINT =
  'UNIQUE (tenant_id, origin_type, origin_id, installment_number) WHERE origin_id IS NOT NULL AND origin_type IN (treatment_plan, financing)';

export const PAYMENT_IDEMPOTENCY_CONSTRAINT = 'UNIQUE (tenant_id, operation_id)';

export const FINANCING_IDEMPOTENCY_CONSTRAINT =
  'UNIQUE (tenant_id, budget_id) WHERE budget_id IS NOT NULL AND status NOT IN (canceled, renegotiated)';

export const CHARGE_IDEMPOTENCY_CONSTRAINT = 'UNIQUE (tenant_id, operation_id)';

export const TARGET_TABLES = {
  financial_v2_receivables: {
    tenant_id: 'NOT NULL',
    money: ['original_cents', 'discount_cents', 'interest_cents', 'fine_cents', 'total_cents'],
    derived: ['effective_paid_cents', 'balance_cents'],
    identity: RECEIVABLE_IDEMPOTENCY_CONSTRAINT,
    deletePolicy: 'DENY',
    pk: 'source_id TEXT (IDB id recv-*)',
  },
  financial_v2_payments: {
    tenant_id: 'NOT NULL',
    money: ['amount_cents'],
    identity: PAYMENT_IDEMPOTENCY_CONSTRAINT,
    deletePolicy: 'DENY',
    appendOnly: true,
    reversalFk: 'reverses_payment_id → financial_v2_payments.source_id RESTRICT',
  },
  financial_v2_financings: {
    tenant_id: 'NOT NULL',
    money: ['total_cents', 'entry_cents', 'interest_cents', 'fee_cents', 'discount_cents', 'total_payable_cents'],
    derived: ['paid_cents', 'open_cents'],
    identity: FINANCING_IDEMPOTENCY_CONSTRAINT,
    deletePolicy: 'DENY',
    budgetBinding: 'budget_id TEXT NOT NULL for PATH B (no FK — budget remains IDB)',
  },
  financial_v2_financing_installments: {
    role: 'OPERATIONAL_PROJECTION',
    obligationSsot: 'financial_v2_receivables',
    moneySsot: false,
    link: 'receivable_id UNIQUE NOT NULL',
  },
  financial_v2_charges: {
    tenant_id: 'NOT NULL',
    createsReceivable: false,
    identity: CHARGE_IDEMPOTENCY_CONSTRAINT,
    fk: 'receivable_id RESTRICT',
  },
  financial_v2_boleto_charges: {
    tenant_id: 'NOT NULL',
    createsReceivable: false,
    identity: CHARGE_IDEMPOTENCY_CONSTRAINT,
    fk: 'receivable_id RESTRICT',
  },
  financial_v2_boleto_reminder_events: {
    tenant_id: 'NOT NULL',
    createsReceivable: false,
    operational: true,
  },
};

export const SOURCE_OF_TRUTH = {
  receivable_total_cents: 'PERSISTED',
  effective_paid_cents: 'DERIVED_FROM_PAYMENT_FACTS',
  balance_cents: 'DERIVED',
  receivable_status: 'PERSISTED_AND_VALIDATED_AGAINST_FACTS',
  financing_paid_cents: 'DERIVED_FROM_RECEIVABLE_EFFECTIVE_PAID',
  charge_amount_cents: 'PERSISTED_ON_CHARGE_NOT_OBLIGATION',
};

export const FK_POLICY = {
  tenant_id: 'REFERENCES tenants(id) ON DELETE RESTRICT — never CASCADE',
  patient_id: 'TEXT opaque until patient cutover proves UUID mapping — NO FK',
  budget_id: 'TEXT opaque — budget lives in IndexedDB clinicalAppointments — NO FK',
  receivable_id: 'REFERENCES financial_v2_receivables(source_id) ON DELETE RESTRICT',
  financing_id: 'REFERENCES financial_v2_financings(source_id) ON DELETE RESTRICT',
  reverses_payment_id: 'REFERENCES financial_v2_payments(source_id) ON DELETE RESTRICT',
  created_by: 'uuid NULL → auth.users; plus created_by_legacy TEXT NULL — never invent author',
};

export const DELETE_POLICY = {
  receivables: 'DENY',
  payments: 'DENY',
  reversals: 'DENY',
  approved_financings: 'DENY',
  charges: 'DENY_HARD_DELETE_SOFT_CANCEL_OK',
};

export const REVERSAL_RULES = {
  sql: [
    'UNIQUE (tenant_id, operation_id)',
    'UNIQUE (reverses_payment_id) WHERE kind = reversal',
    'CHECK kind=payment XOR reverses_payment_id NOT NULL',
    'CHECK reverses_payment_id IS DISTINCT FROM source_id',
    'FK RESTRICT same table',
  ],
  serviceInvariants: [
    'reversal.tenant_id === original.tenant_id',
    'cannot reverse a reversal',
    'cannot reverse already reversed payment',
    'reversal.amount_cents === original.amount_cents',
    'no circular reference',
  ],
  crossTenantFk: 'REJECTED',
};

export const RLS_EXISTING_021 = {
  financial_accounts_receivable: {
    SELECT: 'tenant member via app_user_can_access_tenant',
    INSERT: 'tenant admin via app_user_is_tenant_admin (policy FOR ALL)',
    UPDATE: 'tenant admin (FOR ALL)',
    DELETE: 'tenant admin ALLOWED — GAP vs domain DENY',
  },
  financial_payables: {
    SELECT: 'tenant member',
    INSERT: 'tenant admin',
    UPDATE: 'tenant admin',
    DELETE: 'tenant admin ALLOWED — out of core',
  },
  financial_financings: {
    SELECT: 'tenant member',
    INSERT: 'tenant admin',
    UPDATE: 'tenant admin',
    DELETE: 'tenant admin ALLOWED — GAP vs domain DENY',
  },
  note: 'Admin API service_role bypasses RLS. RLS is tenant isolation, not RBAC.',
};

export const RLS_TARGET_V2 = {
  SELECT: 'tenant member + not canceled-hidden as product requires',
  INSERT: 'authenticated + tenant membership; RBAC in server writer',
  UPDATE: 'authenticated + tenant membership; lifecycle columns only',
  DELETE: 'NO POLICY — REVOKE DELETE FROM authenticated, anon',
  permissionEnforcement: 'SERVER_WRITER_CANONICAL_RBAC',
};

export const RBAC_SERVER_BOUNDARY = {
  location: 'SERVER_WRITER_BEFORE_SQL',
  rlsSubstitutesRbac: false,
  permissions: {
    'financeiro_contas_receber:create': 'create receivable',
    'financeiro_contas_receber:edit': 'register payment',
    'financeiro_contas_receber:reverse': 'reversal',
    'financeiro_contas_receber:cancel': 'cancel unpaid receivable',
    'financeiro_financiamentos:create': 'create proposal',
    'financeiro_financiamentos:approve': 'approve financing',
    'financeiro_financiamentos:cancel': 'cancel financing',
    'financeiro_boletos:create': 'create charge/boleto',
    'financeiro_boletos:issue': 'issue boleto',
    'financeiro_boletos:cancel': 'cancel boleto',
    'financeiro_boletos:resend': 'second copy / reminder',
  },
  jwt: 'app_metadata / tenant membership — never user_metadata',
};

export const LEGACY_OWNERSHIP_CLASSES = ['OWNED_DIRECT', 'OWNED_DERIVED', 'UNOWNED', 'CONFLICTED'];

export const LEGACY_OWNERSHIP_POLICY = {
  OWNED_DIRECT: 'eligible',
  OWNED_DERIVED: 'eligible only with proof',
  UNOWNED: 'quarantine/report',
  CONFLICTED: 'quarantine/report',
  silentAssignToActiveTenant: false,
};

export const LEGACY_DUPLICATE_POLICY = 'QUARANTINE_NOT_DELETE';

export const RECONCILIATION_BEFORE_MIGRATION = 'REQUIRED';

export const ELIGIBILITY_CLASSES = ['RECONCILED', 'MISMATCH', 'UNOWNED', 'DUPLICATE', 'UNSUPPORTED'];

export const CUTOVER_STRATEGY = 'SHADOW_COMPARE_THEN_TENANT_CUTOVER';

export const ROLLBACK_STRATEGY = 'FLAG_OFF_PRESERVE_IDB_AND_SERVER_ROWS';

export const FEATURE_FLAG_PLAN = {
  existing: [
    'FINANCIAL_READ',
    'FINANCIAL_READ_PRIMARY',
    'FINANCIAL_SHADOW',
    'FINANCIAL_COMPARE',
    'FINANCIAL_WRITE',
    'FINANCIAL_WRITE_PRIMARY',
    'FINANCIAL_DUAL_WRITE',
    'FINANCIAL_WRITE_COMPARE',
  ],
  existingDefault: false,
  productionLocked: true,
  futureConceptual: [
    'FINANCIAL_SERVER_READ',
    'FINANCIAL_SERVER_WRITE',
    'FINANCIAL_SHADOW_WRITE',
    'FINANCIAL_TENANT_CUTOVER',
  ],
  implementIn11H: false,
  note: 'Reuse existing V3 flags; do not turn them on against schema 021. 11.I may alias SHADOW_WRITE → FINANCIAL_SHADOW once v2 tables exist.',
};

export const IDB_TO_SUPABASE_MAPPING = {
  accountsReceivable: {
    target: 'financial_v2_receivables',
    id: 'source_id = id (recv-*)',
    money: 'FLOAT_BRL → toCents()',
    ownership: 'tenant_id required',
    legacyRisk: 'unowned / status open≠pending / paid_amount vs received_amount',
  },
  receivablePayments: {
    target: 'financial_v2_payments',
    id: 'source_id = id (rvpay-*)',
    money: 'amount_received → amount_cents via toCents()',
    ownership: 'tenant_id from payment or receivable',
    legacyRisk: 'missing operation_id',
  },
  financings: {
    target: 'financial_v2_financings',
    money: 'total/entry/payable → cents',
    ownership: 'tenant_id NOT NULL',
    legacyRisk: 'status pending_approval vs pending_analysis',
  },
  financingInstallments: {
    target: 'financial_v2_financing_installments',
    transformation: 'operational projection linked to receivable; amounts not SSOT',
    ownership: 'from financing',
    legacyRisk: 'delinquency unscoped tenant (11.F/G note)',
  },
  receivableCharges: {
    target: 'financial_v2_charges',
    transformation: 'never create receivable',
    ownership: 'tenant_id + receivable_id',
    legacyRisk: 'operation_id missing',
  },
  boletoCharges: {
    target: 'financial_v2_boleto_charges',
    transformation: 'never create receivable',
    ownership: 'tenant_id',
    legacyRisk: 'provider fake local',
  },
  boletoReminderEvents: {
    target: 'financial_v2_boleto_reminder_events',
    transformation: 'operational; not obligation',
    ownership: 'tenant_id',
    legacyRisk: 'cross-tenant list',
  },
};

export const READINESS_MATRIX_DOMAINS = [
  'receivables',
  'payments',
  'reversals',
  'financing',
  'installments',
  'charges',
  'boleto/reminders',
];

export const READINESS_MATRIX = {
  receivables: {
    currentIdb: 'accountsReceivable',
    target: 'financial_v2_receivables',
    schemaReady: 'NEEDS_CHANGES',
    rlsReady: 'NEEDS_CHANGES',
    moneyReady: 'DESIGNED',
    idempotencyReady: 'DESIGNED',
    legacyMigrationReady: 'NO',
    blockers: '021 numeric+status open; no installment unique; UUID pk vs recv-*',
  },
  payments: {
    currentIdb: 'receivablePayments',
    target: 'financial_v2_payments',
    schemaReady: 'NEEDS_CHANGES',
    rlsReady: 'NEEDS_CHANGES',
    moneyReady: 'DESIGNED',
    idempotencyReady: 'DESIGNED',
    legacyMigrationReady: 'NO',
    blockers: 'table missing in 021',
  },
  reversals: {
    currentIdb: 'receivablePayments kind=reversal',
    target: 'financial_v2_payments',
    schemaReady: 'NEEDS_CHANGES',
    rlsReady: 'NEEDS_CHANGES',
    moneyReady: 'DESIGNED',
    idempotencyReady: 'DESIGNED',
    legacyMigrationReady: 'NO',
    blockers: 'same as payments; service invariants beyond SQL',
  },
  financing: {
    currentIdb: 'financings',
    target: 'financial_v2_financings',
    schemaReady: 'NEEDS_CHANGES',
    rlsReady: 'NEEDS_CHANGES',
    moneyReady: 'DESIGNED',
    idempotencyReady: 'DESIGNED',
    legacyMigrationReady: 'NO',
    blockers: '021 missing payable/interest/fees; status enum drift; CASCADE tenant',
  },
  installments: {
    currentIdb: 'financingInstallments',
    target: 'financial_v2_financing_installments (projection)',
    schemaReady: 'NEEDS_CHANGES',
    rlsReady: 'NEEDS_CHANGES',
    moneyReady: 'N_A_SSOT_IS_RECEIVABLE',
    idempotencyReady: 'DESIGNED',
    legacyMigrationReady: 'NO',
    blockers: 'must not duplicate obligation truth',
  },
  charges: {
    currentIdb: 'receivableCharges',
    target: 'financial_v2_charges',
    schemaReady: 'NEEDS_CHANGES',
    rlsReady: 'NEEDS_CHANGES',
    moneyReady: 'DESIGNED',
    idempotencyReady: 'DESIGNED',
    legacyMigrationReady: 'NO',
    blockers: 'table missing; must not spawn receivable',
  },
  'boleto/reminders': {
    currentIdb: 'boletoCharges + boletoReminderEvents',
    target: 'financial_v2_boleto_charges + financial_v2_boleto_reminder_events',
    schemaReady: 'NEEDS_CHANGES',
    rlsReady: 'NEEDS_CHANGES',
    moneyReady: 'DESIGNED',
    idempotencyReady: 'DESIGNED',
    legacyMigrationReady: 'NO',
    blockers: 'tables missing; reminder tenant gap operational',
  },
};

export const GO_NO_GO = {
  schemaContract: 'FAIL_UNTIL_V2_APPLIED_LOCALLY',
  rls: 'FAIL_UNTIL_V2_POLICIES',
  tenantOwnership: 'DESIGN_PASS',
  moneyConversion: 'DESIGN_PASS',
  reconciliationEligibility: 'DESIGN_PASS',
  rollbackDesign: 'DESIGN_PASS',
  shadowComparisonPlan: 'DESIGN_PASS',
  noDestructiveDeletes: 'DESIGN_PASS_021_DELETE_STILL_ALLOWED',
  goForPhase11I: true,
  goForProductionCutover: false,
};

export const AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = 'NONE';
