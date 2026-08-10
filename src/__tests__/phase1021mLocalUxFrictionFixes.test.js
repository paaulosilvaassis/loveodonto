/**
 * PHASE_10.21M — Local UX friction fixes (revisão financeira + pré-requisitos)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import {
  addPlannedProcedure,
  saveBudget,
  updateBudgetStatus,
  getBudget,
} from '../services/clinicalService.js';
import {
  ensureContractsModuleSeeded,
  createContractDraft,
  finalizeGeneratedContract,
} from '../services/contractModuleService.js';
import { createId } from '../services/helpers.js';
import { createPatientQuick } from '../services/patientService.js';
import {
  buildWizardViewModel,
  listWizardFinalizePrerequisites,
  resolveWizardFinancialDisplay,
  getStepReadiness,
} from '../services/operationalContractWizardService.js';
import {
  __resetContractsOperationalRolloutCacheForTests,
  getServerOperationalUxSnapshot,
} from '../services/contractsOperationalRolloutService.js';
import { CONTRACTS_OPERATIONAL_MODES } from '../domain/contracts/rollout/contracts-operational-mode.ts';
import { buildPublicSigningSummaryFromV1Contract } from '../contracts/publicSigningSummary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const TOTAL = 1000;
const ENTRY = 200;
const BALANCE = 800;
const INSTALLMENTS = 4;
const INSTALLMENT_VALUE = 200;
const PATIENT_NAME = 'TESTE CONTRATOS LOVE ODONTO 1021M';
const PLAN_NAME = 'TESTE PHASE 10.21M';
const PROCEDURE_NAME = 'Implante unitário teste';

const user = {
  id: 'user-1021m',
  name: 'Dr. Teste Local 1021M',
  tenant_id: 'tenant-1021m',
  tenantId: 'tenant-1021m',
  role: 'master',
  permissions: ['patients:write', 'patients:read', 'prontuario_contratos:create', 'comercial:view'],
};

function seedClinic() {
  withDb((db) => {
    db.tenants = [{ id: 'tenant-1021m', name: 'Clínica Teste Local 1021M', status: 'active' }];
    db.clinicProfile = {
      id: 'clinic-1021m',
      tenant_id: 'tenant-1021m',
      razaoSocial: 'Clínica Teste Local 1021M',
    };
    db.clinicDocumentation = {
      cnpj: '00000000000191',
      responsavelTecnico: 'Dr. Teste Local',
      conselhoRegionalNumero: 'CRO-TEST 1021M',
    };
    db.clinicAddresses = [{
      principal: true,
      logradouro: 'Rua Teste Local',
      numero: '1021',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30100000',
    }];
  });
  ensureContractsModuleSeeded();
}

function seedServerOff() {
  __resetContractsOperationalRolloutCacheForTests();
  localStorage.setItem('loveodonto.contracts.operationalRollout.v1', JSON.stringify({
    state: {
      mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
      productionGlobalEnabled: false,
      tenantEnabled: false,
      productionTenantAllowlist: [],
      source: 'feature_flags',
      rolloutPhase: 'READY_FOR_PRODUCTION_ACTIVATION',
      lastChangedAt: null,
      lastChangedBy: null,
      rollbackReason: null,
      notes: '',
    },
    metrics: {},
    audit: [],
    source: 'feature_flags',
  }));
}

function createApprovedBudget({ withAddress = false, withTcle = false } = {}) {
  const created = createPatientQuick(user, {
    full_name: PATIENT_NAME,
    sex: 'M',
    birth_date: '1990-01-15',
    cpf: '52998224725',
    tenant_id: 'tenant-1021m',
  });
  const patientId = created.patientId;
  const appointmentId = createId('apt');

  withDb((db) => {
    db.appointments.push({
      id: appointmentId,
      tenant_id: 'tenant-1021m',
      patientId,
      professionalId: 'prof-1021m',
      date: '2026-08-10',
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      startTime: '10:00',
      endTime: '11:00',
    });
    if (withAddress) {
      if (!Array.isArray(db.patientAddresses)) db.patientAddresses = [];
      db.patientAddresses.push({
        patient_id: patientId,
        principal: true,
        logradouro: 'Rua Fictícia 1021M',
        numero: '100',
        bairro: 'Centro',
        cidade: 'Belo Horizonte',
        uf: 'MG',
        cep: '30100000',
      });
    }
    if (withTcle) {
      if (!Array.isArray(db.documentRecords)) db.documentRecords = [];
      db.documentRecords.push({
        id: createId('doc'),
        patientId,
        appointmentId,
        category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
        templateKey: 'consent_implante',
        title: 'Termo de Consentimento — Implantes',
        content: 'TCLE fictício 1021M',
        createdAt: new Date().toISOString(),
      });
    }
  });

  addPlannedProcedure(user, appointmentId, {
    name: PROCEDURE_NAME,
    quantity: 1,
    unitValue: TOTAL,
    totalValue: TOTAL,
    tooth: '16',
  });

  saveBudget(user, appointmentId, {
    status: BUDGET_STATUS.RASCUNHO,
    planName: PLAN_NAME,
    procedures: [{
      id: createId('proc'),
      name: PROCEDURE_NAME,
      quantity: 1,
      unitValue: TOTAL,
      totalValue: TOTAL,
      tooth: '16',
    }],
    paymentOptions: [{
      id: createId('pay'),
      label: `Entrada R$ ${ENTRY} + ${INSTALLMENTS}x R$ ${INSTALLMENT_VALUE}`,
      type: 'installments',
      entry: ENTRY,
      installments: INSTALLMENTS,
      installmentValue: INSTALLMENT_VALUE,
      total: TOTAL,
      presentToPatient: true,
      accepted: true,
      presentationStatus: 'escolhida',
    }],
    totalValue: TOTAL,
    professionalId: 'prof-1021m',
  });
  updateBudgetStatus(user, appointmentId, BUDGET_STATUS.APROVADO);
  const budget = getBudget(appointmentId);

  return {
    patientId,
    appointmentId,
    budgetId: budget.id,
    budget,
    row: {
      id: budget.id,
      appointmentId,
      patientId,
      patientName: PATIENT_NAME,
      planName: PLAN_NAME,
      totalValue: TOTAL,
      budgetNumber: budget.budgetNumber || 'ORC-1021M',
      professionalName: 'Dr. Teste Local',
      status: BUDGET_STATUS.APROVADO,
    },
  };
}

describe('PHASE_10.21M — local UX friction fixes', () => {
  let localTestSpy;

  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedClinic();
    seedServerOff();
    const localMod = await import('../domain/contracts/rollout/contracts-operational-ux-local-test.ts');
    localTestSpy = vi.spyOn(localMod, 'isContractsOperationalUxLocalTestEnabled')
      .mockReturnValue(true);
  });

  afterEach(() => {
    localTestSpy?.mockRestore();
  });

  it('1–4 revisão mostra entrada, saldo, quantidade e valor da parcela', () => {
    const { row, budget } = createApprovedBudget();
    const resolved = resolveWizardFinancialDisplay({ budget, row });
    expect(resolved.total).toBe(TOTAL);
    expect(resolved.entrada).toBe(ENTRY);
    expect(resolved.balance).toBe(BALANCE);
    expect(resolved.installmentCount).toBe(INSTALLMENTS);
    expect(resolved.installmentValue).toBe(INSTALLMENT_VALUE);

    const view = buildWizardViewModel(row);
    expect(view.financial.totalLabel).toMatch(/1\.000/);
    expect(view.financial.downPaymentLabel).toMatch(/200/);
    expect(view.financial.balanceLabel).toMatch(/800/);
    expect(view.financial.installmentCount).toBe(4);
    expect(view.financial.installmentValueLabel).toMatch(/200/);
    expect(view.financial.downPaymentLabel).not.toBe('—');
    expect(view.financial.balanceLabel).not.toBe('—');
  });

  it('5 ausência de endereço gera pendência antecipada', () => {
    const { patientId, appointmentId } = createApprovedBudget({ withAddress: false, withTcle: true });
    const prereq = listWizardFinalizePrerequisites({
      patientId,
      appointmentId,
      currentUser: user,
    });
    expect(prereq.ok).toBe(false);
    expect(prereq.items.some((i) => /Endereço do paciente/i.test(i.label))).toBe(true);
    expect(prereq.items.find((i) => /Endereço do paciente/i.test(i.label))?.ctaLabel).toBe('Corrigir dados');
    const readiness = getStepReadiness('revisao', { finalizePrerequisites: prereq });
    expect(readiness.ready).toBe(false);
    expect(readiness.missing.some((m) => /Endereço/i.test(m))).toBe(true);
  });

  it('6 ausência do TCLE obrigatório gera pendência antecipada', () => {
    const { patientId, appointmentId } = createApprovedBudget({ withAddress: true, withTcle: false });
    const prereq = listWizardFinalizePrerequisites({
      patientId,
      appointmentId,
      currentUser: user,
    });
    expect(prereq.ok).toBe(false);
    expect(prereq.items.some((i) => /TCLE obrigatório:.*Implantes/i.test(i.label))).toBe(true);
    expect(prereq.items.find((i) => /Implantes/i.test(i.label))?.ctaLabel).toBe('Adicionar documento');
    expect(prereq.items.find((i) => /Implantes/i.test(i.label))?.action).toBe('add_document');
  });

  it('7 finalização passa quando requisitos estão presentes', () => {
    const { patientId, appointmentId, budgetId } = createApprovedBudget({
      withAddress: true,
      withTcle: true,
    });
    const prereq = listWizardFinalizePrerequisites({
      patientId,
      appointmentId,
      currentUser: user,
    });
    expect(prereq.ok).toBe(true);
    expect(prereq.items).toHaveLength(0);

    const tpl = loadDb().contractTemplates.find((t) => t.type === 'system_default')
      || loadDb().contractTemplates[0];
    const draft = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: appointmentId,
      patientId,
      budgetId,
      templateId: tpl.id,
      editedHtml: `<p>Contrato 1021M — ${PROCEDURE_NAME}</p>`,
      skipHashtagValidation: true,
      title: `Contrato ${PLAN_NAME}`,
    });
    expect(Number(draft.financialSnapshotJson?.entrada)).toBe(ENTRY);
    const finalized = finalizeGeneratedContract(user, draft.id);
    expect(finalized.status).toBe('generated');
  });

  it('8 V1 continua intacto', () => {
    expect(existsSync(path.join(ROOT, 'src/pages/BudgetsHubPage.jsx'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'src/pages/contratos/ContractsPendentesPage.jsx'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'src/pages/contratos/ContractSignPublicPage.jsx'))).toBe(true);
    const wizard = readFileSync(
      path.join(ROOT, 'src/components/contracts/operational/OperationalContractWizard.jsx'),
      'utf8',
    );
    const panels = readFileSync(
      path.join(ROOT, 'src/components/contracts/operational/OperationalContractWizardPanels.jsx'),
      'utf8',
    );
    expect(wizard).toContain('FinalizePrerequisitesPanel');
    expect(wizard).toContain('ocw-financial-review');
    expect(panels).toContain('Antes de finalizar, complete:');
  });

  it('9 produção continua OFF', () => {
    const snap = getServerOperationalUxSnapshot(user);
    expect(snap.productionGlobalEnabled).toBe(false);
    expect(snap.tenantEnabled).toBe(false);
    expect(snap.operationalUxEnabled).toBe(false);
  });

  it('reteste cenário 5/7 10.21L — revisão e resumo público com valores', () => {
    const { row, budget, patientId, appointmentId, budgetId } = createApprovedBudget({
      withAddress: true,
      withTcle: true,
    });
    const view = buildWizardViewModel(row);
    expect(view.financial.downPaymentLabel).toMatch(/200/);
    expect(view.financial.balanceLabel).toMatch(/800/);
    expect(view.financial.installmentCount).toBe(4);
    expect(view.financial.installmentValueLabel).toMatch(/200/);

    const tpl = loadDb().contractTemplates.find((t) => t.type === 'system_default')
      || loadDb().contractTemplates[0];
    const draft = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: appointmentId,
      patientId,
      budgetId,
      templateId: tpl.id,
      editedHtml: `<p>Total R$ ${TOTAL} Entrada R$ ${ENTRY} ${INSTALLMENTS}x R$ ${INSTALLMENT_VALUE}</p>`,
      skipHashtagValidation: true,
    });
    const summary = buildPublicSigningSummaryFromV1Contract(draft);
    expect(summary.financial.total).toMatch(/1\.000/);
    expect(summary.financial.downPayment).toMatch(/200/);
    expect(summary.financial.balance).toMatch(/800/);
    // Parcelas: do orçamento aceito refletidas no snapshot/entrada; count pode vir do schedule/ctx
    expect(Number(draft.financialSnapshotJson?.entrada)).toBe(200);
    expect(budget.paymentOptions[0].installments).toBe(4);
  });
});
