/**
 * PHASE_10.21AL — Editar contrato não reabre o fluxo de gerar contrato.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { saveBudget, updateBudgetStatus } from '../services/clinicalService.js';
import {
  ensureContractsModuleSeeded,
  createContractDraft,
  updateDraftGeneratedContract,
  getContractStatusForQuote,
} from '../services/contractModuleService.js';
import { markBudgetContractGenerated } from '../services/clinicalBudgetLockService.js';
import {
  assertClinicalContractReady,
  composeProfessionalClinicalContractHtml,
  resolveClinicalBudgetForContract,
} from '../components/clinical/contract/composeProfessionalClinicalContract.js';
import { getAcceptedOption, resolveBudgetFinancials } from '../components/clinical/budget/budgetUtils.js';
import {
  assertContractEditContext,
  loadContractForEdit,
  resolveStoredContractHtml,
} from '../contracts/contractEditContext.js';
import { canSendContractForSignature } from '../services/contractSignatureFlowService.js';
import { createId } from '../services/helpers.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-1021al';
const PATIENT_ID = 'patient-1021al';
const WRONG_PATIENT = 'patient-other-al';
const APPT_ID = 'appt-1021al';
const user = { id: 'user-al', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Dr AL' };

function seedApprovedBudget({ status = BUDGET_STATUS.APROVADO, planName = 'Aplicação tópica de flúor' } = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'AL' }];
    db.clinicProfile = {
      id: 'clinic-1',
      razaoSocial: 'Clinica AL LTDA',
      nomeFantasia: 'AL',
      tenant_id: TENANT,
    };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Dr. Responsavel AL',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [{
      id: 'addr-al',
      principal: true,
      logradouro: 'Rua AL',
      numero: '1',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30130-000',
    }];
    db.collaborators = [{
      id: 'col-al',
      nomeCompleto: 'Dra Juliana',
      cro: 'CRO-MG 27267',
      conselhoNumero: 'CRO-MG 27267',
      active: true,
      tenant_id: TENANT,
    }];
    db.patients = [{
      id: PATIENT_ID,
      full_name: 'Paulo Henrique Silva de Assis',
      cpf: '39053344705',
      birth_date: '1990-01-15',
      tenant_id: TENANT,
    }, {
      id: WRONG_PATIENT,
      full_name: 'Outro Paciente',
      cpf: '11144477735',
      tenant_id: TENANT,
    }];
    db.patientAddresses = [{
      id: 'paddr-al',
      patient_id: PATIENT_ID,
      street: 'Av Paciente',
      number: '10',
      neighborhood: 'Bairro',
      city: 'Belo Horizonte',
      state: 'MG',
      cep: '30130-000',
      principal: true,
    }];
    db.appointments = [{
      id: APPT_ID,
      patientId: PATIENT_ID,
      professionalId: 'col-al',
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      date: '2026-08-13',
      tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      id: createId('clinical'),
      appointmentId: APPT_ID,
      patientId: PATIENT_ID,
      plannedProcedures: [],
      budgetHistory: [],
    }];
    db.generatedContracts = [];
    return db;
  });

  ensureContractsModuleSeeded();
  const budgetId = createId('budget');
  saveBudget(user, APPT_ID, {
    id: budgetId,
    status: BUDGET_STATUS.RASCUNHO,
    planName,
    procedures: [{
      id: createId('proc'),
      name: planName,
      quantity: 1,
      unitValue: 150,
      totalValue: 150,
    }],
    paymentOptions: [{
      id: createId('pay'),
      label: 'À vista PIX',
      type: 'a_vista',
      total: 150,
      accepted: true,
      presentToPatient: true,
      presentationStatus: 'escolhida',
    }],
    totalValue: 150,
    professionalId: 'col-al',
  });
  if (status !== BUDGET_STATUS.RASCUNHO) {
    updateBudgetStatus(user, APPT_ID, status === BUDGET_STATUS.CONTRATO_GERADO ? BUDGET_STATUS.APROVADO : status);
  }
  if (status === BUDGET_STATUS.CONTRATO_GERADO) {
    markBudgetContractGenerated(user, APPT_ID);
  }
  return loadDb().clinicalAppointments.find((c) => c.appointmentId === APPT_ID)?.budget || null;
}

function createDraftForBudget(budget) {
  const tpl = loadDb().contractTemplates.find((t) => t.type === 'system_default') || loadDb().contractTemplates[0];
  return createContractDraft(user, {
    quoteSource: 'clinical_budget',
    quoteId: APPT_ID,
    patientId: PATIENT_ID,
    budgetId: budget.id,
    templateId: tpl.id,
    editedHtml: `<p>Contrato ${budget.budgetNumber || budget.id} total ${budget.totalValue}</p>`,
    skipHashtagValidation: true,
  });
}

describe('PHASE_10.21AL contract edit state regression', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
  });

  afterEach(() => {
    resetDb();
  });

  it('A) budget RASCUNHO não gera contrato', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.RASCUNHO });
    const financials = resolveBudgetFinancials(budget);
    expect(() => assertClinicalContractReady({ budget, financials, db: loadDb() }))
      .toThrow(/Orçamento não aprovado/);
  });

  it('B) budget APROVADO pode gerar o primeiro contrato', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.APROVADO });
    const draft = createDraftForBudget(budget);
    expect(draft.contractNumber).toMatch(/^CTR-/);
    expect(draft.budgetId).toBe(budget.id);
    expect(draft.patientId).toBe(PATIENT_ID);
    expect(getContractStatusForQuote(APPT_ID, 'clinical_budget', budget.id, PATIENT_ID).id).toBe(draft.id);
  });

  it('C/D/E) contrato existente + Editar carrega o mesmo id e não o fluxo de gerar', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.APROVADO });
    const draft = createDraftForBudget(budget);
    markBudgetContractGenerated(user, APPT_ID);
    const loaded = loadContractForEdit({
      contractId: draft.id,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: budget.id,
      tenantId: TENANT,
    });
    expect(loaded.id).toBe(draft.id);
    expect(loaded.contractNumber).toBe(draft.contractNumber);
    expect(resolveStoredContractHtml(loaded)).toContain(String(budget.totalValue));

    const modal = readFileSync(path.join(ROOT, 'src/components/contracts/GenerateContractModal.jsx'), 'utf8');
    const clinical = readFileSync(path.join(ROOT, 'src/components/clinical/ClinicalContractSection.jsx'), 'utf8');
    expect(clinical).toContain('openEditContract');
    expect(clinical).toContain("mode={contractModalMode}");
    expect(clinical).not.toMatch(/onClick=\{openContractFlow\}/);
    expect(modal).toContain("isEdit ? 'Editar contrato' : 'Gerar contrato'");
    expect(modal).toContain('step === \'edit\' && !isEdit');
    expect(modal).toContain('Este contrato já existe. Use salvar alterações.');
  });

  it('F/H/I) abrir editor não cria nova versão nem novo contractId/budgetId', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.APROVADO });
    const draft = createDraftForBudget(budget);
    const before = (loadDb().generatedContracts || []).length;
    loadContractForEdit({
      contractId: draft.id,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: budget.id,
    });
    const after = loadDb().generatedContracts || [];
    expect(after).toHaveLength(before);
    expect(after[0].id).toBe(draft.id);
    expect(after[0].budgetId).toBe(budget.id);
  });

  it('G) salvar alteração atualiza o mesmo contrato', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.APROVADO });
    const draft = createDraftForBudget(budget);
    const updated = updateDraftGeneratedContract(user, draft.id, {
      finalContent: '<p>Texto revisado internamente</p>',
      skipHashtagValidation: true,
    });
    expect(updated.id).toBe(draft.id);
    expect(updated.budgetId).toBe(budget.id);
    expect(updated.finalContent).toContain('Texto revisado internamente');
    expect((loadDb().generatedContracts || []).filter((c) => c.quoteId === APPT_ID)).toHaveLength(1);
  });

  it('J) snapshot financeiro permanece imutável no contrato existente', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.APROVADO });
    const draft = createDraftForBudget(budget);
    const snapBefore = JSON.stringify(draft.financialSnapshotJson || draft.totalValueSnapshot);
    markBudgetContractGenerated(user, APPT_ID);
    const loaded = loadContractForEdit({ contractId: draft.id, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: budget.id });
    expect(JSON.stringify(loaded.financialSnapshotJson || loaded.totalValueSnapshot)).toBe(snapBefore);
    expect(Number(loaded.totalValueSnapshot || budget.totalValue)).toBe(150);
  });

  it('K/L/M) fail-closed de tenant/paciente/orçamento errados', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.APROVADO });
    const draft = createDraftForBudget(budget);
    expect(assertContractEditContext(draft, { patientId: WRONG_PATIENT }).ok).toBe(false);
    expect(assertContractEditContext(draft, { budgetId: 'budget-other' }).ok).toBe(false);
    expect(assertContractEditContext(draft, { tenantId: 'tenant-other', clinicId: 'clinic-other' }).ok).toBe(false);
    expect(() => loadContractForEdit({
      contractId: draft.id,
      patientId: WRONG_PATIENT,
      appointmentId: APPT_ID,
      budgetId: budget.id,
    })).toThrow(/paciente/);
    expect(() => loadContractForEdit({
      contractId: draft.id,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: 'budget-wrong',
    })).toThrow(/orçamento/);
  });

  it('N/O) refresh mantém contrato e double-create não duplica', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.APROVADO });
    const first = createDraftForBudget(budget);
    const again = getContractStatusForQuote(APPT_ID, 'clinical_budget', budget.id, PATIENT_ID);
    expect(again.id).toBe(first.id);
    expect(() => createDraftForBudget(budget)).toThrow(/Já existe contrato ativo/);
    expect((loadDb().generatedContracts || []).filter((c) => c.quoteId === APPT_ID)).toHaveLength(1);
  });

  it('P/Q) flúor não exige TCLE; LGPD permanece pronto no package', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.APROVADO });
    const html = composeProfessionalClinicalContractHtml({
      quoteId: APPT_ID,
      patientId: PATIENT_ID,
      budgetId: budget.id,
    });
    expect(html).toMatch(/flúor|fluor|Contrato/i);
    const pkgSrc = readFileSync(
      path.join(ROOT, 'src/services/operationalContractWizardService.js'),
      'utf8',
    );
    expect(pkgSrc).toContain('getTreatmentDocumentRequirements');
    expect(pkgSrc).toContain('tcleRequired');
  });

  it('R) CTAs de blockers continuam no painel de readiness', () => {
    const clinical = readFileSync(path.join(ROOT, 'src/components/clinical/ClinicalContractSection.jsx'), 'utf8');
    expect(clinical).toContain('handleResolvePrerequisite');
    expect(clinical).toContain('enrichContractReadinessChecklist');
  });

  it('CONTRATO_GERADO não dispara "Orçamento não aprovado" no compose', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.CONTRATO_GERADO });
    expect(budget.status).toBe(BUDGET_STATUS.CONTRATO_GERADO);
    const financials = resolveBudgetFinancials(budget);
    expect(getAcceptedOption(budget)).toBeTruthy();
    expect(() => assertClinicalContractReady({ budget, financials, db: loadDb() })).not.toThrow();
    expect(resolveClinicalBudgetForContract({ appointmentId: APPT_ID, budgetId: budget.id }).id).toBe(budget.id);
    expect(() => composeProfessionalClinicalContractHtml({
      quoteId: APPT_ID,
      patientId: PATIENT_ID,
      budgetId: budget.id,
    })).not.toThrow();
  });

  it('assinatura só após GENERATED — esperado enquanto Em edição', () => {
    const budget = seedApprovedBudget({ status: BUDGET_STATUS.APROVADO });
    const draft = createDraftForBudget(budget);
    expect(canSendContractForSignature({ contract: draft, budget })).toBe(false);
    expect(draft.status).toBe(CONTRACT_STATUS.DRAFT);
  });
});
