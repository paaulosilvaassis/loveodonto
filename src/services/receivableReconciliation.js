import { RECEIVABLE_STATUS } from './auditEventCatalog.js';
import { fromCents, toCents } from './receivableMoney.js';
import { applyFinancingReconciliation } from './financingReconciliation.js';

export const RECEIVABLE_PAYMENT_KIND = {
  PAYMENT: 'payment',
  REVERSAL: 'reversal',
};

export const RECEIVABLE_PAYMENT_STATUS = {
  APPLIED: 'applied',
  REVERSED: 'reversed',
};

const TODAY = () => new Date().toISOString().slice(0, 10);

export function isReversalPaymentRecord(payment) {
  if (!payment) return false;
  if (payment.kind === RECEIVABLE_PAYMENT_KIND.REVERSAL) return true;
  return Boolean(payment.reverses_payment_id || payment.reversesPaymentId);
}

export function isReversedPaymentRecord(payment) {
  if (!payment) return false;
  if (payment.status === RECEIVABLE_PAYMENT_STATUS.REVERSED) return true;
  return Boolean(payment.reversed_at || payment.reversedAt);
}

export function isEffectiveReceivablePayment(payment) {
  if (!payment) return false;
  if (isReversalPaymentRecord(payment)) return false;
  if (isReversedPaymentRecord(payment)) return false;
  return true;
}

export function listPaymentsForReceivable(payments, receivableId) {
  const items = Array.isArray(payments) ? payments : [];
  return items.filter((row) => row.receivable_id === receivableId || row.receivableId === receivableId);
}

export function sumEffectivePaidCents(payments, receivableId) {
  return listPaymentsForReceivable(payments, receivableId)
    .filter(isEffectiveReceivablePayment)
    .reduce((sum, row) => {
      const cents = toCents(row.amount_received || row.amountReceived || 0);
      return sum + (Number.isFinite(cents) ? cents : 0);
    }, 0);
}

export function isReceivableCollectible(receivable) {
  const status = receivable?.status;
  return status !== RECEIVABLE_STATUS.CANCELED && status !== RECEIVABLE_STATUS.RENEGOTIATED;
}

export function isReceivableOpenBalanceStatus(status) {
  return status !== RECEIVABLE_STATUS.CANCELED
    && status !== RECEIVABLE_STATUS.RENEGOTIATED
    && status !== RECEIVABLE_STATUS.PAID;
}

export function assertReceivableCollectible(receivable) {
  if (receivable?.status === RECEIVABLE_STATUS.CANCELED) {
    throw new Error('Título cancelado não pode receber pagamentos.');
  }
  if (receivable?.status === RECEIVABLE_STATUS.RENEGOTIATED) {
    throw new Error('Título renegociado não pode receber pagamentos.');
  }
}

export function computeReceivableStatus(receivable, todayIso = TODAY()) {
  if (receivable.status === RECEIVABLE_STATUS.CANCELED) return RECEIVABLE_STATUS.CANCELED;
  if (receivable.status === RECEIVABLE_STATUS.RENEGOTIATED) return RECEIVABLE_STATUS.RENEGOTIATED;

  const remainingCents = toCents(receivable.remaining_amount || 0);
  const netCents = toCents(receivable.net_amount || 0);
  const dueDate = receivable.due_date;

  if (remainingCents <= 0 && netCents > 0) {
    return RECEIVABLE_STATUS.PAID;
  }

  if (remainingCents > 0 && netCents > 0 && remainingCents < netCents) {
    if (dueDate && dueDate < todayIso) return RECEIVABLE_STATUS.OVERDUE;
    if (dueDate && dueDate === todayIso) return RECEIVABLE_STATUS.DUE_TODAY;
    return RECEIVABLE_STATUS.PARTIALLY_PAID;
  }

  if (!dueDate) return RECEIVABLE_STATUS.PENDING;
  if (dueDate < todayIso) return RECEIVABLE_STATUS.OVERDUE;
  if (dueDate === todayIso) return RECEIVABLE_STATUS.DUE_TODAY;
  return RECEIVABLE_STATUS.UPCOMING;
}

export function reconcileReceivableFromPayments(receivable, payments, todayIso = TODAY()) {
  const netCents = toCents(receivable?.net_amount || 0);
  const paidCents = sumEffectivePaidCents(payments, receivable?.id);
  const remainingCents = Math.max(netCents - paidCents, 0);
  const next = {
    ...receivable,
    received_amount: fromCents(paidCents),
    remaining_amount: fromCents(remainingCents),
  };
  next.status = computeReceivableStatus(next, todayIso);
  return {
    receivable: next,
    effective_paid_cents: paidCents,
    remaining_cents: remainingCents,
    net_cents: netCents,
  };
}

export function refreshFinancingFromReceivable(db, receivable) {
  const financingId = receivable?.financing_id;
  if (!financingId) return;
  const installmentIndex = Array.isArray(db.financingInstallments)
    ? db.financingInstallments.findIndex((item) => item.receivable_id === receivable.id)
    : -1;
  if (installmentIndex >= 0) {
    const installment = db.financingInstallments[installmentIndex];
    const paidAmount = Number(receivable.received_amount || 0);
    const netAmount = Number(receivable.net_amount || 0);
    db.financingInstallments[installmentIndex] = {
      ...installment,
      paid_amount: paidAmount,
      remaining_amount: Math.max(netAmount - paidAmount, 0),
      status: computeReceivableStatus(receivable, TODAY()),
      last_payment_at: paidAmount > 0 ? new Date().toISOString() : installment.last_payment_at || null,
      updated_at: new Date().toISOString(),
    };
  }
  applyFinancingReconciliation(db, financingId);
}
