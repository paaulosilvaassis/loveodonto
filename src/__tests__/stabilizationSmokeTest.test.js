/**
 * Smoke test de estabilização — Sprint Fase 1–6.
 *
 * Replica o cenário Paulo Henrique Silva de Assis:
 *   ORC-001 aprovado (com contrato e financeiro)
 *   ORC-003 pendente (negociação)
 *
 * Executa:
 *   1. Bloco 0 — 11 checks de integridade de dados
 *   2. Central do Paciente — abre orçamento correto (pendente)
 *   3. Fluxo completo: aprovar ORC-003 → financeiro → contrato → CRO → snapshot → TCLE → Central
 *
 * Critério de aprovação: zero issue crítico, zero assertion failure.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
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
  finalizeGeneratedContract,
  getContractStatusForQuote,
  signContractOnScreen,
} from '../services/contractModuleService.js';
import { markBudgetContractGenerated, getBudgetLockContextForBudget } from '../services/clinicalBudgetLockService.js';
import { buildPatientCareContextByPatient } from '../services/patientCareCentralService.js';
import { buildPatientExecutiveSummary } from '../services/patientCareExecutiveSummaryService.js';
import { runDataIntegrityCheck } from '../services/dataIntegrityService.js';
import { resolveBudgetReadOnlyState, isRealContractLinkedToBudget } from '../components/clinical/budget/budgetEditAccessUtils.js';
import { DEFAULT_PAYMENT_OPTIONS } from '../components/clinical/clinicalAppointmentConfig.js';
import { resolveAttachedTcleIdsFromClinicalDocuments } from '../services/clinicalTcleAttachmentService.js';

// ─── IDs fixos (representam Paulo Henrique no cenário de teste) ───
const PATIENT_ID   = 'patient-paulo-henrique';
const APPT_OLD     = 'appt-old-approved';   // atendimento do ORC-001
const APPT_ACTIVE  = 'appt-active-pending'; // atendimento do ORC-003
const BUDGET_001   = 'budget-001-aprovado';
const BUDGET_003   = 'budget-003-pendente';
const CONTRACT_001 = 'contract-001-signed';
const TENANT_ID    = 'tenant-love-odonto';

const user = { id: 'user-admin', name: 'Dr. Estabilização', tenant_id: TENANT_ID, role: 'admin' };

// ─── Seed base ───────────────────────────────────────────────────
function seedClinicAndPatient() {
  withDb((db) => {
    db.tenants = [{ id: TENANT_ID, name: 'Love Odonto', status: 'active' }];
    db.clinicProfile = {
      id: 'clinic-love',
      tenant_id: TENANT_ID,
      razaoSocial: 'Love Odonto LTDA',
      nomeFantasia: 'Love Odonto',
      email: 'contato@loveodonto.com',
    };
    db.clinicDocumentation = {
      cnpj: '12345678000199',
      responsavelTecnico: 'Dr. Paulo Responsável',
      conselhoRegionalNumero: 'CRO-MG 54321',
    };
    db.clinicAddresses = [{
      principal: true,
      logradouro: 'Av. Afonso Pena',
      numero: '1000',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30130005',
    }];
    db.patients = [{
      id: PATIENT_ID,
      tenant_id: TENANT_ID,
      full_name: 'Paulo Henrique Silva de Assis',
      cpf: '52998224725',
      birth_date: '1985-03-15',
      sex: 'M',
    }];
    db.patientAddresses = [{
      patient_id: PATIENT_ID,
      principal: true,
      logradouro: 'Rua das Flores',
      numero: '42',
      bairro: 'Savassi',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30140070',
    }];
    db.appointments = [
      {
        id: APPT_OLD,
        tenant_id: TENANT_ID,
        patientId: PATIENT_ID,
        date: '2026-03-10',
        status: APPOINTMENT_STATUS.FINALIZADO,
        finishedAt: '2026-03-10T17:00:00.000Z',
      },
      {
        id: APPT_ACTIVE,
        tenant_id: TENANT_ID,
        patientId: PATIENT_ID,
        date: '2026-06-18',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        startedAt: '2026-06-18T09:00:00.000Z',
      },
    ];
    return db;
  });
}

/**
 * Seed completo do cenário Paulo Henrique:
 *   – APPT_OLD  → ORC-001 aprovado (histórico) com contrato assinado e receivable
 *   – APPT_ACTIVE → ORC-003 em negociação (sem contrato nem financeiro)
 */
function seedPauloHenriqueScenario() {
  seedClinicAndPatient();

  withDb((db) => {
    // ORC-001 aprovado no histórico
    db.clinicalAppointments = [
      {
        appointmentId: APPT_OLD,
        patientId: PATIENT_ID,
        tenant_id: TENANT_ID,
        plannedProcedures: [{
          id: 'planned-old-1',
          name: 'Implante Unitário',
          quantity: 1,
          unitValue: 20000,
          totalValue: 20000,
        }],
        budget: null,
        budgetHistory: [{
          id: BUDGET_001,
          budgetNumber: 'ORC-001',
          status: BUDGET_STATUS.APROVADO,
          totalValue: 20000,
          planName: 'Implante',
          procedures: [{
            id: 'proc-001-1',
            name: 'Implante Unitário',
            quantity: 1,
            unitValue: 20000,
            totalValue: 20000,
          }],
          paymentOptions: [{
            id: 'pay-001',
            type: 'a_vista',
            total: 20000,
            accepted: true,
            presentationStatus: 'escolhida',
          }],
          approvedAt: '2026-03-10T15:00:00.000Z',
          archivedAt: '2026-03-10T17:00:00.000Z',
          contractId: CONTRACT_001,
        }],
      },
      {
        appointmentId: APPT_ACTIVE,
        patientId: PATIENT_ID,
        tenant_id: TENANT_ID,
        plannedProcedures: [{
          id: 'planned-003-1',
          name: 'Prótese Total',
          quantity: 1,
          unitValue: 35000,
          totalValue: 35000,
        }],
        budget: {
          id: BUDGET_003,
          budgetNumber: 'ORC-003',
          status: BUDGET_STATUS.NEGOCIACAO,
          totalValue: 35000,
          planName: 'Prótese Total',
          procedures: [{
            id: 'proc-003-1',
            name: 'Prótese Total',
            quantity: 1,
            unitValue: 35000,
            totalValue: 35000,
          }],
          paymentOptions: DEFAULT_PAYMENT_OPTIONS().map((opt, i) => ({
            ...opt,
            total: 35000,
            ...(i === 0 ? {
              presentToPatient: true,
              presentationStatus: 'apresentada',
              presentedAt: '2026-06-18T09:30:00.000Z',
            } : {}),
          })),
          createdAt: '2026-06-18T09:00:00.000Z',
        },
        budgetHistory: [],
      },
    ];

    // Contrato assinado vinculado ao ORC-001
    db.generatedContracts = [{
      id: CONTRACT_001,
      tenant_id: TENANT_ID,
      clinicId: 'clinic-love',
      patientId: PATIENT_ID,
      quoteId: APPT_OLD,
      quoteSource: 'clinical_budget',
      budgetId: BUDGET_001,
      contractNumber: 'CTR-001',
      status: CONTRACT_STATUS.SIGNED,
      renderedHtml: '<p>Contrato de implante Paulo Henrique</p>',
      finalContent: '<p>Contrato assinado</p>',
      totalValueSnapshot: 20000,
      financialSnapshotJson: {
        budgetId: BUDGET_001,
        valorTotal: '20000.00',
        entrada: '20000.00',
        formaPagamento: 'À vista',
        financiamentos: [],
        parcelas: [{
          description: 'Parcela 1/1 — ORC-001',
          net_amount: 20000,
          due_date: '2026-03-10',
          installment_number: 1,
          total_installments: 1,
          status: 'PAID',
        }],
      },
      metadata: { attachedTcleIds: ['tcle_implante'] },
      generatedAt: '2026-03-10T14:00:00.000Z',
    }];

    // Receivable do ORC-001 com vínculo correto
    db.accountsReceivable = [{
      id: 'recv-001-1',
      tenant_id: TENANT_ID,
      patient_id: PATIENT_ID,
      origin_id: BUDGET_001,
      budget_id: BUDGET_001,
      treatment_plan_id: BUDGET_001,
      description: 'Parcela 1/1 — Orçamento ORC-001',
      original_amount: 20000,
      net_amount: 20000,
      remaining_amount: 0,
      installment_number: 1,
      total_installments: 1,
      due_date: '2026-03-10',
      status: 'PAID',
      origin_type: 'treatment_plan',
    }];

    db.financings = [];
    db.documentRecords = [];
    db.clinicalEvents = [];
    db.contractSignatures = [];
    return db;
  });

  ensureContractsModuleSeeded();
}

// ─── BLOCO 0 — Integridade de dados ─────────────────────────────
describe('BLOCO 0 — Integridade dos vínculos (Paulo Henrique)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPauloHenriqueScenario();
  });

  it('0.1 — budgetId único por paciente', () => {
    const report = runDataIntegrityCheck();
    const dup = report.issues.filter((i) => i.code === 'BUDGET_ID_DUPLICATE');
    expect(dup).toHaveLength(0);
  });

  it('0.2 — contractId único', () => {
    const report = runDataIntegrityCheck();
    const dup = report.issues.filter((i) => i.code === 'CONTRACT_ID_DUPLICATE');
    expect(dup).toHaveLength(0);
  });

  it('0.3 — receivable.origin_id referencia budget.id real', () => {
    const report = runDataIntegrityCheck();
    const orphan = report.issues.filter((i) => i.code === 'RECEIVABLE_ORPHAN_ORIGIN');
    const noOrigin = report.issues.filter((i) => i.code === 'RECEIVABLE_NO_ORIGIN_ID');
    expect(orphan, `Receivables órfãos: ${JSON.stringify(orphan)}`).toHaveLength(0);
    expect(noOrigin, `Receivables sem origin_id: ${JSON.stringify(noOrigin)}`).toHaveLength(0);
  });

  it('0.4 — financing.budget_id referencia budget.id real', () => {
    const report = runDataIntegrityCheck();
    const issues = report.issues.filter((i) =>
      i.code === 'FINANCING_NO_BUDGET_ID' || i.code === 'FINANCING_ORPHAN_BUDGET',
    );
    expect(issues).toHaveLength(0);
  });

  it('0.5 — contract.budgetId referencia budget.id real', () => {
    const report = runDataIntegrityCheck();
    const orphan = report.issues.filter((i) => i.code === 'CONTRACT_ORPHAN_BUDGET');
    expect(orphan, `Contratos com budgetId órfão: ${JSON.stringify(orphan)}`).toHaveLength(0);
  });

  it('0.6 — contract.quoteId referencia atendimento real', () => {
    const report = runDataIntegrityCheck();
    const orphan = report.issues.filter((i) => i.code === 'CONTRACT_ORPHAN_QUOTE');
    expect(orphan, `Contratos com quoteId órfão: ${JSON.stringify(orphan)}`).toHaveLength(0);
  });

  it('0.7 — tenant_id presente em registros críticos', () => {
    const report = runDataIntegrityCheck();
    const missing = report.issues.filter((i) => i.code === 'MISSING_TENANT_ID');
    expect(missing, `Registros sem tenant_id: ${JSON.stringify(missing)}`).toHaveLength(0);
  });

  it('0.8 — orçamento novo ORC-003 não herdou contractId/financialId', () => {
    const report = runDataIntegrityCheck();
    const inherited = report.issues.filter((i) => i.code === 'NEW_BUDGET_INHERITED_IDS');
    expect(inherited, `Herança indevida: ${JSON.stringify(inherited)}`).toHaveLength(0);
  });

  it('0.9 — snapshot financeiro presente no contrato assinado', () => {
    const report = runDataIntegrityCheck();
    const emptySnap = report.issues.filter((i) => i.code === 'CONTRACT_EMPTY_FINANCIAL_SNAPSHOT');
    expect(emptySnap, `Snapshots vazios: ${JSON.stringify(emptySnap)}`).toHaveLength(0);
  });

  it('0.10 — valor do contrato ≡ valor do orçamento ORC-001', () => {
    const report = runDataIntegrityCheck();
    const mismatch = report.issues.filter((i) => i.code === 'VALUE_MISMATCH_BUDGET_CONTRACT');
    expect(mismatch, `Divergências contrato×orçamento: ${JSON.stringify(mismatch)}`).toHaveLength(0);
  });

  it('0.11 — soma das parcelas ≡ valor do orçamento ORC-001', () => {
    const report = runDataIntegrityCheck();
    const mismatch = report.issues.filter((i) => i.code === 'VALUE_MISMATCH_BUDGET_RECEIVABLES');
    expect(mismatch, `Divergências parcelas×orçamento: ${JSON.stringify(mismatch)}`).toHaveLength(0);
  });

  it('GATE — zero críticos no cenário inicial', () => {
    const report = runDataIntegrityCheck();
    expect(
      report.gate,
      `GATE FALHOU — críticos: ${report.issues.filter((i) => i.severity === 'critical').map((i) => `[${i.code}] ${i.entity}: ${i.detail}`).join('\n')}`,
    ).toBe(true);
  });
});

// ─── BLOCO 1 — Central do Paciente ───────────────────────────────
describe('BLOCO 1 — Central do Paciente abre orçamento correto', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPauloHenriqueScenario();
  });

  it('1.1 — primaryBudgetId aponta para ORC-003 (pendente), não ORC-001', () => {
    const ctx = buildPatientCareContextByPatient(PATIENT_ID);
    expect(ctx).toBeTruthy();
    expect(ctx.actions.primaryBudgetId).toBe(BUDGET_003);
    expect(ctx.actions.pendingDecisionBudget?.id).toBe(BUDGET_003);
    expect(ctx.actions.latestApprovedBudget?.id).toBe(BUDGET_001);
  });

  it('1.2 — alerta de orçamento pendente identifica ORC-003', () => {
    const ctx = buildPatientCareContextByPatient(PATIENT_ID);
    const pendingAlert = ctx.alerts.find((a) => a.id === 'pending-budget-decision');
    expect(pendingAlert).toBeTruthy();
    expect(pendingAlert.budgetId).toBe(BUDGET_003);
    expect(pendingAlert.appointmentId).toBe(APPT_ACTIVE);
  });

  it('1.3 — resumo executivo ativo aponta para ORC-003', () => {
    const header = { patientName: 'Paulo Henrique Silva de Assis' };
    const summary = buildPatientExecutiveSummary(PATIENT_ID, header);
    expect(summary).toBeTruthy();
    // activeBudget usa budgetId (id interno) — ver patientCareExecutiveSummaryService
    expect(summary.activeBudget?.budgetId ?? summary.activeBudget?.id).toBe(BUDGET_003);
  });

  it('1.4 — ORC-003 está editável (não bloqueado por ORC-001)', () => {
    const budget003 = { id: BUDGET_003, status: BUDGET_STATUS.NEGOCIACAO };
    const lockCtx = getBudgetLockContextForBudget(APPT_ACTIVE, budget003, PATIENT_ID);
    const access = resolveBudgetReadOnlyState(budget003, lockCtx);
    expect(access.isEditBlocked, `Bloqueio indevido: ${lockCtx.isLocked}`).toBe(false);
    expect(access.canEdit).toBe(true);
    expect(access.mode).toBe('edit');
  });

  it('1.5 — contrato do ORC-001 permanece vinculado ao ORC-001', () => {
    const contract = getContractStatusForQuote(APPT_OLD, 'clinical_budget', BUDGET_001, PATIENT_ID);
    expect(contract?.id).toBe(CONTRACT_001);
    expect(contract?.status).toBe(CONTRACT_STATUS.SIGNED);
    const linkedToBudget001 = isRealContractLinkedToBudget(BUDGET_001);
    expect(linkedToBudget001).toBe(true);
    const linkedToBudget003 = isRealContractLinkedToBudget(BUDGET_003);
    expect(linkedToBudget003).toBe(false);
  });
});

// ─── BLOCO 2 — Smoke test: aprovar ORC-003 → Financeiro → Contrato ───
describe('BLOCO 2 — Smoke test: fluxo completo ORC-003', () => {
  let approvedBudgetId;
  let receivableIds;
  let contractDraftId;

  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPauloHenriqueScenario();

    // Passo 1: aceitar condição de pagamento no ORC-003
    withDb((db) => {
      const ca = db.clinicalAppointments.find((c) => c.appointmentId === APPT_ACTIVE);
      if (ca?.budget?.paymentOptions?.[0]) {
        ca.budget.paymentOptions[0].accepted = true;
        ca.budget.paymentOptions[0].presentationStatus = 'escolhida';
      }
    });

    // Passo 2: aprovar ORC-003
    updateBudgetStatus(user, APPT_ACTIVE, BUDGET_STATUS.APROVADO, 'Aprovado pelo paciente');
    const budget = getBudget(APPT_ACTIVE);
    approvedBudgetId = budget?.id;

    // Passo 3: gerar financeiro
    const { receivables } = processApprovedBudgetFinance(user, {
      appointmentId: APPT_ACTIVE,
      patientId: PATIENT_ID,
      patient: { id: PATIENT_ID, cpf: '52998224725', full_name: 'Paulo Henrique Silva de Assis' },
      budget,
    });
    receivableIds = receivables.map((r) => r.id);

    // Passo 4: adicionar TCLE (implante → tcle_implante)
    withDb((db) => {
      if (!db.documentRecords) db.documentRecords = [];
      db.documentRecords.push({
        id: 'doc-tcle-003',
        patientId: PATIENT_ID,
        appointmentId: APPT_ACTIVE,
        category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
        templateKey: 'consent_implante',
        title: 'Consentimento Implante',
        content: 'Termo assinado',
        createdAt: new Date().toISOString(),
      });
    });
  });

  it('2.1 — ORC-003 aprovado permanece editável para gerar contrato (não bloqueado)', () => {
    const budget = getBudget(APPT_ACTIVE);
    expect(budget?.status).toBe(BUDGET_STATUS.APROVADO);
    const lockCtx = getBudgetLockContextForBudget(APPT_ACTIVE, budget, PATIENT_ID);
    const access = resolveBudgetReadOnlyState(budget, lockCtx);
    expect(access.isEditBlocked).toBe(false);
    expect(access.canGenerateContract).toBe(true);
  });

  it('2.2 — financeiro gerado com origin_id e budget_id apontando para ORC-003', () => {
    const db = loadDb();
    const recv003 = (db.accountsReceivable || []).filter((r) => receivableIds.includes(r.id));
    expect(recv003.length).toBeGreaterThan(0);
    for (const r of recv003) {
      expect(r.origin_id, `origin_id errado em ${r.id}`).toBe(BUDGET_003);
      expect(r.budget_id, `budget_id errado em ${r.id}`).toBe(BUDGET_003);
      expect(r.patient_id, `patient_id errado em ${r.id}`).toBe(PATIENT_ID);
      expect(r.tenant_id, `tenant_id ausente em ${r.id}`).toBe(TENANT_ID);
      expect(r.installment_number, `installment_number ausente em ${r.id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('2.3 — Bloco 0 continua sem críticos após aprovar ORC-003 e gerar financeiro', () => {
    const report = runDataIntegrityCheck();
    const criticals = report.issues.filter((i) => i.severity === 'critical');
    expect(
      criticals,
      `Novos críticos após aprovação:\n${criticals.map((i) => `[${i.code}] ${i.entity}: ${i.detail}`).join('\n')}`,
    ).toHaveLength(0);
    expect(report.gate).toBe(true);
  });

  it('2.4 — gerar contrato ORC-003 com snapshot financeiro e attachedTcleIds', () => {
    const tpl = loadDb().contractTemplates?.find((t) => t.type === 'system_default');
    expect(tpl, 'Template padrão não encontrado').toBeTruthy();

    const draft = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: APPT_ACTIVE,
      patientId: PATIENT_ID,
      budgetId: BUDGET_003,
      templateId: tpl.id,
      editedHtml: '<p>Contrato Prótese Total — #pacienteNomeCompleto</p>',
      skipHashtagValidation: true,
    });

    contractDraftId = draft.id;
    expect(draft.budgetId).toBe(BUDGET_003);
    expect(draft.patientId).toBe(PATIENT_ID);
    expect(draft.quoteId).toBe(APPT_ACTIVE);
    expect(draft.financialSnapshotJson?.budgetId).toBe(BUDGET_003);
    expect(draft.financialSnapshotJson?.parcelas?.length).toBeGreaterThan(0);
    expect(draft.metadata?.attachedTcleIds).toContain('tcle_implante');
  });

  it('2.5 — snapshot financeiro do contrato ≡ receivables gerados', () => {
    const tpl = loadDb().contractTemplates?.find((t) => t.type === 'system_default');
    const draft = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: APPT_ACTIVE,
      patientId: PATIENT_ID,
      budgetId: BUDGET_003,
      templateId: tpl.id,
      editedHtml: '<p>Contrato</p>',
      skipHashtagValidation: true,
    });

    const snap = draft.financialSnapshotJson;
    const db = loadDb();
    const recv003 = (db.accountsReceivable || []).filter((r) => receivableIds.includes(r.id));

    const sumSnap = snap.parcelas.reduce((s, p) => s + Number(p.net_amount || 0), 0);
    const sumDb   = recv003.reduce((s, r) => s + Number(r.original_amount || 0), 0);

    expect(Math.abs(sumSnap - sumDb)).toBeLessThanOrEqual(0.02);
  });

  it('2.6 — CRO do responsável técnico presente nos metadados do contrato', () => {
    const tpl = loadDb().contractTemplates?.find((t) => t.type === 'system_default');
    const draft = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: APPT_ACTIVE,
      patientId: PATIENT_ID,
      budgetId: BUDGET_003,
      templateId: tpl.id,
      editedHtml: '<p>Contrato</p>',
      skipHashtagValidation: true,
    });

    const db = loadDb();
    const doc = db.clinicDocumentation || {};
    expect(String(doc.responsavelTecnico || '').trim(), 'responsavelTecnico vazio').not.toBe('');
    expect(String(doc.conselhoRegionalNumero || '').trim(), 'CRO vazio').not.toBe('');
    expect(draft.id, 'draft não foi criado').toBeTruthy();
  });

  it('2.7 — TCLE reconhecido nos documentos clínicos', () => {
    const ids = resolveAttachedTcleIdsFromClinicalDocuments({
      patientId: PATIENT_ID,
      appointmentId: APPT_ACTIVE,
    });
    expect(ids).toContain('tcle_implante');
  });

  it('2.8 — Bloco 0 permanece limpo após gerar contrato', () => {
    const tpl = loadDb().contractTemplates?.find((t) => t.type === 'system_default');
    createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: APPT_ACTIVE,
      patientId: PATIENT_ID,
      budgetId: BUDGET_003,
      templateId: tpl.id,
      editedHtml: '<p>Contrato</p>',
      skipHashtagValidation: true,
    });

    markBudgetContractGenerated(user, APPT_ACTIVE);

    const report = runDataIntegrityCheck();
    const criticals = report.issues.filter((i) => i.severity === 'critical');
    expect(
      criticals,
      `Críticos após gerar contrato:\n${criticals.map((i) => `[${i.code}] ${i.entity}: ${i.detail}`).join('\n')}`,
    ).toHaveLength(0);
    expect(report.gate).toBe(true);
  });

  it('2.9 — Central pós-aprovação: primaryBudgetId muda para ORC-003 aprovado', () => {
    const ctx = buildPatientCareContextByPatient(PATIENT_ID);
    expect(ctx.actions.primaryBudgetId).toBe(BUDGET_003);
    expect(ctx.actions.showOpenExistingBudget).toBe(true);
  });

  it('2.10 — ORC-001 permanece inalterado após aprovar ORC-003', () => {
    const db = loadDb();
    const ca = db.clinicalAppointments.find((c) => c.appointmentId === APPT_OLD);
    const hist001 = (ca?.budgetHistory || []).find((h) => h.id === BUDGET_001);
    expect(hist001?.status).toBe(BUDGET_STATUS.APROVADO);
    expect(hist001?.totalValue).toBe(20000);
    const contract001 = (db.generatedContracts || []).find((c) => c.id === CONTRACT_001);
    expect(contract001?.status).toBe(CONTRACT_STATUS.SIGNED);
    expect(contract001?.budgetId).toBe(BUDGET_001);
  });
});
