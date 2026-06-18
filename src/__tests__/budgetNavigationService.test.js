import { describe, expect, it, beforeEach, vi } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import {
  findBudgetRecord,
  resolveBudgetForView,
  validateBudgetConsistency,
  openExistingBudget,
  resolveEffectiveViewBudgetId,
} from '../services/budgetNavigationService.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';

describe('budgetNavigationService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
    });
  });

  function seedApprovedArchivedBudget() {
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
          approvedAt: '2026-06-15T11:00:00.000Z',
          procedures: [
            {
              id: 'proc-1',
              name: 'Implante',
              quantity: 1,
              unitValue: 25000,
              totalValue: 25000,
            },
          ],
          totalValue: 25000,
          paymentOptions: [{
            id: 'pay-a-vista',
            type: 'a_vista',
            total: 25000,
            accepted: true,
            presentationStatus: 'escolhida',
          }],
          createdAt: '2026-06-15T10:00:00.000Z',
          archivedAt: '2026-06-16T09:00:00.000Z',
        }],
      }];
    });
  }

  it('findBudgetRecord localiza orçamento histórico por budgetNumber ORC-002', () => {
    seedApprovedArchivedBudget();

    const byNumber = findBudgetRecord({ budgetId: 'ORC-002', patientId: 'p1' });
    expect(byNumber?.budget?.id).toBe('budget-approved');
    expect(byNumber?.isHistorical).toBeUndefined();
    expect(byNumber?.isInBudgetHistory).toBe(true);
    expect(byNumber?.budget?.totalValue).toBe(25000);

    const byId = findBudgetRecord({ budgetId: 'budget-approved', patientId: 'p1' });
    expect(byId?.budget?.budgetNumber).toBe('ORC-002');
  });

  it('resolveBudgetForView retorna orçamento histórico em vez do ativo vazio', () => {
    seedApprovedArchivedBudget();

    const activeOnly = resolveBudgetForView('apt-1');
    expect(activeOnly.budget?.id).toBe('budget-new');
    expect(activeOnly.budget?.totalValue).toBe(0);

    const historical = resolveBudgetForView('apt-1', 'ORC-002');
    expect(historical.isHistoricalView).toBe(true);
    expect(historical.isReadOnly).toBe(true);
    expect(historical.mode).toBe('readonly');
    expect(historical.budget?.id).toBe('budget-approved');
    expect(historical.budget?.procedures).toHaveLength(1);
    expect(historical.budget?.totalValue).toBe(25000);
  });

  it('resolveEffectiveViewBudgetId ignora orçamento arquivado durante atendimento ativo', () => {
    seedApprovedArchivedBudget();

    expect(resolveEffectiveViewBudgetId('apt-1', 'budget-approved', {
      appointmentStatus: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    })).toBeNull();

    expect(resolveEffectiveViewBudgetId('apt-1', 'budget-new', {
      appointmentStatus: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    })).toBe('budget-new');
  });

  it('resolveEffectiveViewBudgetId mantém histórico quando viewMode explícito ou atendimento finalizado', () => {
    seedApprovedArchivedBudget();

    expect(resolveEffectiveViewBudgetId('apt-1', 'budget-approved', {
      forceHistorical: true,
      appointmentStatus: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    })).toBe('budget-approved');

    expect(resolveEffectiveViewBudgetId('apt-1', 'budget-approved', {
      appointmentStatus: APPOINTMENT_STATUS.FINALIZADO,
    })).toBe('budget-approved');
  });

  it('validateBudgetConsistency detecta divergência de valor', () => {
    const budget = {
      id: 'b1',
      status: BUDGET_STATUS.APROVADO,
      totalValue: 10000,
      procedures: [{ quantity: 1, unitValue: 25000, totalValue: 25000 }],
      paymentOptions: [{ id: 'p1', total: 25000, accepted: true }],
    };

    const result = validateBudgetConsistency(budget, 'apt-1', 'p1');
    expect(result.isConsistent).toBe(false);
    expect(result.message).toContain('Inconsistência detectada');
  });

  it('openExistingBudget navega com budgetId na query', () => {
    seedApprovedArchivedBudget();
    const navigate = vi.fn();

    openExistingBudget(navigate, { budgetId: 'ORC-002', patientId: 'p1' });

    expect(navigate).toHaveBeenCalledWith(
      '/atendimento-clinico/apt-1?budgetId=budget-approved',
      expect.objectContaining({
        state: expect.objectContaining({
          budgetId: 'budget-approved',
          section: 'orcamento',
          viewMode: true,
          mode: 'readonly',
        }),
      }),
    );
  });

  it('openExistingBudget usa viewMode false para orçamento ativo em negociação', () => {
    withDb((db) => {
      db.appointments = [{
        id: 'apt-1',
        tenant_id: 'tenant-1',
        patientId: 'p1',
        date: '2026-06-16',
        status: 'em_atendimento',
      }];
      db.clinicalAppointments = [{
        appointmentId: 'apt-1',
        budget: {
          id: 'budget-active',
          budgetNumber: 'ORC-001',
          status: BUDGET_STATUS.NEGOCIACAO,
          procedures: [{ id: 'p1', name: 'Limpeza', quantity: 1, unitValue: 500, totalValue: 500 }],
          totalValue: 500,
          paymentOptions: [{ id: 'pay-a-vista', type: 'a_vista', presentToPatient: true }],
        },
        budgetHistory: [],
      }];
    });

    const navigate = vi.fn();
    openExistingBudget(navigate, { budgetId: 'budget-active', patientId: 'p1' });

    expect(navigate).toHaveBeenCalledWith(
      '/atendimento-clinico/apt-1?budgetId=budget-active',
      expect.objectContaining({
        state: expect.objectContaining({
          budgetId: 'budget-active',
          viewMode: false,
        }),
      }),
    );
  });
});
