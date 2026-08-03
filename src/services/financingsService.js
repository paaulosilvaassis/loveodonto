import { loadDb, withDb } from '../db/index.js';
import { requirePermission, can } from '../permissions/permissions.js';
import { createId } from './helpers.js';
import { readGetFinancing, readListFinancings } from './financialReadAdapter.js';
import {
  scheduleFinancialDualWriteCreateFinancing,
  scheduleFinancialDualWriteUpdateFinancing,
} from './financialWriteAdapter.js';
import {
  scheduleFinancingCreatedDomainEvent,
  scheduleFinancingUpdatedDomainEvent,
} from './financialDomainEventPublisher.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';
import {
  calculateFinancingSummary,
  buildInstallmentsSchedule,
  normalizeFinancingFrequency,
  isFinancingFrequencyInput,
  FINANCING_FREQUENCIES,
  FINANCING_INTEREST_TYPES,
} from './financingCalculator.js';
import {
  createFinancingInstallment,
  listFinancingInstallments,
  patchFinancingInstallment,
  computeInstallmentStatus,
  FINANCING_INSTALLMENT_STATUS,
} from './financingInstallmentsService.js';
import {
  createReceivable,
  registerReceivablePayment,
  RECEIVABLE_ORIGIN_TYPE,
  cancelReceivable,
} from './receivablesService.js';
import { createBoletoCharge, listBoletoCharges, BOLETO_CHARGE_STATUS } from './boletoChargesService.js';
import {
  createFinancingPaymentAllocation,
  FINANCING_PAYMENT_ALLOCATION_TYPE,
  FINANCING_PAYMENT_ALLOCATION_STATUS,
  reverseAllocationsByReceivablePayment,
} from './financingPaymentAllocationsService.js';
import {
  AUDIT_EVENT_KEY,
  AUDIT_EVENT_SOURCE,
  AUDIT_OPERATION_CONTEXT,
  BOLETO_CHARGE_TYPE,
  FINANCIAL_PAYMENT_METHOD,
  FINANCING_STATUS,
  RECEIVABLE_CHARGE_TYPE,
  BOLETO_REMINDER_CHANNEL,
  BOLETO_REMINDER_EVENT_KEY,
  BOLETO_REMINDER_STATUS,
  FINANCING_TIMELINE_EVENT,
  assertEnumValue,
  normalizeEnumValue,
} from './auditEventCatalog.js';
export { FINANCING_STATUS };

export const FINANCING_APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const FINANCING_ANALYSIS_STATUS = {
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const toEvent = (payload) => ({
  id: createId('fnev'),
  financing_id: payload.financing_id,
  installment_id: payload.installment_id || null,
  boleto_charge_id: payload.boleto_charge_id || null,
  receivable_id: payload.receivable_id || null,
  event_type: payload.event_type,
  title: payload.title || '',
  description: payload.description || '',
  payload: payload.payload || {},
  actor_id: payload.actor_id || null,
  created_at: new Date().toISOString(),
});

const logEvent = (eventPayload) => {
  assertEnumValue('event_type', FINANCING_TIMELINE_EVENT, eventPayload?.event_type);
  const event = toEvent(eventPayload);
  withDb((db) => {
    if (!Array.isArray(db.financingEvents)) db.financingEvents = [];
    db.financingEvents.push(event);
    return db;
  });
  return event;
};

const computeFinancingStatusFromInstallments = (installments) => {
  if (!Array.isArray(installments) || installments.length === 0) return FINANCING_STATUS.APPROVED;
  const statuses = installments.map((item) => computeInstallmentStatus(item, todayIso()));
  const hasOverdue = statuses.includes(FINANCING_INSTALLMENT_STATUS.OVERDUE);
  const allPaid = statuses.every((status) => status === FINANCING_INSTALLMENT_STATUS.PAID);
  const hasPartial = statuses.some((status) => status === FINANCING_INSTALLMENT_STATUS.PARTIALLY_PAID);
  if (allPaid) return FINANCING_STATUS.PAID_OFF;
  if (hasOverdue) return FINANCING_STATUS.OVERDUE;
  if (hasPartial) return FINANCING_STATUS.PARTIALLY_PAID;
  return FINANCING_STATUS.ACTIVE;
};

export const listFinancings = (filters = {}) => {
  const fromRepo = readListFinancings(filters);
  const db = loadDb();
  let items = fromRepo !== null
    ? [...fromRepo]
    : (Array.isArray(db.financings) ? [...db.financings] : []);
  const installments = Array.isArray(db.financingInstallments) ? db.financingInstallments : [];

  items = items.map((item) => {
    if (item.status === FINANCING_STATUS.CANCELED || item.status === FINANCING_STATUS.RENEGOTIATED) return item;
    const linked = installments.filter((ins) => ins.financing_id === item.id);
    const derivedStatus = computeFinancingStatusFromInstallments(linked);
    return { ...item, status: derivedStatus };
  });

  if (filters.status && Object.values(FINANCING_STATUS).includes(filters.status)) {
    items = items.filter((item) => item.status === filters.status);
  }
  if (filters.patient_id) items = items.filter((item) => item.patient_id === filters.patient_id);
  if (filters.professional_id) items = items.filter((item) => item.professional_id === filters.professional_id);
  if (filters.clinical_appointment_id) {
    items = items.filter((item) => item.clinical_appointment_id === filters.clinical_appointment_id);
  }
  if (filters.budget_id) items = items.filter((item) => item.budget_id === filters.budget_id);
  if (filters.source) items = items.filter((item) => item.source === filters.source);
  if (filters.financial_responsible_id) items = items.filter((item) => item.financial_responsible_id === filters.financial_responsible_id);
  if (filters.startDate) items = items.filter((item) => (item.issue_date || '') >= filters.startDate);
  if (filters.endDate) items = items.filter((item) => (item.issue_date || '') <= filters.endDate);
  if (filters.minValue !== undefined && filters.minValue !== '') items = items.filter((item) => Number(item.total_amount || 0) >= Number(filters.minValue));
  if (filters.maxValue !== undefined && filters.maxValue !== '') items = items.filter((item) => Number(item.total_amount || 0) <= Number(filters.maxValue));
  if (filters.installments_count) items = items.filter((item) => Number(item.installments_count || 0) === Number(filters.installments_count));

  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return items;
};

export const getFinancingById = (id) => {
  const fromRepo = readGetFinancing(id);
  if (fromRepo !== null) return fromRepo;
  const db = loadDb();
  const list = Array.isArray(db.financings) ? db.financings : [];
  return list.find((item) => item.id === id) || null;
};

export const getFinancingTimeline = (financingId, filters = {}) => {
  const db = loadDb();
  let list = Array.isArray(db.financingEvents) ? [...db.financingEvents] : [];
  list = list.filter((item) => item.financing_id === financingId);
  if (filters.event_type && Object.values(FINANCING_TIMELINE_EVENT).includes(filters.event_type)) {
    list = list.filter((item) => item.event_type === filters.event_type);
  }
  return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
};

export const getFinancingsKPIs = () => {
  const items = listFinancings();
  const nowPrefix = todayIso().slice(0, 7);
  const monthItems = items.filter((item) => (item.created_at || '').slice(0, 7) === nowPrefix);
  const totalFinancedMonth = monthItems.reduce((sum, item) => sum + Number(item.net_financed_amount || 0), 0);
  const totalOpen = items
    .filter((item) => [FINANCING_STATUS.ACTIVE, FINANCING_STATUS.PARTIALLY_PAID, FINANCING_STATUS.OVERDUE].includes(item.status))
    .reduce((sum, item) => sum + Number(item.total_payable_amount || 0), 0);
  const totalReceived = items
    .reduce((sum, item) => sum + Number(item.total_paid_amount || 0), 0);
  const totalOverdue = items
    .filter((item) => item.status === FINANCING_STATUS.OVERDUE)
    .reduce((sum, item) => sum + Number(item.total_open_amount || 0), 0);
  const defaultRate = totalOpen > 0 ? (totalOverdue / totalOpen) * 100 : 0;
  const ticketMedio = items.length > 0
    ? items.reduce((sum, item) => sum + Number(item.total_payable_amount || 0), 0) / items.length
    : 0;

  return {
    totalFinancedMonth,
    totalOpen,
    totalReceived,
    totalOverdue,
    defaultRate,
    ticketMedio,
  };
};

const assertFinancingCreatePermission = (user, options = {}) => {
  if (options.source === 'clinical_budget') {
    const allowed = can(user, 'prontuario_orcamentos:approve')
      || can(user, 'financeiro_financiamentos:create')
      || can(user, 'finance:write');
    if (!allowed) requirePermission(user, 'financeiro_financiamentos:create');
    return;
  }
  requirePermission(user, 'finance:write');
};

export const createFinancingProposal = (user, payload, options = {}) => {
  assertFinancingCreatePermission(user, options);
  if (!payload.patient_id) throw new Error('Paciente é obrigatório.');
  if (!payload.description?.trim()) throw new Error('Descrição do financiamento é obrigatória.');
  if (
    payload.interest_type !== undefined
    && !Object.values(FINANCING_INTEREST_TYPES).includes(payload.interest_type)
  ) {
    throw new Error(`interest_type inválido: "${String(payload.interest_type)}".`);
  }
  const normalizedFrequency = normalizeFinancingFrequency(
    payload.installment_frequency || FINANCING_FREQUENCIES.MONTHLY
  );
  if (payload.installment_frequency !== undefined && !isFinancingFrequencyInput(payload.installment_frequency)) {
    throw new Error(`installment_frequency inválido: "${String(payload.installment_frequency)}".`);
  }
  if (payload.status !== undefined) {
    assertEnumValue('status', FINANCING_STATUS, payload.status);
  }
  const summary = calculateFinancingSummary({
    total_amount: payload.total_amount,
    entry_amount: payload.entry_amount,
    installments_count: payload.installments_count,
    interest_type: payload.interest_type || FINANCING_INTEREST_TYPES.NONE,
    interest_rate: payload.interest_rate || 0,
    discount_amount: payload.discount_amount || 0,
    admin_fee_amount: payload.admin_fee_amount || 0,
    admin_fee_rate: payload.admin_fee_rate || 0,
  });

  const now = new Date().toISOString();
  const id = createId('fin');
  const needsAnalysis = Boolean(payload.requires_credit_analysis);
  const frequency = normalizedFrequency;
  const record = {
    id,
    patient_id: payload.patient_id,
    financial_responsible_id: payload.financial_responsible_id || null,
    contract_id: payload.contract_id || null,
    treatment_plan_id: payload.treatment_plan_id || null,
    professional_id: payload.professional_id || null,
    description: payload.description.trim(),
    total_amount: summary.totalAmount,
    entry_amount: summary.entryAmount,
    financed_amount: summary.financedAmount,
    installments_count: summary.installmentsCount,
    installment_frequency: frequency,
    first_due_date: payload.first_due_date || todayIso(),
    issue_date: payload.issue_date || todayIso(),
    interest_type: summary.interestType,
    interest_rate: summary.interestRate,
    fine_rate: Number(payload.fine_rate || 0),
    late_interest_rate: Number(payload.late_interest_rate || 0),
    discount_amount: summary.discountAmount,
    net_financed_amount: summary.netFinancedAmount,
    installment_amount: summary.installmentAmount,
    total_payable_amount: summary.totalPayableAmount,
    total_paid_amount: 0,
    total_open_amount: summary.totalPayableAmount,
    status: needsAnalysis ? FINANCING_STATUS.PENDING_ANALYSIS : FINANCING_STATUS.DRAFT,
    approval_status: FINANCING_APPROVAL_STATUS.PENDING,
    credit_analysis_status: needsAnalysis ? FINANCING_ANALYSIS_STATUS.PENDING : FINANCING_ANALYSIS_STATUS.NOT_REQUIRED,
    internal_notes: payload.internal_notes || '',
    external_notes: payload.external_notes || '',
    boleto_auto_generate: payload.boleto_auto_generate !== false,
    generate_carne: Boolean(payload.generate_carne),
    send_reminders: Boolean(payload.send_reminders),
    payer_data: payload.payer_data || {},
    instructions: payload.instructions || '',
    source: payload.source || 'manual',
    clinical_appointment_id: payload.clinical_appointment_id || null,
    budget_id: payload.budget_id || null,
    partner_name: payload.partner_name || '',
    financial_partner_id: payload.financial_partner_id || null,
    admin_fee_rate: Number(payload.admin_fee_rate || 0),
    admin_fee_amount: Number(summary.adminFee || payload.admin_fee_amount || 0),
    calculation_snapshot: payload.calculation_snapshot || null,
    patient_name: payload.patient_name || '',
    patient_document: payload.patient_document || '',
    budget_approved_at: payload.budget_approved_at || null,
    budget_approved_by: payload.budget_approved_by || null,
    created_by: user?.id || null,
    approved_by: null,
    created_at: now,
    updated_at: now,
    approved_at: null,
    canceled_at: null,
    canceled_reason: '',
  };
  withDb((db) => {
    if (!Array.isArray(db.financings)) db.financings = [];
    db.financings.push(record);
    return db;
  });
  logEvent({
    financing_id: id,
    event_type: FINANCING_TIMELINE_EVENT.PROPOSAL_CREATED,
    title: 'Proposta criada',
    description: options.source === 'clinical_budget'
      ? 'Financiamento gerado automaticamente a partir do orçamento clínico aprovado.'
      : 'Proposta de financiamento registrada.',
    actor_id: user?.id || null,
    payload: {
      source: payload.source || 'manual',
      clinical_appointment_id: payload.clinical_appointment_id || null,
      budget_id: payload.budget_id || null,
    },
  });
  scheduleFinancialDualWriteCreateFinancing(user, record);
  scheduleFinancingCreatedDomainEvent(user, record, {
    tenantId: resolveTenantIdForWrite(user, payload?.tenant_id || payload?.tenantId),
  });
  return record;
};

const createInstallmentsAndReceivables = (user, financing) => {
  const summary = calculateFinancingSummary(financing);
  const schedule = buildInstallmentsSchedule({
    amountParts: summary.installmentParts,
    firstDueDate: financing.first_due_date,
    frequency: financing.installment_frequency,
  });
  const createdInstallments = [];
  for (const item of schedule) {
    const receivable = createReceivable(user, {
      patient_id: financing.patient_id,
      financial_responsible_id: financing.financial_responsible_id,
      origin_type: RECEIVABLE_ORIGIN_TYPE.FINANCING,
      origin_id: financing.id,
      description: `${financing.description} - Parcela ${item.installment_number}/${schedule.length}`,
      installment_number: item.installment_number,
      total_installments: schedule.length,
      issue_date: financing.issue_date,
      due_date: item.due_date,
      original_amount: item.original_amount,
      discount_amount: 0,
      interest_amount: 0,
      fine_amount: 0,
      payment_method_expected: FINANCIAL_PAYMENT_METHOD.BOLETO,
      charge_method: RECEIVABLE_CHARGE_TYPE.BOLETO,
      contract_id: financing.contract_id,
      treatment_plan_id: financing.treatment_plan_id,
      professional_id: financing.professional_id,
      notes: `Gerado automaticamente pelo financiamento ${financing.id}.`,
      financing_id: financing.id,
    });
    const installment = createFinancingInstallment({
      financing_id: financing.id,
      receivable_id: receivable.id,
      installment_number: item.installment_number,
      total_installments: schedule.length,
      due_date: item.due_date,
      original_amount: item.original_amount,
      net_amount: item.original_amount,
      boleto_enabled: true,
    });
    createdInstallments.push(installment);
  }
  return createdInstallments;
};

const createEntryReceivableIfNeeded = (user, financing) => {
  const entry = Number(financing.entry_amount || 0);
  if (entry <= 0) return null;
  return createReceivable(user, {
    patient_id: financing.patient_id,
    financial_responsible_id: financing.financial_responsible_id,
    origin_type: RECEIVABLE_ORIGIN_TYPE.FINANCING,
    origin_id: financing.id,
    description: `${financing.description} - Entrada`,
    installment_number: 0,
    total_installments: Number(financing.installments_count || 1),
    issue_date: financing.issue_date,
    due_date: financing.issue_date,
    original_amount: entry,
    payment_method_expected: FINANCIAL_PAYMENT_METHOD.OTHERS,
    charge_method: RECEIVABLE_CHARGE_TYPE.NONE,
    contract_id: financing.contract_id,
    treatment_plan_id: financing.treatment_plan_id,
    professional_id: financing.professional_id,
    notes: 'Título de entrada do financiamento.',
    financing_id: financing.id,
  });
};

export const approveFinancing = (user, financingId, options = {}) => {
  requirePermission(user, 'finance:write');
  const current = getFinancingById(financingId);
  if (!current) throw new Error('Financiamento não encontrado.');
  if ([FINANCING_STATUS.CANCELED, FINANCING_STATUS.RENEGOTIATED].includes(current.status)) {
    throw new Error('Não é possível aprovar um financiamento encerrado.');
  }
  if (options.credit_analysis_status !== undefined) {
    assertEnumValue('credit_analysis_status', FINANCING_ANALYSIS_STATUS, options.credit_analysis_status);
  }
  const updated = {
    ...current,
    status: FINANCING_STATUS.APPROVED,
    approval_status: FINANCING_APPROVAL_STATUS.APPROVED,
    credit_analysis_status: options.credit_analysis_status || current.credit_analysis_status || FINANCING_ANALYSIS_STATUS.APPROVED,
    approved_by: user?.id || null,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  withDb((db) => {
    const list = Array.isArray(db.financings) ? db.financings : [];
    const index = list.findIndex((item) => item.id === financingId);
    if (index < 0) throw new Error('Financiamento não encontrado.');
    list[index] = updated;
    db.financings = list;
    return db;
  });

  logEvent({
    financing_id: financingId,
    event_type: FINANCING_TIMELINE_EVENT.FINANCING_APPROVED,
    title: 'Financiamento aprovado',
    description: 'A proposta foi aprovada internamente.',
    actor_id: user?.id || null,
  });

  const entryReceivable = createEntryReceivableIfNeeded(user, updated);
  if (entryReceivable) {
    logEvent({
      financing_id: financingId,
      event_type: FINANCING_TIMELINE_EVENT.ENTRY_RECEIVABLE_CREATED,
      title: 'Título de entrada criado',
      receivable_id: entryReceivable.id,
      description: 'Entrada registrada como título a receber.',
      actor_id: user?.id || null,
    });
    if (options.entry_received_now) {
      registerReceivablePayment(user, entryReceivable.id, {
        payment_date: todayIso(),
        amount_received: Number(updated.entry_amount || 0),
        payment_method: options.entry_payment_method || 'dinheiro',
        notes: 'Entrada recebida no ato da aprovação.',
      });
      logEvent({
        financing_id: financingId,
        event_type: FINANCING_TIMELINE_EVENT.ENTRY_RECEIVED,
        title: 'Entrada recebida',
        receivable_id: entryReceivable.id,
        description: 'Entrada marcada como recebida no ato.',
        actor_id: user?.id || null,
      });
    }
  }

  const installments = createInstallmentsAndReceivables(user, updated);
  logEvent({
    financing_id: financingId,
    event_type: FINANCING_TIMELINE_EVENT.INSTALLMENTS_GENERATED,
    title: 'Parcelas geradas',
    description: `${installments.length} parcela(s) criada(s) automaticamente.`,
    actor_id: user?.id || null,
  });

  let boletoCount = 0;
  if (updated.boleto_auto_generate !== false) {
    for (const installment of installments) {
      const boleto = createBoletoCharge(user, {
        financing_id: financingId,
        installment_id: installment.id,
        receivable_id: installment.receivable_id,
        patient_id: updated.patient_id,
        charge_type: BOLETO_CHARGE_TYPE.BOLETO,
        issue_date: todayIso(),
        due_date: installment.due_date,
        amount: installment.net_amount,
        recipient_name: updated.payer_data?.recipient_name || '',
        recipient_document: updated.payer_data?.recipient_document || '',
        recipient_email: updated.payer_data?.recipient_email || '',
        recipient_phone: updated.payer_data?.recipient_phone || '',
        payer_name: updated.payer_data?.payer_name || '',
        payer_document: updated.payer_data?.payer_document || '',
        payer_email: updated.payer_data?.payer_email || '',
        payer_phone: updated.payer_data?.payer_phone || '',
        payer_zip_code: updated.payer_data?.payer_zip_code || '',
        payer_street: updated.payer_data?.payer_street || '',
        payer_number: updated.payer_data?.payer_number || '',
        payer_complement: updated.payer_data?.payer_complement || '',
        payer_district: updated.payer_data?.payer_district || '',
        payer_city: updated.payer_data?.payer_city || '',
        payer_state: updated.payer_data?.payer_state || '',
        instructions: updated.instructions || '',
      });
      boletoCount += 1;
      logEvent({
        financing_id: financingId,
        installment_id: installment.id,
        boleto_charge_id: boleto.id,
        receivable_id: installment.receivable_id,
        event_type: FINANCING_TIMELINE_EVENT.BOLETO_GENERATED,
        title: 'Boleto emitido',
        description: `Cobrança de boleto emitida para parcela ${installment.installment_number}.`,
        actor_id: user?.id || null,
      });
    }
  }

  const activeStatus = computeFinancingStatusFromInstallments(installments);
  withDb((db) => {
    const list = Array.isArray(db.financings) ? db.financings : [];
    const index = list.findIndex((item) => item.id === financingId);
    if (index >= 0) {
      list[index] = {
        ...list[index],
        status: activeStatus,
        updated_at: new Date().toISOString(),
      };
      db.financings = list;
    }
    return db;
  });

  import('./commissionCalculationService.js')
    .then((mod) => {
      try {
        mod.syncConversionCommissionsForFinancing(user, financingId);
      } catch {
        /* best-effort */
      }
    })
    .catch(() => {});

  return {
    financing: getFinancingById(financingId),
    installments,
    boletoCount,
  };
};

export const rejectFinancing = (user, financingId, reason = '') => {
  requirePermission(user, 'finance:write');
  let output = null;
  withDb((db) => {
    const list = Array.isArray(db.financings) ? db.financings : [];
    const index = list.findIndex((item) => item.id === financingId);
    if (index < 0) throw new Error('Financiamento não encontrado.');
    const current = list[index];
    output = {
      ...current,
      status: FINANCING_STATUS.CANCELED,
      approval_status: FINANCING_APPROVAL_STATUS.REJECTED,
      credit_analysis_status: FINANCING_ANALYSIS_STATUS.REJECTED,
      canceled_reason: reason || 'Reprovado na análise interna.',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list[index] = output;
    db.financings = list;
    return db;
  });
  logEvent({
    financing_id: financingId,
    event_type: FINANCING_TIMELINE_EVENT.FINANCING_REJECTED,
    title: 'Financiamento reprovado',
    description: reason || 'Proposta reprovada.',
    actor_id: user?.id || null,
  });
  return output;
};

export const registerFinancingPayment = (user, payload) => {
  requirePermission(user, 'finance:write');
  if (payload.payment_method !== undefined) {
    assertEnumValue('payment_method', FINANCIAL_PAYMENT_METHOD, payload.payment_method);
  }
  const installment = payload.installment_id ? listFinancingInstallments({}).find((i) => i.id === payload.installment_id) : null;
  const receivableId = payload.receivable_id || installment?.receivable_id;
  if (!receivableId) throw new Error('Parcela/recebível é obrigatório para baixa.');
  const result = registerReceivablePayment(user, receivableId, {
    payment_date: payload.payment_date || todayIso(),
    amount_received: Number(payload.amount_received || 0),
    discount_amount: Number(payload.discount_amount || 0),
    interest_amount: Number(payload.interest_amount || 0),
    fine_amount: Number(payload.fine_amount || 0),
    payment_method: normalizeEnumValue(
      FINANCIAL_PAYMENT_METHOD,
      payload.payment_method,
      FINANCIAL_PAYMENT_METHOD.BOLETO
    ),
    notes: payload.notes || '',
  });

  const linkedInstallment = installment || listFinancingInstallments({}).find((i) => i.receivable_id === receivableId);
  if (linkedInstallment) {
    const net = Number(linkedInstallment.net_amount || 0);
    const paid = Number(linkedInstallment.paid_amount || 0) + Number(payload.amount_received || 0);
    const isTotalSettlement = paid >= net && net > 0;
    const allocationType = isTotalSettlement
      ? FINANCING_PAYMENT_ALLOCATION_TYPE.TOTAL_SETTLEMENT
      : FINANCING_PAYMENT_ALLOCATION_TYPE.PARTIAL_PAYMENT;
    patchFinancingInstallment(linkedInstallment.id, {
      paid_amount: paid,
      remaining_amount: Math.max(net - paid, 0),
      last_payment_at: new Date().toISOString(),
      notes: payload.notes || linkedInstallment.notes || '',
    });
    if (result.payment?.id) {
      createFinancingPaymentAllocation({
        financing_id: linkedInstallment.financing_id,
        installment_id: linkedInstallment.id,
        receivable_id: receivableId,
        receivable_payment_id: result.payment.id,
        boleto_charge_id: linkedInstallment.boleto_charge_id || null,
        allocated_amount: Number(payload.amount_received || 0),
        allocation_type: allocationType,
        status: FINANCING_PAYMENT_ALLOCATION_STATUS.APPLIED,
        notes: payload.notes || '',
        created_by: user?.id || null,
        metadata: {
          event_key: isTotalSettlement
            ? AUDIT_EVENT_KEY.PAYMENT_ALLOCATION_TOTAL_SETTLEMENT
            : AUDIT_EVENT_KEY.PAYMENT_ALLOCATION_PARTIAL,
          source: AUDIT_EVENT_SOURCE.FINANCIAL_OPERATION,
          operation_context: AUDIT_OPERATION_CONTEXT.REGISTER_FINANCING_PAYMENT,
          payment_method: normalizeEnumValue(
            FINANCIAL_PAYMENT_METHOD,
            payload.payment_method,
            FINANCIAL_PAYMENT_METHOD.BOLETO
          ),
          payment_date: payload.payment_date || todayIso(),
          installment_net_amount: net,
          installment_paid_amount_after: paid,
          installment_remaining_after: Math.max(net - paid, 0),
        },
      });
    }
    logEvent({
      financing_id: linkedInstallment.financing_id,
      installment_id: linkedInstallment.id,
      receivable_id: receivableId,
      event_type: isTotalSettlement
        ? FINANCING_TIMELINE_EVENT.INSTALLMENT_PAID
        : FINANCING_TIMELINE_EVENT.INSTALLMENT_PARTIALLY_PAID,
      title: isTotalSettlement ? 'Parcela quitada' : 'Pagamento parcial',
      description: `Pagamento registrado no valor de ${Number(payload.amount_received || 0).toFixed(2)}.`,
      actor_id: user?.id || null,
      payload: {
        receivable_payment_id: result.payment?.id || null,
        payment_amount: Number(payload.amount_received || 0),
        payment_method: normalizeEnumValue(
          FINANCIAL_PAYMENT_METHOD,
          payload.payment_method,
          FINANCIAL_PAYMENT_METHOD.BOLETO
        ),
        payment_date: payload.payment_date || todayIso(),
        installment_net_amount: net,
        installment_paid_amount_after: paid,
        installment_remaining_after: Math.max(net - paid, 0),
        settlement_type: isTotalSettlement ? 'total' : 'partial',
      },
    });
    refreshFinancingTotals(linkedInstallment.financing_id);
  }

  return result;
};

export const reverseFinancingPaymentAudit = (user, payload) => {
  requirePermission(user, 'finance:write');
  const receivablePaymentId = payload?.receivable_payment_id || null;
  if (!receivablePaymentId) throw new Error('receivable_payment_id é obrigatório para estorno.');
  const reversed = reverseAllocationsByReceivablePayment(receivablePaymentId, {
    reversed_by: user?.id || null,
    reversal_reason: payload.reversal_reason || 'Estorno operacional registrado.',
    metadata: {
      reversal_event_key: AUDIT_EVENT_KEY.PAYMENT_ALLOCATION_REVERSED,
      reversal_source: AUDIT_EVENT_SOURCE.FINANCIAL_OPERATION,
      reversal_operation_context: AUDIT_OPERATION_CONTEXT.REVERSE_FINANCING_PAYMENT_AUDIT,
      reversal_reference: payload.reversal_reference || null,
    },
  });
  for (const allocation of reversed) {
    if (!allocation) continue;
    logEvent({
      financing_id: allocation.financing_id,
      installment_id: allocation.installment_id,
      receivable_id: allocation.receivable_id,
      boleto_charge_id: allocation.boleto_charge_id,
      event_type: FINANCING_TIMELINE_EVENT.PAYMENT_REVERSED,
      title: 'Estorno registrado',
      description: payload.reversal_reason || 'Estorno operacional registrado.',
      actor_id: user?.id || null,
      payload: {
        allocation_id: allocation.id,
        receivable_payment_id: allocation.receivable_payment_id,
        reversed_amount: Number(allocation.allocated_amount || 0),
        reversal_reference: payload.reversal_reference || null,
      },
    });
  }
  return reversed;
};

export const refreshFinancingTotals = (financingId) => {
  const installments = listFinancingInstallments({ financing_id: financingId });
  const totalInstallments = installments.reduce((sum, item) => sum + Number(item.net_amount || 0), 0);
  const paidInstallments = installments.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0);
  const openInstallments = Math.max(totalInstallments - paidInstallments, 0);
  const nextStatus = computeFinancingStatusFromInstallments(installments);
  let out = null;
  withDb((db) => {
    const list = Array.isArray(db.financings) ? db.financings : [];
    const index = list.findIndex((item) => item.id === financingId);
    if (index < 0) return db;
    const current = list[index];
    out = {
      ...current,
      status: nextStatus,
      total_paid_amount: paidInstallments,
      total_open_amount: openInstallments,
      updated_at: new Date().toISOString(),
    };
    list[index] = out;
    db.financings = list;
    return db;
  });
  return out;
};

export const cancelFinancing = (user, financingId, reason = '') => {
  requirePermission(user, 'finance:write');
  const financing = getFinancingById(financingId);
  if (!financing) throw new Error('Financiamento não encontrado.');
  const installments = listFinancingInstallments({ financing_id: financingId })
    .filter((item) => ![FINANCING_INSTALLMENT_STATUS.PAID, FINANCING_INSTALLMENT_STATUS.CANCELED, FINANCING_INSTALLMENT_STATUS.RENEGOTIATED].includes(item.status));
  for (const installment of installments) {
    patchFinancingInstallment(installment.id, {
      status: FINANCING_INSTALLMENT_STATUS.CANCELED,
      notes: reason || 'Financiamento cancelado.',
    });
    if (installment.receivable_id) {
      try {
        cancelReceivable(user, installment.receivable_id, reason || 'Financiamento cancelado.');
      } catch {
        // Evita quebrar o fluxo se o título já estiver encerrado.
      }
    }
  }
  let output = null;
  withDb((db) => {
    const list = Array.isArray(db.financings) ? db.financings : [];
    const index = list.findIndex((item) => item.id === financingId);
    if (index < 0) throw new Error('Financiamento não encontrado.');
    output = {
      ...list[index],
      status: FINANCING_STATUS.CANCELED,
      canceled_reason: reason || '',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list[index] = output;
    db.financings = list;
    return db;
  });
  logEvent({
    financing_id: financingId,
    event_type: FINANCING_TIMELINE_EVENT.FINANCING_CANCELED,
    title: 'Financiamento cancelado',
    description: reason || 'Cancelado manualmente.',
    actor_id: user?.id || null,
  });

  import('./commissionCalculationService.js')
    .then((mod) => {
      try {
        mod.reverseConversionCommissionsForFinancing(user, financingId, reason || '');
      } catch {
        /* best-effort */
      }
    })
    .catch(() => {});

  return output;
};

export const generateBoletoCarne = (user, financingId) => {
  requirePermission(user, 'finance:write');
  const financing = getFinancingById(financingId);
  if (!financing) throw new Error('Financiamento não encontrado.');
  const installments = listFinancingInstallments({ financing_id: financingId })
    .filter((item) => ![FINANCING_INSTALLMENT_STATUS.PAID, FINANCING_INSTALLMENT_STATUS.CANCELED, FINANCING_INSTALLMENT_STATUS.RENEGOTIATED].includes(item.status));
  const boletos = installments.map((item) =>
    createBoletoCharge(user, {
      financing_id: financingId,
      installment_id: item.id,
      receivable_id: item.receivable_id,
      patient_id: financing.patient_id,
      charge_type: BOLETO_CHARGE_TYPE.CARNE,
      issue_date: todayIso(),
      due_date: item.due_date,
      amount: item.net_amount,
      recipient_name: financing.payer_data?.recipient_name || '',
      recipient_document: financing.payer_data?.recipient_document || '',
      recipient_email: financing.payer_data?.recipient_email || '',
      recipient_phone: financing.payer_data?.recipient_phone || '',
      instructions: financing.instructions || '',
    })
  );
  logEvent({
    financing_id: financingId,
    event_type: FINANCING_TIMELINE_EVENT.CARNE_GENERATED,
    title: 'Carnê gerado',
    description: `${boletos.length} boleto(s) agrupados no carnê.`,
    actor_id: user?.id || null,
  });
  return boletos;
};

export const runBoletoReminderRule = (user, referenceDate = todayIso()) => {
  requirePermission(user, 'finance:write');
  const charges = listBoletoCharges();
  const scheduleMap = {
    '-3': BOLETO_REMINDER_EVENT_KEY.BEFORE_3_DAYS,
    '0': BOLETO_REMINDER_EVENT_KEY.DUE_TODAY,
    '3': BOLETO_REMINDER_EVENT_KEY.AFTER_3_DAYS,
    '7': BOLETO_REMINDER_EVENT_KEY.AFTER_7_DAYS,
    '15': BOLETO_REMINDER_EVENT_KEY.AFTER_15_DAYS,
  };
  const reminders = [];
  const ref = new Date(`${referenceDate}T12:00:00`);
  for (const charge of charges) {
    if ([BOLETO_CHARGE_STATUS.PAID, BOLETO_CHARGE_STATUS.CANCELED].includes(charge.status)) continue;
    if (!charge.due_date) continue;
    const due = new Date(`${charge.due_date}T12:00:00`);
    const diffDays = Math.round((ref.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const ruleKey = scheduleMap[String(diffDays)];
    if (!ruleKey) continue;
    const event = {
      id: createId('bltrm'),
      boleto_charge_id: charge.id,
      financing_id: charge.financing_id || null,
      installment_id: charge.installment_id || null,
      receivable_id: charge.receivable_id || null,
      event_key: ruleKey,
      channel: BOLETO_REMINDER_CHANNEL.INTERNAL_NOTIFICATION,
      status: BOLETO_REMINDER_STATUS.GENERATED,
      recipient: charge.recipient_email || charge.recipient_phone || '',
      payload: {
        due_date: charge.due_date,
        amount: charge.amount,
        linha_digitavel: charge.linha_digitavel || '',
        source: AUDIT_EVENT_SOURCE.FINANCIAL_OPERATION,
        operation_context: AUDIT_OPERATION_CONTEXT.RUN_BOLETO_REMINDER_RULE,
        metadata: {
          event_key: AUDIT_EVENT_KEY.BOLETO_REMINDER_SCHEDULED,
          operation_context: AUDIT_OPERATION_CONTEXT.RUN_BOLETO_REMINDER_RULE,
          reminder_rule: ruleKey,
        },
      },
      created_at: new Date().toISOString(),
      created_by: user?.id || null,
    };
    assertEnumValue('event.event_key', BOLETO_REMINDER_EVENT_KEY, event.event_key);
    assertEnumValue('event.channel', BOLETO_REMINDER_CHANNEL, event.channel);
    assertEnumValue('event.status', BOLETO_REMINDER_STATUS, event.status);
    assertEnumValue('event.payload.source', AUDIT_EVENT_SOURCE, event.payload?.source);
    assertEnumValue('event.payload.operation_context', AUDIT_OPERATION_CONTEXT, event.payload?.operation_context);
    assertEnumValue('event.payload.metadata.event_key', AUDIT_EVENT_KEY, event.payload?.metadata?.event_key);
    assertEnumValue(
      'event.payload.metadata.operation_context',
      AUDIT_OPERATION_CONTEXT,
      event.payload?.metadata?.operation_context
    );
    reminders.push(event);
  }
  if (reminders.length > 0) {
    withDb((db) => {
      if (!Array.isArray(db.boletoReminderEvents)) db.boletoReminderEvents = [];
      db.boletoReminderEvents.push(...reminders);
      return db;
    });
  }
  return reminders;
};

export const listBoletoReminderEvents = (filters = {}) => {
  const db = loadDb();
  let items = Array.isArray(db.boletoReminderEvents) ? [...db.boletoReminderEvents] : [];
  if (filters.financing_id) items = items.filter((item) => item.financing_id === filters.financing_id);
  if (filters.boleto_charge_id) items = items.filter((item) => item.boleto_charge_id === filters.boleto_charge_id);
  if (filters.channel && Object.values(BOLETO_REMINDER_CHANNEL).includes(filters.channel)) {
    items = items.filter((item) => item.channel === filters.channel);
  }
  if (filters.status && Object.values(BOLETO_REMINDER_STATUS).includes(filters.status)) {
    items = items.filter((item) => item.status === filters.status);
  }
  if (filters.event_key && Object.values(BOLETO_REMINDER_EVENT_KEY).includes(filters.event_key)) {
    items = items.filter((item) => item.event_key === filters.event_key);
  }
  if (filters.source && Object.values(AUDIT_EVENT_SOURCE).includes(filters.source)) {
    items = items.filter((item) => item.payload?.source === filters.source);
  }
  if (filters.operation_context && Object.values(AUDIT_OPERATION_CONTEXT).includes(filters.operation_context)) {
    items = items.filter((item) => item.payload?.operation_context === filters.operation_context);
  }
  if (filters.audit_event_key && Object.values(AUDIT_EVENT_KEY).includes(filters.audit_event_key)) {
    items = items.filter((item) => item.payload?.metadata?.event_key === filters.audit_event_key);
  }
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return items;
};

export const renegotiateFinancing = (user, financingId, payload) => {
  requirePermission(user, 'finance:write');
  const financing = getFinancingById(financingId);
  if (!financing) throw new Error('Financiamento não encontrado.');
  const selected = Array.isArray(payload.installment_ids) ? payload.installment_ids : [];
  if (selected.length === 0) throw new Error('Selecione ao menos uma parcela para renegociação.');
  const installments = listFinancingInstallments({ financing_id: financingId })
    .filter((item) => selected.includes(item.id));
  if (installments.length === 0) throw new Error('Parcelas informadas não foram encontradas.');

  const outstanding = installments.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0);
  const discount = Number(payload.discount_amount || 0);
  const renegotiationInterest = Number(payload.interest_amount || 0);
  const newBaseValue = Math.max(outstanding - discount + renegotiationInterest, 0);

  for (const installment of installments) {
    patchFinancingInstallment(installment.id, {
      status: FINANCING_INSTALLMENT_STATUS.RENEGOTIATED,
      notes: 'Parcela renegociada.',
    });
    if (installment.receivable_id) {
      try {
        cancelReceivable(user, installment.receivable_id, 'Título substituído por renegociação.');
      } catch {
        // título pode já estar encerrado
      }
    }
  }

  withDb((db) => {
    if (!Array.isArray(db.financingRenegotiations)) db.financingRenegotiations = [];
    db.financingRenegotiations.push({
      id: createId('fnren'),
      previous_financing_id: financingId,
      selected_installment_ids: selected,
      consolidated_amount: outstanding,
      discount_amount: discount,
      interest_amount: renegotiationInterest,
      created_at: new Date().toISOString(),
      created_by: user?.id || null,
    });
    return db;
  });

  const newProposal = createFinancingProposal(user, {
    ...financing,
    total_amount: newBaseValue,
    entry_amount: 0,
    installments_count: Number(payload.new_installments_count || financing.installments_count || 1),
    first_due_date: payload.first_due_date || todayIso(),
    issue_date: payload.issue_date || todayIso(),
    description: `${financing.description} (Renegociação)`,
    requires_credit_analysis: false,
    boleto_auto_generate: true,
  });
  const approved = approveFinancing(user, newProposal.id, {
    credit_analysis_status: FINANCING_ANALYSIS_STATUS.APPROVED,
  });

  withDb((db) => {
    const list = Array.isArray(db.financings) ? db.financings : [];
    const index = list.findIndex((item) => item.id === financingId);
    if (index >= 0) {
      list[index] = {
        ...list[index],
        status: FINANCING_STATUS.RENEGOTIATED,
        updated_at: new Date().toISOString(),
      };
      db.financings = list;
    }
    return db;
  });

  logEvent({
    financing_id: financingId,
    event_type: FINANCING_TIMELINE_EVENT.FINANCING_RENEGOTIATED,
    title: 'Renegociação concluída',
    description: `Novo financiamento gerado: ${approved.financing?.id || ''}.`,
    actor_id: user?.id || null,
  });

  syncClinicalBudgetIfNeeded(approved.financing?.id, user?.id);

  return approved.financing;
};

const syncClinicalBudgetIfNeeded = (financingId, actorId) => {
  if (!financingId) return;
  import('./clinicalBudgetFinancingIntegration.js')
    .then((mod) => mod.syncClinicalBudgetFromFinancing(financingId, actorId))
    .catch(() => {});
};

export const linkFinancingToContract = (user, financingId, contractId) => {
  if (!financingId || !contractId) return null;
  const current = getFinancingById(financingId);
  if (!current) throw new Error('Financiamento não encontrado.');

  withDb((db) => {
    const list = Array.isArray(db.financings) ? db.financings : [];
    const index = list.findIndex((item) => item.id === financingId);
    if (index < 0) throw new Error('Financiamento não encontrado.');
    list[index] = {
      ...list[index],
      contract_id: contractId,
      updated_at: new Date().toISOString(),
    };
    db.financings = list;

    if (Array.isArray(db.receivables)) {
      db.receivables = db.receivables.map((item) => (
        item.financing_id === financingId
          ? { ...item, contract_id: contractId, updated_at: new Date().toISOString() }
          : item
      ));
    }
    return db;
  });

  logEvent({
    financing_id: financingId,
    event_type: FINANCING_TIMELINE_EVENT.CONTRACT_LINKED,
    title: 'Contrato vinculado',
    description: `Contrato ${contractId} associado ao financiamento.`,
    actor_id: user?.id || null,
    payload: { contract_id: contractId },
  });

  syncClinicalBudgetIfNeeded(financingId, user?.id);
  return getFinancingById(financingId);
};

const EDITABLE_FINANCING_STATUSES = new Set([
  FINANCING_STATUS.DRAFT,
  FINANCING_STATUS.PENDING_ANALYSIS,
]);

export const updateFinancingTerms = (user, financingId, patch = {}) => {
  requirePermission(user, 'financeiro_financiamentos:edit');
  const current = getFinancingById(financingId);
  if (!current) throw new Error('Financiamento não encontrado.');
  if (!EDITABLE_FINANCING_STATUSES.has(current.status)) {
    throw new Error('Alteração de termos permitida apenas enquanto o financiamento está em análise.');
  }

  const merged = {
    total_amount: patch.total_amount ?? current.total_amount,
    entry_amount: patch.entry_amount ?? current.entry_amount,
    installments_count: patch.installments_count ?? current.installments_count,
    interest_type: patch.interest_type ?? current.interest_type,
    interest_rate: patch.interest_rate ?? current.interest_rate,
    discount_amount: patch.discount_amount ?? current.discount_amount,
    admin_fee_amount: patch.admin_fee_amount ?? current.admin_fee_amount,
    admin_fee_rate: patch.admin_fee_rate ?? current.admin_fee_rate,
  };
  const summary = calculateFinancingSummary(merged);

  const updated = {
    ...current,
    total_amount: summary.totalAmount,
    entry_amount: summary.entryAmount,
    financed_amount: summary.financedAmount,
    installments_count: summary.installmentsCount,
    interest_type: summary.interestType,
    interest_rate: summary.interestRate,
    discount_amount: summary.discountAmount,
    net_financed_amount: summary.netFinancedAmount,
    installment_amount: summary.installmentAmount,
    total_payable_amount: summary.totalPayableAmount,
    total_open_amount: summary.totalPayableAmount,
    first_due_date: patch.first_due_date ?? current.first_due_date,
    partner_name: patch.partner_name ?? current.partner_name,
    internal_notes: patch.internal_notes ?? current.internal_notes,
    updated_at: new Date().toISOString(),
  };

  withDb((db) => {
    const list = Array.isArray(db.financings) ? db.financings : [];
    const index = list.findIndex((item) => item.id === financingId);
    if (index < 0) throw new Error('Financiamento não encontrado.');
    list[index] = updated;
    db.financings = list;
    return db;
  });

  logEvent({
    financing_id: financingId,
    event_type: FINANCING_TIMELINE_EVENT.TERMS_UPDATED,
    title: 'Termos atualizados',
    description: 'Condições financeiras do financiamento foram revisadas.',
    actor_id: user?.id || null,
    payload: { patch },
  });

  syncClinicalBudgetIfNeeded(financingId, user?.id);
  scheduleFinancialDualWriteUpdateFinancing(user, updated, patch);
  scheduleFinancingUpdatedDomainEvent(user, updated, patch, {
    tenantId: resolveTenantIdForWrite(user, updated?.tenant_id || updated?.tenantId),
  });
  return updated;
};
