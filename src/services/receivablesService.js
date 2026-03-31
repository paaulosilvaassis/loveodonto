import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId } from './helpers.js';
import {
  AUDIT_EVENT_KEY,
  AUDIT_EVENT_SOURCE,
  AUDIT_OPERATION_CONTEXT,
  FINANCIAL_PAYMENT_METHOD,
  RECEIVABLE_CHARGE_TYPE,
  RECEIVABLE_CHARGE_EVENT_TYPE,
  RECEIVABLE_CHARGE_STATUS,
  RECEIVABLE_STATUS,
  assertEnumValue,
  normalizeEnumValue,
} from './auditEventCatalog.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';

export const RECEIVABLE_TABS = {
  A_RECEBER: 'a_receber',
  RECEBIDOS: 'recebidos',
  EM_ATRASO: 'em_atraso',
  COBRANCAS: 'cobrancas',
  PARCELAMENTOS: 'parcelamentos',
  RECEBIMENTOS_AVULSOS: 'recebimentos_avulsos',
};

export { RECEIVABLE_STATUS };

export const RECEIVABLE_ORIGIN_TYPE = {
  TREATMENT_PLAN: 'treatment_plan',
  CONTRACT: 'contract',
  FINANCING: 'financing',
  MANUAL_ENTRY: 'manual_entry',
  RENEGOTIATION: 'renegotiation',
  RECURRING_CHARGE: 'recurring_charge',
};

export const RECEIVABLE_PAYMENT_METHODS = [
  { value: FINANCIAL_PAYMENT_METHOD.CASH, label: 'Dinheiro' },
  { value: FINANCIAL_PAYMENT_METHOD.PIX, label: 'PIX' },
  { value: FINANCIAL_PAYMENT_METHOD.BOLETO, label: 'Boleto' },
  { value: FINANCIAL_PAYMENT_METHOD.DEBIT_CARD, label: 'Cartão débito' },
  { value: FINANCIAL_PAYMENT_METHOD.CREDIT_CARD, label: 'Cartão crédito' },
  { value: FINANCIAL_PAYMENT_METHOD.PAYMENT_LINK, label: 'Link de pagamento' },
  { value: FINANCIAL_PAYMENT_METHOD.TRANSFER, label: 'Transferência' },
  { value: FINANCIAL_PAYMENT_METHOD.INSURANCE, label: 'Convênio' },
  { value: FINANCIAL_PAYMENT_METHOD.CHECK, label: 'Cheque' },
  { value: FINANCIAL_PAYMENT_METHOD.DIGITAL_WALLET, label: 'Carteira digital' },
  { value: FINANCIAL_PAYMENT_METHOD.OTHERS, label: 'Outros' },
];

export const RECEIVABLE_CHARGE_METHODS = [
  { value: RECEIVABLE_CHARGE_TYPE.NONE, label: 'Nenhuma' },
  { value: RECEIVABLE_CHARGE_TYPE.BOLETO, label: 'Boleto' },
  { value: RECEIVABLE_CHARGE_TYPE.PIX, label: 'PIX cobrança' },
  { value: RECEIVABLE_CHARGE_TYPE.CARD_LINK, label: 'Link de cartão' },
  { value: RECEIVABLE_CHARGE_TYPE.WHATSAPP_REMINDER, label: 'WhatsApp' },
  { value: RECEIVABLE_CHARGE_TYPE.EMAIL_REMINDER, label: 'E-mail' },
  { value: RECEIVABLE_CHARGE_TYPE.SMS_REMINDER, label: 'SMS' },
];

export { RECEIVABLE_CHARGE_STATUS };

const TODAY = () => new Date().toISOString().slice(0, 10);

const normalizeAmounts = ({
  original_amount,
  discount_amount,
  interest_amount,
  fine_amount,
}) => {
  const original = Number(original_amount || 0);
  const discount = Number(discount_amount || 0);
  const interest = Number(interest_amount || 0);
  const fine = Number(fine_amount || 0);
  const net = original - discount + interest + fine;
  return {
    original_amount: original,
    discount_amount: discount,
    interest_amount: interest,
    fine_amount: fine,
    net_amount: net,
  };
};

const computeReceivableStatus = (receivable, todayIso = TODAY()) => {
  if (receivable.status === RECEIVABLE_STATUS.CANCELED) return RECEIVABLE_STATUS.CANCELED;
  if (receivable.status === RECEIVABLE_STATUS.RENEGOTIATED) return RECEIVABLE_STATUS.RENEGOTIATED;

  const remaining = Number(receivable.remaining_amount || 0);
  const net = Number(receivable.net_amount || 0);
  const dueDate = receivable.due_date;

  if (remaining <= 0 && net > 0) {
    return RECEIVABLE_STATUS.PAID;
  }

  if (remaining > 0 && net > 0 && remaining < net) {
    // parcialmente pago
    if (dueDate && dueDate < todayIso) return RECEIVABLE_STATUS.OVERDUE;
    if (dueDate && dueDate === todayIso) return RECEIVABLE_STATUS.DUE_TODAY;
    return RECEIVABLE_STATUS.PARTIALLY_PAID;
  }

  if (!dueDate) return RECEIVABLE_STATUS.PENDING;

  if (dueDate < todayIso) return RECEIVABLE_STATUS.OVERDUE;
  if (dueDate === todayIso) return RECEIVABLE_STATUS.DUE_TODAY;

  // a vencer no futuro
  return RECEIVABLE_STATUS.UPCOMING;
};

const refreshFinancingFromReceivable = (db, receivable) => {
  const financingId = receivable?.financing_id;
  if (!financingId) return;
  const installmentIndex = Array.isArray(db.financingInstallments)
    ? db.financingInstallments.findIndex((item) => item.receivable_id === receivable.id)
    : -1;
  if (installmentIndex >= 0) {
    const installment = db.financingInstallments[installmentIndex];
    const paidAmount = Number(receivable.received_amount || 0);
    const netAmount = Number(receivable.net_amount || 0);
    const nextInstallment = {
      ...installment,
      paid_amount: paidAmount,
      remaining_amount: Math.max(netAmount - paidAmount, 0),
      status: computeReceivableStatus(receivable, TODAY()),
      last_payment_at: paidAmount > 0 ? new Date().toISOString() : installment.last_payment_at || null,
      updated_at: new Date().toISOString(),
    };
    db.financingInstallments[installmentIndex] = nextInstallment;
  }
  if (!Array.isArray(db.financings)) return;
  const financingIndex = db.financings.findIndex((item) => item.id === financingId);
  if (financingIndex < 0) return;
  const linkedInstallments = (Array.isArray(db.financingInstallments) ? db.financingInstallments : [])
    .filter((item) => item.financing_id === financingId);
  const totalNet = linkedInstallments.reduce((sum, item) => sum + Number(item.net_amount || 0), 0);
  const totalPaid = linkedInstallments.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0);
  const totalOpen = Math.max(totalNet - totalPaid, 0);
  const hasOverdue = linkedInstallments.some((item) => item.status === RECEIVABLE_STATUS.OVERDUE);
  const allPaid = linkedInstallments.length > 0
    && linkedInstallments.every((item) => item.status === RECEIVABLE_STATUS.PAID);
  const hasPartial = linkedInstallments.some((item) => item.status === RECEIVABLE_STATUS.PARTIALLY_PAID);
  let nextStatus = db.financings[financingIndex].status || 'active';
  if (allPaid) nextStatus = 'paid_off';
  else if (hasOverdue) nextStatus = 'overdue';
  else if (hasPartial || totalPaid > 0) nextStatus = 'partially_paid';
  else nextStatus = 'active';
  db.financings[financingIndex] = {
    ...db.financings[financingIndex],
    status: nextStatus,
    total_paid_amount: totalPaid,
    total_open_amount: totalOpen,
    updated_at: new Date().toISOString(),
  };
};

const applyTabFilter = (items, tabKey) => {
  switch (tabKey) {
    case RECEIVABLE_TABS.A_RECEBER:
      return items.filter((r) =>
        [RECEIVABLE_STATUS.PENDING, RECEIVABLE_STATUS.DUE_TODAY, RECEIVABLE_STATUS.UPCOMING, RECEIVABLE_STATUS.OVERDUE, RECEIVABLE_STATUS.PARTIALLY_PAID]
          .includes(r.status)
      );
    case RECEIVABLE_TABS.RECEBIDOS:
      return items.filter((r) => r.status === RECEIVABLE_STATUS.PAID);
    case RECEIVABLE_TABS.EM_ATRASO:
      return items.filter((r) => r.status === RECEIVABLE_STATUS.OVERDUE);
    case RECEIVABLE_TABS.COBRANCAS:
      return items.filter((r) => !!r.charge_method && r.charge_method !== RECEIVABLE_CHARGE_TYPE.NONE);
    case RECEIVABLE_TABS.PARCELAMENTOS:
      return items.filter((r) => Number(r.total_installments || 0) > 1);
    case RECEIVABLE_TABS.RECEBIMENTOS_AVULSOS:
      // Será alimentado por cashTransactions / estrutura futura
      return [];
    default:
      return items;
  }
};

export const listReceivables = (filters = {}) => {
  const db = loadDb();
  let items = Array.isArray(db.accountsReceivable) ? [...db.accountsReceivable] : [];
  const todayIso = TODAY();

  items = items.map((r) => ({
    ...r,
    status: computeReceivableStatus(r, todayIso),
  }));

  const {
    startDate,
    endDate,
    status,
    patientId,
    professionalId,
    paymentMethodExpected,
    originType,
    tabFilter,
  } = filters;

  if (tabFilter) {
    items = applyTabFilter(items, tabFilter, todayIso);
  }

  if (startDate) items = items.filter((r) => (r.due_date || '') >= startDate);
  if (endDate) items = items.filter((r) => (r.due_date || '') <= endDate);
  if (status && Object.values(RECEIVABLE_STATUS).includes(status)) {
    items = items.filter((r) => r.status === status);
  }
  if (patientId) items = items.filter((r) => r.patient_id === patientId);
  if (professionalId) items = items.filter((r) => r.professional_id === professionalId);
  if (paymentMethodExpected) items = items.filter((r) => r.payment_method_expected === paymentMethodExpected);
  if (originType) items = items.filter((r) => r.origin_type === originType);

  items.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  return items;
};

export const getReceivablesKPIs = (month, year) => {
  const db = loadDb();
  const items = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
  const todayIso = TODAY();
  const y = year ?? new Date().getFullYear();
  const m = month ?? new Date().getMonth() + 1;
  const prefix = `${y}-${String(m).padStart(2, '0')}`;

  let totalToReceive = 0;
  let totalReceived = 0;
  let totalOverdue = 0;
  let totalUpcoming = 0;

  items.forEach((r) => {
    const duePrefix = (r.due_date || '').slice(0, 7);
    if (duePrefix !== prefix) return;

    const net = Number(r.net_amount || 0);
    const remaining = Number(r.remaining_amount || 0);
    const status = computeReceivableStatus(r, todayIso);

    if (status === RECEIVABLE_STATUS.PAID) {
      totalReceived += net;
    } else if (status === RECEIVABLE_STATUS.OVERDUE) {
      totalOverdue += remaining;
    } else if (status === RECEIVABLE_STATUS.UPCOMING || status === RECEIVABLE_STATUS.DUE_TODAY || status === RECEIVABLE_STATUS.PARTIALLY_PAID) {
      totalUpcoming += remaining;
    }
  });

  totalToReceive = totalReceived + totalOverdue + totalUpcoming;

  const totalReceivableBase = totalReceived + totalOverdue + totalUpcoming;
  const inadimplenciaPercent =
    totalReceivableBase > 0 ? (totalOverdue / totalReceivableBase) * 100 : 0;

  return {
    totalToReceive,
    totalReceived,
    totalOverdue,
    totalUpcoming,
    inadimplenciaPercent,
  };
};

export const createReceivable = (user, payload) => {
  if (payload.payment_method_expected !== undefined) {
    assertEnumValue('payment_method_expected', FINANCIAL_PAYMENT_METHOD, payload.payment_method_expected);
  }
  if (payload.charge_method !== undefined) {
    assertEnumValue('charge_method', RECEIVABLE_CHARGE_TYPE, payload.charge_method);
  }
  requirePermission(user, 'finance:write');
  const tenantId = resolveTenantIdForWrite(user, payload?.tenant_id || payload?.tenantId);

  const todayIso = TODAY();
  const description = String(payload.description || '').trim();
  const patientId = payload.patient_id || payload.patientId || null;
  const originType = payload.origin_type || payload.originType || RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY;
  const originId = payload.origin_id || payload.originId || null;

  if (!description) throw new Error('Descrição é obrigatória.');
  if (!patientId) throw new Error('Paciente é obrigatório.');
  if (!Object.values(RECEIVABLE_ORIGIN_TYPE).includes(originType)) {
    throw new Error(`origin_type inválido: "${String(originType)}".`);
  }

  const {
    original_amount,
    discount_amount,
    interest_amount,
    fine_amount,
  } = normalizeAmounts(payload);

  if (!original_amount || original_amount <= 0) throw new Error('Valor original deve ser maior que zero.');

  const issueDate = payload.issue_date || payload.issueDate || todayIso;
  const dueDate = payload.due_date || payload.dueDate || todayIso;

  const netAmount = original_amount - discount_amount + interest_amount + fine_amount;

  const now = new Date().toISOString();
  const id = createId('recv');

  const record = {
    id,
    patient_id: patientId,
    financial_responsible_id: payload.financial_responsible_id || null,
    origin_type: originType,
    origin_id: originId,
    description,
    installment_number: Number(payload.installment_number || 1),
    total_installments: Number(payload.total_installments || 1),
    issue_date: issueDate,
    due_date: dueDate,
    original_amount,
    discount_amount,
    interest_amount,
    fine_amount,
    net_amount: netAmount,
    received_amount: 0,
    remaining_amount: netAmount,
    status: RECEIVABLE_STATUS.PENDING,
    payment_method_expected: normalizeEnumValue(
      FINANCIAL_PAYMENT_METHOD,
      payload.payment_method_expected,
      FINANCIAL_PAYMENT_METHOD.OTHERS
    ),
    payment_method_received: null,
    charge_method: normalizeEnumValue(
      RECEIVABLE_CHARGE_TYPE,
      payload.charge_method,
      RECEIVABLE_CHARGE_TYPE.NONE
    ),
    charge_reference: payload.charge_reference || null,
    invoice_number: payload.invoice_number || null,
    contract_id: payload.contract_id || null,
    treatment_plan_id: payload.treatment_plan_id || null,
    financing_id: payload.financing_id || null,
    financing_installment_id: payload.financing_installment_id || null,
    category_id: payload.category_id || null,
    cost_center_id: payload.cost_center_id || null,
    professional_id: payload.professional_id || null,
    clinic_unit_id: payload.clinic_unit_id || null,
    is_recurring: Boolean(payload.is_recurring),
    recurrence_frequency: payload.recurrence_frequency || null,
    last_reminder_sent_at: null,
    notes: payload.notes || '',
    created_at: now,
    updated_at: now,
    canceled_at: null,
    canceled_reason: null,
    tenant_id: tenantId,
  };

  record.status = computeReceivableStatus(record, todayIso);

  withDb((db) => {
    if (!Array.isArray(db.accountsReceivable)) db.accountsReceivable = [];
    db.accountsReceivable.push(record);
    return db;
  });

  if (!record.financing_id && originType !== RECEIVABLE_ORIGIN_TYPE.FINANCING) {
    import('./commissionCalculationService.js')
      .then((mod) => {
        try {
          mod.syncConversionCommissionsForReceivable(user, record.id);
        } catch {
          /* best-effort */
        }
      })
      .catch(() => {});
  }

  return record;
};

export const updateReceivable = (user, id, payload) => {
  if (payload.payment_method_expected !== undefined) {
    assertEnumValue('payment_method_expected', FINANCIAL_PAYMENT_METHOD, payload.payment_method_expected);
  }
  if (payload.charge_method !== undefined) {
    assertEnumValue('charge_method', RECEIVABLE_CHARGE_TYPE, payload.charge_method);
  }
  requirePermission(user, 'finance:write');
  const db = loadDb();
  const items = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
  const idx = items.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error('Título não encontrado.');

  const current = items[idx];
  if (current.status === RECEIVABLE_STATUS.CANCELED) throw new Error('Não é possível editar título cancelado.');
  if (current.status === RECEIVABLE_STATUS.RENEGOTIATED) throw new Error('Não é possível editar título renegociado.');
  if (payload.origin_type !== undefined) {
    const nextOriginType = payload.origin_type || current.origin_type;
    if (!Object.values(RECEIVABLE_ORIGIN_TYPE).includes(nextOriginType)) {
      throw new Error(`origin_type inválido: "${String(payload.origin_type)}".`);
    }
  }

  const todayIso = TODAY();

  const description = payload.description !== undefined
    ? String(payload.description || '').trim()
    : current.description;

  if (!description) throw new Error('Descrição é obrigatória.');

  const mergedAmounts = normalizeAmounts({
    original_amount: payload.original_amount !== undefined ? payload.original_amount : current.original_amount,
    discount_amount: payload.discount_amount !== undefined ? payload.discount_amount : current.discount_amount,
    interest_amount: payload.interest_amount !== undefined ? payload.interest_amount : current.interest_amount,
    fine_amount: payload.fine_amount !== undefined ? payload.fine_amount : current.fine_amount,
  });

  const netAmount = mergedAmounts.original_amount - mergedAmounts.discount_amount + mergedAmounts.interest_amount + mergedAmounts.fine_amount;
  const receivedAmount = Number(current.received_amount || 0);
  const remainingAmount = Math.max(netAmount - receivedAmount, 0);

  const updated = {
    ...current,
    patient_id: payload.patient_id !== undefined ? payload.patient_id : current.patient_id,
    financial_responsible_id: payload.financial_responsible_id !== undefined ? payload.financial_responsible_id : current.financial_responsible_id,
    origin_type: payload.origin_type !== undefined ? payload.origin_type : current.origin_type,
    origin_id: payload.origin_id !== undefined ? payload.origin_id : current.origin_id,
    description,
    installment_number: payload.installment_number !== undefined ? Number(payload.installment_number || 1) : current.installment_number,
    total_installments: payload.total_installments !== undefined ? Number(payload.total_installments || 1) : current.total_installments,
    issue_date: payload.issue_date !== undefined ? (payload.issue_date || current.issue_date) : current.issue_date,
    due_date: payload.due_date !== undefined ? (payload.due_date || current.due_date) : current.due_date,
    original_amount: mergedAmounts.original_amount,
    discount_amount: mergedAmounts.discount_amount,
    interest_amount: mergedAmounts.interest_amount,
    fine_amount: mergedAmounts.fine_amount,
    net_amount: netAmount,
    remaining_amount: remainingAmount,
    payment_method_expected: payload.payment_method_expected !== undefined ? payload.payment_method_expected : current.payment_method_expected,
    charge_method: payload.charge_method !== undefined ? payload.charge_method : current.charge_method,
    charge_reference: payload.charge_reference !== undefined ? payload.charge_reference : current.charge_reference,
    invoice_number: payload.invoice_number !== undefined ? payload.invoice_number : current.invoice_number,
    contract_id: payload.contract_id !== undefined ? payload.contract_id : current.contract_id,
    treatment_plan_id: payload.treatment_plan_id !== undefined ? payload.treatment_plan_id : current.treatment_plan_id,
    category_id: payload.category_id !== undefined ? payload.category_id : current.category_id,
    cost_center_id: payload.cost_center_id !== undefined ? payload.cost_center_id : current.cost_center_id,
    professional_id: payload.professional_id !== undefined ? payload.professional_id : current.professional_id,
    clinic_unit_id: payload.clinic_unit_id !== undefined ? payload.clinic_unit_id : current.clinic_unit_id,
    is_recurring: payload.is_recurring !== undefined ? Boolean(payload.is_recurring) : current.is_recurring,
    recurrence_frequency: payload.recurrence_frequency !== undefined ? payload.recurrence_frequency : current.recurrence_frequency,
    notes: payload.notes !== undefined ? payload.notes : current.notes,
    updated_at: new Date().toISOString(),
  };

  updated.status = computeReceivableStatus(updated, todayIso);

  withDb((d) => {
    const arr = Array.isArray(d.accountsReceivable) ? d.accountsReceivable : [];
    const index = arr.findIndex((r) => r.id === id);
    if (index >= 0) {
      arr[index] = updated;
      d.accountsReceivable = arr;
    }
    return d;
  });

  return updated;
};

export const registerReceivablePayment = (user, receivableId, payload) => {
  if (payload.payment_method !== undefined || payload.paymentMethod !== undefined) {
    assertEnumValue(
      'payment_method',
      FINANCIAL_PAYMENT_METHOD,
      payload.payment_method || payload.paymentMethod
    );
  }
  requirePermission(user, 'finance:write');
  const db = loadDb();
  const items = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
  const idx = items.findIndex((r) => r.id === receivableId);
  if (idx < 0) throw new Error('Título não encontrado.');

  const current = items[idx];
  if (current.status === RECEIVABLE_STATUS.CANCELED) throw new Error('Título cancelado não pode receber pagamentos.');

  const paymentDate = payload.payment_date || payload.paymentDate || TODAY();
  const amountReceived = Number(payload.amount_received || payload.amountReceived || 0);
  const discount = Number(payload.discount_amount || payload.discountAmount || 0);
  const interest = Number(payload.interest_amount || payload.interestAmount || 0);
  const fine = Number(payload.fine_amount || payload.fineAmount || 0);

  if (!amountReceived && !discount && !interest && !fine) {
    throw new Error('Informe algum valor recebido, desconto, juros ou multa.');
  }

  const prevReceived = Number(current.received_amount || 0);
  const newReceived = prevReceived + amountReceived;
  const netAmount = Number(current.net_amount || 0);
  const newRemaining = Math.max(netAmount - newReceived, 0);

  const now = new Date().toISOString();
  const paymentId = createId('rvpay');

  const paymentRecord = {
    id: paymentId,
    receivable_id: receivableId,
    payment_date: paymentDate,
    amount_received: amountReceived,
    discount_amount: discount,
    interest_amount: interest,
    fine_amount: fine,
    payment_method: normalizeEnumValue(
      FINANCIAL_PAYMENT_METHOD,
      payload.payment_method || payload.paymentMethod || current.payment_method_expected,
      FINANCIAL_PAYMENT_METHOD.OTHERS
    ),
    financial_account_id: payload.financial_account_id || null,
    cash_register_id: payload.cash_register_id || null,
    transaction_reference: payload.transaction_reference || null,
    notes: payload.notes || '',
    created_at: now,
    created_by: user?.id || null,
  };

  const updatedReceivable = {
    ...current,
    received_amount: newReceived,
    remaining_amount: newRemaining,
    payment_method_received: paymentRecord.payment_method,
    updated_at: now,
  };

  updatedReceivable.status = computeReceivableStatus(updatedReceivable, TODAY());

  withDb((d) => {
    if (!Array.isArray(d.accountsReceivable)) d.accountsReceivable = [];
    if (!Array.isArray(d.receivablePayments)) d.receivablePayments = [];

    const arr = d.accountsReceivable;
    const index = arr.findIndex((r) => r.id === receivableId);
    if (index >= 0) {
      arr[index] = updatedReceivable;
      d.accountsReceivable = arr;
    }

    d.receivablePayments.push(paymentRecord);
    refreshFinancingFromReceivable(d, updatedReceivable);

    // Estrutura futura: integração com caixa/contas financeiras
    // Ex.: d.cashTransactions.push({ type: 'income', source: 'receivable_payment', ... })

    return d;
  });

  return {
    receivable: updatedReceivable,
    payment: paymentRecord,
  };
};

export const cancelReceivable = (user, id, reason) => {
  requirePermission(user, 'finance:write');
  const db = loadDb();
  const items = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
  const idx = items.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error('Título não encontrado.');

  const current = items[idx];
  if (current.status === RECEIVABLE_STATUS.PAID) throw new Error('Não é possível cancelar título já pago. Utilize estorno/renegociação.');

  const updated = {
    ...current,
    status: RECEIVABLE_STATUS.CANCELED,
    canceled_at: new Date().toISOString(),
    canceled_reason: reason || '',
    updated_at: new Date().toISOString(),
  };

  withDb((d) => {
    const arr = Array.isArray(d.accountsReceivable) ? d.accountsReceivable : [];
    const index = arr.findIndex((r) => r.id === id);
    if (index >= 0) {
      arr[index] = updated;
      d.accountsReceivable = arr;
      refreshFinancingFromReceivable(d, updated);
    }
    return d;
  });

  return updated;
};

export const getReceivablePayments = (receivableId) => {
  const db = loadDb();
  const payments = Array.isArray(db.receivablePayments) ? db.receivablePayments : [];
  return payments.filter((p) => p.receivable_id === receivableId);
};

export const getReceivableById = (id) => {
  const db = loadDb();
  const items = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
  return items.find((r) => r.id === id) || null;
};

export const createReceivableCharge = (user, payload) => {
  if (payload.charge_type !== undefined) {
    assertEnumValue('charge_type', RECEIVABLE_CHARGE_TYPE, payload.charge_type);
  }
  requirePermission(user, 'finance:write');
  const receivableId = payload.receivable_id;
  if (!receivableId) throw new Error('receivable_id é obrigatório para criar cobrança.');
  if (payload.event_type !== undefined) {
    assertEnumValue('event_type', RECEIVABLE_CHARGE_EVENT_TYPE, payload.event_type);
  }
  if (payload.status !== undefined) {
    assertEnumValue('status', RECEIVABLE_CHARGE_STATUS, payload.status);
  }
  if (payload.source !== undefined) {
    assertEnumValue('source', AUDIT_EVENT_SOURCE, payload.source);
  }
  if (payload.operation_context !== undefined) {
    assertEnumValue('operation_context', AUDIT_OPERATION_CONTEXT, payload.operation_context);
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

  const db = loadDb();
  const receivables = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
  const exists = receivables.some((r) => r.id === receivableId);
  if (!exists) throw new Error('Título de contas a receber não encontrado para cobrança.');

  const now = new Date().toISOString();
  const id = createId('rvchg');

  const record = {
    id,
    receivable_id: receivableId,
    event_type: normalizeEnumValue(
      RECEIVABLE_CHARGE_EVENT_TYPE,
      payload.event_type,
      RECEIVABLE_CHARGE_EVENT_TYPE.CREATED
    ),
    charge_type: normalizeEnumValue(
      RECEIVABLE_CHARGE_TYPE,
      payload.charge_type,
      RECEIVABLE_CHARGE_TYPE.WHATSAPP_REMINDER
    ),
    status: normalizeEnumValue(
      RECEIVABLE_CHARGE_STATUS,
      payload.status,
      RECEIVABLE_CHARGE_STATUS.DRAFT
    ),
    source: normalizeEnumValue(
      AUDIT_EVENT_SOURCE,
      payload.source,
      AUDIT_EVENT_SOURCE.INTERNAL_MANUAL
    ),
    operation_context: normalizeEnumValue(
      AUDIT_OPERATION_CONTEXT,
      payload.operation_context,
      AUDIT_OPERATION_CONTEXT.CREATE_RECEIVABLE_CHARGE
    ),
    sent_at: payload.sent_at || null,
    recipient: payload.recipient || '',
    message_template: payload.message_template || '',
    external_reference: payload.external_reference || null,
    viewed_at: payload.viewed_at || null,
    paid_at: payload.paid_at || null,
    notes: payload.notes || '',
    metadata: {
      event_key: normalizeEnumValue(
        AUDIT_EVENT_KEY,
        payload.metadata?.event_key,
        AUDIT_EVENT_KEY.RECEIVABLE_CHARGE_CREATED
      ),
      operation_context: normalizeEnumValue(
        AUDIT_OPERATION_CONTEXT,
        payload.metadata?.operation_context,
        AUDIT_OPERATION_CONTEXT.CREATE_RECEIVABLE_CHARGE
      ),
      source: normalizeEnumValue(
        AUDIT_EVENT_SOURCE,
        payload.metadata?.source || payload.source,
        AUDIT_EVENT_SOURCE.INTERNAL_MANUAL
      ),
      operation_id: payload.metadata?.operation_id || null,
      payment_method: payload.metadata?.payment_method || null,
      ...payload.metadata,
    },
    created_at: now,
  };

  withDb((d) => {
    if (!Array.isArray(d.receivableCharges)) d.receivableCharges = [];
    d.receivableCharges.push(record);
    return d;
  });

  return record;
};

export const listReceivableCharges = (filters = {}) => {
  const db = loadDb();
  let items = Array.isArray(db.receivableCharges) ? [...db.receivableCharges] : [];
  const {
    receivableId,
    patientId,
    type,
    status,
    eventType,
    source,
    operationContext,
    eventKey,
    startDate,
    endDate,
  } = filters;

  if (receivableId) {
    items = items.filter((c) => c.receivable_id === receivableId);
  }

  if (patientId) {
    const receivables = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
    const allowedIds = new Set(
      receivables.filter((r) => r.patient_id === patientId).map((r) => r.id)
    );
    items = items.filter((c) => allowedIds.has(c.receivable_id));
  }

  if (type) {
    items = items.filter((c) => c.charge_type === type);
  }

  if (status && Object.values(RECEIVABLE_CHARGE_STATUS).includes(status)) {
    items = items.filter((c) => c.status === status);
  }
  if (eventType && Object.values(RECEIVABLE_CHARGE_EVENT_TYPE).includes(eventType)) {
    items = items.filter((c) => c.event_type === eventType);
  }
  if (source && Object.values(AUDIT_EVENT_SOURCE).includes(source)) {
    items = items.filter((c) => c.source === source || c.metadata?.source === source);
  }
  if (operationContext && Object.values(AUDIT_OPERATION_CONTEXT).includes(operationContext)) {
    items = items.filter((c) =>
      c.operation_context === operationContext
      || c.metadata?.operation_context === operationContext
    );
  }
  if (eventKey && Object.values(AUDIT_EVENT_KEY).includes(eventKey)) {
    items = items.filter((c) => c.metadata?.event_key === eventKey);
  }

  if (startDate) {
    items = items.filter((c) => !c.sent_at || c.sent_at >= startDate);
  }

  if (endDate) {
    items = items.filter((c) => !c.sent_at || c.sent_at <= endDate);
  }

  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return items;
};

export const getReceivableChargesByReceivable = (receivableId) => {
  const db = loadDb();
  const items = Array.isArray(db.receivableCharges) ? db.receivableCharges : [];
  return items.filter((c) => c.receivable_id === receivableId);
};

