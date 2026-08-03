import { describe, expect, it, beforeEach, vi } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  APPOINTMENT_CLOSE_REASON,
  closeClinicalAppointment,
  findPendingDecisionBudget,
} from '../services/clinicalAppointmentCloseService.js';
import { resolveBudgetForView, openExistingBudget, resolveBudgetNavigationId } from '../services/budgetNavigationService.js';
import { getBudgetLockContextForBudget } from '../services/clinicalBudgetLockService.js';
import { resolveBudgetReadOnlyState, isBudgetLocked } from '../components/clinical/budget/budgetEditAccessUtils.js';
import { buildPatientCareContextByPatient } from '../services/patientCareCentralService.js';
import { DEFAULT_PAYMENT_OPTIONS } from '../components/clinical/clinicalAppointmentConfig.js';

const APPOINTMENT_ID = 'apt-pending-1';
const PATIENT_ID = 'patient-pending-1';
const BUDGET_ID = 'budget-pending-003';
const USER = { id: 'user-1', name: 'Dentista', role: 'admin', tenant_id: 'tenant-1' };

function seedPendingBudgetScenario({ budgetStatus = BUDGET_STATUS.NEGOCIACAO, withSignedContractOnPrevious = true } = {}) {
  withDb((db) => {
    db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: 'tenant-1' };
    db.patients = [{ id: PATIENT_ID, tenant_id: 'tenant-1', full_name: 'Paciente Teste' }];
    db.appointments = [{
      id: APPOINTMENT_ID,
      tenant_id: 'tenant-1',
      patientId: PATIENT_ID,
      date: '2026-06-16',
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      startTime: '10:00',
      endTime: '10:30',
      checkInAt: '2026-06-16T10:00:00.000Z',
      startedAt: '2026-06-16T10:00:00.000Z',
    }];
    db.clinicalAppointments = [{
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      tenant_id: 'tenant-1',
      plannedProcedures: [{
        id: 'planned-1',
        name: 'Implante',
        quantity: 1,
        unitValue: 25000,
        totalValue: 25000,
      }],
      budget: {
        id: BUDGET_ID,
        budgetNumber: 'ORC-003',
        status: budgetStatus,
        procedures: [{
          id: 'proc-1',
          name: 'Implante',
          quantity: 1,
          unitValue: 25000,
          totalValue: 25000,
        }],
        totalValue: 25000,
        paymentOptions: DEFAULT_PAYMENT_OPTIONS().map((opt, index) => ({
          ...opt,
          total: 25000,
          ...(index === 0
            ? {
              presentToPatient: true,
              presentationStatus: 'apresentada',
              presentedAt: '2026-06-16T12:00:00.000Z',
            }
            : {}),
        })),
      },
      budgetHistory: withSignedContractOnPrevious
        ? [{
          id: 'budget-002',
          budgetNumber: 'ORC-002',
          status: BUDGET_STATUS.APROVADO,
          totalValue: 25000,
          archivedAt: '2026-06-15T10:00:00.000Z',
        }]
        : [],
    }];
    db.generatedContracts = withSignedContractOnPrevious
      ? [{
        id: 'ctr-1',
        clinicId: 'clinic-1',
        quoteId: APPOINTMENT_ID,
        quoteSource: 'clinical_budget',
        budgetId: 'budget-002',
        status: CONTRACT_STATUS.SIGNED,
        patientId: PATIENT_ID,
        generatedAt: '2026-06-15T11:00:00.000Z',
      }]
      : [];
    db.clinicalEvents = [];
    db.crmTasks = [];
    db.followUps = [];
  });
}

describe('pending budget opened from Patient Central remains editable', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('fluxo completo: apresentar condição, encerrar atendimento e reabrir editável', () => {
    seedPendingBudgetScenario({ budgetStatus: BUDGET_STATUS.NEGOCIACAO });

    closeClinicalAppointment(USER, {
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      budgetId: BUDGET_ID,
      reason: APPOINTMENT_CLOSE_REASON.ANALYZE_LATER,
      notes: 'Paciente vai pensar',
    });

    const pending = findPendingDecisionBudget(PATIENT_ID);
    expect(pending?.id).toBe(BUDGET_ID);
    expect(pending?.status).toBe(BUDGET_STATUS.NEGOCIACAO);

    const ctx = buildPatientCareContextByPatient(PATIENT_ID);
    const pendingAlert = ctx.alerts.find((a) => a.id === 'pending-budget-decision');
    expect(pendingAlert?.budgetId).toBe(BUDGET_ID);

    const view = resolveBudgetForView(APPOINTMENT_ID, pendingAlert.budgetId);
    const lockCtx = getBudgetLockContextForBudget(APPOINTMENT_ID, view.budget);
    const access = resolveBudgetReadOnlyState(view.budget, lockCtx);

    expect(view.isReadOnly).toBe(false);
    expect(view.isHistoricalView).toBe(false);
    expect(view.mode).toBe('edit');
    expect(access.isEditBlocked).toBe(false);
    expect(access.canPresent).toBe(true);
    expect(access.canChooseCondition).toBe(true);
    expect(access.canApprove).toBe(true);
    expect(isBudgetLocked(view.budget, lockCtx)).toBe(false);
    expect(lockCtx.isLocked).toBe(false);
    expect(lockCtx.contractApplies).toBe(false);
    expect(lockCtx.hasReceivables).toBe(false);
    expect(lockCtx.hasActiveContract).toBe(false);

    const db = loadDb();
    const linkedReceivables = (db.accountsReceivable || []).filter(
      (r) => String(r.origin_id || '') === String(BUDGET_ID),
    );
    const linkedContracts = (db.generatedContracts || []).filter(
      (c) => c.budgetId === BUDGET_ID,
    );
    expect(linkedReceivables).toHaveLength(0);
    expect(linkedContracts).toHaveLength(0);
  });

  it('RASCUNHO com contrato assinado de orçamento anterior permanece editável', () => {
    seedPendingBudgetScenario({ budgetStatus: BUDGET_STATUS.RASCUNHO });

    closeClinicalAppointment(USER, {
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      budgetId: BUDGET_ID,
      reason: APPOINTMENT_CLOSE_REASON.ANALYZE_LATER,
    });

    const view = resolveBudgetForView(APPOINTMENT_ID, BUDGET_ID);
    expect(view.budget?.status).toBe(BUDGET_STATUS.RASCUNHO);
    expect(view.isReadOnly).toBe(false);
    expect(view.isHistoricalView).toBe(false);
    expect(view.mode).toBe('edit');
  });

  it('openExistingBudget do alerta usa mode edit (viewMode false)', () => {
    seedPendingBudgetScenario({ budgetStatus: BUDGET_STATUS.RASCUNHO });
    closeClinicalAppointment(USER, {
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      budgetId: BUDGET_ID,
      reason: APPOINTMENT_CLOSE_REASON.ANALYZE_LATER,
    });

    const navigate = vi.fn();
    const alert = buildPatientCareContextByPatient(PATIENT_ID).alerts
      .find((a) => a.id === 'pending-budget-decision');

    openExistingBudget(navigate, {
      budgetId: alert.budgetId,
      patientId: PATIENT_ID,
      appointmentId: alert.appointmentId,
      mode: 'edit',
    });

    expect(navigate).toHaveBeenCalledWith(
      `/atendimento-clinico/${APPOINTMENT_ID}?budgetId=${BUDGET_ID}`,
      expect.objectContaining({
        state: expect.objectContaining({
          budgetId: BUDGET_ID,
          viewMode: false,
          mode: 'edit',
        }),
      }),
    );
  });

  it('orçamento aprovado com contrato continua somente leitura', () => {
    seedPendingBudgetScenario({ budgetStatus: BUDGET_STATUS.APROVADO, withSignedContractOnPrevious: false });
    withDb((db) => {
      db.clinicalAppointments[0].budget.status = BUDGET_STATUS.APROVADO;
      db.generatedContracts = [{
        id: 'ctr-active',
        clinicId: 'clinic-1',
        quoteId: APPOINTMENT_ID,
        quoteSource: 'clinical_budget',
        budgetId: BUDGET_ID,
        status: CONTRACT_STATUS.SIGNED,
        patientId: PATIENT_ID,
        generatedAt: '2026-06-16T14:00:00.000Z',
      }];
    });

    const view = resolveBudgetForView(APPOINTMENT_ID, BUDGET_ID);
    expect(view.isReadOnly).toBe(true);
    expect(view.mode).toBe('readonly');
  });

  it('central expõe orçamento pendente para abertura', () => {
    seedPendingBudgetScenario({ budgetStatus: BUDGET_STATUS.RASCUNHO });
    const ctx = buildPatientCareContextByPatient(PATIENT_ID);
    expect(ctx.actions.pendingDecisionBudget?.id).toBe(BUDGET_ID);
    expect(ctx.actions.showOpenExistingBudget).toBe(true);
  });

  it('com ORC aprovado e orçamento pendente, primaryBudgetId aponta para o pendente', () => {
    seedPendingBudgetScenario({ budgetStatus: BUDGET_STATUS.NEGOCIACAO });
    withDb((db) => {
      db.clinicalAppointments[0].budgetHistory = [{
        id: 'budget-001',
        budgetNumber: 'ORC-001',
        status: BUDGET_STATUS.APROVADO,
        totalValue: 18000,
        approvedAt: '2026-06-10T10:00:00.000Z',
        archivedAt: '2026-06-14T10:00:00.000Z',
      }];
      db.generatedContracts = [{
        id: 'ctr-approved',
        clinicId: 'clinic-1',
        quoteId: APPOINTMENT_ID,
        quoteSource: 'clinical_budget',
        budgetId: 'budget-001',
        status: CONTRACT_STATUS.SIGNED,
        patientId: PATIENT_ID,
        generatedAt: '2026-06-10T11:00:00.000Z',
      }];
    });

    const ctx = buildPatientCareContextByPatient(PATIENT_ID);
    expect(ctx.actions.latestApprovedBudget?.id).toBe('budget-001');
    expect(ctx.actions.pendingDecisionBudget?.id).toBe(BUDGET_ID);
    expect(ctx.actions.primaryBudgetId).toBe(BUDGET_ID);
  });

  it('resolveBudgetNavigationId não substitui ORC inexistente por orçamento aprovado', () => {
    seedPendingBudgetScenario({ budgetStatus: BUDGET_STATUS.RASCUNHO });
    withDb((db) => {
      db.clinicalAppointments[0].budgetHistory = [{
        id: 'budget-approved-old',
        budgetNumber: 'ORC-001',
        status: BUDGET_STATUS.HISTORICO,
        totalValue: 1000,
        archivedAt: '2026-06-10T10:00:00.000Z',
      }];
    });

    const resolved = resolveBudgetNavigationId({
      budgetId: 'ORC-999',
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
    });
    expect(resolved).toBeNull();
  });
});
