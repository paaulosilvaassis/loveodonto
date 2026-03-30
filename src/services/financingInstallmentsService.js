import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { FINANCING_INSTALLMENT_STATUS, assertEnumValue, normalizeEnumValue } from './auditEventCatalog.js';
export { FINANCING_INSTALLMENT_STATUS };

const todayIso = () => new Date().toISOString().slice(0, 10);

export const computeInstallmentStatus = (item, nowIso = todayIso()) => {
  if (!item) return FINANCING_INSTALLMENT_STATUS.PENDING;
  if (item.status === FINANCING_INSTALLMENT_STATUS.CANCELED) return FINANCING_INSTALLMENT_STATUS.CANCELED;
  if (item.status === FINANCING_INSTALLMENT_STATUS.RENEGOTIATED) return FINANCING_INSTALLMENT_STATUS.RENEGOTIATED;
  const net = Number(item.net_amount || 0);
  const paid = Number(item.paid_amount || 0);
  const dueDate = item.due_date || '';
  if (paid >= net && net > 0) return FINANCING_INSTALLMENT_STATUS.PAID;
  if (paid > 0 && paid < net) return dueDate && dueDate < nowIso ? FINANCING_INSTALLMENT_STATUS.OVERDUE : FINANCING_INSTALLMENT_STATUS.PARTIALLY_PAID;
  if (!dueDate) return FINANCING_INSTALLMENT_STATUS.PENDING;
  if (dueDate < nowIso) return FINANCING_INSTALLMENT_STATUS.OVERDUE;
  if (dueDate === nowIso) return FINANCING_INSTALLMENT_STATUS.DUE_TODAY;
  return FINANCING_INSTALLMENT_STATUS.UPCOMING;
};

export const listFinancingInstallments = (filters = {}) => {
  const db = loadDb();
  let items = Array.isArray(db.financingInstallments) ? [...db.financingInstallments] : [];
  const nowIso = todayIso();
  items = items.map((item) => ({ ...item, status: computeInstallmentStatus(item, nowIso) }));
  if (filters.financing_id) items = items.filter((item) => item.financing_id === filters.financing_id);
  if (filters.status && Object.values(FINANCING_INSTALLMENT_STATUS).includes(filters.status)) {
    items = items.filter((item) => item.status === filters.status);
  }
  if (filters.patient_id) {
    const financingIds = new Set(
      (Array.isArray(db.financings) ? db.financings : [])
        .filter((f) => f.patient_id === filters.patient_id)
        .map((f) => f.id)
    );
    items = items.filter((item) => financingIds.has(item.financing_id));
  }
  items.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  return items;
};

export const getFinancingInstallmentById = (id) => {
  const db = loadDb();
  const list = Array.isArray(db.financingInstallments) ? db.financingInstallments : [];
  return list.find((item) => item.id === id) || null;
};

export const createFinancingInstallment = (payload) => {
  if (!payload?.financing_id) throw new Error('financing_id é obrigatório para criar parcela.');
  if (payload.status !== undefined) {
    assertEnumValue('status', FINANCING_INSTALLMENT_STATUS, payload.status);
  }
  const now = new Date().toISOString();
  const netAmount = Number(payload.net_amount ?? payload.original_amount ?? 0);
  const paidAmount = Number(payload.paid_amount || 0);
  const record = {
    id: payload.id || createId('fins'),
    financing_id: payload.financing_id,
    receivable_id: payload.receivable_id || null,
    installment_number: Number(payload.installment_number || 1),
    total_installments: Number(payload.total_installments || 1),
    due_date: payload.due_date || '',
    original_amount: Number(payload.original_amount || 0),
    discount_amount: Number(payload.discount_amount || 0),
    interest_amount: Number(payload.interest_amount || 0),
    fine_amount: Number(payload.fine_amount || 0),
    net_amount: netAmount,
    paid_amount: paidAmount,
    remaining_amount: Math.max(netAmount - paidAmount, 0),
    status: normalizeEnumValue(
      FINANCING_INSTALLMENT_STATUS,
      payload.status,
      FINANCING_INSTALLMENT_STATUS.PENDING
    ),
    boleto_enabled: payload.boleto_enabled !== false,
    boleto_charge_id: payload.boleto_charge_id || null,
    last_charge_at: payload.last_charge_at || null,
    last_payment_at: payload.last_payment_at || null,
    notes: payload.notes || '',
    created_at: now,
    updated_at: now,
  };
  record.status = computeInstallmentStatus(record, todayIso());
  withDb((db) => {
    if (!Array.isArray(db.financingInstallments)) db.financingInstallments = [];
    db.financingInstallments.push(record);
    return db;
  });
  return record;
};

export const patchFinancingInstallment = (id, payload) => {
  if (payload?.status !== undefined) {
    assertEnumValue('status', FINANCING_INSTALLMENT_STATUS, payload.status);
  }
  const nowIso = todayIso();
  const updatedAt = new Date().toISOString();
  let output = null;
  withDb((db) => {
    const list = Array.isArray(db.financingInstallments) ? db.financingInstallments : [];
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Parcela não encontrada.');
    const current = list[index];
    const next = {
      ...current,
      ...payload,
      updated_at: updatedAt,
    };
    if (payload.net_amount !== undefined || payload.paid_amount !== undefined) {
      const net = Number(next.net_amount || 0);
      const paid = Number(next.paid_amount || 0);
      next.remaining_amount = Math.max(net - paid, 0);
    }
    next.status = computeInstallmentStatus(next, nowIso);
    list[index] = next;
    db.financingInstallments = list;
    output = next;
    return db;
  });
  return output;
};
