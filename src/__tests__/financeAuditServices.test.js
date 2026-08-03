import { beforeEach, describe, expect, it } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import {
  createFinancingPaymentAllocation,
  FINANCING_PAYMENT_ALLOCATION_STATUS,
  getFinancingPaymentAllocationById,
  listFinancingPaymentAllocations,
  reverseFinancingPaymentAllocation,
  reverseAllocationsByReceivablePayment,
  summarizeAllocationsByInstallment,
} from '../services/financingPaymentAllocationsService.js';
import {
  BOLETO_STATUS_EVENT_TYPE,
  createBoletoChargeStatusHistory,
  getBoletoChargeStatusHistoryById,
  getLatestBoletoChargeStatus,
  listBoletoChargeStatusHistory,
} from '../services/boletoChargeStatusHistoryService.js';
import {
  createFinancingProposal,
  approveFinancing,
  getFinancingTimeline,
  listBoletoReminderEvents,
  registerFinancingPayment,
  runBoletoReminderRule,
  reverseFinancingPaymentAudit,
} from '../services/financingsService.js';
import {
  cancelBoletoCharge,
  createBoletoCharge,
  generateSecondCopy,
  listBoletoCharges,
  processBoletoProviderWebhook,
  syncBoletoChargeStatusFromProvider,
  updateBoletoChargeStatus,
  BOLETO_CHARGE_STATUS,
} from '../services/boletoChargesService.js';
import {
  createReceivable,
  createReceivableCharge,
  listReceivableCharges,
  RECEIVABLE_ORIGIN_TYPE,
} from '../services/receivablesService.js';
import { createFinancingInstallment, patchFinancingInstallment } from '../services/financingInstallmentsService.js';
import { processProviderWebhookAndApplyFlow, syncBoletoAndApplyFinancialFlow } from '../services/boletoAutomationService.js';
import {
  AUDIT_EVENT_KEY,
  AUDIT_EVENT_SOURCE,
  AUDIT_OPERATION_CONTEXT,
  BOLETO_REMINDER_EVENT_KEY,
  BOLETO_REMINDER_CHANNEL,
  BOLETO_REMINDER_STATUS,
  FINANCING_TIMELINE_EVENT,
  RECEIVABLE_CHARGE_EVENT_TYPE,
  FINANCIAL_PAYMENT_METHOD,
} from '../services/auditEventCatalog.js';

const admin = { id: 'user-admin', role: 'admin', tenant_id: 'tenant-1' };

describe('Services de auditoria financeira', () => {
  beforeEach(async () => {
    localStorage.clear();
    resetDb();
    await initDb();
    withDb((db) => {
      db.patients = [{ id: 'patient-1', full_name: 'Paciente Teste', status: 'active', tenant_id: 'tenant-1' }];
      return db;
    });
  });

  it('cria e lista alocacoes de pagamento', () => {
    const created = createFinancingPaymentAllocation({
      financing_id: 'fin-1',
      installment_id: 'ins-1',
      receivable_id: 'recv-1',
      receivable_payment_id: 'rvpay-1',
      allocated_amount: 150.5,
      notes: 'Alocacao manual de teste',
      created_by: 'user-admin',
    });
    expect(created.id).toBeTruthy();
    const loaded = getFinancingPaymentAllocationById(created.id);
    expect(loaded?.receivable_payment_id).toBe('rvpay-1');
    const list = listFinancingPaymentAllocations({ installment_id: 'ins-1' });
    expect(list.length).toBe(1);
    const summary = summarizeAllocationsByInstallment('ins-1');
    expect(summary.net_allocated).toBeCloseTo(150.5, 2);

    const reversed = reverseFinancingPaymentAllocation(created.id, {
      reversed_by: 'user-admin',
      reversal_reason: 'Estorno de teste',
    });
    expect(reversed.status).toBe(FINANCING_PAYMENT_ALLOCATION_STATUS.REVERSED);
  });

  it('cria e consulta historico de status de boleto', () => {
    const created = createBoletoChargeStatusHistory({
      boleto_charge_id: 'blt-1',
      financing_id: 'fin-1',
      installment_id: 'ins-1',
      receivable_id: 'recv-1',
      from_status: null,
      to_status: 'generated',
      source: 'internal_manual',
      actor_id: 'user-admin',
    });
    expect(created.id).toBeTruthy();
    const loaded = getBoletoChargeStatusHistoryById(created.id);
    expect(loaded?.to_status).toBe('generated');
    const list = listBoletoChargeStatusHistory({ boleto_charge_id: 'blt-1' });
    expect(list.length).toBe(1);
    const latest = getLatestBoletoChargeStatus('blt-1');
    expect(latest?.id).toBe(created.id);
    expect(latest?.event_type).toBe(BOLETO_STATUS_EVENT_TYPE.STATUS_CHANGED);
  });

  it('integra registro de alocacao e historico no fluxo financeiro', () => {
    const proposal = createFinancingProposal(admin, {
      patient_id: 'patient-1',
      description: 'Tratamento com auditoria',
      total_amount: 900,
      entry_amount: 0,
      installments_count: 3,
      installment_frequency: 'monthly',
      first_due_date: '2026-06-10',
      issue_date: '2026-05-10',
      boleto_auto_generate: true,
      requires_credit_analysis: false,
    });
    approveFinancing(admin, proposal.id);
    const charge = listBoletoCharges({ financing_id: proposal.id })[0];
    expect(charge).toBeTruthy();

    updateBoletoChargeStatus(admin, charge.id, BOLETO_CHARGE_STATUS.SENT, {
      source: 'internal_manual',
      change_reason: 'Envio de teste',
    });
    const statusHistory = listBoletoChargeStatusHistory({ boleto_charge_id: charge.id });
    expect(statusHistory.length).toBeGreaterThanOrEqual(2);

    const dbSnapshot = loadDb();
    const firstInstallment = (dbSnapshot.financingInstallments || []).find((item) => item.financing_id === proposal.id);
    expect(firstInstallment).toBeTruthy();

    registerFinancingPayment(admin, {
      installment_id: firstInstallment.id,
      amount_received: 100,
      payment_date: '2026-06-10',
      payment_method: 'boleto',
      notes: 'Baixa parcial teste',
    });

    const allocations = listFinancingPaymentAllocations({ installment_id: firstInstallment.id });
    expect(allocations.length).toBeGreaterThanOrEqual(1);
    expect(allocations[0].receivable_payment_id).toBeTruthy();
    expect(allocations[0].metadata?.event_key).toBeTruthy();
  });

  it('audita 2a via, cancelamento, baixa total e estorno operacional', () => {
    const proposal = createFinancingProposal(admin, {
      patient_id: 'patient-1',
      description: 'Fluxo completo auditavel',
      total_amount: 300,
      entry_amount: 0,
      installments_count: 1,
      installment_frequency: 'monthly',
      first_due_date: '2026-07-10',
      issue_date: '2026-06-10',
      boleto_auto_generate: true,
      requires_credit_analysis: false,
    });
    approveFinancing(admin, proposal.id);
    const charge = listBoletoCharges({ financing_id: proposal.id })[0];
    expect(charge).toBeTruthy();

    generateSecondCopy(admin, charge.id);
    cancelBoletoCharge(admin, charge.id, 'Cancelamento para teste');

    const dbSnapshot = loadDb();
    const installment = (dbSnapshot.financingInstallments || []).find((item) => item.financing_id === proposal.id);
    expect(installment).toBeTruthy();

    const paymentResult = registerFinancingPayment(admin, {
      installment_id: installment.id,
      amount_received: 300,
      payment_date: '2026-07-10',
      payment_method: 'boleto',
      notes: 'Quitacao total teste',
    });
    expect(paymentResult.payment?.id).toBeTruthy();

    const reversedByPayment = reverseAllocationsByReceivablePayment(paymentResult.payment.id, {
      reversed_by: admin.id,
      reversal_reason: 'Estorno tecnico',
    });
    expect(reversedByPayment.length).toBeGreaterThanOrEqual(1);

    const auditReversal = reverseFinancingPaymentAudit(admin, {
      receivable_payment_id: paymentResult.payment.id,
      reversal_reason: 'Estorno operacional',
      reversal_reference: 'estorno-001',
    });
    expect(Array.isArray(auditReversal)).toBe(true);

    const history = listBoletoChargeStatusHistory({ boleto_charge_id: charge.id });
    const eventTypes = new Set(history.map((item) => item.event_type));
    expect(eventTypes.has(BOLETO_STATUS_EVENT_TYPE.SECOND_COPY_GENERATED)).toBe(true);
    expect(eventTypes.has(BOLETO_STATUS_EVENT_TYPE.CANCELED)).toBe(true);
  });

  it('padroniza eventos de regua e cobrancas de receivables', () => {
    const proposal = createFinancingProposal(admin, {
      patient_id: 'patient-1',
      description: 'Padronizacao de eventos',
      total_amount: 500,
      entry_amount: 0,
      installments_count: 1,
      installment_frequency: 'monthly',
      first_due_date: '2026-08-10',
      issue_date: '2026-08-10',
      boleto_auto_generate: true,
      requires_credit_analysis: false,
    });
    approveFinancing(admin, proposal.id);
    const charge = listBoletoCharges({ financing_id: proposal.id })[0];
    expect(charge).toBeTruthy();

    const reminders = runBoletoReminderRule(admin, '2026-08-07');
    expect(reminders.length).toBeGreaterThanOrEqual(1);
    expect(reminders[0].event_key).toBe(BOLETO_REMINDER_EVENT_KEY.BEFORE_3_DAYS);
    expect(reminders[0].payload?.metadata?.event_key).toBe(AUDIT_EVENT_KEY.BOLETO_REMINDER_SCHEDULED);
    expect(reminders[0].payload?.operation_context).toBe(AUDIT_OPERATION_CONTEXT.RUN_BOLETO_REMINDER_RULE);
    const filteredReminders = listBoletoReminderEvents({
      financing_id: proposal.id,
      channel: BOLETO_REMINDER_CHANNEL.INTERNAL_NOTIFICATION,
      status: BOLETO_REMINDER_STATUS.GENERATED,
      event_key: BOLETO_REMINDER_EVENT_KEY.BEFORE_3_DAYS,
      source: AUDIT_EVENT_SOURCE.FINANCIAL_OPERATION,
      operation_context: AUDIT_OPERATION_CONTEXT.RUN_BOLETO_REMINDER_RULE,
      audit_event_key: AUDIT_EVENT_KEY.BOLETO_REMINDER_SCHEDULED,
    });
    expect(filteredReminders.length).toBeGreaterThanOrEqual(1);

    const dbSnapshot = loadDb();
    const receivable = (dbSnapshot.accountsReceivable || []).find((item) => item.financing_id === proposal.id);
    expect(receivable).toBeTruthy();
    const receivableCharge = createReceivableCharge(admin, {
      receivable_id: receivable.id,
      charge_type: 'whatsapp_reminder',
      recipient: '5511999999999',
      notes: 'Cobranca padronizada',
    });
    expect(receivableCharge.event_type).toBe(RECEIVABLE_CHARGE_EVENT_TYPE.CREATED);
    expect(receivableCharge.metadata?.event_key).toBe(AUDIT_EVENT_KEY.RECEIVABLE_CHARGE_CREATED);
    expect(receivableCharge.metadata?.operation_context).toBe(AUDIT_OPERATION_CONTEXT.CREATE_RECEIVABLE_CHARGE);
    const charges = listReceivableCharges({
      receivableId: receivable.id,
      eventType: RECEIVABLE_CHARGE_EVENT_TYPE.CREATED,
      source: AUDIT_EVENT_SOURCE.INTERNAL_MANUAL,
      operationContext: AUDIT_OPERATION_CONTEXT.CREATE_RECEIVABLE_CHARGE,
      eventKey: AUDIT_EVENT_KEY.RECEIVABLE_CHARGE_CREATED,
    });
    expect(charges.length).toBeGreaterThanOrEqual(1);

    const timeline = getFinancingTimeline(proposal.id, {
      event_type: FINANCING_TIMELINE_EVENT.BOLETO_GENERATED,
    });
    expect(timeline.length).toBeGreaterThanOrEqual(1);
  });

  it('rejeita payload invalido na gravacao de auditoria e cobranca', () => {
    expect(() =>
      createBoletoChargeStatusHistory({
        boleto_charge_id: 'blt-invalid',
        to_status: 'status_invalido',
      })
    ).toThrow(/to_status inválido/i);

    const charge = createBoletoCharge(admin, {
      patient_id: 'patient-1',
      due_date: '2026-09-10',
      amount: 100,
      status: BOLETO_CHARGE_STATUS.GENERATED,
    });

    expect(() =>
      updateBoletoChargeStatus(admin, charge.id, 'status_invalido')
    ).toThrow(/nextStatus inválido/i);
  });

  it('rejeita payload invalido em receivableCharge e parcelas', () => {
    const receivable = withDb((db) => {
      db.accountsReceivable = db.accountsReceivable || [];
      db.accountsReceivable.push({
        id: 'recv-invalid-test',
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        description: 'Teste',
        issue_date: '2026-09-01',
        due_date: '2026-09-10',
        original_amount: 100,
        discount_amount: 0,
        interest_amount: 0,
        fine_amount: 0,
        net_amount: 100,
        received_amount: 0,
        remaining_amount: 100,
        status: 'pending',
      });
      return db.accountsReceivable.find((item) => item.id === 'recv-invalid-test');
    });

    expect(() =>
      createReceivableCharge(admin, {
        receivable_id: receivable.id,
        event_type: 'evento_invalido',
      })
    ).toThrow(/event_type inválido/i);
    expect(() =>
      createReceivableCharge(admin, {
        receivable_id: receivable.id,
        charge_type: 'tipo_livre_invalido',
      })
    ).toThrow(/charge_type inválido/i);

    expect(() =>
      createFinancingInstallment({
        financing_id: 'fin-test',
        due_date: '2026-09-10',
        original_amount: 100,
        net_amount: 100,
        status: 'status_invalido',
      })
    ).toThrow(/status inválido/i);

    const installment = createFinancingInstallment({
      financing_id: 'fin-test-ok',
      due_date: '2026-09-10',
      original_amount: 100,
      net_amount: 100,
    });
    expect(() =>
      patchFinancingInstallment(installment.id, { status: 'status_invalido' })
    ).toThrow(/status inválido/i);
  });

  it('rejeita campos de dominio financeiro invalidos', () => {
    expect(() =>
      createFinancingProposal(admin, {
        patient_id: 'patient-1',
        description: 'Teste juros inválidos',
        total_amount: 500,
        entry_amount: 0,
        installments_count: 3,
        interest_type: 'random',
      })
    ).toThrow(/interest_type inválido/i);

    expect(() =>
      createFinancingProposal(admin, {
        patient_id: 'patient-1',
        description: 'Teste frequência inválida',
        total_amount: 500,
        entry_amount: 0,
        installments_count: 3,
        installment_frequency: 'a cada lua cheia',
      })
    ).toThrow(/installment_frequency inválido/i);

    const proposal = createFinancingProposal(admin, {
      patient_id: 'patient-1',
      description: 'Pagamento com método válido',
      total_amount: 300,
      entry_amount: 0,
      installments_count: 1,
      installment_frequency: 'monthly',
      issue_date: '2026-10-01',
      first_due_date: '2026-10-10',
      requires_credit_analysis: false,
    });
    approveFinancing(admin, proposal.id);
    const dbSnapshot = loadDb();
    const installment = (dbSnapshot.financingInstallments || []).find((item) => item.financing_id === proposal.id);
    expect(installment).toBeTruthy();
    expect(() =>
      registerFinancingPayment(admin, {
        installment_id: installment.id,
        amount_received: 50,
        payment_method: 'metodo_invalido',
      })
    ).toThrow(/payment_method inválido/i);

    expect(() =>
      createBoletoCharge(admin, {
        patient_id: 'patient-1',
        due_date: '2026-10-10',
        amount: 100,
        charge_type: 'tipo_invalido',
      })
    ).toThrow(/charge_type inválido/i);
    expect(() =>
      createBoletoCharge(admin, {
        patient_id: 'patient-1',
        due_date: '2026-10-10',
        amount: 100,
        external_provider: 'provider_desconhecido',
      })
    ).toThrow(/external_provider inválido/i);

    const validCharge = createBoletoCharge(admin, {
      patient_id: 'patient-1',
      due_date: '2026-10-10',
      amount: 100,
      charge_type: 'boleto',
      payment_method: FINANCIAL_PAYMENT_METHOD.BOLETO,
    });
    expect(validCharge.charge_type).toBe('boleto');

    expect(() =>
      createReceivable(admin, {
        patient_id: 'patient-1',
        description: 'Recebível inválido',
        original_amount: 100,
        origin_type: 'origem_invalida',
      })
    ).toThrow(/origin_type inválido/i);

    const validReceivable = createReceivable(admin, {
      patient_id: 'patient-1',
      description: 'Recebível válido',
      original_amount: 100,
      origin_type: RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY,
    });
    expect(validReceivable.origin_type).toBe(RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY);
  });

  it('sincroniza status com provider e processa webhook com baixa automática', () => {
    const proposal = createFinancingProposal(admin, {
      patient_id: 'patient-1',
      description: 'Sync provider',
      total_amount: 200,
      entry_amount: 0,
      installments_count: 1,
      installment_frequency: 'monthly',
      first_due_date: '2026-11-10',
      issue_date: '2026-10-10',
      boleto_auto_generate: true,
      requires_credit_analysis: false,
    });
    approveFinancing(admin, proposal.id);
    const charge = listBoletoCharges({ financing_id: proposal.id })[0];
    expect(charge).toBeTruthy();

    const syncResult = syncBoletoChargeStatusFromProvider(admin, charge.id, {
      status: BOLETO_CHARGE_STATUS.SENT,
      provider_status: 'sent',
      provider_payload: { mock: true },
    });
    expect(syncResult.updated).toBe(true);
    expect(syncResult.charge.status).toBe(BOLETO_CHARGE_STATUS.SENT);

    const webhookResult = processBoletoProviderWebhook(admin, {
      provider: 'manual',
      external_charge_id: charge.external_charge_id,
      status: 'paid',
      paid_at: '2026-11-10T12:00:00.000Z',
    });
    expect(webhookResult.matched).toBe(true);
    expect(webhookResult.charge.status).toBe(BOLETO_CHARGE_STATUS.PAID);

    const autoFlow = processProviderWebhookAndApplyFlow(admin, {
      provider: 'manual',
      external_charge_id: charge.external_charge_id,
      status: 'paid',
      paid_at: '2026-11-10T12:00:00.000Z',
    });
    expect(autoFlow.matched).toBe(true);
    expect(autoFlow.settlement.settled).toBe(true);

    const alreadyPaidFlow = syncBoletoAndApplyFinancialFlow(admin, charge.id, {
      status: BOLETO_CHARGE_STATUS.PAID,
      provider_status: 'paid',
    });
    expect(alreadyPaidFlow.settlement.settled).toBe(false);
  });
});

