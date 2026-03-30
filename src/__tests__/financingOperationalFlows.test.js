import { beforeEach, describe, expect, it } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import {
  executeChargeGenerationFlow,
  executeDelinquencyFlow,
  executeFinancingCreationFlow,
  executeReceivementFlow,
  executeReminderFlow,
  executeRenegotiationFlow,
} from '../services/financingOperationalFlowsService.js';
import { listBoletoCharges } from '../services/boletoChargesService.js';
import { listFinancingInstallments } from '../services/financingInstallmentsService.js';
import { listReceivableCharges } from '../services/receivablesService.js';

const admin = { id: 'user-admin', role: 'admin' };

describe('Fluxos operacionais de financiamento e boletos', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.patients = [
        { id: 'patient-1', full_name: 'Paciente Fluxo', status: 'active' },
      ];
      return db;
    });
  });

  it('executa fluxo ponta a ponta: criação, cobrança, recebimento, inadimplência e régua', () => {
    const creation = executeFinancingCreationFlow(admin, {
      patient_id: 'patient-1',
      description: 'Fluxo completo ortodontia',
      total_amount: 900,
      entry_amount: 0,
      installments_count: 3,
      installment_frequency: 'monthly',
      first_due_date: '2026-03-10',
      issue_date: '2026-02-10',
      requires_credit_analysis: false,
      boleto_auto_generate: false,
    });
    expect(creation.financing?.id).toBeTruthy();
    expect(creation.installments.length).toBe(3);
    expect(creation.receivables.length).toBe(3);

    const chargesFlow = executeChargeGenerationFlow(admin, {
      financing_id: creation.financing.id,
      issue_date: '2026-02-10',
    });
    expect(chargesFlow.total_created).toBe(3);
    const charges = listBoletoCharges({ financing_id: creation.financing.id });
    expect(charges.length).toBe(3);

    const firstInstallment = listFinancingInstallments({ financing_id: creation.financing.id })[0];
    const paymentFlow = executeReceivementFlow(admin, {
      installment_id: firstInstallment.id,
      amount_received: 100,
      payment_date: '2026-03-10',
      payment_method: 'boleto',
      notes: 'Baixa parcial de operação',
    });
    expect(paymentFlow.payment?.id).toBeTruthy();
    expect(Number(paymentFlow.installment?.paid_amount || 0)).toBeGreaterThan(0);

    const delinquency = executeDelinquencyFlow(admin, '2026-03-13');
    expect(Array.isArray(delinquency.overdue_installments)).toBe(true);
    expect(Array.isArray(delinquency.generated_reminders)).toBe(true);

    const reminderFlow = executeReminderFlow(admin, '2026-03-13');
    expect(reminderFlow.reminders_generated).toBeGreaterThanOrEqual(1);
    expect(reminderFlow.receivable_charges_generated).toBeGreaterThanOrEqual(1);
    const receivableCharges = listReceivableCharges({});
    expect(receivableCharges.length).toBeGreaterThanOrEqual(1);
  });

  it('executa fluxo de renegociação preservando histórico e novo plano', () => {
    const creation = executeFinancingCreationFlow(admin, {
      patient_id: 'patient-1',
      description: 'Renegociação clínica',
      total_amount: 600,
      entry_amount: 0,
      installments_count: 2,
      installment_frequency: 'monthly',
      first_due_date: '2026-04-10',
      issue_date: '2026-03-10',
      requires_credit_analysis: false,
      boleto_auto_generate: true,
    });
    const oldInstallments = listFinancingInstallments({ financing_id: creation.financing.id });
    expect(oldInstallments.length).toBe(2);

    const renegotiation = executeRenegotiationFlow(admin, {
      financing_id: creation.financing.id,
      installment_ids: oldInstallments.map((item) => item.id),
      new_installments_count: 3,
      first_due_date: '2026-05-10',
      issue_date: '2026-04-01',
      discount_amount: 0,
      interest_amount: 0,
    });
    expect(renegotiation.new_financing?.id).toBeTruthy();
    expect(renegotiation.new_financing.id).not.toBe(creation.financing.id);
    expect(renegotiation.new_installments.length).toBe(3);

    const db = loadDb();
    const renegotiationHistory = Array.isArray(db.financingRenegotiations) ? db.financingRenegotiations : [];
    expect(renegotiationHistory.length).toBeGreaterThanOrEqual(1);
  });
});
