import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  getLatestApprovedBudget,
  buildApprovedBudgetQuickSummaryText,
  isApprovedBudgetRecord,
} from '../services/clinicalBudgetApprovedService.js';

describe('clinicalBudgetApprovedService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  function seedHistoricalApprovedBudget() {
    withDb((db) => {
      db.appointments = [{
        id: 'apt-1',
        tenant_id: 'tenant-1',
        patientId: 'p1',
        date: '2026-06-15',
        status: 'em_atendimento',
      }];
      db.clinicalAppointments = [{
        appointmentId: 'apt-1',
        patientId: 'p1',
        plannedProcedures: [],
        budget: {
          id: 'budget-new',
          budgetNumber: 'ORC-003',
          status: BUDGET_STATUS.RASCUNHO,
          procedures: [],
          totalValue: 0,
          paymentOptions: [],
          createdAt: '2026-06-16T10:00:00.000Z',
        },
        budgetHistory: [{
          id: 'budget-approved',
          budgetNumber: 'ORC-002',
          status: BUDGET_STATUS.HISTORICO,
          approvedAt: '2026-06-15T14:00:00.000Z',
          procedures: [{ id: 'proc-1', name: 'Implante', totalValue: 25000 }],
          totalValue: 25000,
          paymentOptions: [],
          createdAt: '2026-06-15T10:00:00.000Z',
          archivedAt: '2026-06-16T09:00:00.000Z',
          financingId: 'fin-1',
        }],
      }];
      db.generatedContracts = [{
        id: 'ctr-1',
        quoteId: 'apt-1',
        quoteSource: 'clinical_budget',
        budgetId: 'budget-approved',
        status: CONTRACT_STATUS.SIGNED,
        contractNumber: 'CTR-001',
      }];
      db.financings = [{
        id: 'fin-1',
        patient_id: 'p1',
        status: 'active',
      }];
    });
  }

  it('getLatestApprovedBudget encontra orçamento histórico aprovado com approvedAt', () => {
    seedHistoricalApprovedBudget();

    const latest = getLatestApprovedBudget('p1');
    expect(latest).not.toBeNull();
    expect(latest.id).toBe('budget-approved');
    expect(latest.budgetNumber).toBe('ORC-002');
    expect(latest.totalAmount).toBe(25000);
    expect(latest.contractId).toBe('ctr-1');
    expect(latest.financialId).toBe('fin-1');
    expect(latest.hasContract).toBe(true);
    expect(latest.hasFinancing).toBe(true);
  });

  it('buildApprovedBudgetQuickSummaryText formata número, valor e extras', () => {
    const text = buildApprovedBudgetQuickSummaryText({
      budgetNumber: 'ORC-002',
      totalAmount: 25000,
      hasContract: true,
      hasFinancing: true,
    });

    expect(text).toContain('Orçamento aprovado: ORC-002');
    expect(text).toContain('R$');
    expect(text).toContain('Contrato gerado');
    expect(text).toContain('Financiamento ativo');
  });

  it('retorna null quando só existe rascunho', () => {
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
      db.appointments = [{ id: 'apt-1', tenant_id: 'tenant-1', patientId: 'p1' }];
      db.clinicalAppointments = [{
        appointmentId: 'apt-1',
        patientId: 'p1',
        budget: {
          id: 'budget-draft',
          status: BUDGET_STATUS.RASCUNHO,
          procedures: [],
          totalValue: 0,
        },
        budgetHistory: [],
      }];
    });

    expect(getLatestApprovedBudget('p1')).toBeNull();
    expect(buildApprovedBudgetQuickSummaryText(null)).toBe('Nenhum orçamento aprovado');
  });

  it('isApprovedBudgetRecord ignora histórico sem aprovação', () => {
    const draftLike = { status: BUDGET_STATUS.HISTORICO, procedures: [] };
    expect(isApprovedBudgetRecord(draftLike, 'apt-1', 'p1')).toBe(false);

    const approvedHistorical = {
      status: BUDGET_STATUS.HISTORICO,
      approvedAt: '2026-06-15T14:00:00.000Z',
    };
    expect(isApprovedBudgetRecord(approvedHistorical, 'apt-1', 'p1')).toBe(true);
  });
});
