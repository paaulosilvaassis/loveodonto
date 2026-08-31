/**
 * PHASE 11.L — persistência shadow financial_v2 em STAGING + read-back parity.
 * Fixtures sintéticos phase11l-* apenas. IndexedDB permanece SSOT.
 * Default da app continua OFF. Sem cutover. Sem backfill. Sem produção.
 */
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  isFinancialV2TenantId,
} from '../contracts/financialV2RemoteSchemaContract.js';
import { FINANCIAL_REPOSITORY_FLAG_DEFAULTS } from '../repositories/financial/financialRepositoryFlags.ts';
import { compareFinancialShadow } from './financialV2ShadowComparator.js';
import {
  PHASE_11L_SOURCE_PREFIX,
  PHASE_11L_TENANT_A,
  PHASE_11L_TENANT_B,
  buildPhase11lSyntheticLegacyDb,
} from './financialV2Phase11lFixtures.js';
import {
  PHASE_11K_RUNTIME,
  SHADOW_WRITE_DECISION,
  createMemoryFinancialV2Store,
  runFinancialV2ShadowParity,
} from './financialV2ShadowWrite.js';

export const PHASE_11L_GATE = 'FINANCIAL_V2_STAGING_SHADOW_PERSISTENCE_VALIDATED';
export {
  PHASE_11L_SOURCE_PREFIX,
  PHASE_11L_TENANT_A,
  PHASE_11L_TENANT_B,
  buildPhase11lSyntheticLegacyDb,
};

export const PHASE_11L_RUNTIME = {
  TARGET_DB_ENVIRONMENT: 'STAGING',
  REMOTE_SCHEMA_ENVIRONMENT: STAGING_SUPABASE_PROJECT_REF,
  REMOTE_STAGING_WRITE: true,
  SHADOW_WRITE_DEFAULT: false,
  APP_WRITERS_STAGING_WIRED: false,
  DUAL_WRITE_ENABLED: false,
  FINANCIAL_SERVER_READ_ENABLED: false,
  FINANCIAL_SERVER_WRITE_ENABLED: false,
  TENANT_CUTOVER: false,
  PRODUCTION_DATABASE_CHANGED: false,
  BACKFILL_APPLIED: false,
  HISTORICAL_PRODUCTION_SCAN: false,
  SYNTHETIC_PREFIX: PHASE_11L_SOURCE_PREFIX,
};

export const STAGING_SQL_TABLE = {
  receivables: 'financial_v2_receivables',
  payments: 'financial_v2_payments',
  financings: 'financial_v2_financings',
  charges: 'financial_v2_charges',
};

const ENTITY_FROM_BAG = {
  receivables: 'receivable',
  payments: 'payment',
  financings: 'financing',
  charges: 'charge',
};

export function assertStagingShadowEnvironmentAllowed(projectRef) {
  if (String(projectRef || '') === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_STAGING_SHADOW_PRODUCTION_FORBIDDEN');
  }
  if (String(projectRef || '') !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_STAGING_SHADOW_ENV_REQUIRED');
  }
  return true;
}

export function assertPhase11lSyntheticSourceId(sourceId) {
  if (!String(sourceId || '').startsWith(PHASE_11L_SOURCE_PREFIX)) {
    throw new Error('FINANCIAL_V2_STAGING_SHADOW_SYNTHETIC_ONLY');
  }
  return true;
}

export function isPhase11lSyntheticSourceId(sourceId) {
  return String(sourceId || '').startsWith(PHASE_11L_SOURCE_PREFIX);
}

function sqlText(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlUuid(value) {
  if (!isFinancialV2TenantId(value)) throw new Error('FINANCIAL_V2_STAGING_SHADOW_TENANT_NOT_UUID');
  return `${sqlText(value)}::uuid`;
}

function sqlBigint(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('FINANCIAL_V2_STAGING_SHADOW_INVALID_CENTS');
  return String(Math.trunc(n));
}

function sqlInt(value, fallback = 0) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) throw new Error('FINANCIAL_V2_STAGING_SHADOW_INVALID_INT');
  return String(Math.trunc(n));
}

function sqlDate(value) {
  if (!value) return 'NULL';
  const day = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('FINANCIAL_V2_STAGING_SHADOW_INVALID_DATE');
  return `${sqlText(day)}::date`;
}

function sqlTs(value) {
  if (!value) return 'NULL';
  return `${sqlText(value)}::timestamptz`;
}

export function buildPhase11lInsertSql(table, row) {
  assertPhase11lSyntheticSourceId(row.source_id);
  if (table === 'receivables') {
    return `INSERT INTO public.financial_v2_receivables (
      source_id, tenant_id, patient_id, origin_type, origin_id, installment_number, total_installments,
      budget_id, financing_id, description, issue_date, due_date, original_cents, discount_cents,
      interest_cents, fine_cents, total_cents, status, payment_method_expected, canceled_at,
      canceled_reason, created_by_legacy
    ) VALUES (
      ${sqlText(row.source_id)}, ${sqlUuid(row.tenant_id)}, ${sqlText(row.patient_id)},
      ${sqlText(row.origin_type)}, ${sqlText(row.origin_id)}, ${sqlInt(row.installment_number)},
      ${sqlInt(row.total_installments, 1)}, ${sqlText(row.budget_id)}, ${sqlText(row.financing_id)},
      ${sqlText(row.description || '')}, ${sqlDate(row.issue_date)}, ${sqlDate(row.due_date)},
      ${sqlBigint(row.original_cents)}, ${sqlBigint(row.discount_cents || 0)},
      ${sqlBigint(row.interest_cents || 0)}, ${sqlBigint(row.fine_cents || 0)},
      ${sqlBigint(row.total_cents)}, ${sqlText(row.status)}, ${sqlText(row.payment_method_expected || '')},
      ${sqlTs(row.canceled_at)}, ${sqlText(row.canceled_reason)}, ${sqlText(row.created_by_legacy)}
    ) ON CONFLICT (tenant_id, source_id) DO NOTHING`;
  }
  if (table === 'payments') {
    return `INSERT INTO public.financial_v2_payments (
      source_id, tenant_id, receivable_id, operation_id, kind, status, amount_cents,
      payment_method, paid_at, reverses_payment_id, reversed_at, reversal_reason, created_by_legacy
    ) VALUES (
      ${sqlText(row.source_id)}, ${sqlUuid(row.tenant_id)}, ${sqlText(row.receivable_id)},
      ${sqlText(row.operation_id)}, ${sqlText(row.kind)}, ${sqlText(row.status)},
      ${sqlBigint(row.amount_cents)}, ${sqlText(row.payment_method || '')}, ${sqlDate(row.paid_at)},
      ${sqlText(row.reverses_payment_id)}, ${sqlTs(row.reversed_at)}, ${sqlText(row.reversal_reason)},
      ${sqlText(row.created_by_legacy)}
    ) ON CONFLICT (tenant_id, source_id) DO NOTHING`;
  }
  if (table === 'financings') {
    return `INSERT INTO public.financial_v2_financings (
      source_id, tenant_id, patient_id, budget_id, status, total_cents, entry_cents, interest_cents,
      fee_cents, discount_cents, total_payable_cents, installments_count, approved_at, canceled_at,
      canceled_reason, created_by_legacy
    ) VALUES (
      ${sqlText(row.source_id)}, ${sqlUuid(row.tenant_id)}, ${sqlText(row.patient_id)},
      ${sqlText(row.budget_id)}, ${sqlText(row.status)}, ${sqlBigint(row.total_cents)},
      ${sqlBigint(row.entry_cents || 0)}, ${sqlBigint(row.interest_cents || 0)},
      ${sqlBigint(row.fee_cents || 0)}, ${sqlBigint(row.discount_cents || 0)},
      ${sqlBigint(row.total_payable_cents)}, ${sqlInt(row.installments_count, 1)},
      ${sqlTs(row.approved_at)}, ${sqlTs(row.canceled_at)}, ${sqlText(row.canceled_reason)},
      ${sqlText(row.created_by_legacy)}
    ) ON CONFLICT (tenant_id, source_id) DO NOTHING`;
  }
  if (table === 'charges') {
    return `INSERT INTO public.financial_v2_charges (
      source_id, tenant_id, receivable_id, provider, provider_charge_id, operation_id, status,
      amount_cents, created_by_legacy
    ) VALUES (
      ${sqlText(row.source_id)}, ${sqlUuid(row.tenant_id)}, ${sqlText(row.receivable_id)},
      ${sqlText(row.provider || 'internal')}, ${sqlText(row.provider_charge_id)},
      ${sqlText(row.operation_id)}, ${sqlText(row.status)}, ${sqlBigint(row.amount_cents || 0)},
      ${sqlText(row.created_by_legacy)}
    ) ON CONFLICT (tenant_id, source_id) DO NOTHING`;
  }
  throw new Error(`unknown v2 bag ${table}`);
}

export function buildPhase11lSelectSql(table, tenantId, sourceId) {
  assertPhase11lSyntheticSourceId(sourceId);
  return `SELECT * FROM public.${STAGING_SQL_TABLE[table]}
    WHERE tenant_id = ${sqlUuid(tenantId)} AND source_id = ${sqlText(sourceId)} LIMIT 1`;
}

export function buildPhase11lTenantSeedSql() {
  return `INSERT INTO public.tenants (id, legal_name, trade_name, clinic_code, status)
    VALUES
      (${sqlUuid(PHASE_11L_TENANT_A)}, 'phase11l-clinic-a', 'phase11l-a', 'phase11l-a', 'active'),
      (${sqlUuid(PHASE_11L_TENANT_B)}, 'phase11l-clinic-b', 'phase11l-b', 'phase11l-b', 'active')
    ON CONFLICT (id) DO NOTHING`;
}

export function buildPhase11lCleanupSql() {
  return [
    `DELETE FROM public.financial_v2_boleto_reminder_events WHERE source_id LIKE 'phase11l-%'`,
    `DELETE FROM public.financial_v2_boleto_charges WHERE source_id LIKE 'phase11l-%'`,
    `DELETE FROM public.financial_v2_charges WHERE source_id LIKE 'phase11l-%'`,
    `DELETE FROM public.financial_v2_financing_installments WHERE source_id LIKE 'phase11l-%'`,
    `DELETE FROM public.financial_v2_payments WHERE source_id LIKE 'phase11l-%'`,
    `DELETE FROM public.financial_v2_financings WHERE source_id LIKE 'phase11l-%'`,
    `DELETE FROM public.financial_v2_receivables WHERE source_id LIKE 'phase11l-%'`,
    `DELETE FROM public.tenant_users WHERE email LIKE 'phase11l-%' OR full_name LIKE 'phase11l-%'`,
    `DELETE FROM public.tenants WHERE legal_name LIKE 'phase11l-%' OR clinic_code LIKE 'phase11l-%'`,
  ].join(';\n');
}

export function normalizeFinancialV2Readback(entityType, row) {
  if (!row) return null;
  const cents = (value) => (value == null ? value : Number(value));
  const next = {
    ...row,
    original_cents: cents(row.original_cents),
    discount_cents: cents(row.discount_cents),
    interest_cents: cents(row.interest_cents),
    fine_cents: cents(row.fine_cents),
    total_cents: cents(row.total_cents),
    amount_cents: cents(row.amount_cents),
    entry_cents: cents(row.entry_cents),
    fee_cents: cents(row.fee_cents),
    total_payable_cents: cents(row.total_payable_cents),
  };
  if (entityType === 'charge') next.creates_receivable = false;
  if (next.paid_at) next.paid_at = String(next.paid_at).slice(0, 10);
  return next;
}

export function compareStagingReadback({ entityType, legacy, readback, eligibility }) {
  return compareFinancialShadow({
    entityType,
    legacy,
    v2: normalizeFinancialV2Readback(entityType, readback),
    eligibility,
  });
}

export function preparePhase11lShadowPlan(db = buildPhase11lSyntheticLegacyDb()) {
  const store = createMemoryFinancialV2Store();
  const parity = runFinancialV2ShadowParity(db, {
    store,
    enabled: true,
    projectRef: STAGING_SUPABASE_PROJECT_REF,
  });
  const writes = parity.results
    .filter((row) => row.decision === SHADOW_WRITE_DECISION.WRITTEN && row.mapped)
    .map((row) => {
      const table = Object.keys(STAGING_SQL_TABLE).find((bag) => (
        ENTITY_FROM_BAG[bag] === (row.classified?.entity_type)
      ));
      assertPhase11lSyntheticSourceId(row.mapped.source_id);
      return {
        entityType: row.classified.entity_type,
        table,
        mapped: row.mapped,
        legacy: db[
          row.classified.entity_type === 'receivable' ? 'accountsReceivable'
            : row.classified.entity_type === 'payment' ? 'receivablePayments'
              : row.classified.entity_type === 'financing' ? 'financings'
                : 'receivableCharges'
        ].find((item) => item.id === row.mapped.source_id),
        eligibility: row.eligibility,
        insertSql: buildPhase11lInsertSql(table, row.mapped),
        selectSql: buildPhase11lSelectSql(table, row.mapped.tenant_id, row.mapped.source_id),
      };
    });
  return { store, parity, writes };
}

export async function persistPhase11lStagingShadow({
  executor,
  projectRef = STAGING_SUPABASE_PROJECT_REF,
  db = buildPhase11lSyntheticLegacyDb(),
} = {}) {
  assertStagingShadowEnvironmentAllowed(projectRef);
  if (typeof executor !== 'function') {
    throw new Error('FINANCIAL_V2_STAGING_SHADOW_EXECUTOR_REQUIRED');
  }
  const plan = preparePhase11lShadowPlan(db);
  const comparisons = [];
  for (const item of plan.writes) {
    await executor(item.insertSql);
    const rows = await executor(item.selectSql);
    const readback = Array.isArray(rows) ? rows[0] : rows;
    const comparison = compareStagingReadback({
      entityType: item.entityType,
      legacy: item.legacy,
      readback,
      eligibility: item.eligibility,
    });
    comparisons.push({
      entityType: item.entityType,
      source_id: item.mapped.source_id,
      tenant_id: item.mapped.tenant_id,
      comparison,
      readback,
    });
  }
  return {
    writes: plan.writes,
    comparisons,
    stats: {
      TOTAL: comparisons.length,
      MATCH: comparisons.filter((row) => row.comparison.result === 'MATCH').length,
      MISMATCH: comparisons.filter((row) => row.comparison.result === 'MISMATCH').length,
      NOT_COMPARABLE: comparisons.filter((row) => row.comparison.result === 'NOT_COMPARABLE').length,
    },
    parity: plan.parity.stats,
  };
}

export function assertV3FlagsRemainOffForStagingShadow(flags = FINANCIAL_REPOSITORY_FLAG_DEFAULTS) {
  return Object.values(flags).every((value) => value === false);
}

export function assertPhase11kDidNotPersistRemote() {
  return PHASE_11K_RUNTIME.REMOTE_STAGING_WRITE === false;
}
