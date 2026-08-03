import { describe, expect, it, beforeEach, vi } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { getContractStatusForQuote } from '../services/contractModuleService.js';
import { createNewBudgetForAppointment } from '../services/clinicalBudgetLockService.js';
import {
  canAccessContract,
  isHistoricalApprovedBudget,
} from '../components/clinical/contract/contractAccessUtils.js';
import { getBudgetLockContextForBudget } from '../services/clinicalBudgetLockService.js';
import {
  openExistingContract,
  buildClinicalAppointmentUrl,
} from '../services/budgetNavigationService.js';
import { buildPatientExecutiveSummary } from '../services/patientCareExecutiveSummaryService.js';

const user = { id: 'user-1', name: 'Dr. Teste', tenant_id: 'tenant-1' };

describe('contractBudgetFlow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
      db.clinicProfile = { id: 'clinic-1', tenant_id: 'tenant-1' };
    });
  });

  function seedHistoricalApprovedWithContract() {
    withDb((db) => {
      db.patients = [{ id: 'p1', full_name: 'Paciente Teste', tenant_id: 'tenant-1' }];
      db.appointments = [{
        id: 'apt-1',
        tenant_id: 'tenant-1',
        patientId: 'p1',
        date: '2026-06-15',
        status: 'finalizado',
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
          procedures: [{ id: 'proc-1', name: 'Implante', quantity: 1, unitValue: 25000, totalValue: 25000 }],
          totalValue: 25000,
          paymentOptions: [{
            id: 'pay-a-vista',
            type: 'a_vista',
            total: 25000,
            accepted: true,
            presentationStatus: 'escolhida',
          }],
          approvedAt: '2026-06-15T11:00:00.000Z',
          createdAt: '2026-06-15T10:00:00.000Z',
          archivedAt: '2026-06-16T09:00:00.000Z',
          financingId: 'fin-1',
        }],
      }];
      db.financings = [{ id: 'fin-1', patient_id: 'p1', status: 'active', totalValue: 25000 }];
      db.generatedContracts = [{
        id: 'contract-1',
        clinicId: 'clinic-1',
        patientId: 'p1',
        quoteId: 'apt-1',
        quoteSource: 'clinical_budget',
        budgetId: 'budget-approved',
        contractNumber: 'CTR-2026-00001',
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>Contrato</p>',
        generatedAt: '2026-06-15T12:00:00.000Z',
      }];
    });
  }

  it('getContractStatusForQuote não retorna contrato de outro orçamento para negociação ativa', () => {
    seedHistoricalApprovedWithContract();

    const contract = getContractStatusForQuote('apt-1', 'clinical_budget', 'budget-new', 'p1');
    expect(contract).toBeNull();
  });

  it('getContractStatusForQuote encontra contrato de orçamento histórico por budgetId', () => {
    seedHistoricalApprovedWithContract();

    const contract = getContractStatusForQuote('apt-1', 'clinical_budget', 'budget-approved', 'p1');
    expect(contract?.id).toBe('contract-1');
  });

  it('getContractStatusForQuote faz fallback por quoteId quando budgetId legado está ausente', () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'contract-legacy',
        clinicId: 'clinic-1',
        patientId: 'p1',
        quoteId: 'apt-1',
        quoteSource: 'clinical_budget',
        budgetId: null,
        contractNumber: 'CTR-2026-00002',
        status: CONTRACT_STATUS.GENERATED,
        generatedAt: '2026-06-15T12:00:00.000Z',
      }];
    });

    const contract = getContractStatusForQuote('apt-1', 'clinical_budget', 'budget-approved', 'p1');
    expect(contract?.id).toBe('contract-legacy');
  });

  it('canAccessContract libera contrato para orçamento HISTORICO aprovado', () => {
    seedHistoricalApprovedWithContract();

    const historical = withDb((db) => db.clinicalAppointments[0].budgetHistory[0]);
    const lockCtx = getBudgetLockContextForBudget('apt-1', historical);

    expect(isHistoricalApprovedBudget(historical, lockCtx)).toBe(true);
    expect(canAccessContract(historical, lockCtx)).toBe(true);
  });

  it('createNewBudgetForAppointment não marca contrato como replaced', () => {
    seedHistoricalApprovedWithContract();

    withDb((db) => {
      db.clinicalAppointments[0].budget = {
        id: 'budget-approved',
        budgetNumber: 'ORC-002',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        procedures: [],
        totalValue: 25000,
        paymentOptions: [],
        createdAt: '2026-06-15T10:00:00.000Z',
      };
      db.clinicalAppointments[0].budgetHistory = [];
    });

    createNewBudgetForAppointment(user, 'apt-1');

    const contract = withDb((db) => db.generatedContracts.find((c) => c.id === 'contract-1'));
    expect(contract.status).toBe(CONTRACT_STATUS.GENERATED);
    expect(contract.budgetId).toBe('budget-approved');
  });

  it('openExistingContract navega com budgetId e contractId na query', () => {
    seedHistoricalApprovedWithContract();
    const navigate = vi.fn();

    openExistingContract(navigate, {
      contractId: 'contract-1',
      patientId: 'p1',
      appointmentId: 'apt-1',
    });

    expect(navigate).toHaveBeenCalledWith(
      buildClinicalAppointmentUrl({
        appointmentId: 'apt-1',
        budgetId: 'budget-approved',
        contractId: 'contract-1',
        section: 'contratos',
      }),
      expect.objectContaining({
        state: expect.objectContaining({
          section: 'contratos',
          contractId: 'contract-1',
          budgetId: 'budget-approved',
        }),
      }),
    );
  });

  it('resumo executivo expõe contractId e budgetId reais', () => {
    seedHistoricalApprovedWithContract();

    const summary = buildPatientExecutiveSummary('p1', { patientName: 'Paciente Teste' });
    expect(summary.activeBudget?.budgetId).toBe('budget-approved');
    expect(summary.activeContract?.contractId).toBe('contract-1');
    expect(summary.activeContract?.budgetId).toBe('budget-approved');
  });
});
