import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { buildPatientExecutiveSummary } from '../services/patientCareExecutiveSummaryService.js';
import { buildPatientCareContextByPatient } from '../services/patientCareCentralService.js';
import { getLatestApprovedBudget } from '../services/clinicalBudgetApprovedService.js';
import { resolveBudgetNavigationId } from '../services/budgetNavigationService.js';

describe('patient care budget navigation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
    });
  });

  function seedArchivedApprovedWithNewDraft() {
    withDb((db) => {
      db.patients = [{ id: 'p1', full_name: 'Paciente Teste', tenant_id: 'tenant-1' }];
      db.appointments = [{
        id: 'apt-1',
        tenant_id: 'tenant-1',
        patientId: 'p1',
        date: '2026-06-15',
        status: 'finalizado',
        finishedAt: '2026-06-16T12:00:00.000Z',
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
          procedures: [{
            id: 'proc-1',
            name: 'Implante',
            quantity: 1,
            unitValue: 25000,
            totalValue: 25000,
          }],
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
    });
  }

  it('executive summary aponta orçamento aprovado arquivado, não o rascunho vazio', () => {
    seedArchivedApprovedWithNewDraft();

    const latest = getLatestApprovedBudget('p1');
    expect(latest?.id).toBe('budget-approved');
    expect(latest?.totalAmount).toBe(25000);

    const summary = buildPatientExecutiveSummary('p1', { patientName: 'Paciente Teste' });
    expect(summary.activeBudget?.budgetId).toBe('budget-approved');
    expect(summary.activeBudget?.value).toBe(25000);
    expect(summary.activeBudget?.budgetNumber).toMatch(/^ORC-/);
    expect(summary.activeBudget?.appointmentId).toBe('apt-1');
  });

  it('contexto da central expõe primaryBudgetId para abrir orçamento', () => {
    seedArchivedApprovedWithNewDraft();

    const ctx = buildPatientCareContextByPatient('p1');
    expect(ctx.actions.showOpenExistingBudget).toBe(true);
    expect(ctx.actions.primaryBudgetId).toBe('budget-approved');
    expect(ctx.executiveSummary?.activeBudget?.budgetId).toBe('budget-approved');
  });

  it('resolveBudgetNavigationId usa orçamento aprovado quando id ausente', () => {
    seedArchivedApprovedWithNewDraft();

    const resolved = resolveBudgetNavigationId({ patientId: 'p1', appointmentId: 'apt-1' });
    expect(resolved).toBe('budget-approved');
  });
});
