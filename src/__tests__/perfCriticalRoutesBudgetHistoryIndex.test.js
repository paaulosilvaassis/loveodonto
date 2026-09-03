/**
 * PERF.ROUTES.3 — índice request-scoped de histórico de orçamentos.
 * Garante que o scan completo do histórico NÃO cresce com o número de rows.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { listPatientBudgetHistory } from '../services/clinicalBudgetLockService.js';
import {
  __getBudgetHubPerfCountersForTest,
  __resetBudgetHubPerfCountersForTest,
  listAllClinicalBudgetRows,
  listClinicalBudgetHubBaseData,
  listBudgetHubRowsFromBaseData,
} from '../services/clinicalBudgetHubService.js';

const TENANT = 'tenant-1';

function seedBudgets({ budgetCount, patients = 50 }) {
  withDb((db) => {
    db.patients = Array.from({ length: patients }, (_, i) => ({
      id: `p-${i}`,
      full_name: `Paciente ${i}`,
      tenant_id: TENANT,
    }));
    db.collaborators = [{ id: 'col-1', nomeCompleto: 'Dr Teste', active: true }];
    db.rooms = [{ id: 'room-1', name: 'Sala 1', active: true }];
    db.generatedContracts = [];
    db.accountsReceivable = [];

    const clinicalAppointments = [];
    const appointments = [];
    for (let i = 0; i < budgetCount; i += 1) {
      const patientId = `p-${i % patients}`;
      const apptId = `appt-b-${i}`;
      appointments.push({
        id: apptId,
        patientId,
        professionalId: 'col-1',
        roomId: 'room-1',
        date: '2026-06-15',
        startTime: '09:00',
        endTime: '09:30',
        status: 'finalizado',
        tenant_id: TENANT,
      });
      clinicalAppointments.push({
        appointmentId: apptId,
        patientId,
        budget: {
          id: `budget-${i}`,
          status: BUDGET_STATUS.RASCUNHO,
          totalValue: 1000 + i,
          createdAt: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
          planName: 'Plano',
          professionalId: 'col-1',
        },
        budgetHistory: i % 7 === 0
          ? [{
            id: `budget-arch-${i}`,
            status: BUDGET_STATUS.HISTORICO,
            totalValue: 500,
            createdAt: '2026-05-01T10:00:00.000Z',
            archivedAt: '2026-05-20T10:00:00.000Z',
            planName: 'Plano antigo',
            professionalId: 'col-1',
          }]
          : [],
      });
    }
    db.appointments = appointments;
    db.clinicalAppointments = clinicalAppointments;
    return db;
  });
}

describe('PERF.ROUTES.3 budget history request-scoped index', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    __resetBudgetHubPerfCountersForTest();
  });

  it('número de full scans permanece constante ao dobrar rows', async () => {
    seedBudgets({ budgetCount: 200, patients: 40 });
    __resetBudgetHubPerfCountersForTest();
    const rowsA = listAllClinicalBudgetRows({});
    const scansA = __getBudgetHubPerfCountersForTest().historyFullScans;

    localStorage.clear();
    await resetDb();
    await initDb();
    seedBudgets({ budgetCount: 400, patients: 50 });
    __resetBudgetHubPerfCountersForTest();
    const rowsB = listAllClinicalBudgetRows({});
    const scansB = __getBudgetHubPerfCountersForTest().historyFullScans;

    expect(rowsB.length).toBeGreaterThan(rowsA.length);
    expect(scansA).toBe(1);
    expect(scansB).toBe(1);
  }, 30000);

  it('faz no máximo 1 full scan de histórico para >= 400 budgets', () => {
    seedBudgets({ budgetCount: 400, patients: 50 });
    __resetBudgetHubPerfCountersForTest();

    const rows = listAllClinicalBudgetRows({});
    expect(rows.length).toBeGreaterThanOrEqual(400);

    const counters = __getBudgetHubPerfCountersForTest();
    // 1 scan para construir o índice; lookups O(1) por row.
    expect(counters.historyFullScans).toBe(1);
    expect(counters.historyLookups).toBe(rows.length);
  }, 30000);

  it('caminho canônico do hub usa índice (lookups == rows, scans == 1)', () => {
    seedBudgets({ budgetCount: 120, patients: 30 });
    __resetBudgetHubPerfCountersForTest();

    const base = listClinicalBudgetHubBaseData();
    const rows = listBudgetHubRowsFromBaseData(base.rawRows, {});
    const counters = __getBudgetHubPerfCountersForTest();

    expect(rows.length).toBe(base.rawRows.length);
    expect(counters.historyFullScans).toBe(1);
    expect(counters.historyLookups).toBe(rows.length);
  });

  it('preserva equivalência de budgetNumber vs listPatientBudgetHistory', () => {
    seedBudgets({ budgetCount: 80, patients: 20 });
    const base = listClinicalBudgetHubBaseData();
    const rows = listBudgetHubRowsFromBaseData(base.rawRows, {});

    for (const row of rows.slice(0, 40)) {
      if (!row.patientId) continue;
      const history = listPatientBudgetHistory(row.patientId);
      const match = history.find((h) => h.id === row.id);
      expect(match).toBeTruthy();
      expect(row.budgetNumber).toBe(match.budgetNumber);
    }
  });
});
