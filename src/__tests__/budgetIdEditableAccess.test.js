import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { resolveBudgetForView } from '../services/budgetNavigationService.js';
import { getBudgetLockContextForBudget } from '../services/clinicalBudgetLockService.js';
import { resolveBudgetReadOnlyState } from '../components/clinical/budget/budgetEditAccessUtils.js';
import { DEFAULT_PAYMENT_OPTIONS } from '../components/clinical/clinicalAppointmentConfig.js';

const APPOINTMENT_ID = 'apt-edit-1';
const PATIENT_ID = 'patient-edit-1';
const BUDGET_ID = 'budget-negotiation-1';

function seedNegotiationBudget() {
  withDb((db) => {
    db.appointments = [{
      id: APPOINTMENT_ID,
      tenant_id: 'tenant-1',
      patientId: PATIENT_ID,
      date: '2026-06-16',
      status: APPOINTMENT_STATUS.FINALIZADO,
    }];
    db.clinicalAppointments = [{
      appointmentId: APPOINTMENT_ID,
      plannedProcedures: [{
        id: 'planned-1',
        name: 'Limpeza',
        quantity: 1,
        unitValue: 500,
        totalValue: 500,
      }],
      budget: {
        id: BUDGET_ID,
        budgetNumber: 'ORC-001',
        status: BUDGET_STATUS.NEGOCIACAO,
        procedures: [{
          id: 'proc-1',
          name: 'Limpeza',
          quantity: 1,
          unitValue: 500,
          totalValue: 500,
        }],
        totalValue: 500,
        paymentOptions: DEFAULT_PAYMENT_OPTIONS().map((opt, index) => ({
          ...opt,
          total: 500,
          ...(index === 0
            ? {
              presentToPatient: true,
              presentationStatus: 'apresentada',
              presentedAt: '2026-06-16T12:00:00.000Z',
            }
            : {}),
        })),
      },
      budgetHistory: [],
    }];
  });
}

describe('orçamento aberto por budgetId permanece editável em negociação', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedNegotiationBudget();
  });

  it('resolveBudgetForView não marca somente leitura para NEGOCIACAO sem contrato/financeiro', () => {
    const view = resolveBudgetForView(APPOINTMENT_ID, BUDGET_ID);

    expect(view.budget?.id).toBe(BUDGET_ID);
    expect(view.budget?.status).toBe(BUDGET_STATUS.NEGOCIACAO);
    expect(view.isReadOnly).toBe(false);
    expect(view.isHistoricalView).toBe(false);
    expect(view.record?.isInBudgetHistory).toBe(false);
  });

  it('resolveBudgetReadOnlyState permite editar, apresentar e aprovar', () => {
    const view = resolveBudgetForView(APPOINTMENT_ID, BUDGET_ID);
    const lockCtx = getBudgetLockContextForBudget(APPOINTMENT_ID, view.budget);
    const access = resolveBudgetReadOnlyState(view.budget, lockCtx);

    expect(lockCtx.isLocked).toBe(false);
    expect(lockCtx.hasReceivables).toBe(false);
    expect(lockCtx.hasActiveContract).toBe(false);
    expect(access.isReadOnly).toBe(false);
    expect(access.isEditBlocked).toBe(false);
    expect(access.isNegotiationOpen).toBe(true);
    expect(access.canEdit).toBe(true);
    expect(access.canApprove).toBe(true);
    expect(access.canPresent).toBe(true);
    expect(access.canChooseCondition).toBe(true);
  });

  it('RASCUNHO e ENVIADO também permanecem editáveis via budgetId', () => {
    for (const status of [BUDGET_STATUS.RASCUNHO, BUDGET_STATUS.ENVIADO]) {
      withDb((db) => {
        db.clinicalAppointments[0].budget.status = status;
      });
      const view = resolveBudgetForView(APPOINTMENT_ID, BUDGET_ID);
      expect(view.isReadOnly).toBe(false);
    }
  });

  it('orçamento arquivado em budgetHistory continua somente leitura', () => {
    withDb((db) => {
      const current = db.clinicalAppointments[0].budget;
      db.clinicalAppointments[0].budgetHistory = [{
        ...current,
        status: BUDGET_STATUS.HISTORICO,
        archivedAt: '2026-06-17T10:00:00.000Z',
      }];
      db.clinicalAppointments[0].budget = {
        id: 'budget-new',
        status: BUDGET_STATUS.RASCUNHO,
        procedures: [],
        totalValue: 0,
        paymentOptions: [],
      };
    });

    const view = resolveBudgetForView(APPOINTMENT_ID, BUDGET_ID);
    expect(view.isReadOnly).toBe(true);
    expect(view.isHistoricalView).toBe(true);
    expect(view.record?.isInBudgetHistory).toBe(true);
  });
});
