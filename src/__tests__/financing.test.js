import { beforeEach, describe, expect, it } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { calculateFinancingSummary } from '../services/financingCalculator.js';
import {
  approveFinancing,
  createFinancingProposal,
  listFinancings,
  registerFinancingPayment,
} from '../services/financingsService.js';
import { listFinancingInstallments } from '../services/financingInstallmentsService.js';
import { listBoletoCharges } from '../services/boletoChargesService.js';

const admin = { id: 'user-admin', role: 'admin', tenant_id: 'tenant-1' };

describe('Financiamentos e boletos (fase 1)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.patients = [
        {
          id: 'patient-1',
          full_name: 'Paciente Teste',
          status: 'active',
          tenant_id: 'tenant-1',
        },
      ];
      return db;
    });
  });

  it('calcula parcelas com arredondamento de centavos', () => {
    const summary = calculateFinancingSummary({
      total_amount: 1000,
      entry_amount: 100,
      installments_count: 3,
      interest_type: 'none',
      interest_rate: 0,
      discount_amount: 0,
    });
    expect(summary.financedAmount).toBe(900);
    expect(summary.installmentParts.reduce((sum, value) => sum + value, 0)).toBeCloseTo(900, 2);
    expect(summary.totalPayableAmount).toBe(1000);
  });

  it('aprova financiamento e gera parcelas + boletos', () => {
    const proposal = createFinancingProposal(admin, {
      patient_id: 'patient-1',
      description: 'Implante completo',
      total_amount: 1200,
      entry_amount: 200,
      installments_count: 4,
      installment_frequency: 'monthly',
      first_due_date: '2026-04-10',
      issue_date: '2026-03-10',
      interest_type: 'none',
      interest_rate: 0,
      discount_amount: 0,
      boleto_auto_generate: true,
      requires_credit_analysis: true,
    });

    const result = approveFinancing(admin, proposal.id, { entry_received_now: true });
    expect(result.installments.length).toBe(4);

    const installments = listFinancingInstallments({ financing_id: proposal.id });
    expect(installments.length).toBe(4);

    const boletos = listBoletoCharges({ financing_id: proposal.id });
    expect(boletos.length).toBe(4);

    const receivables = loadDb().accountsReceivable || [];
    expect(receivables.length).toBe(5); // 1 entrada + 4 parcelas
  });

  it('registra baixa parcial e mantém rastreabilidade', () => {
    const proposal = createFinancingProposal(admin, {
      patient_id: 'patient-1',
      description: 'Ortodontia',
      total_amount: 600,
      entry_amount: 0,
      installments_count: 2,
      installment_frequency: 'monthly',
      first_due_date: '2026-05-01',
      issue_date: '2026-04-01',
      interest_type: 'none',
      interest_rate: 0,
      discount_amount: 0,
      boleto_auto_generate: true,
      requires_credit_analysis: false,
    });
    approveFinancing(admin, proposal.id);
    const firstInstallment = listFinancingInstallments({ financing_id: proposal.id })[0];

    registerFinancingPayment(admin, {
      installment_id: firstInstallment.id,
      amount_received: 100,
      payment_date: '2026-05-01',
      payment_method: 'boleto',
    });

    const refreshInstallment = listFinancingInstallments({ financing_id: proposal.id }).find((i) => i.id === firstInstallment.id);
    expect(refreshInstallment.paid_amount).toBeCloseTo(100, 2);
    expect(refreshInstallment.remaining_amount).toBeGreaterThan(0);
    expect(['partially_paid', 'overdue', 'due_today', 'upcoming']).toContain(refreshInstallment.status);

    const financing = listFinancings({}).find((item) => item.id === proposal.id);
    expect(financing).toBeTruthy();
  });
});
