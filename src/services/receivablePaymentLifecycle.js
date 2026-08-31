import { withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId } from './helpers.js';
import {
  FINANCIAL_PAYMENT_METHOD,
  assertEnumValue,
  normalizeEnumValue,
} from './auditEventCatalog.js';
import { resolveTenantIdForWrite, requireSessionTenantId, assertSameTenant } from './tenantWriteGuard.js';
import { schedulePaymentReceivedDomainEvent } from './financialDomainEventPublisher.js';
import { reverseAllocationsByReceivablePayment } from './financingPaymentAllocationsService.js';
import { assertFiniteMoney, fromCents, toCents } from './receivableMoney.js';
import {
  RECEIVABLE_PAYMENT_KIND,
  RECEIVABLE_PAYMENT_STATUS,
  assertReceivableCollectible,
  isEffectiveReceivablePayment,
  reconcileReceivableFromPayments,
  refreshFinancingFromReceivable,
} from './receivableReconciliation.js';

export const PAYMENT_RECEIVE_PERMISSION = 'financeiro_contas_receber:edit';
export const PAYMENT_REVERSE_PERMISSION = 'financeiro_contas_receber:reverse';

const TODAY = () => new Date().toISOString().slice(0, 10);

let paymentWriteFault = null;
export function __setPaymentWriteFaultForTest(hook) {
  paymentWriteFault = typeof hook === 'function' ? hook : null;
}

function normalizeTenant(value) {
  return String(value || '').trim();
}

function findReceivable(db, receivableId) {
  const items = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
  const index = items.findIndex((row) => row.id === receivableId);
  return { items, index, current: index >= 0 ? items[index] : null };
}

function findPayment(db, paymentId) {
  const items = Array.isArray(db.receivablePayments) ? db.receivablePayments : [];
  const index = items.findIndex((row) => row.id === paymentId);
  return { items, index, current: index >= 0 ? items[index] : null };
}

function findPaymentByOperationId(payments, { tenantId, operationId }) {
  const op = String(operationId || '').trim();
  const tid = normalizeTenant(tenantId);
  if (!op || !tid) return null;
  return (Array.isArray(payments) ? payments : []).find((row) => (
    String(row.operation_id || '').trim() === op
    && normalizeTenant(row.tenant_id || row.tenantId) === tid
  )) || null;
}

/**
 * LEGACY_RECEIVABLE_WRITE_POLICY = DERIVE_FROM_PATIENT_OR_FAIL_CLOSED
 * Não backfill. Não assume tenant da sessão como dono do título.
 */
export function assertReceivableWriteOwnership(user, receivable, db) {
  requireSessionTenantId(user);
  const rowTenant = normalizeTenant(receivable?.tenant_id || receivable?.tenantId);
  if (rowTenant) {
    assertSameTenant(user, rowTenant, { action: 'write' });
    return rowTenant;
  }
  const patient = (db.patients || []).find((row) => row.id === receivable?.patient_id);
  const derived = normalizeTenant(patient?.tenant_id || patient?.tenantId);
  if (derived) {
    assertSameTenant(user, derived, { action: 'write' });
    return derived;
  }
  const error = new Error('Título sem vínculo de clínica comprovável. Mutação financeira bloqueada.');
  error.code = 'LEGACY_RECEIVABLE_UNOWNED';
  throw error;
}

function assertPatientConsistency(receivable, payload = {}) {
  const payloadPatient = payload.patient_id || payload.patientId;
  if (!payloadPatient) return;
  if (String(payloadPatient) !== String(receivable.patient_id)) {
    throw new Error('Paciente não corresponde ao título.');
  }
}

function validateIncomingAmount(rawAmount) {
  if (rawAmount === null || rawAmount === undefined || rawAmount === '') {
    throw new Error('Valor recebido é obrigatório.');
  }
  const cents = assertFiniteMoney(rawAmount, 'Valor recebido');
  if (cents <= 0) throw new Error('Valor recebido deve ser maior que zero.');
  return cents;
}

function persistReconciledReceivable(db, receivableId, payments, now) {
  const { items, index, current } = findReceivable(db, receivableId);
  if (!current) throw new Error('Título não encontrado.');
  const { receivable } = reconcileReceivableFromPayments(current, payments);
  const next = { ...receivable, updated_at: now };
  items[index] = next;
  db.accountsReceivable = items;
  refreshFinancingFromReceivable(db, next);
  return next;
}

export function registerReceivablePayment(user, receivableId, payload = {}) {
  if (payload.payment_method !== undefined || payload.paymentMethod !== undefined) {
    assertEnumValue(
      'payment_method',
      FINANCIAL_PAYMENT_METHOD,
      payload.payment_method || payload.paymentMethod,
    );
  }
  requirePermission(user, PAYMENT_RECEIVE_PERMISSION);

  const amountCents = validateIncomingAmount(payload.amount_received ?? payload.amountReceived);
  const discountCents = assertFiniteMoney(payload.discount_amount ?? payload.discountAmount ?? 0, 'Desconto');
  const interestCents = assertFiniteMoney(payload.interest_amount ?? payload.interestAmount ?? 0, 'Juros');
  const fineCents = assertFiniteMoney(payload.fine_amount ?? payload.fineAmount ?? 0, 'Multa');
  if (discountCents < 0 || interestCents < 0 || fineCents < 0) {
    throw new Error('Desconto, juros e multa não podem ser negativos.');
  }

  let savedPayment = null;
  let savedReceivable = null;
  let replayed = false;

  withDb((db) => {
    if (!Array.isArray(db.accountsReceivable)) db.accountsReceivable = [];
    if (!Array.isArray(db.receivablePayments)) db.receivablePayments = [];

    const { current } = findReceivable(db, receivableId);
    if (!current) throw new Error('Título não encontrado.');
    assertReceivableCollectible(current);

    const tenantId = assertReceivableWriteOwnership(user, current, db);
    if (payload.tenant_id || payload.tenantId) {
      resolveTenantIdForWrite(user, payload.tenant_id || payload.tenantId);
    }
    assertPatientConsistency(current, payload);

    const operationId = String(payload.operation_id || payload.idempotencyKey || '').trim()
      || createId('payop');
    const existing = findPaymentByOperationId(db.receivablePayments, { tenantId, operationId });
    if (existing) {
      replayed = true;
      savedPayment = existing;
      savedReceivable = current;
      return db;
    }

    const paidCents = toCents(reconcileReceivableFromPayments(current, db.receivablePayments).receivable.received_amount);
    const netCents = toCents(current.net_amount || 0);
    if (paidCents + amountCents > netCents) {
      throw new Error('Pagamento excede o saldo em aberto do título.');
    }

    const now = new Date().toISOString();
    const paymentRecord = {
      id: createId('rvpay'),
      tenant_id: tenantId,
      receivable_id: receivableId,
      payment_date: payload.payment_date || payload.paymentDate || TODAY(),
      amount_received: fromCents(amountCents),
      discount_amount: fromCents(discountCents),
      interest_amount: fromCents(interestCents),
      fine_amount: fromCents(fineCents),
      payment_method: normalizeEnumValue(
        FINANCIAL_PAYMENT_METHOD,
        payload.payment_method || payload.paymentMethod || current.payment_method_expected,
        FINANCIAL_PAYMENT_METHOD.OTHERS,
      ),
      financial_account_id: payload.financial_account_id || null,
      cash_register_id: payload.cash_register_id || null,
      transaction_reference: payload.transaction_reference || null,
      notes: payload.notes || '',
      created_at: now,
      created_by: user?.id || null,
      operation_id: operationId,
      kind: RECEIVABLE_PAYMENT_KIND.PAYMENT,
      status: RECEIVABLE_PAYMENT_STATUS.APPLIED,
      reverses_payment_id: null,
      reversed_at: null,
      reversed_by: null,
      reversal_reason: null,
      reversal_payment_id: null,
    };

    db.receivablePayments.push(paymentRecord);
    if (paymentWriteFault) paymentWriteFault({ phase: 'after-payment-push', db });

    const nextReceivable = persistReconciledReceivable(db, receivableId, db.receivablePayments, now);
    nextReceivable.payment_method_received = paymentRecord.payment_method;
    const idx = db.accountsReceivable.findIndex((row) => row.id === receivableId);
    if (idx >= 0) db.accountsReceivable[idx] = nextReceivable;

    savedPayment = paymentRecord;
    savedReceivable = nextReceivable;
    return db;
  });

  if (!replayed && isEffectiveReceivablePayment(savedPayment)) {
    schedulePaymentReceivedDomainEvent(user, savedPayment, savedReceivable);
  }
  return { receivable: savedReceivable, payment: savedPayment, replayed };
}

export function reverseReceivablePayment(user, paymentId, payload = {}) {
  requirePermission(user, PAYMENT_REVERSE_PERMISSION);
  if (!paymentId) throw new Error('Pagamento é obrigatório para estorno.');

  let savedPayment = null;
  let savedReversal = null;
  let savedReceivable = null;

  withDb((db) => {
    if (!Array.isArray(db.receivablePayments)) db.receivablePayments = [];
    const { current: original } = findPayment(db, paymentId);
    if (!original) throw new Error('Pagamento não encontrado.');
    if (original.kind === RECEIVABLE_PAYMENT_KIND.REVERSAL || original.reverses_payment_id) {
      throw new Error('Não é possível estornar um registro de estorno.');
    }

    const { current: receivable } = findReceivable(db, original.receivable_id);
    if (!receivable) throw new Error('Título não encontrado.');
    const tenantId = assertReceivableWriteOwnership(user, receivable, db);
    const paymentTenant = normalizeTenant(original.tenant_id || original.tenantId);
    if (paymentTenant) assertSameTenant(user, paymentTenant, { action: 'write' });

    const operationId = String(payload.operation_id || payload.idempotencyKey || '').trim()
      || `revop:${original.id}`;
    const existingOp = findPaymentByOperationId(db.receivablePayments, { tenantId, operationId });
    if (existingOp) {
      savedReversal = existingOp;
      savedPayment = original;
      savedReceivable = receivable;
      return db;
    }
    if (original.status === RECEIVABLE_PAYMENT_STATUS.REVERSED || original.reversed_at) {
      savedPayment = original;
      savedReversal = db.receivablePayments.find((row) => row.reverses_payment_id === original.id) || original;
      savedReceivable = receivable;
      return db;
    }

    const now = new Date().toISOString();
    const reversal = {
      id: createId('rvpay'),
      tenant_id: tenantId,
      receivable_id: original.receivable_id,
      payment_date: payload.payment_date || TODAY(),
      amount_received: original.amount_received,
      discount_amount: 0,
      interest_amount: 0,
      fine_amount: 0,
      payment_method: original.payment_method,
      financial_account_id: null,
      cash_register_id: null,
      transaction_reference: payload.reversal_reference || null,
      notes: payload.reversal_reason || payload.reason || original.notes || '',
      created_at: now,
      created_by: user?.id || null,
      operation_id: operationId,
      kind: RECEIVABLE_PAYMENT_KIND.REVERSAL,
      status: RECEIVABLE_PAYMENT_STATUS.APPLIED,
      reverses_payment_id: original.id,
      reversed_at: null,
      reversed_by: null,
      reversal_reason: payload.reversal_reason || payload.reason || '',
    };

    const origIndex = db.receivablePayments.findIndex((row) => row.id === original.id);
    const marked = {
      ...original,
      status: RECEIVABLE_PAYMENT_STATUS.REVERSED,
      reversed_at: now,
      reversed_by: user?.id || null,
      reversal_reason: reversal.reversal_reason,
      reversal_payment_id: reversal.id,
    };
    db.receivablePayments[origIndex] = marked;
    db.receivablePayments.push(reversal);
    if (paymentWriteFault) paymentWriteFault({ phase: 'after-reversal-push', db });

    const nextReceivable = persistReconciledReceivable(db, original.receivable_id, db.receivablePayments, now);
    savedPayment = marked;
    savedReversal = reversal;
    savedReceivable = nextReceivable;
    return db;
  });

  reverseAllocationsByReceivablePayment(paymentId, {
    reversed_by: user?.id || null,
    reversal_reason: payload.reversal_reason || payload.reason || 'Estorno de recebimento.',
  });

  return {
    receivable: savedReceivable,
    payment: savedPayment,
    reversal: savedReversal,
  };
}
