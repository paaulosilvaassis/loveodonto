/**
 * PHASE 11.K — shadow-write financial_v2 + parity.
 * IDB permanece SSOT. Falha remota nunca bloqueia o writer legado.
 * Default OFF. Produção recusada. Sem cutover. Sem dual-write 021.
 */
import { peekDb } from '../db/index.js';
import { FINANCIAL_REPOSITORY_FLAG_DEFAULTS } from '../repositories/financial/financialRepositoryFlags.ts';
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  isFinancialV2TenantId,
} from '../contracts/financialV2RemoteSchemaContract.js';
import {
  classifyLegacyFinancialRecord,
  evaluateFinancialMigrationEligibility,
  ELIGIBILITY,
} from './financialV2LegacyClassifier.js';
import {
  mapChargeToV2,
  mapFinancingToV2,
  mapPaymentToV2,
  mapReceivableToV2,
} from './financialV2Mapper.js';
import { compareFinancialShadow } from './financialV2ShadowComparator.js';

export const PHASE_11K_GATE = 'FINANCIAL_V2_SHADOW_WRITE_PARITY_VALIDATED';

export const PHASE_11K_RUNTIME = {
  SHADOW_WRITE_DEFAULT: false,
  DUAL_WRITE_ENABLED: false,
  FINANCIAL_SERVER_READ_ENABLED: false,
  FINANCIAL_SERVER_WRITE_ENABLED: false,
  TENANT_CUTOVER: false,
  REMOTE_STAGING_WRITE: false,
  PRODUCTION_DATABASE_CHANGED: false,
  BACKFILL_APPLIED: false,
  HISTORICAL_PRODUCTION_SCAN: false,
};

export const SHADOW_WRITE_DECISION = {
  SKIPPED_FLAG_OFF: 'SKIPPED_FLAG_OFF',
  SKIPPED_PRODUCTION_GUARD: 'SKIPPED_PRODUCTION_GUARD',
  SKIPPED_NO_STORE: 'SKIPPED_NO_STORE',
  QUARANTINED: 'QUARANTINED',
  WRITTEN: 'WRITTEN',
  REPLAYED: 'REPLAYED',
  FAILED: 'FAILED',
};

const MAPPERS = {
  receivable: mapReceivableToV2,
  payment: mapPaymentToV2,
  financing: mapFinancingToV2,
  charge: mapChargeToV2,
};

const STORE_TABLE = {
  receivable: 'receivables',
  payment: 'payments',
  financing: 'financings',
  charge: 'charges',
};

let testEnabled = false;
let activeStore = null;

export function __setFinancialV2ShadowWriteForTest(enabled) {
  testEnabled = Boolean(enabled);
}

export function __setFinancialV2ShadowStoreForTest(store) {
  activeStore = store || null;
}

export function __resetFinancialV2ShadowWriteForTest() {
  testEnabled = false;
  activeStore = null;
}

export function assertShadowWriteEnvironmentAllowed(projectRef) {
  if (String(projectRef || '') === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_SHADOW_WRITE_PRODUCTION_FORBIDDEN');
  }
  return true;
}

export function isFinancialV2ShadowWriteEnabled({ enabled, projectRef } = {}) {
  if (String(projectRef || '') === PRODUCTION_SUPABASE_PROJECT_REF) return false;
  if (enabled === true) return true;
  if (enabled === false) return false;
  return testEnabled === true;
}

export function createMemoryFinancialV2Store() {
  const bags = { receivables: [], payments: [], financings: [], charges: [] };
  return {
    bags,
    get(table, tenantId, sourceId) {
      return (bags[table] || []).find((row) => (
        String(row.tenant_id) === String(tenantId) && String(row.source_id) === String(sourceId)
      )) || null;
    },
    upsert(table, row) {
      if (!bags[table]) throw new Error(`unknown v2 table ${table}`);
      const existing = this.get(table, row.tenant_id, row.source_id);
      if (existing) {
        Object.assign(existing, row);
        return { replayed: true, row: existing };
      }
      bags[table].push(row);
      return { replayed: false, row };
    },
  };
}

export function shadowWriteFinancialRecord({
  entityType,
  record,
  db,
  store = activeStore,
  enabled,
  projectRef,
} = {}) {
  try {
    if (String(projectRef || '') === PRODUCTION_SUPABASE_PROJECT_REF) {
      return { decision: SHADOW_WRITE_DECISION.SKIPPED_PRODUCTION_GUARD };
    }
    if (!isFinancialV2ShadowWriteEnabled({ enabled, projectRef })) {
      return { decision: SHADOW_WRITE_DECISION.SKIPPED_FLAG_OFF };
    }
    if (!store) {
      return { decision: SHADOW_WRITE_DECISION.SKIPPED_NO_STORE };
    }
    if (!record || !MAPPERS[entityType]) {
      return { decision: SHADOW_WRITE_DECISION.FAILED, error: 'unsupported_entity' };
    }

    const classified = classifyLegacyFinancialRecord(record, { entityType, db: db || {} });
    const eligibility = evaluateFinancialMigrationEligibility(classified);
    const tenantId = eligibility.tenant_id || record.tenant_id || record.tenantId;

    if (!isFinancialV2TenantId(tenantId)) {
      return {
        decision: SHADOW_WRITE_DECISION.QUARANTINED,
        reason_code: 'TENANT_NOT_UUID',
        classified,
        eligibility,
      };
    }
    if (eligibility.decision === ELIGIBILITY.QUARANTINE) {
      return {
        decision: SHADOW_WRITE_DECISION.QUARANTINED,
        reason_code: eligibility.classification,
        classified,
        eligibility,
      };
    }

    if (entityType === 'payment' && record.receivable_id) {
      const recv = (db?.accountsReceivable || []).find((item) => item.id === record.receivable_id);
      if (recv && !store.get('receivables', tenantId, recv.id)) {
        shadowWriteFinancialRecord({
          entityType: 'receivable', record: recv, db, store, enabled: true, projectRef,
        });
      }
    }
    if (entityType === 'payment' && (record.reverses_payment_id || record.reversesPaymentId)) {
      const originalId = record.reverses_payment_id || record.reversesPaymentId;
      const original = (db?.receivablePayments || []).find((item) => item.id === originalId);
      if (original && !store.get('payments', tenantId, original.id)) {
        shadowWriteFinancialRecord({
          entityType: 'payment', record: original, db, store, enabled: true, projectRef,
        });
      }
    }
    if (entityType === 'charge' && record.receivable_id) {
      const recv = (db?.accountsReceivable || []).find((item) => item.id === record.receivable_id);
      if (recv && !store.get('receivables', tenantId, recv.id)) {
        shadowWriteFinancialRecord({
          entityType: 'receivable', record: recv, db, store, enabled: true, projectRef,
        });
      }
    }

    const mapped = MAPPERS[entityType](record, { eligibility });
    if (entityType === 'payment' && !mapped.paid_at) {
      mapped.paid_at = record.payment_date || record.paid_at || null;
    }
    const persisted = store.upsert(STORE_TABLE[entityType], mapped);
    const comparison = compareFinancialShadow({
      entityType, legacy: record, v2: persisted.row, eligibility,
    });
    return {
      decision: persisted.replayed ? SHADOW_WRITE_DECISION.REPLAYED : SHADOW_WRITE_DECISION.WRITTEN,
      mapped: persisted.row,
      comparison,
      classified,
      eligibility,
    };
  } catch (error) {
    return {
      decision: SHADOW_WRITE_DECISION.FAILED,
      error: error instanceof Error ? error.message : String(error || 'shadow-write failed'),
    };
  }
}

export function runFinancialV2ShadowParity(db, { store, enabled = true, projectRef } = {}) {
  const target = store || createMemoryFinancialV2Store();
  const results = [];
  const plan = [
    ...(db.financings || []).map((record) => ({ entityType: 'financing', record })),
    ...(db.accountsReceivable || []).map((record) => ({ entityType: 'receivable', record })),
    ...(db.receivablePayments || []).filter((row) => row.kind !== 'reversal').map((record) => ({ entityType: 'payment', record })),
    ...(db.receivablePayments || []).filter((row) => row.kind === 'reversal').map((record) => ({ entityType: 'payment', record })),
    ...(db.receivableCharges || []).map((record) => ({ entityType: 'charge', record })),
  ];
  for (const item of plan) {
    results.push(shadowWriteFinancialRecord({
      ...item, db, store: target, enabled, projectRef,
    }));
  }
  const stats = {
    TOTAL: results.length,
    WRITTEN: results.filter((row) => row.decision === SHADOW_WRITE_DECISION.WRITTEN).length,
    REPLAYED: results.filter((row) => row.decision === SHADOW_WRITE_DECISION.REPLAYED).length,
    QUARANTINED: results.filter((row) => row.decision === SHADOW_WRITE_DECISION.QUARANTINED).length,
    MATCH: results.filter((row) => row.comparison?.result === 'MATCH').length,
    MISMATCH: results.filter((row) => row.comparison?.result === 'MISMATCH').length,
    FAILED: results.filter((row) => row.decision === SHADOW_WRITE_DECISION.FAILED).length,
  };
  return { store: target, results, stats };
}

export function scheduleFinancialV2ShadowWrite({ entityType, record }) {
  if (!isFinancialV2ShadowWriteEnabled()) return;
  queueMicrotask(() => {
    try {
      shadowWriteFinancialRecord({
        entityType,
        record,
        db: peekDb(),
        store: activeStore,
      });
    } catch {
      /* IDB permanece SSOT */
    }
  });
}

export function assertV3FlagsRemainOffForShadow(flags = FINANCIAL_REPOSITORY_FLAG_DEFAULTS) {
  return Object.values(flags).every((value) => value === false);
}
