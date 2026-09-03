/**
 * PERF.ROUTES.4 — índice request-scoped de contratos/locks no hub de orçamentos.
 * Garante: sem loadDb/deep-clone no loop de rows; scans de contracts constantes;
 * debug log silenciado no caminho normal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { getContractStatusForQuote } from '../services/contractModuleService.js';
import {
  __getBudgetHubPerfCountersForTest,
  __resetBudgetHubPerfCountersForTest,
  listAllClinicalBudgetRows,
  listClinicalBudgetHubBaseData,
  listBudgetHubRowsFromBaseData,
} from '../services/clinicalBudgetHubService.js';

const TENANT = 'tenant-1';
const CLINIC = 'clinic-1';

function seedBudgets({ budgetCount, patients = 50, withContracts = true }) {
  withDb((db) => {
    db.clinicProfile = { ...(db.clinicProfile || {}), id: CLINIC };
    db.patients = Array.from({ length: patients }, (_, i) => ({
      id: `p-${i}`,
      full_name: `Paciente ${i}`,
      tenant_id: TENANT,
    }));
    db.collaborators = [{ id: 'col-1', nomeCompleto: 'Dr Teste', active: true }];
    db.rooms = [{ id: 'room-1', name: 'Sala 1', active: true }];
    db.accountsReceivable = [];
    db.financings = [];

    const clinicalAppointments = [];
    const appointments = [];
    const generatedContracts = [];

    for (let i = 0; i < budgetCount; i += 1) {
      const patientId = `p-${i % patients}`;
      const apptId = `appt-b-${i}`;
      const budgetId = `budget-${i}`;
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

      const status = i % 11 === 0
        ? BUDGET_STATUS.APROVADO
        : i % 5 === 0
          ? BUDGET_STATUS.CONTRATO_GERADO
          : BUDGET_STATUS.RASCUNHO;

      clinicalAppointments.push({
        appointmentId: apptId,
        patientId,
        budget: {
          id: budgetId,
          status,
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

      if (withContracts && (i % 5 === 0 || i % 11 === 0)) {
        generatedContracts.push({
          id: `ctr-${i}`,
          clinicId: CLINIC,
          quoteId: apptId,
          quoteSource: 'clinical_budget',
          budgetId,
          patientId,
          status: i % 5 === 0 ? CONTRACT_STATUS.GENERATED : CONTRACT_STATUS.SIGNED,
          contractNumber: `CTR-${i}`,
          generatedAt: '2026-06-10T10:00:00.000Z',
        });
      }
    }

    db.appointments = appointments;
    db.clinicalAppointments = clinicalAppointments;
    db.generatedContracts = generatedContracts;
    return db;
  });
}

describe('PERF.ROUTES.4 budget lock/contract request-scoped index', () => {
  beforeEach(async () => {
    localStorage.clear();
    delete globalThis.__LOVE_BUDGET_LOCK_DEBUG__;
    await resetDb();
    await initDb();
    __resetBudgetHubPerfCountersForTest();
  });

  it('não chama loadDb no loop de rows (>= 400 budgets)', () => {
    seedBudgets({ budgetCount: 400, patients: 50 });
    __resetBudgetHubPerfCountersForTest();

    const rows = listAllClinicalBudgetRows({});
    expect(rows.length).toBeGreaterThanOrEqual(400);

    const counters = __getBudgetHubPerfCountersForTest();
    expect(counters.loadDbInRowLoop).toBe(0);
    expect(counters.contractCollectionScans).toBe(1);
    expect(counters.contractStatusCalls).toBe(rows.length);
    expect(counters.lockContextCalls).toBe(rows.length);
  }, 30000);

  it('scans de contracts permanecem constantes ao dobrar rows', async () => {
    seedBudgets({ budgetCount: 200, patients: 40 });
    __resetBudgetHubPerfCountersForTest();
    const rowsA = listAllClinicalBudgetRows({});
    const scansA = __getBudgetHubPerfCountersForTest().contractCollectionScans;

    localStorage.clear();
    await resetDb();
    await initDb();
    seedBudgets({ budgetCount: 400, patients: 50 });
    __resetBudgetHubPerfCountersForTest();
    const rowsB = listAllClinicalBudgetRows({});
    const scansB = __getBudgetHubPerfCountersForTest().contractCollectionScans;

    expect(rowsB.length).toBeGreaterThan(rowsA.length);
    expect(scansA).toBe(1);
    expect(scansB).toBe(1);
  }, 30000);

  it('caminho canônico do hub: 0 loadDb no row loop + 1 contract scan', () => {
    seedBudgets({ budgetCount: 120, patients: 30 });
    __resetBudgetHubPerfCountersForTest();

    const base = listClinicalBudgetHubBaseData();
    const rows = listBudgetHubRowsFromBaseData(base.rawRows, {});
    const counters = __getBudgetHubPerfCountersForTest();

    expect(rows.length).toBe(base.rawRows.length);
    expect(counters.loadDbInRowLoop).toBe(0);
    expect(counters.contractCollectionScans).toBe(1);
    expect(counters.contractStatusCalls).toBe(rows.length);
  });

  it('não emite [BUDGET LOCK DEBUG] no caminho normal', () => {
    seedBudgets({ budgetCount: 80, patients: 20 });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    listAllClinicalBudgetRows({});

    const debugCalls = spy.mock.calls.filter(
      (args) => String(args[0] || '').includes('[BUDGET LOCK DEBUG]'),
    );
    expect(debugCalls.length).toBe(0);
    spy.mockRestore();
  });

  it('preserva contractId/status vs getContractStatusForQuote no mesmo snapshot', () => {
    seedBudgets({ budgetCount: 60, patients: 15 });
    const base = listClinicalBudgetHubBaseData();
    const rows = listBudgetHubRowsFromBaseData(base.rawRows, {});
    const db = loadDb();

    for (const row of rows.slice(0, 40)) {
      const expected = getContractStatusForQuote(
        row.appointmentId,
        'clinical_budget',
        row.id,
        null,
        db,
      );
      expect(row.contractId).toBe(expected?.id || null);
      expect(row.contractStatus).toBe(expected?.status || null);
    }
  });
});
