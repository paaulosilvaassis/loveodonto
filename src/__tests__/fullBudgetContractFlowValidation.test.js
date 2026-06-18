import { describe, expect, it, beforeEach, vi } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  addPlannedProcedure,
  saveBudget,
  updateBudgetStatus,
  getBudget,
  getClinicalData,
} from '../services/clinicalService.js';
import { processApprovedBudgetFinance } from '../services/clinicalBudgetFinance.js';
import {
  ensureContractsModuleSeeded,
  createContractDraft,
} from '../services/contractModuleService.js';
import {
  createNewBudgetForAppointment,
  listPatientBudgetHistory,
  markBudgetContractGenerated,
} from '../services/clinicalBudgetLockService.js';
import { buildPatientCareContextByPatient } from '../services/patientCareCentralService.js';
import { buildPatientExecutiveSummary } from '../services/patientCareExecutiveSummaryService.js';
import {
  openExistingBudget,
  openExistingContract,
  resolveBudgetForView,
  buildClinicalAppointmentUrl,
} from '../services/budgetNavigationService.js';
import { getContractStatusForQuote } from '../services/contractModuleService.js';
import { canAccessContract } from '../components/clinical/contract/contractAccessUtils.js';
import { getBudgetLockContextForBudget } from '../services/clinicalBudgetLockService.js';
import { getClinicalWorkflowState } from '../components/clinical/clinicalAppointmentConfig.js';
import { isTechnicalId } from '../utils/friendlyNumbers.js';
import { DEFAULT_PAYMENT_OPTIONS } from '../components/clinical/clinicalAppointmentConfig.js';
import { createId } from '../services/helpers.js';

const user = {
  id: 'user-1',
  name: 'Dr. Validação',
  tenant_id: 'tenant-1',
  role: 'admin',
};

const PATIENT_ID = 'patient-flow-1';
const APPOINTMENT_ID = 'apt-flow-1';
const PROCEDURE_VALUE = 25000;

function seedBaseClinicAndPatient() {
  withDb((db) => {
    db.tenants = [{ id: 'tenant-1', name: 'Clínica Validação', status: 'active' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: 'tenant-1', razaoSocial: 'Clínica Validação' };
    db.clinicDocumentation = {
      cnpj: '12345678000199',
      responsavelTecnico: 'Dr. Responsável Técnico',
      conselhoRegionalNumero: 'CRO-MG 00001',
    };
    db.clinicAddresses = [{
      principal: true,
      logradouro: 'Rua Teste',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30100000',
    }];
    db.collaborators = [{
      id: 'prof-1',
      tenant_id: 'tenant-1',
      nomeCompleto: 'Dr. Responsável',
      conselhoNumero: '12345',
    }];
    db.patients = [{
      id: PATIENT_ID,
      tenant_id: 'tenant-1',
      full_name: 'Paciente Fluxo Completo',
      cpf: '52998224725',
      birth_date: '1990-05-10',
      sex: 'M',
    }];
    db.patientAddresses = [{
      patient_id: PATIENT_ID,
      principal: true,
      logradouro: 'Rua Paciente',
      numero: '50',
      bairro: 'Savassi',
      cidade: 'Belo Horizonte',
      uf: 'MG',
    }];
    db.appointments = [{
      id: APPOINTMENT_ID,
      tenant_id: 'tenant-1',
      patientId: PATIENT_ID,
      professionalId: 'prof-1',
      date: '2026-06-16',
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      startTime: '09:00',
      endTime: '10:00',
    }];
  });
  ensureContractsModuleSeeded();
}

function assertNoTechnicalIdsInUserFacingLabels(summary) {
  const fields = [
    summary?.activeBudget?.label,
    summary?.activeBudget?.budgetNumber,
    summary?.activeContract?.label,
    summary?.activeContract?.contractNumber,
  ].filter(Boolean);

  for (const label of fields) {
    expect(isTechnicalId(label)).toBe(false);
    expect(String(label)).toMatch(/^(ORC|CTR)-/i);
  }
}

describe('validação fluxo completo orçamento → contrato → financeiro', () => {
  let originalBudgetId;
  let originalContractId;
  let navigateMock;

  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedBaseClinicAndPatient();
    navigateMock = vi.fn();
  });

  it('executa os 17 passos do fluxo comercial sem perda de vínculo', () => {
    // 1. Planejamento com procedimentos
    addPlannedProcedure(user, APPOINTMENT_ID, {
      name: 'Implante unitário',
      quantity: 1,
      unitValue: PROCEDURE_VALUE,
      totalValue: PROCEDURE_VALUE,
    });

    const clinicalAfterPlanning = getClinicalData(APPOINTMENT_ID);
    expect(clinicalAfterPlanning?.plannedProcedures?.length).toBe(1);

    // 2. Gerar orçamento
    const planned = clinicalAfterPlanning.plannedProcedures;
    const paymentOptions = DEFAULT_PAYMENT_OPTIONS().map((o) => ({
      ...o,
      total: PROCEDURE_VALUE,
    }));

    const draftBudget = {
      status: BUDGET_STATUS.RASCUNHO,
      planName: 'Reabilitação oral',
      procedures: planned.map((p) => ({
        id: createId('proc'),
        name: p.name,
        quantity: 1,
        unitValue: PROCEDURE_VALUE,
        totalValue: PROCEDURE_VALUE,
      })),
      paymentOptions,
      totalValue: PROCEDURE_VALUE,
      professionalId: 'prof-1',
    };

    saveBudget(user, APPOINTMENT_ID, draftBudget);
    let budget = getBudget(APPOINTMENT_ID);
    expect(budget).toBeTruthy();
    expect(budget.procedures).toHaveLength(1);
    expect(budget.totalValue).toBe(PROCEDURE_VALUE);
    originalBudgetId = budget.id;

    // 3. Apresentar condição de pagamento
    const presentedOptions = budget.paymentOptions.map((opt, index) => (
      index === 0
        ? {
          ...opt,
          presentToPatient: true,
          presentedAt: new Date().toISOString(),
          presentationStatus: 'apresentada',
        }
        : opt
    ));
    saveBudget(user, APPOINTMENT_ID, { ...budget, paymentOptions: presentedOptions });
    budget = getBudget(APPOINTMENT_ID);
    expect(budget.paymentOptions[0].presentToPatient).toBe(true);

    // 4. Marcar condição escolhida
    const chosenOptions = budget.paymentOptions.map((opt, index) => (
      index === 0
        ? {
          ...opt,
          accepted: true,
          presentationStatus: 'escolhida',
        }
        : { ...opt, accepted: false }
    ));
    saveBudget(user, APPOINTMENT_ID, { ...budget, paymentOptions: chosenOptions });
    budget = getBudget(APPOINTMENT_ID);
    expect(budget.paymentOptions[0].accepted).toBe(true);

    // 5. Aprovar orçamento
    saveBudget(user, APPOINTMENT_ID, { ...budget, id: budget.id || createId('budget') });
    updateBudgetStatus(user, APPOINTMENT_ID, BUDGET_STATUS.APROVADO);

    const approvedBudget = {
      ...getBudget(APPOINTMENT_ID),
      status: BUDGET_STATUS.APROVADO,
      approvedAt: new Date().toISOString(),
    };

    // 6. Gerar financeiro
    const { receivables, financing } = processApprovedBudgetFinance(user, {
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      patient: loadDb().patients.find((p) => p.id === PATIENT_ID),
      budget: approvedBudget,
      professional: { id: 'prof-1' },
    });

    expect(receivables.length).toBeGreaterThan(0);
    expect(financing).toBeNull();

    saveBudget(user, APPOINTMENT_ID, approvedBudget, { skipLockCheck: true });
    budget = getBudget(APPOINTMENT_ID);
    expect(budget.status).toBe(BUDGET_STATUS.APROVADO);

    const dbAfterFinance = loadDb();
    const linkedReceivables = (dbAfterFinance.accountsReceivable || []).filter(
      (r) => r.patient_id === PATIENT_ID && String(r.origin_id) === String(budget.id),
    );
    expect(linkedReceivables.length).toBeGreaterThan(0);

    // 7. Gerar contrato (fluxo clínico: rascunho gerado — finalize exige TCLEs adicionais)
    const tpl = loadDb().contractTemplates.find((t) => t.type === 'system_default');
    const contractDraft = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      budgetId: budget.id,
      templateId: tpl.id,
      editedHtml: '<p>Contrato de teste</p>',
      skipHashtagValidation: true,
    });
    markBudgetContractGenerated(user, APPOINTMENT_ID);
    originalContractId = contractDraft.id;

    budget = getBudget(APPOINTMENT_ID);
    expect(budget.status).toBe(BUDGET_STATUS.CONTRATO_GERADO);

    const linkedContract = getContractStatusForQuote(
      APPOINTMENT_ID,
      'clinical_budget',
      budget.id,
      PATIENT_ID,
    );
    expect(linkedContract?.id).toBe(originalContractId);

    // 8. Central do Paciente
    const careContext = buildPatientCareContextByPatient(PATIENT_ID);
    expect(careContext).toBeTruthy();
    expect(careContext.actions.showOpenExistingBudget).toBe(true);
    expect(careContext.actions.primaryBudgetId).toBe(originalBudgetId);

    const executiveSummary = buildPatientExecutiveSummary(PATIENT_ID, {
      patientName: 'Paciente Fluxo Completo',
    });
    expect(executiveSummary.activeBudget?.budgetId).toBe(originalBudgetId);
    expect(executiveSummary.activeBudget?.value).toBe(PROCEDURE_VALUE);
    expect(executiveSummary.activeContract?.contractId).toBe(originalContractId);
    assertNoTechnicalIdsInUserFacingLabels(executiveSummary);

    // 9–10. Ver orçamento (modo somente leitura)
    openExistingBudget(navigateMock, {
      budgetId: originalBudgetId,
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      section: 'orcamento',
    });

    expect(navigateMock).toHaveBeenCalledWith(
      buildClinicalAppointmentUrl({
        appointmentId: APPOINTMENT_ID,
        budgetId: originalBudgetId,
      }),
      expect.objectContaining({
        state: expect.objectContaining({ budgetId: originalBudgetId, viewMode: true }),
      }),
    );

    const budgetView = resolveBudgetForView(APPOINTMENT_ID, originalBudgetId);
    expect(budgetView.budget?.id).toBe(originalBudgetId);
    expect(budgetView.budget?.totalValue).toBe(PROCEDURE_VALUE);
    expect(budgetView.budget?.procedures).toHaveLength(1);
    expect(budgetView.isReadOnly).toBe(true);
    expect(budgetView.isHistoricalView).toBe(false);
    expect(budgetView.mode).toBe('readonly');

    const workflowBudget = getClinicalWorkflowState(APPOINTMENT_ID, originalBudgetId);
    expect(workflowBudget.isHistoricalView).toBe(false);
    expect(workflowBudget.budget?.id).toBe(originalBudgetId);

    // 11–12. Abrir contrato vinculado
    navigateMock.mockClear();
    openExistingContract(navigateMock, {
      contractId: originalContractId,
      budgetId: originalBudgetId,
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
    });

    expect(navigateMock).toHaveBeenCalledWith(
      buildClinicalAppointmentUrl({
        appointmentId: APPOINTMENT_ID,
        budgetId: originalBudgetId,
        contractId: originalContractId,
        section: 'contratos',
      }),
      expect.objectContaining({
        state: expect.objectContaining({
          contractId: originalContractId,
          budgetId: originalBudgetId,
          section: 'contratos',
        }),
      }),
    );

    const workflowContract = getClinicalWorkflowState(APPOINTMENT_ID, originalBudgetId);
    expect(workflowContract.contractAccessible).toBe(true);
    expect(canAccessContract(budgetView.budget, workflowContract.lockCtx)).toBe(true);

    const contractAfterNav = getContractStatusForQuote(
      APPOINTMENT_ID,
      'clinical_budget',
      originalBudgetId,
      PATIENT_ID,
    );
    expect(contractAfterNav?.id).toBe(originalContractId);
    expect(contractAfterNav?.status).not.toBe(CONTRACT_STATUS.REPLACED);

    // 13. Criar novo orçamento
    const newBudget = createNewBudgetForAppointment(user, APPOINTMENT_ID);
    expect(newBudget.id).toBeTruthy();
    expect(newBudget.id).not.toBe(originalBudgetId);
    expect(newBudget.status).toBe(BUDGET_STATUS.RASCUNHO);
    expect(newBudget.procedures).toHaveLength(0);
    expect(newBudget.totalValue).toBe(0);

    // 14. Novo orçamento limpo
    const currentBudget = getBudget(APPOINTMENT_ID);
    expect(currentBudget.id).toBe(newBudget.id);
    expect(currentBudget.procedures).toHaveLength(0);

    // 15. Orçamento antigo no histórico
    const history = listPatientBudgetHistory(PATIENT_ID);
    const archived = history.find((row) => row.id === originalBudgetId);
    expect(archived).toBeTruthy();
    expect(archived.status).toBe(BUDGET_STATUS.HISTORICO);
    expect(archived.totalValue).toBe(PROCEDURE_VALUE);

    // 16. Contrato antigo ainda acessível
    const contractAfterNewBudget = getContractStatusForQuote(
      APPOINTMENT_ID,
      'clinical_budget',
      originalBudgetId,
      PATIENT_ID,
    );
    expect(contractAfterNewBudget?.id).toBe(originalContractId);
    expect(contractAfterNewBudget?.status).toBe(CONTRACT_STATUS.DRAFT);

    const historicalView = resolveBudgetForView(APPOINTMENT_ID, originalBudgetId);
    expect(historicalView.isHistoricalView).toBe(true);
    expect(historicalView.budget?.totalValue).toBe(PROCEDURE_VALUE);

    const lockHistorical = getBudgetLockContextForBudget(APPOINTMENT_ID, historicalView.budget);
    expect(canAccessContract(historicalView.budget, lockHistorical)).toBe(true);

    navigateMock.mockClear();
    openExistingContract(navigateMock, {
      contractId: originalContractId,
      budgetId: originalBudgetId,
      patientId: PATIENT_ID,
    });
    expect(navigateMock).toHaveBeenCalled();

    // 17. Nenhum UUID na interface da Central
    const summaryAfterNew = buildPatientExecutiveSummary(PATIENT_ID, {
      patientName: 'Paciente Fluxo Completo',
    });
    assertNoTechnicalIdsInUserFacingLabels(summaryAfterNew);
    expect(String(summaryAfterNew.activeBudget?.label || '')).not.toContain('budget-');
    expect(String(summaryAfterNew.activeContract?.label || '')).not.toContain('contract-');
  });
});
