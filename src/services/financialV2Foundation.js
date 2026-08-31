/**
 * PHASE 11.I — fundação local financial_v2.
 * Espelha o contrato 11.H. Sem persistência remota. Sem dual-write.
 */
import {
  CUTOVER_STRATEGY,
  DELETE_POLICY,
  FEATURE_FLAG_PLAN,
  FINANCING_STATUSES,
  MONEY_CONVERSION_RULE,
  PAYMENT_KINDS,
  PAYMENT_STATUSES,
  RBAC_SERVER_BOUNDARY,
  RECEIVABLE_STATUSES,
  RLS_TARGET_V2,
  ROLLBACK_STRATEGY,
  TARGET_MONEY_STORAGE_MODEL,
  TARGET_TENANT_MODEL,
  TARGET_TABLES,
} from '../contracts/financialCoreV2PersistenceContract.js';
import { FINANCIAL_REPOSITORY_FLAG_DEFAULTS } from '../repositories/financial/financialRepositoryFlags.ts';
import { toCents } from './receivableMoney.js';

export {
  CUTOVER_STRATEGY,
  DELETE_POLICY,
  FEATURE_FLAG_PLAN,
  MONEY_CONVERSION_RULE,
  RBAC_SERVER_BOUNDARY,
  RLS_TARGET_V2,
  ROLLBACK_STRATEGY,
  TARGET_MONEY_STORAGE_MODEL,
  TARGET_TENANT_MODEL,
  TARGET_TABLES,
};

export const PHASE_11I_GATE = 'FINANCIAL_V2_LOCAL_FOUNDATION_VALIDATED';

export const PHASE_11I_RUNTIME = {
  SHADOW_WRITE_ENABLED: false,
  DUAL_WRITE_ENABLED: false,
  FINANCIAL_SERVER_READ_ENABLED: false,
  FINANCIAL_SERVER_WRITE_ENABLED: false,
  REMOTE_DATABASE_CHANGED: false,
  MIGRATION_APPLIED: false,
  BACKFILL_APPLIED: false,
  HISTORICAL_PRODUCTION_SCAN: false,
};

export const FINANCIAL_V2_MIGRATION_ORDER = [
  'financings',
  'receivables',
  'payments',
  'reversals',
  'charges',
  'boleto_charges',
  'financing_installments',
  'boleto_reminder_events',
];

export const V2_RBAC_OPERATIONS = {
  createReceivable: 'financeiro_contas_receber:create',
  registerPayment: 'financeiro_contas_receber:edit',
  reversePayment: 'financeiro_contas_receber:reverse',
  cancelReceivable: 'financeiro_contas_receber:cancel',
  createFinancing: 'financeiro_financiamentos:create',
  approveFinancing: 'financeiro_financiamentos:approve',
  cancelFinancing: 'financeiro_financiamentos:cancel',
  createCharge: 'financeiro_boletos:create',
  issueBoleto: 'financeiro_boletos:issue',
  cancelBoleto: 'financeiro_boletos:cancel',
  resendBoleto: 'financeiro_boletos:resend',
};

export const CANONICAL_RECEIVABLE_STATUSES = RECEIVABLE_STATUSES;
export const CANONICAL_FINANCING_STATUSES = FINANCING_STATUSES;
export const CANONICAL_PAYMENT_KINDS = PAYMENT_KINDS;
export const CANONICAL_PAYMENT_STATUSES = PAYMENT_STATUSES;

export const LEGACY_021_STATUS_IS_NOT_CANONICAL = ['open', 'partial', 'cancelled', 'pending_approval', 'completed'];

export function v2Cents(value) {
  return toCents(value);
}

export function assertV3FlagsRemainOff(flags = FINANCIAL_REPOSITORY_FLAG_DEFAULTS) {
  return Object.values(flags).every((value) => value === false);
}

export function receivableV2Identity({ tenant_id, origin_type, origin_id, installment_number }) {
  return `${String(tenant_id || '').trim()}::${String(origin_type || '').trim()}::${String(origin_id || '').trim()}::${Number(installment_number)}`;
}

export function paymentV2Identity({ tenant_id, operation_id }) {
  return `${String(tenant_id || '').trim()}::${String(operation_id || '').trim()}`;
}

export function financingActiveIdentity({ tenant_id, budget_id }) {
  return `${String(tenant_id || '').trim()}::${String(budget_id || '').trim()}`;
}

export function validateReceivableV2Contract(row) {
  if (!row?.tenant_id) throw new Error('receivable V2 requires tenant_id');
  if (!row?.source_id) throw new Error('receivable V2 requires source_id');
  if (!Number.isInteger(row.total_cents)) throw new Error('receivable V2 total_cents must be integer');
  if (!CANONICAL_RECEIVABLE_STATUSES.includes(row.status)) throw new Error('receivable V2 status not canonical');
  return true;
}

export function validatePaymentV2Contract(row) {
  if (!row?.tenant_id) throw new Error('payment V2 requires tenant_id');
  if (!row?.source_id) throw new Error('payment V2 requires source_id');
  if (!row?.operation_id) throw new Error('payment V2 requires operation_id');
  if (!row?.receivable_id) throw new Error('payment V2 requires receivable_id');
  if (!Number.isInteger(row.amount_cents)) throw new Error('payment V2 amount_cents must be integer');
  if (!CANONICAL_PAYMENT_KINDS.includes(row.kind)) throw new Error('payment V2 kind invalid');
  if (row.kind === 'reversal' && !row.reverses_payment_id) throw new Error('reversal requires reverses_payment_id');
  if (row.kind === 'payment' && row.reverses_payment_id) throw new Error('payment cannot reverse');
  return true;
}

export function validateFinancingV2Contract(row) {
  if (!row?.tenant_id) throw new Error('financing V2 requires tenant_id');
  if (!row?.source_id) throw new Error('financing V2 requires source_id');
  if (!Number.isInteger(row.total_cents)) throw new Error('financing V2 total_cents must be integer');
  if (!CANONICAL_FINANCING_STATUSES.includes(row.status)) throw new Error('financing V2 status not canonical');
  return true;
}

export function validateChargeV2Contract(row) {
  if (!row?.tenant_id) throw new Error('charge V2 requires tenant_id');
  if (!row?.source_id) throw new Error('charge V2 requires source_id');
  if (!row?.receivable_id) throw new Error('charge V2 requires receivable_id');
  if (!row?.operation_id) throw new Error('charge V2 requires operation_id');
  if (row.creates_receivable) throw new Error('charge must not create receivable');
  return true;
}
