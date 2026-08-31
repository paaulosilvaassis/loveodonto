/**
 * PHASE 11.I — mapper IndexedDB → financial_v2 (puro, sem persistência).
 * Referências V2 usam source_id do legado. MONEY = toCents 11.G.
 */
import { toCents } from './receivableMoney.js';
import { isReversalPaymentRecord } from './receivableReconciliation.js';
import { ELIGIBILITY } from './financialV2LegacyClassifier.js';
import {
  validateChargeV2Contract,
  validateFinancingV2Contract,
  validatePaymentV2Contract,
  validateReceivableV2Contract,
} from './financialV2Foundation.js';

function requireEligible(eligibility) {
  if (!eligibility || ![ELIGIBILITY.ELIGIBLE, ELIGIBILITY.ELIGIBLE_WITH_DERIVED_OWNERSHIP].includes(eligibility.decision)) {
    throw new Error('Mapper exige registro elegível.');
  }
}

function tenantOf(eligibility, record) {
  return eligibility.tenant_id || record.tenant_id || record.tenantId;
}

export function mapReceivableToV2(record, { eligibility } = {}) {
  requireEligible(eligibility);
  const mapped = {
    source_id: record.id,
    tenant_id: tenantOf(eligibility, record),
    patient_id: record.patient_id || null,
    origin_type: record.origin_type,
    origin_id: record.origin_id || null,
    installment_number: Number(record.installment_number ?? 0),
    total_installments: Number(record.total_installments || 1),
    budget_id: record.budget_id || null,
    financing_id: record.financing_id || null,
    description: record.description || '',
    issue_date: record.issue_date || null,
    due_date: record.due_date || null,
    original_cents: toCents(record.original_amount || 0),
    discount_cents: toCents(record.discount_amount || 0),
    interest_cents: toCents(record.interest_amount || 0),
    fine_cents: toCents(record.fine_amount || 0),
    total_cents: toCents(record.net_amount || 0),
    status: record.status,
    payment_method_expected: record.payment_method_expected || '',
    canceled_at: record.canceled_at || null,
    canceled_reason: record.canceled_reason || null,
    created_at: record.created_at || null,
    created_by_legacy: record.created_by || null,
    creates_receivable: undefined,
  };
  validateReceivableV2Contract(mapped);
  return mapped;
}

export function mapPaymentToV2(record, { eligibility } = {}) {
  requireEligible(eligibility);
  const reversal = isReversalPaymentRecord(record);
  const mapped = {
    source_id: record.id,
    tenant_id: tenantOf(eligibility, record),
    receivable_id: record.receivable_id,
    operation_id: record.operation_id,
    kind: reversal ? 'reversal' : 'payment',
    status: record.status || (reversal ? 'applied' : 'applied'),
    amount_cents: toCents(record.amount_received || 0),
    payment_method: record.payment_method || '',
    paid_at: record.payment_date || null,
    reverses_payment_id: reversal ? (record.reverses_payment_id || record.reversesPaymentId) : null,
    reversed_at: record.reversed_at || null,
    reversal_reason: record.reversal_reason || null,
    created_at: record.created_at || null,
    created_by_legacy: record.created_by || null,
  };
  validatePaymentV2Contract(mapped);
  return mapped;
}

export function mapFinancingToV2(record, { eligibility } = {}) {
  requireEligible(eligibility);
  const mapped = {
    source_id: record.id,
    tenant_id: tenantOf(eligibility, record),
    patient_id: record.patient_id || null,
    budget_id: record.budget_id || record.treatment_plan_id || null,
    status: record.status,
    total_cents: toCents(record.total_amount || 0),
    entry_cents: toCents(record.entry_amount || 0),
    interest_cents: toCents(record.total_interest || record.interest_amount || 0),
    fee_cents: toCents(record.admin_fee_amount || record.admin_fee || 0),
    discount_cents: toCents(record.discount_amount || 0),
    total_payable_cents: toCents(record.total_payable_amount || record.total_amount || 0),
    installments_count: Number(record.installments_count || 1),
    approved_at: record.approved_at || null,
    canceled_at: record.canceled_at || null,
    canceled_reason: record.canceled_reason || null,
    created_at: record.created_at || null,
    created_by_legacy: record.created_by || null,
  };
  validateFinancingV2Contract(mapped);
  return mapped;
}

export function mapChargeToV2(record, { eligibility } = {}) {
  requireEligible(eligibility);
  const mapped = {
    source_id: record.id,
    tenant_id: tenantOf(eligibility, record),
    receivable_id: record.receivable_id,
    provider: record.provider || record.charge_type || 'internal',
    provider_charge_id: record.provider_charge_id || null,
    operation_id: record.operation_id,
    status: record.status,
    amount_cents: toCents(record.amount || 0),
    created_at: record.created_at || null,
    created_by_legacy: record.created_by || null,
    creates_receivable: false,
  };
  validateChargeV2Contract(mapped);
  return mapped;
}

export const V2_REFERENCE_STRATEGY = 'source_id_of_legacy_row';
