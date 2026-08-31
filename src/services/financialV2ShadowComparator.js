/**
 * PHASE 11.I — shadow comparator puro (legacy normalizado vs V2).
 * Sem persistência. Sem shadow-write.
 */
import { toCents } from './receivableMoney.js';
import { ELIGIBILITY } from './financialV2LegacyClassifier.js';
import {
  CANONICAL_FINANCING_STATUSES,
  CANONICAL_RECEIVABLE_STATUSES,
  LEGACY_021_STATUS_IS_NOT_CANONICAL,
} from './financialV2Foundation.js';

export const SHADOW_RESULT = {
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  NOT_COMPARABLE: 'NOT_COMPARABLE',
  QUARANTINED: 'QUARANTINED',
};

export const SHADOW_REASON = {
  MONEY_MISMATCH: 'MONEY_MISMATCH',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  STATUS_MISMATCH: 'STATUS_MISMATCH',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  REFERENCE_MISMATCH: 'REFERENCE_MISMATCH',
  PAYMENT_FACT_MISMATCH: 'PAYMENT_FACT_MISMATCH',
  REVERSAL_MISMATCH: 'REVERSAL_MISMATCH',
  UNKNOWN_STATUS: 'UNKNOWN_STATUS',
};

function result(kind, reason_code = null, extra = {}) {
  return { result: kind, reason_code, ...extra };
}

function canonicalStatus(entityType, status) {
  if (!status) return true;
  if (LEGACY_021_STATUS_IS_NOT_CANONICAL.includes(status)) return false;
  if (entityType === 'receivable') return CANONICAL_RECEIVABLE_STATUSES.includes(status);
  if (entityType === 'financing') return CANONICAL_FINANCING_STATUSES.includes(status);
  return true;
}

export function compareFinancialShadow({ entityType, legacy, v2, eligibility }) {
  if (eligibility && eligibility.decision === ELIGIBILITY.QUARANTINE) {
    return result(SHADOW_RESULT.QUARANTINED, eligibility.classification);
  }
  if (!legacy || !v2) return result(SHADOW_RESULT.NOT_COMPARABLE, 'missing_side');
  if (legacy.id && v2.source_id && String(legacy.id) !== String(v2.source_id)) {
    return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.IDENTITY_MISMATCH);
  }
  const legacyTenant = String(legacy.tenant_id || legacy.tenantId || eligibility?.tenant_id || '').trim();
  if (legacyTenant && String(v2.tenant_id) !== legacyTenant) {
    return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.TENANT_MISMATCH);
  }
  if (!canonicalStatus(entityType, legacy.status)) {
    return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.UNKNOWN_STATUS);
  }
  if (legacy.status && v2.status && legacy.status !== v2.status) {
    return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.STATUS_MISMATCH);
  }

  if (entityType === 'receivable') {
    if (toCents(legacy.net_amount) !== v2.total_cents) {
      return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.MONEY_MISMATCH);
    }
  }
  if (entityType === 'payment') {
    if (toCents(legacy.amount_received) !== v2.amount_cents) {
      return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.MONEY_MISMATCH);
    }
    if (String(legacy.receivable_id) !== String(v2.receivable_id)) {
      return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.REFERENCE_MISMATCH);
    }
    if (v2.kind === 'payment' && (legacy.operation_id !== v2.operation_id || v2.reverses_payment_id)) {
      return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.PAYMENT_FACT_MISMATCH);
    }
    if (v2.kind === 'reversal') {
      const expected = legacy.reverses_payment_id || legacy.reversesPaymentId;
      if (String(expected) !== String(v2.reverses_payment_id)) {
        return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.REVERSAL_MISMATCH);
      }
    }
  }
  if (entityType === 'financing') {
    if (toCents(legacy.total_amount) !== v2.total_cents) {
      return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.MONEY_MISMATCH);
    }
  }
  if (entityType === 'charge') {
    if (String(legacy.receivable_id) !== String(v2.receivable_id)) {
      return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.REFERENCE_MISMATCH);
    }
    if (v2.creates_receivable) {
      return result(SHADOW_RESULT.MISMATCH, SHADOW_REASON.REFERENCE_MISMATCH);
    }
  }
  return result(SHADOW_RESULT.MATCH);
}
