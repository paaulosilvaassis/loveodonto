/**
 * PHASE 11.I — classificador legado read-only. Não muta registros.
 */
import { inspectFinancialReconciliation } from './financialReconciliationInspector.js';
import { findBudgetRecord } from './financingOwnership.js';
import { FINANCING_STATUS, RECEIVABLE_STATUS } from './auditEventCatalog.js';
import {
  CANONICAL_FINANCING_STATUSES,
  CANONICAL_PAYMENT_KINDS,
  CANONICAL_RECEIVABLE_STATUSES,
  financingActiveIdentity,
  paymentV2Identity,
  receivableV2Identity,
} from './financialV2Foundation.js';
import { isReversalPaymentRecord } from './receivableReconciliation.js';

export const LEGACY_CLASSIFICATION = {
  OWNED_DIRECT: 'OWNED_DIRECT',
  OWNED_DERIVED: 'OWNED_DERIVED',
  UNOWNED: 'UNOWNED',
  CONFLICTED: 'CONFLICTED',
  DUPLICATE: 'DUPLICATE',
  RECONCILIATION_MISMATCH: 'RECONCILIATION_MISMATCH',
  UNSUPPORTED: 'UNSUPPORTED',
};

export const ELIGIBILITY = {
  ELIGIBLE: 'ELIGIBLE',
  ELIGIBLE_WITH_DERIVED_OWNERSHIP: 'ELIGIBLE_WITH_DERIVED_OWNERSHIP',
  QUARANTINE: 'QUARANTINE',
};

const TENANT_TERMINAL_FINANCING = new Set([FINANCING_STATUS.CANCELED, FINANCING_STATUS.RENEGOTIATED]);

function tid(value) {
  return String(value || '').trim();
}

function patientTenant(db, patientId) {
  if (!patientId) return null;
  const row = (db.patients || []).find((item) => item.id === patientId);
  return tid(row?.tenant_id || row?.tenantId) || null;
}

function budgetTenant(db, budgetId) {
  if (!budgetId) return null;
  const found = findBudgetRecord(budgetId, db);
  return tid(found?.budget?.tenant_id || found?.budget?.tenantId) || null;
}

function financingDirectTenant(db, financingId) {
  if (!financingId) return null;
  const row = (db.financings || []).find((item) => item.id === financingId);
  return tid(row?.tenant_id || row?.tenantId) || null;
}

function receivableDirectTenant(db, receivableId) {
  if (!receivableId) return null;
  const row = (db.accountsReceivable || []).find((item) => item.id === receivableId);
  return tid(row?.tenant_id || row?.tenantId) || null;
}

function collectRelatedTenants(entityType, record, db) {
  const related = [];
  const push = (source, tenant_id) => {
    if (tenant_id) related.push({ source, tenant_id });
  };
  if (entityType === 'receivable') {
    push('patient', patientTenant(db, record.patient_id));
    push('budget', budgetTenant(db, record.budget_id || record.origin_id));
    push('financing', financingDirectTenant(db, record.financing_id));
  } else if (entityType === 'payment') {
    push('receivable', receivableDirectTenant(db, record.receivable_id));
    const recv = (db.accountsReceivable || []).find((item) => item.id === record.receivable_id);
    push('patient', patientTenant(db, recv?.patient_id));
  } else if (entityType === 'financing') {
    push('patient', patientTenant(db, record.patient_id));
    push('budget', budgetTenant(db, record.budget_id || record.treatment_plan_id));
  } else if (entityType === 'charge') {
    push('receivable', receivableDirectTenant(db, record.receivable_id));
    push('financing', financingDirectTenant(db, record.financing_id));
    push('patient', patientTenant(db, record.patient_id));
  }
  return related;
}

function uniqueRelatedTenants(related) {
  return [...new Set(related.map((item) => item.tenant_id))];
}

function ownershipResult(direct, related) {
  const relatedIds = uniqueRelatedTenants(related);
  if (direct && relatedIds.some((id) => id !== direct)) {
    return {
      class: LEGACY_CLASSIFICATION.CONFLICTED,
      tenant_id: null,
      proof: { direct, related },
    };
  }
  if (direct) {
    return { class: LEGACY_CLASSIFICATION.OWNED_DIRECT, tenant_id: direct, proof: { direct, related } };
  }
  if (relatedIds.length > 1) {
    return { class: LEGACY_CLASSIFICATION.CONFLICTED, tenant_id: null, proof: { direct: null, related } };
  }
  if (relatedIds.length === 1) {
    return {
      class: LEGACY_CLASSIFICATION.OWNED_DERIVED,
      tenant_id: relatedIds[0],
      proof: { via: related.find((item) => item.tenant_id === relatedIds[0])?.source, related },
    };
  }
  return { class: LEGACY_CLASSIFICATION.UNOWNED, tenant_id: null, proof: { direct: null, related: [] } };
}

function isUnsupported(entityType, record) {
  if (!record?.id) return 'missing_source_id';
  if (entityType === 'receivable') {
    if (record.status && !CANONICAL_RECEIVABLE_STATUSES.includes(record.status)) return 'unknown_status';
  }
  if (entityType === 'financing') {
    if (record.status && !CANONICAL_FINANCING_STATUSES.includes(record.status)) return 'unknown_status';
  }
  if (entityType === 'payment') {
    const kind = isReversalPaymentRecord(record) ? 'reversal' : (record.kind || 'payment');
    if (kind && !CANONICAL_PAYMENT_KINDS.includes(kind)) return 'unknown_kind';
  }
  return null;
}

export function identityKeyFor(entityType, record, tenantId) {
  if (entityType === 'receivable') {
    const origin = String(record.origin_type || '');
    if (!record.origin_id || !['treatment_plan', 'financing'].includes(origin)) return null;
    return receivableV2Identity({
      tenant_id: tenantId,
      origin_type: origin,
      origin_id: record.origin_id,
      installment_number: record.installment_number ?? 0,
    });
  }
  if (entityType === 'payment') {
    if (!record.operation_id) return null;
    return paymentV2Identity({ tenant_id: tenantId, operation_id: record.operation_id });
  }
  if (entityType === 'financing') {
    const budgetId = record.budget_id || record.treatment_plan_id;
    if (!budgetId || TENANT_TERMINAL_FINANCING.has(record.status)) return null;
    return financingActiveIdentity({ tenant_id: tenantId, budget_id: budgetId });
  }
  if (entityType === 'charge' && record.operation_id) {
    return paymentV2Identity({ tenant_id: tenantId, operation_id: record.operation_id });
  }
  return null;
}

export function classifyLegacyFinancialRecord(record, {
  entityType,
  db,
  duplicateIds = new Set(),
  reconEntityIds = new Set(),
} = {}) {
  const findings = [];
  const direct = tid(record?.tenant_id || record?.tenantId) || null;
  const related = collectRelatedTenants(entityType, record, db);
  const ownership = ownershipResult(direct, related);
  findings.push({ code: ownership.class, detail: ownership.proof });

  const unsupported = isUnsupported(entityType, record);
  if (unsupported) findings.push({ code: LEGACY_CLASSIFICATION.UNSUPPORTED, detail: unsupported });

  if (reconEntityIds.has(record?.id)) {
    findings.push({ code: LEGACY_CLASSIFICATION.RECONCILIATION_MISMATCH, detail: record.id });
  }
  if (duplicateIds.has(record?.id)) {
    findings.push({ code: LEGACY_CLASSIFICATION.DUPLICATE, detail: identityKeyFor(entityType, record, ownership.tenant_id || direct) });
  }

  const severity = [
    LEGACY_CLASSIFICATION.CONFLICTED,
    LEGACY_CLASSIFICATION.DUPLICATE,
    LEGACY_CLASSIFICATION.RECONCILIATION_MISMATCH,
    LEGACY_CLASSIFICATION.UNOWNED,
    LEGACY_CLASSIFICATION.UNSUPPORTED,
    LEGACY_CLASSIFICATION.OWNED_DERIVED,
    LEGACY_CLASSIFICATION.OWNED_DIRECT,
  ];
  const present = new Set(findings.map((item) => item.code));
  const primary = severity.find((code) => present.has(code)) || ownership.class;

  return {
    entity_type: entityType,
    source_id: record?.id || null,
    classification: primary,
    ownership_class: ownership.class,
    tenant_id: ownership.tenant_id,
    proof: ownership.proof,
    findings,
  };
}

export function evaluateFinancialMigrationEligibility(classified) {
  const tags = new Set((classified.findings || []).map((item) => item.code));
  tags.add(classified.classification);
  const blocked = [
    LEGACY_CLASSIFICATION.UNOWNED,
    LEGACY_CLASSIFICATION.CONFLICTED,
    LEGACY_CLASSIFICATION.DUPLICATE,
    LEGACY_CLASSIFICATION.RECONCILIATION_MISMATCH,
    LEGACY_CLASSIFICATION.UNSUPPORTED,
  ].some((code) => tags.has(code));
  if (blocked) {
    return { decision: ELIGIBILITY.QUARANTINE, classification: classified.classification, tenant_id: classified.tenant_id, proof: classified.proof };
  }
  if (classified.ownership_class === LEGACY_CLASSIFICATION.OWNED_DERIVED) {
    return {
      decision: ELIGIBILITY.ELIGIBLE_WITH_DERIVED_OWNERSHIP,
      classification: classified.classification,
      tenant_id: classified.tenant_id,
      proof: classified.proof,
    };
  }
  return { decision: ELIGIBILITY.ELIGIBLE, classification: classified.classification, tenant_id: classified.tenant_id, proof: classified.proof };
}

function collectDuplicateIds(rows, entityType) {
  const buckets = new Map();
  for (const row of rows) {
    const tenant = tid(row.tenant_id || row.tenantId);
    const key = identityKeyFor(entityType, row, tenant);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row.id);
  }
  const duplicates = new Set();
  for (const ids of buckets.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicates.add(id));
  }
  return duplicates;
}

export function buildDuplicateIndex(db) {
  return {
    receivable: collectDuplicateIds(db.accountsReceivable || [], 'receivable'),
    payment: collectDuplicateIds(db.receivablePayments || [], 'payment'),
    financing: collectDuplicateIds(db.financings || [], 'financing'),
    charge: collectDuplicateIds(db.receivableCharges || [], 'charge'),
  };
}

export function buildReconEntityIndex(db) {
  const report = inspectFinancialReconciliation(db);
  return new Set((report.findings || []).map((item) => item.entity).filter(Boolean));
}

export { RECEIVABLE_STATUS };
