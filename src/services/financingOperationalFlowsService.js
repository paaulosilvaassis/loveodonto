import {
  approveFinancing,
  createFinancingProposal,
  getFinancingById,
  listBoletoReminderEvents,
  registerFinancingPayment,
  renegotiateFinancing,
  runBoletoReminderRule,
} from './financingsService.js';
import { createBoletoCharge, listBoletoCharges } from './boletoChargesService.js';
import { FINANCING_INSTALLMENT_STATUS, listFinancingInstallments } from './financingInstallmentsService.js';
import {
  createReceivableCharge,
  getReceivableById,
  listReceivableCharges,
  RECEIVABLE_ORIGIN_TYPE,
  listReceivables,
} from './receivablesService.js';
import {
  AUDIT_EVENT_KEY,
  AUDIT_OPERATION_CONTEXT,
  BOLETO_CHARGE_STATUS,
  BOLETO_CHARGE_TYPE,
  FINANCIAL_PAYMENT_METHOD,
  RECEIVABLE_CHARGE_TYPE,
  RECEIVABLE_STATUS,
} from './auditEventCatalog.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

const ensureFinancingExists = (financingId) => {
  const financing = getFinancingById(financingId);
  if (!financing) throw new Error('Financiamento não encontrado para executar fluxo operacional.');
  return financing;
};

export const executeFinancingCreationFlow = (user, payload, options = {}) => {
  const proposal = createFinancingProposal(user, payload);
  const shouldApprove = options?.approve_immediately !== false;
  const approved = shouldApprove ? approveFinancing(user, proposal.id, options) : null;
  const targetFinancingId = shouldApprove ? proposal.id : proposal.id;
  const installments = listFinancingInstallments({ financing_id: targetFinancingId });
  const receivables = listReceivables({ originType: RECEIVABLE_ORIGIN_TYPE.FINANCING })
    .filter((item) => item.financing_id === targetFinancingId);
  const currentFinancing = shouldApprove ? approved.financing : getFinancingById(targetFinancingId);
  return {
    proposal,
    financing: currentFinancing,
    installments,
    receivables,
    boletoCount: approved?.boletoCount || 0,
    approved: shouldApprove,
  };
};

export const executeChargeGenerationFlow = (user, payload) => {
  const financing = ensureFinancingExists(payload?.financing_id);
  const installments = listFinancingInstallments({ financing_id: financing.id })
    .filter((item) => item.receivable_id);
  const selectedIds = Array.isArray(payload?.installment_ids) ? new Set(payload.installment_ids) : null;
  const createdCharges = [];
  for (const installment of installments) {
    if (selectedIds && !selectedIds.has(installment.id)) continue;
    const existing = listBoletoCharges({ installment_id: installment.id })
      .find((item) => item.status !== BOLETO_CHARGE_STATUS.CANCELED); // canceled allowed for reissue
    if (existing) continue;
    const charge = createBoletoCharge(user, {
      financing_id: financing.id,
      installment_id: installment.id,
      receivable_id: installment.receivable_id,
      patient_id: financing.patient_id,
      charge_type: payload?.charge_type || BOLETO_CHARGE_TYPE.BOLETO,
      issue_date: payload?.issue_date || todayIso(),
      due_date: payload?.due_date || installment.due_date,
      amount: payload?.amount ?? installment.net_amount,
      recipient_name: payload?.recipient_name || financing.payer_data?.recipient_name || '',
      recipient_document: payload?.recipient_document || financing.payer_data?.recipient_document || '',
      recipient_email: payload?.recipient_email || financing.payer_data?.recipient_email || '',
      recipient_phone: payload?.recipient_phone || financing.payer_data?.recipient_phone || '',
      instructions: payload?.instructions || financing.instructions || '',
      message_template: payload?.message_template || '',
      external_provider: payload?.external_provider,
      payment_method: payload?.payment_method,
    });
    createdCharges.push(charge);
  }
  return {
    financing_id: financing.id,
    created_charges: createdCharges,
    total_created: createdCharges.length,
  };
};

export const executeReceivementFlow = (user, payload) => {
  const result = registerFinancingPayment(user, payload);
  const receivableId = payload.receivable_id || result?.payment?.receivable_id || null;
  const receivable = receivableId ? getReceivableById(receivableId) : null;
  const installment = payload.installment_id
    ? listFinancingInstallments({}).find((item) => item.id === payload.installment_id) || null
    : (receivableId
      ? listFinancingInstallments({}).find((item) => item.receivable_id === receivableId) || null
      : null);
  const financing = installment?.financing_id ? getFinancingById(installment.financing_id) : null;
  return {
    payment: result.payment,
    receivable,
    installment,
    financing,
  };
};

export const executeDelinquencyFlow = (user, referenceDate = todayIso()) => {
  const overdueInstallments = listFinancingInstallments({ status: FINANCING_INSTALLMENT_STATUS.OVERDUE });
  const overdueReceivables = listReceivables({ status: RECEIVABLE_STATUS.OVERDUE });
  const reminders = runBoletoReminderRule(user, referenceDate);
  return {
    reference_date: referenceDate,
    overdue_installments: overdueInstallments,
    overdue_receivables: overdueReceivables,
    generated_reminders: reminders,
  };
};

export const executeReminderFlow = (user, referenceDate = todayIso()) => {
  const reminders = runBoletoReminderRule(user, referenceDate);
  const createdCharges = [];
  for (const reminder of reminders) {
    if (!reminder.receivable_id) continue;
    const alreadyExists = listReceivableCharges({
      receivableId: reminder.receivable_id,
      eventKey: AUDIT_EVENT_KEY.RECEIVABLE_CHARGE_CREATED,
    }).find((item) =>
      item.metadata?.operation_context === AUDIT_OPERATION_CONTEXT.RUN_BOLETO_REMINDER_RULE
      && item.metadata?.reminder_event_id === reminder.id
    );
    if (alreadyExists) continue;
    const chargeRecord = createReceivableCharge(user, {
      receivable_id: reminder.receivable_id,
      charge_type: RECEIVABLE_CHARGE_TYPE.WHATSAPP_REMINDER,
      recipient: reminder.recipient || '',
      message_template: `Lembrete automático (${reminder.event_key})`,
      notes: 'Cobrança operacional gerada pela régua.',
      metadata: {
        operation_context: AUDIT_OPERATION_CONTEXT.RUN_BOLETO_REMINDER_RULE,
        reminder_event_id: reminder.id,
        reminder_event_key: reminder.event_key,
        event_key: AUDIT_EVENT_KEY.RECEIVABLE_CHARGE_CREATED,
        payment_method: FINANCIAL_PAYMENT_METHOD.BOLETO,
      },
    });
    createdCharges.push(chargeRecord);
  }
  return {
    reference_date: referenceDate,
    reminders_generated: reminders.length,
    receivable_charges_generated: createdCharges.length,
    reminders,
    receivable_charges: createdCharges,
    persisted_reminders: listBoletoReminderEvents({}),
  };
};

export const executeRenegotiationFlow = (user, payload) => {
  const financingId = payload?.financing_id;
  if (!financingId) throw new Error('financing_id é obrigatório para fluxo de renegociação.');
  ensureFinancingExists(financingId);
  const previousInstallments = listFinancingInstallments({ financing_id: financingId });
  const renegotiated = renegotiateFinancing(user, financingId, payload);
  const newInstallments = listFinancingInstallments({ financing_id: renegotiated.id });
  return {
    previous_financing_id: financingId,
    new_financing: renegotiated,
    previous_installments: previousInstallments,
    new_installments: newInstallments,
  };
};
