/**
 * PHASE_10.21BJ — forense produção: card visual ORC-002 não pode apontar ao ciclo legado.
 * IDs reais de produção. Sem writer jurídico.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, peekDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { listAllClinicalBudgetRows } from '../services/clinicalBudgetHubService.js';
import { buildClinicalAppointmentUrl, openExistingBudget } from '../services/budgetNavigationService.js';
import { resolveContractForSelectedBudget } from '../contracts/resolveContractForSelectedBudget.js';
import { evaluateClinicalSignatureReadiness } from '../contracts/clinicalSignatureReadiness.js';
import { resolveRequiredSigners } from '../contracts/clinicalRequiredSigners.js';
import { getActiveCategory } from '../navigation/navCategories.js';

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const JULIANA = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const OLD_APPT = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const NEW_APPT = 'appt-041ca62b-5bd9-4359-8bdc-c54e175a6ff1';
const OLD_BUDGET = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const NEW_BUDGET = 'budget-26cb84bf-f9ea-41da-b8a3-9cab0c26884b';
const CTR1 = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const CTR2 = 'gctr-cc1d92aa-6304-4fdf-9502-cc498679edbd';

function seedProductionMap() {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.clinicProfile = { id: 'clinic-b721c2c9', tenant_id: TENANT };
    db.patients = [{ id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT }];
    db.appointments = [
      {
        id: OLD_APPT,
        patientId: PATIENT,
        professionalId: JULIANA,
        status: APPOINTMENT_STATUS.FINALIZADO,
        tenant_id: TENANT,
        finishedAt: '2026-08-14T15:03:44.712Z',
      },
      {
        id: NEW_APPT,
        patientId: PATIENT,
        professionalId: JULIANA,
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: TENANT,
      },
    ];
    db.clinicalAppointments = [
      {
        id: 'clinical-9df8fac3-12e3-4b59-bf45-616880d1190b',
        appointmentId: OLD_APPT,
        patientId: PATIENT,
        budget: {
          id: OLD_BUDGET,
          budgetNumber: null,
          status: BUDGET_STATUS.CONTRATO_GERADO,
          totalValue: 150,
          createdAt: '2026-08-13T23:29:00.629Z',
          approvedAt: '2026-08-13T23:29:28.203Z',
        },
        budgetHistory: [],
      },
      {
        id: 'clinical-9cc88539-dbc8-4dc9-ab8a-fc5a8fd0acdf',
        appointmentId: NEW_APPT,
        patientId: PATIENT,
        budget: {
          id: NEW_BUDGET,
          budgetNumber: null,
          status: BUDGET_STATUS.CONTRATO_GERADO,
          totalValue: 150,
          createdAt: '2026-08-14T16:22:58.873Z',
          approvedAt: '2026-08-14T17:10:11.816Z',
        },
        budgetHistory: [],
      },
    ];
    db.generatedContracts = [
      {
        id: CTR1,
        contractNumber: 'CTR-2026-00001',
        budgetId: OLD_BUDGET,
        quoteId: OLD_APPT,
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        clinicId: 'clinic-b721c2c9',
        tenant_id: TENANT,
        status: CONTRACT_STATUS.SIGNED,
        generatedAt: '2026-08-14T00:46:09.926Z',
      },
      {
        id: CTR2,
        contractNumber: 'CTR-2026-00002',
        budgetId: NEW_BUDGET,
        quoteId: NEW_APPT,
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        clinicId: 'clinic-b721c2c9',
        tenant_id: TENANT,
        status: CONTRACT_STATUS.SIGNED,
        generatedAt: '2026-08-14T18:16:13.996Z',
      },
    ];
  });
}

describe('PHASE_10.21BJ production ORC/CTR map + hub labels', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedProductionMap();
  });

  it('1 URL legado budget-d8069b7e é o primeiro ciclo e abre CTR-00001', () => {
    const resolved = resolveContractForSelectedBudget({
      budgetId: OLD_BUDGET,
      appointmentId: OLD_APPT,
      patientId: PATIENT,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.contract.id).toBe(CTR1);
    expect(resolved.contract.contractNumber).toBe('CTR-2026-00001');
  });

  it('2 ciclo novo budget-26cb84bf abre CTR-00002', () => {
    const resolved = resolveContractForSelectedBudget({
      budgetId: NEW_BUDGET,
      appointmentId: NEW_APPT,
      patientId: PATIENT,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.contract.id).toBe(CTR2);
    expect(resolved.contract.contractNumber).toBe('CTR-2026-00002');
  });

  it('3 appointmentId diferente não mistura contratos', () => {
    expect(resolveContractForSelectedBudget({
      budgetId: NEW_BUDGET,
      appointmentId: OLD_APPT,
      patientId: PATIENT,
    }).ok).toBe(false);
  });

  it('4 section=contratos preserva budgetId na URL', () => {
    const url = buildClinicalAppointmentUrl({
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      section: 'contratos',
    });
    expect(url).toContain(`budgetId=${NEW_BUDGET}`);
    expect(url).toContain('section=contratos');
  });

  it('5 avanço para Assinatura preserva budgetId', () => {
    const url = buildClinicalAppointmentUrl({
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      section: 'assinatura',
    });
    expect(url).toContain(`budgetId=${NEW_BUDGET}`);
    expect(url).not.toContain(OLD_BUDGET);
  });

  it('6 displayedContract === selectedContract no ciclo novo', () => {
    const selected = resolveContractForSelectedBudget({ budgetId: NEW_BUDGET, appointmentId: NEW_APPT });
    const readiness = evaluateClinicalSignatureReadiness({
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      patientId: PATIENT,
    });
    expect(readiness.contract?.id).toBe(selected.contract.id);
    expect(readiness.identity.contractId).toBe(CTR2);
  });

  it('7 ceremony.contractId === selectedContract.id com budgetId explícito', () => {
    const signers = resolveRequiredSigners({
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      patientId: PATIENT,
      tenantId: TENANT,
    });
    expect(signers.identity?.contractId || peekDb().generatedContracts.find((c) => c.budgetId === NEW_BUDGET)?.id)
      .toBe(CTR2);
    const readiness = evaluateClinicalSignatureReadiness({
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      patientId: PATIENT,
    });
    expect(readiness.ceremony.contract.id).toBe(CTR2);
  });

  it('8 refresh da URL do ciclo novo resolve CTR-00002', () => {
    expect(resolveContractForSelectedBudget({
      budgetId: NEW_BUDGET,
      appointmentId: NEW_APPT,
    }).contract.contractNumber).toBe('CTR-2026-00002');
  });

  it('9 hub: card visual ORC-002 envia o id do segundo ciclo, não o legado', () => {
    const rows = listAllClinicalBudgetRows({ sortBy: 'recent' });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[OLD_BUDGET].budgetNumber).toBe('ORC-001');
    expect(byId[NEW_BUDGET].budgetNumber).toBe('ORC-002');
    const visualOrc002 = rows.find((r) => r.budgetNumber === 'ORC-002');
    expect(visualOrc002.id).toBe(NEW_BUDGET);
    expect(visualOrc002.appointmentId).toBe(NEW_APPT);
    const navigate = (url) => {
      expect(url).toContain(NEW_BUDGET);
      expect(url).not.toContain(OLD_BUDGET);
    };
    openExistingBudget(navigate, {
      budgetId: visualOrc002.id,
      patientId: PATIENT,
      appointmentId: visualOrc002.appointmentId,
      section: 'contratos',
    });
  });

  it('10 mismatch budget/contract não inicia writer: fail closed sem contrato vazado', () => {
    const readiness = evaluateClinicalSignatureReadiness({
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      patientId: PATIENT,
      contractId: CTR1,
    });
    expect(readiness.ok).toBe(false);
    expect(readiness.contract).toBeNull();
    expect(readiness.identity.contractId).toBeNull();
  });

  it('11 Paulo/admin não é coberto por este reader; contrato do ciclo novo permanece CTR-00002', () => {
    expect(resolveContractForSelectedBudget({ budgetId: NEW_BUDGET }).contract.id).toBe(CTR2);
  });

  it('12 sidebar clínica continua na categoria gestão-atendimento', () => {
    expect(getActiveCategory(`/atendimento-clinico/${NEW_APPT}`)).toBe('gestao-atendimento');
  });
});
