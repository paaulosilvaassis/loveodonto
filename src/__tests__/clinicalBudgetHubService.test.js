import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import {
  listAllClinicalBudgetRows,
  getPatientBudgetOverview,
  resolveRowPatientId,
  resolveRowPatientName,
} from '../services/clinicalBudgetHubService.js';

describe('clinicalBudgetHubService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('listAllClinicalBudgetRows não quebra sem patientId global', () => {
    withDb((db) => {
      db.patients = [{ id: 'p1', full_name: 'Maria Silva', tenant_id: 'tenant-1' }];
      db.appointments = [{
        id: 'apt-1',
        patientId: 'p1',
        date: '2026-06-15',
        status: 'finalizado',
        tenant_id: 'tenant-1',
      }];
      db.clinicalAppointments = [{
        appointmentId: 'apt-1',
        patientId: 'p1',
        budget: {
          id: 'budget-1',
          status: BUDGET_STATUS.RASCUNHO,
          totalValue: 1200,
          createdAt: '2026-06-15T10:00:00.000Z',
          planName: 'Reabilitação oral',
        },
        budgetHistory: [],
      }];
    });

    const rows = listAllClinicalBudgetRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].patientId).toBe('p1');
    expect(rows[0].patientName).toBe('Maria Silva');
  });

  it('getPatientBudgetOverview retorna histórico do paciente informado', () => {
    withDb((db) => {
      db.patients = [{ id: 'p1', full_name: 'Maria Silva', tenant_id: 'tenant-1' }];
      db.appointments = [{
        id: 'apt-1',
        patientId: 'p1',
        date: '2026-06-15',
        status: 'finalizado',
        tenant_id: 'tenant-1',
      }];
      db.clinicalAppointments = [{
        appointmentId: 'apt-1',
        patientId: 'p1',
        budget: {
          id: 'budget-1',
          status: BUDGET_STATUS.RASCUNHO,
          totalValue: 1200,
          createdAt: '2026-06-15T10:00:00.000Z',
        },
        budgetHistory: [],
      }];
    });

    const overview = getPatientBudgetOverview('p1');
    expect(overview.history).toHaveLength(1);
    expect(overview.currentBudget?.id).toBe('budget-1');
  });

  it('resolveRowPatientId usa fallback e resolveRowPatientName trata ausência', () => {
    expect(resolveRowPatientId({ patient_id: 'p2' })).toBe('p2');
    expect(resolveRowPatientId({ patient: { id: 'p3' } })).toBe('p3');
    expect(resolveRowPatientId({})).toBeNull();
    expect(resolveRowPatientName({})).toBe('Paciente não identificado');
    expect(resolveRowPatientName({ patientId: 'p1', patientName: 'João' })).toBe('João');
  });
});
