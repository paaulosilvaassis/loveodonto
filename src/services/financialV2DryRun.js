/**
 * PHASE 11.I — dry-run local IndexedDB-like → V2. Sem writes. Sem scan de produção.
 */
import { ELIGIBILITY } from './financialV2LegacyClassifier.js';
import {
  buildDuplicateIndex,
  buildReconEntityIndex,
  classifyLegacyFinancialRecord,
  evaluateFinancialMigrationEligibility,
} from './financialV2LegacyClassifier.js';
import {
  mapChargeToV2,
  mapFinancingToV2,
  mapPaymentToV2,
  mapReceivableToV2,
} from './financialV2Mapper.js';
import { compareFinancialShadow } from './financialV2ShadowComparator.js';
import { isReversalPaymentRecord } from './receivableReconciliation.js';
import { FINANCIAL_V2_MIGRATION_ORDER, PHASE_11I_RUNTIME } from './financialV2Foundation.js';

function quarantineRow(classified, reason_code) {
  return {
    entity_type: classified.entity_type,
    source_id: classified.source_id,
    classification: classified.classification,
    reason_code: reason_code || classified.classification,
    tenant_evidence: classified.proof || null,
    reconciliation_finding: (classified.findings || []).find((item) => item.code === 'RECONCILIATION_MISMATCH') || null,
    duplicate_identity: (classified.findings || []).find((item) => item.code === 'DUPLICATE')?.detail || null,
  };
}

function classifyOne(record, entityType, db, duplicates, reconIds) {
  const classified = classifyLegacyFinancialRecord(record, {
    entityType,
    db,
    duplicateIds: duplicates[entityType] || new Set(),
    reconEntityIds: reconIds,
  });
  const eligibility = evaluateFinancialMigrationEligibility(classified);
  return { record, classified, eligibility };
}

export function dryRunFinancialV2Migration(db) {
  if (PHASE_11I_RUNTIME.HISTORICAL_PRODUCTION_SCAN) {
    throw new Error('Production scan is forbidden in 11.I.');
  }
  const duplicates = buildDuplicateIndex(db);
  const reconIds = buildReconEntityIndex(db);
  const eligible = [];
  const quarantined = [];
  const mapped = [];
  const comparisonReady = [];

  const push = (item, mapper, entityType) => {
    if (item.eligibility.decision === ELIGIBILITY.QUARANTINE) {
      quarantined.push(quarantineRow(item.classified, item.eligibility.classification));
      return;
    }
    eligible.push({
      entity_type: entityType,
      source_id: item.record.id,
      decision: item.eligibility.decision,
      tenant_id: item.eligibility.tenant_id,
    });
    const v2 = mapper(item.record, { eligibility: item.eligibility });
    mapped.push({ entity_type: entityType, v2 });
    comparisonReady.push(compareFinancialShadow({
      entityType,
      legacy: { ...item.record, tenant_id: item.eligibility.tenant_id },
      v2,
      eligibility: item.eligibility,
    }));
  };

  for (const row of db.financings || []) {
    push(classifyOne(row, 'financing', db, duplicates, reconIds), mapFinancingToV2, 'financing');
  }
  for (const row of db.accountsReceivable || []) {
    push(classifyOne(row, 'receivable', db, duplicates, reconIds), mapReceivableToV2, 'receivable');
  }
  const payments = db.receivablePayments || [];
  for (const row of payments.filter((item) => !isReversalPaymentRecord(item))) {
    push(classifyOne(row, 'payment', db, duplicates, reconIds), mapPaymentToV2, 'payment');
  }
  for (const row of payments.filter((item) => isReversalPaymentRecord(item))) {
    push(classifyOne(row, 'payment', db, duplicates, reconIds), mapPaymentToV2, 'payment');
  }
  for (const row of db.receivableCharges || []) {
    push(classifyOne(row, 'charge', db, duplicates, reconIds), mapChargeToV2, 'charge');
  }

  const stats = {
    TOTAL_RECORDS: eligible.length + quarantined.length,
    ELIGIBLE: eligible.filter((item) => item.decision === ELIGIBILITY.ELIGIBLE).length,
    DERIVED_OWNERSHIP: eligible.filter((item) => item.decision === ELIGIBILITY.ELIGIBLE_WITH_DERIVED_OWNERSHIP).length,
    QUARANTINED: quarantined.length,
    DUPLICATES: quarantined.filter((item) => item.classification === 'DUPLICATE').length,
    MISMATCHES: quarantined.filter((item) => item.classification === 'RECONCILIATION_MISMATCH').length,
    UNOWNED: quarantined.filter((item) => item.classification === 'UNOWNED').length,
    CONFLICTED: quarantined.filter((item) => item.classification === 'CONFLICTED').length,
    MIGRATION_ORDER: FINANCIAL_V2_MIGRATION_ORDER,
  };

  return { eligible, quarantined, mapped, comparisonReady, stats };
}
