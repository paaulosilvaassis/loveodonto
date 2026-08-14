/**
 * PHASE_10.21AT — sequência ORC por paciente.
 * Orçamento legado sem budgetNumber persistido ocupa o slot ORC-001.
 * O próximo ciclo deve persistir ORC-002 sem mutar o legado.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { saveBudget, getBudget } from '../services/clinicalService.js';
import {
  allocateNextBudgetDisplayNumber,
  createNewBudgetForAppointment,
  listPatientBudgetHistory,
} from '../services/clinicalBudgetLockService.js';

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const OTHER_PATIENT = 'patient-other-at';
const LEGACY_APPT = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const LEGACY_CLINICAL = 'clinical-9df8fac3-12e3-4b59-bf45-616880d1190b';
const LEGACY_BUDGET = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const NEW_APPT = 'appt-at-new-cycle';
const USER = { id: 'user-at', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin' };

function seedLegacy({ extraClinical = [] } = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.patients = [
      { id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT },
      { id: OTHER_PATIENT, full_name: 'Outro Paciente', tenant_id: TENANT },
    ];
    db.appointments = [
      {
        id: LEGACY_APPT,
        patientId: PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.FINALIZADO,
        tenant_id: TENANT,
      },
      {
        id: NEW_APPT,
        patientId: PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: TENANT,
      },
    ];
    db.clinicalAppointments = [
      {
        id: LEGACY_CLINICAL,
        appointmentId: LEGACY_APPT,
        patientId: PATIENT,
        budget: {
          id: LEGACY_BUDGET,
          budgetNumber: null,
          status: BUDGET_STATUS.CONTRATO_GERADO,
          totalValue: 150,
          createdAt: '2026-08-13T20:00:00.000Z',
        },
      },
      ...extraClinical,
    ];
  });
}

function snapshotLegacy() {
  const db = loadDb();
  const clinical = db.clinicalAppointments.find((c) => c.id === LEGACY_CLINICAL);
  return JSON.stringify({
    id: clinical?.budget?.id,
    budgetNumber: clinical?.budget?.budgetNumber ?? null,
    status: clinical?.budget?.status,
    totalValue: clinical?.budget?.totalValue,
  });
}

describe('PHASE_10.21AT — sequência ORC por paciente', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('legado sem budgetNumber ocupa o slot; próximo persistido é ORC-002', () => {
    seedLegacy();
    const next = allocateNextBudgetDisplayNumber(
      { appointmentId: NEW_APPT, patientId: PATIENT },
      loadDb(),
    );
    expect(next).toBe('ORC-002');
    expect(listPatientBudgetHistory(PATIENT)[0].budgetNumber).toBe('ORC-001');
  });

  it('saveBudget no ciclo novo persiste ORC-002 e não muta o legado', () => {
    seedLegacy();
    const before = snapshotLegacy();

    saveBudget(USER, NEW_APPT, {
      status: BUDGET_STATUS.RASCUNHO,
      procedures: [{ id: 'proc-fluor', name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
    });

    const created = getBudget(NEW_APPT);
    expect(created.id).not.toBe(LEGACY_BUDGET);
    expect(created.budgetNumber).toBe('ORC-002');
    expect(snapshotLegacy()).toBe(before);

    const history = listPatientBudgetHistory(PATIENT);
    expect(history.map((row) => row.budgetNumber).sort()).toEqual(['ORC-001', 'ORC-002']);
  });

  it('saveBudget no orçamento legado unlabeled não grava número histórico', () => {
    seedLegacy();

    saveBudget(USER, LEGACY_APPT, {
      id: LEGACY_BUDGET,
      status: BUDGET_STATUS.CONTRATO_GERADO,
      procedures: [{ id: 'proc-legacy', name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
    }, { skipLockCheck: true });

    const legacy = getBudget(LEGACY_APPT);
    expect(legacy.id).toBe(LEGACY_BUDGET);
    expect(legacy.budgetNumber == null).toBe(true);
  });

  it('regenerar orçamento no mesmo atendimento preserva ORC-002', () => {
    seedLegacy();
    saveBudget(USER, NEW_APPT, {
      status: BUDGET_STATUS.RASCUNHO,
      procedures: [{ id: 'proc-1', name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
    });
    const firstId = getBudget(NEW_APPT).id;

    saveBudget(USER, NEW_APPT, {
      status: BUDGET_STATUS.RASCUNHO,
      procedures: [{ id: 'proc-1', name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
    });

    const again = getBudget(NEW_APPT);
    expect(again.id).toBe(firstId);
    expect(again.budgetNumber).toBe('ORC-002');
    expect(getBudget(LEGACY_APPT).budgetNumber == null).toBe(true);
  });

  it('createNewBudgetForAppointment em atendimento novo também gera ORC-002', () => {
    seedLegacy();
    withDb((db) => {
      db.clinicalAppointments.push({
        id: 'clinical-at-new',
        appointmentId: NEW_APPT,
        patientId: PATIENT,
      });
    });

    const created = createNewBudgetForAppointment(USER, NEW_APPT);
    expect(created.budgetNumber).toBe('ORC-002');
    expect(created.id).not.toBe(LEGACY_BUDGET);
    expect(getBudget(LEGACY_APPT).id).toBe(LEGACY_BUDGET);
    expect(getBudget(LEGACY_APPT).budgetNumber == null).toBe(true);
  });

  it('orçamento de outro paciente não consome a sequência', () => {
    seedLegacy({
      extraClinical: [{
        id: 'clinical-other',
        appointmentId: 'appt-other',
        patientId: OTHER_PATIENT,
        budget: { id: 'budget-other', budgetNumber: 'ORC-009', status: BUDGET_STATUS.RASCUNHO },
      }],
    });
    withDb((db) => {
      db.appointments.push({
        id: 'appt-other',
        patientId: OTHER_PATIENT,
        tenant_id: TENANT,
      });
    });

    expect(allocateNextBudgetDisplayNumber({ patientId: PATIENT }, loadDb())).toBe('ORC-002');
  });
});
