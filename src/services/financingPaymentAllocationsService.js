import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import {
  AUDIT_EVENT_KEY,
  AUDIT_EVENT_SOURCE,
  AUDIT_OPERATION_CONTEXT,
  FINANCIAL_PAYMENT_METHOD,
  FINANCING_PAYMENT_ALLOCATION_STATUS,
  FINANCING_PAYMENT_ALLOCATION_TYPE,
  assertEnumValue,
  normalizeEnumValue,
} from './auditEventCatalog.js';
export { FINANCING_PAYMENT_ALLOCATION_STATUS, FINANCING_PAYMENT_ALLOCATION_TYPE };

const nowIso = () => new Date().toISOString();

const normalizeAmount = (value) => Number(value || 0);

const validateAllocationPayload = (payload) => {
  if (!payload || typeof payload !== 'object') throw new Error('Payload de alocação inválido.');
  if (!payload.financing_id) throw new Error('financing_id é obrigatório.');
  if (!payload.installment_id) throw new Error('installment_id é obrigatório.');
  if (!payload.receivable_id) throw new Error('receivable_id é obrigatório.');
  if (!payload.receivable_payment_id) throw new Error('receivable_payment_id é obrigatório.');
  const amount = normalizeAmount(payload.allocated_amount);
  if (amount <= 0) throw new Error('allocated_amount deve ser maior que zero.');
  if (payload.status !== undefined) {
    assertEnumValue('status', FINANCING_PAYMENT_ALLOCATION_STATUS, payload.status);
  }
  if (payload.allocation_type !== undefined) {
    assertEnumValue('allocation_type', FINANCING_PAYMENT_ALLOCATION_TYPE, payload.allocation_type);
  }
  if (payload.metadata?.event_key !== undefined) {
    assertEnumValue('metadata.event_key', AUDIT_EVENT_KEY, payload.metadata.event_key);
  }
  if (payload.metadata?.source !== undefined) {
    assertEnumValue('metadata.source', AUDIT_EVENT_SOURCE, payload.metadata.source);
  }
  if (payload.metadata?.operation_context !== undefined) {
    assertEnumValue('metadata.operation_context', AUDIT_OPERATION_CONTEXT, payload.metadata.operation_context);
  }
  if (payload.metadata?.payment_method !== undefined) {
    assertEnumValue('metadata.payment_method', FINANCIAL_PAYMENT_METHOD, payload.metadata.payment_method);
  }
  return amount;
};

export const createFinancingPaymentAllocation = (payload) => {
  const allocatedAmount = validateAllocationPayload(payload);
  const createdAt = nowIso();
  const record = {
    id: payload.id || createId('fnalloc'),
    financing_id: payload.financing_id,
    installment_id: payload.installment_id,
    receivable_id: payload.receivable_id,
    receivable_payment_id: payload.receivable_payment_id,
    boleto_charge_id: payload.boleto_charge_id || null,
    allocated_amount: allocatedAmount,
    allocation_type: normalizeEnumValue(
      FINANCING_PAYMENT_ALLOCATION_TYPE,
      payload.allocation_type,
      FINANCING_PAYMENT_ALLOCATION_TYPE.INSTALLMENT_PAYMENT
    ),
    status: normalizeEnumValue(
      FINANCING_PAYMENT_ALLOCATION_STATUS,
      payload.status,
      FINANCING_PAYMENT_ALLOCATION_STATUS.APPLIED
    ),
    notes: payload.notes || '',
    metadata: {
      event_key: normalizeEnumValue(
        AUDIT_EVENT_KEY,
        payload.metadata?.event_key,
        AUDIT_EVENT_KEY.PAYMENT_ALLOCATION_CREATED
      ),
      payment_method: payload.metadata?.payment_method
        ? normalizeEnumValue(FINANCIAL_PAYMENT_METHOD, payload.metadata?.payment_method, null)
        : null,
      payment_date: payload.metadata?.payment_date || null,
      source: normalizeEnumValue(
        AUDIT_EVENT_SOURCE,
        payload.metadata?.source,
        AUDIT_EVENT_SOURCE.FINANCIAL_OPERATION
      ),
      operation_context: normalizeEnumValue(
        AUDIT_OPERATION_CONTEXT,
        payload.metadata?.operation_context,
        AUDIT_OPERATION_CONTEXT.REGISTER_FINANCING_PAYMENT
      ),
      ...payload.metadata,
    },
    created_at: createdAt,
    created_by: payload.created_by || null,
    reversed_at: payload.reversed_at || null,
    reversed_by: payload.reversed_by || null,
    reversal_reason: payload.reversal_reason || '',
  };
  withDb((db) => {
    if (!Array.isArray(db.financingPaymentAllocations)) db.financingPaymentAllocations = [];
    db.financingPaymentAllocations.push(record);
    return db;
  });
  return record;
};

const markAllocationAsReversed = (allocation, payload = {}) => ({
  ...allocation,
  status: FINANCING_PAYMENT_ALLOCATION_STATUS.REVERSED,
  reversed_at: payload.reversed_at || nowIso(),
  reversed_by: payload.reversed_by || null,
  reversal_reason: payload.reversal_reason || '',
  metadata: {
    ...(allocation.metadata || {}),
    reversal_event_key: normalizeEnumValue(
      AUDIT_EVENT_KEY,
      payload.metadata?.reversal_event_key,
      AUDIT_EVENT_KEY.PAYMENT_ALLOCATION_REVERSED
    ),
    reversal_source: normalizeEnumValue(
      AUDIT_EVENT_SOURCE,
      payload.metadata?.reversal_source,
      AUDIT_EVENT_SOURCE.FINANCIAL_OPERATION
    ),
    reversal_operation_context: normalizeEnumValue(
      AUDIT_OPERATION_CONTEXT,
      payload.metadata?.reversal_operation_context,
      AUDIT_OPERATION_CONTEXT.REVERSE_FINANCING_PAYMENT_AUDIT
    ),
    ...(payload.metadata || {}),
  },
});

export const reverseFinancingPaymentAllocation = (allocationId, payload = {}) => {
  let output = null;
  withDb((db) => {
    const list = Array.isArray(db.financingPaymentAllocations) ? db.financingPaymentAllocations : [];
    const index = list.findIndex((item) => item.id === allocationId);
    if (index < 0) throw new Error('Alocação não encontrada.');
    const current = list[index];
    if (current.status === FINANCING_PAYMENT_ALLOCATION_STATUS.REVERSED) {
      output = current;
      return db;
    }
    const next = markAllocationAsReversed(current, payload);
    list[index] = next;
    db.financingPaymentAllocations = list;
    output = next;
    return db;
  });
  return output;
};

export const reverseAllocationsByReceivablePayment = (receivablePaymentId, payload = {}) => {
  if (!receivablePaymentId) throw new Error('receivablePaymentId é obrigatório para estorno.');
  const allocations = listFinancingPaymentAllocations({
    receivable_payment_id: receivablePaymentId,
    status: FINANCING_PAYMENT_ALLOCATION_STATUS.APPLIED,
  });
  const reversed = [];
  for (const allocation of allocations) {
    reversed.push(reverseFinancingPaymentAllocation(allocation.id, payload));
  }
  return reversed;
};

export const getFinancingPaymentAllocationById = (id) => {
  const db = loadDb();
  const items = Array.isArray(db.financingPaymentAllocations) ? db.financingPaymentAllocations : [];
  return items.find((item) => item.id === id) || null;
};

export const listFinancingPaymentAllocations = (filters = {}) => {
  const db = loadDb();
  let items = Array.isArray(db.financingPaymentAllocations) ? [...db.financingPaymentAllocations] : [];
  if (filters.financing_id) items = items.filter((item) => item.financing_id === filters.financing_id);
  if (filters.installment_id) items = items.filter((item) => item.installment_id === filters.installment_id);
  if (filters.receivable_id) items = items.filter((item) => item.receivable_id === filters.receivable_id);
  if (filters.receivable_payment_id) items = items.filter((item) => item.receivable_payment_id === filters.receivable_payment_id);
  if (filters.boleto_charge_id) items = items.filter((item) => item.boleto_charge_id === filters.boleto_charge_id);
  if (filters.status) items = items.filter((item) => item.status === filters.status);
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return items;
};

export const summarizeAllocationsByInstallment = (installmentId) => {
  const applied = listFinancingPaymentAllocations({
    installment_id: installmentId,
    status: FINANCING_PAYMENT_ALLOCATION_STATUS.APPLIED,
  });
  const reversed = listFinancingPaymentAllocations({
    installment_id: installmentId,
    status: FINANCING_PAYMENT_ALLOCATION_STATUS.REVERSED,
  });
  const totalApplied = applied.reduce((sum, item) => sum + normalizeAmount(item.allocated_amount), 0);
  const totalReversed = reversed.reduce((sum, item) => sum + normalizeAmount(item.allocated_amount), 0);
  return {
    installment_id: installmentId,
    total_applied: totalApplied,
    total_reversed: totalReversed,
    net_allocated: Math.max(totalApplied - totalReversed, 0),
  };
};

