/**
 * Guardas de estabilidade do fluxo comercial aprovado.
 * Complementa fullBudgetContractFlowValidation.test.js com asserções focadas.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  addPlannedProcedure,
  saveBudget,
  updateBudgetStatus,
  getBudget,
} from '../services/clinicalService.js';
import { processApprovedBudgetFinance } from '../services/clinicalBudgetFinance.js';
import {
  ensureContractsModuleSeeded,
  createContractDraft,
  getContractStatusForQuote,
} from '../services/contractModuleService.js';
import {
  createNewBudgetForAppointment,
  listPatientBudgetHistory,
  markBudgetContractGenerated,
} from '../services/clinicalBudgetLockService.js';
import { buildPatientExecutiveSummary } from '../services/patientCareExecutiveSummaryService.js';
import { resolveBudgetForView } from '../services/budgetNavigationService.js';
import { canAccessContract } from '../components/clinical/contract/contractAccessUtils.js';
import { getBudgetLockContextForBudget } from '../services/clinicalBudgetLockService.js';
import { isTechnicalId } from '../utils/friendlyNumbers.js';
import { DEFAULT_PAYMENT_OPTIONS } from '../components/clinical/clinicalAppointmentConfig.js';
import { createId } from '../services/helpers.js';

const user = { id: 'user-guard', name: 'Guard', tenant_id: 'tenant-1', role: 'admin' };
const PATIENT_ID = 'patient-guard-1';
const APPOINTMENT_ID = 'apt-guard-1';
const VALUE = 18000;

function seedAndRunFlow() {
  withDb((db) => {
    db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: 'tenant-1', razaoSocial: 'Clínica Guard' };
    db.clinicDocumentation = {
      cnpj: '12345678000199',
      responsavelTecnico: 'Dr. Guard',
      conselhoRegionalNumero: 'CRO-MG 11111',
    };
    db.clinicAddresses = [{
      principal: true,
      logradouro: 'Rua Guard',
      numero: '1',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
    }];
    db.patients = [{ id: PATIENT_ID, tenant_id: 'tenant-1', full_name: 'Paciente Guard' }];
    db.appointments = [{
      id: APPOINTMENT_ID,
      tenant_id: 'tenant-1',
      patientId: PATIENT_ID,
      professionalId: 'prof-1',
      date: '2026-06-16',
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    }];
    db.collaborators = [{ id: 'prof-1', tenant_id: 'tenant-1', nomeCompleto: 'Dr.' }];
  });
  ensureContractsModuleSeeded();

  addPlannedProcedure(user, APPOINTMENT_ID, {
    name: 'Prótese',
    quantity: 1,
    unitValue: VALUE,
    totalValue: VALUE,
  });

  const clinical = loadDb().clinicalAppointments.find((c) => c.appointmentId === APPOINTMENT_ID);
  const procedures = clinical?.plannedProcedures || [];

  const paymentOptions = DEFAULT_PAYMENT_OPTIONS().map((o, i) => ({
    ...o,
    total: VALUE,
    ...(i === 0 ? { presentToPatient: true, accepted: true, presentationStatus: 'escolhida' } : {}),
  }));

  saveBudget(user, APPOINTMENT_ID, {
    status: BUDGET_STATUS.RASCUNHO,
    planName: 'Plano',
    procedures: procedures.map((p) => ({
      id: createId('proc'),
      name: p.name,
      quantity: 1,
      unitValue: VALUE,
      totalValue: VALUE,
    })),
    paymentOptions,
    totalValue: VALUE,
    professionalId: 'prof-1',
  });

  updateBudgetStatus(user, APPOINTMENT_ID, BUDGET_STATUS.APROVADO);
  const approved = { ...getBudget(APPOINTMENT_ID), status: BUDGET_STATUS.APROVADO };

  processApprovedBudgetFinance(user, {
    appointmentId: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    patient: loadDb().patients[0],
    budget: approved,
    professional: { id: 'prof-1' },
  });
  saveBudget(user, APPOINTMENT_ID, approved, { skipLockCheck: true });

  const tpl = loadDb().contractTemplates.find((t) => t.type === 'system_default');
  const contract = createContractDraft(user, {
    quoteSource: 'clinical_budget',
    quoteId: APPOINTMENT_ID,
    patientId: PATIENT_ID,
    budgetId: approved.id,
    templateId: tpl.id,
    editedHtml: '<p>Contrato</p>',
    skipHashtagValidation: true,
  });
  markBudgetContractGenerated(user, APPOINTMENT_ID);

  const originalBudgetId = approved.id;
  const originalContractId = contract.id;

  createNewBudgetForAppointment(user, APPOINTMENT_ID);

  return { originalBudgetId, originalContractId };
}

describe('guardas de estabilidade — orçamento/contrato/financeiro', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('não expõe ids técnicos nos rótulos da Central', () => {
    const { originalBudgetId, originalContractId } = seedAndRunFlow();
    const summary = buildPatientExecutiveSummary(PATIENT_ID, { patientName: 'Paciente Guard' });

    expect(summary.activeBudget?.budgetId).toBe(originalBudgetId);
    expect(summary.activeContract?.contractId).toBe(originalContractId);
    expect(isTechnicalId(summary.activeBudget?.label)).toBe(false);
    expect(isTechnicalId(summary.activeContract?.label)).toBe(false);
    expect(summary.activeBudget?.label).toMatch(/^ORC-/i);
    expect(summary.activeContract?.label).toMatch(/^CTR-/i);
  });

  it('orçamento histórico abre em modo somente leitura', () => {
    const { originalBudgetId } = seedAndRunFlow();
    const view = resolveBudgetForView(APPOINTMENT_ID, originalBudgetId);
    expect(view.isHistoricalView).toBe(true);
    expect(view.budget?.totalValue).toBe(VALUE);
    expect(view.budget?.status).toBe(BUDGET_STATUS.HISTORICO);
  });

  it('contrato antigo permanece acessível após novo orçamento', () => {
    const { originalBudgetId, originalContractId } = seedAndRunFlow();
    const contract = getContractStatusForQuote(
      APPOINTMENT_ID,
      'clinical_budget',
      originalBudgetId,
      PATIENT_ID,
    );
    expect(contract?.id).toBe(originalContractId);
    expect(contract?.status).not.toBe(CONTRACT_STATUS.REPLACED);

    const historical = resolveBudgetForView(APPOINTMENT_ID, originalBudgetId);
    const lock = getBudgetLockContextForBudget(APPOINTMENT_ID, historical.budget);
    expect(canAccessContract(historical.budget, lock)).toBe(true);
  });

  it('financeiro permanece vinculado ao orçamento arquivado', () => {
    const { originalBudgetId } = seedAndRunFlow();
    const history = listPatientBudgetHistory(PATIENT_ID);
    const archived = history.find((row) => row.id === originalBudgetId);
    expect(archived).toBeTruthy();
    expect(archived.status).toBe(BUDGET_STATUS.HISTORICO);

    const receivables = (loadDb().accountsReceivable || []).filter(
      (r) => r.patient_id === PATIENT_ID && String(r.origin_id) === String(originalBudgetId),
    );
    expect(receivables.length).toBeGreaterThan(0);
  });
});
