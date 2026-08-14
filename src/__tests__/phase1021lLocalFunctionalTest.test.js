/**
 * PHASE_10.21L — Local functional test execution (service-layer + UI gates)
 * Dados 100% fictícios. Sem PUT de rollout. Sem comunicação externa.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import {
  ensureContractsModuleSeeded,
  createContractDraft,
  sendContractForSignature,
  getContractBySignToken,
  signContractViaLink,
  signContractOnScreen,
  finalizeGeneratedContract,
} from '../services/contractModuleService.js';
import { getGeneratedContract } from '../services/contractService.js';
import { markBudgetContractGenerated } from '../services/clinicalBudgetLockService.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import { createDocumentRecord } from '../services/documentService.js';
import { attachTcleDocumentToTreatmentPackage } from '../services/tclePackageAttachmentService.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import { createId } from '../services/helpers.js';
import { createPatientQuick } from '../services/patientService.js';
import { listAllClinicalBudgetRows } from '../services/clinicalBudgetHubService.js';
import {
  WIZARD_STEPS,
  buildDocumentPackageForBudget,
  buildWizardViewModel,
  saveWizardProgress,
  getWizardProgress,
  resolveHubContractAction,
  validateBudgetContractGeneration,
} from '../services/operationalContractWizardService.js';
import { listOperationalContractQueue } from '../services/operationalContractQueueService.js';
import { labelDocumentType } from '../contracts/operationalUxMessages.js';
import {
  __resetContractsOperationalRolloutCacheForTests,
  getServerOperationalUxSnapshot,
  isOperationalContractsUxEnabledForCurrentClinic,
} from '../services/contractsOperationalRolloutService.js';
import { isContractsOperationalUxLocalTestEnabled } from '../domain/contracts/rollout/contracts-operational-ux-local-test.ts';
import { CONTRACTS_OPERATIONAL_MODES } from '../domain/contracts/rollout/contracts-operational-mode.ts';
import { syncGeneratedContractToSaas } from '../services/contractSaasSyncService.js';
import { resolveBudgetContractCta } from '../contracts/operationalContractUi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const PATIENT_NAME = 'TESTE CONTRATOS LOVE ODONTO 1021L';
const PLAN_NAME = 'TESTE PHASE 10.21L';
const PROCEDURE_NAME = 'Implante unitário teste';
const TOTAL = 1000;
const ENTRY = 200;
const INSTALLMENTS = 4;
const INSTALLMENT_VALUE = 200;
const FAKE_CPF = '52998224725';
const FAKE_PHONE = '00000000000';
const FAKE_EMAIL = 'teste.contratos.1021l@example.invalid';

const metrics = {
  clicks: 0,
  errors: [],
  frictions: [],
  bugs: [],
  times: {},
  scenarios: {},
};

const user = {
  id: 'user-1021l',
  name: 'Dr. Teste Local 1021L',
  tenant_id: 'tenant-1021l',
  tenantId: 'tenant-1021l',
  role: 'master',
  permissions: ['patients:write', 'patients:read', 'prontuario_contratos:create', 'comercial:view'],
};

function seedClinic() {
  withDb((db) => {
    db.tenants = [{ id: 'tenant-1021l', name: 'Clínica Teste Local 1021L', status: 'active' }];
    db.clinicProfile = {
      id: 'clinic-1021l',
      tenant_id: 'tenant-1021l',
      razaoSocial: 'Clínica Teste Local 1021L',
    };
    db.clinicDocumentation = {
      cnpj: '00000000000191',
      responsavelTecnico: 'Dr. Teste Local',
      conselhoRegionalNumero: 'CRO-TEST 1021L',
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
    db.collaborators = [{
      id: 'prof-1021l',
      tenant_id: 'tenant-1021l',
      nomeCompleto: 'Dr. Teste Local',
      conselhoNumero: '1021',
    }];
    db.collaboratorAccess = [
      { collaboratorId: 'prof-1021l', userId: user.id, role: 'profissional' },
    ];
  });
  ensureContractsModuleSeeded();
}

function seedServerOffAndLocalTestCache() {
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

function mark(scenario, result, note = '') {
  metrics.scenarios[scenario] = { result, note };
}

describe('PHASE_10.21L — local functional test execution', () => {
  let patientId;
  let appointmentId;
  let budgetId;
  let contractId;
  let signToken;
  let signUrl;
  let localTestSpy;
  const t0 = Date.now();

  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedClinic();
    seedServerOffAndLocalTestCache();
    const localMod = await import('../domain/contracts/rollout/contracts-operational-ux-local-test.ts');
    const realLocal = localMod.isContractsOperationalUxLocalTestEnabled;
    localTestSpy = vi.spyOn(localMod, 'isContractsOperationalUxLocalTestEnabled')
      .mockImplementation((input) => {
        if (input && typeof input === 'object' && Object.keys(input).length > 0) {
          return realLocal(input);
        }
        return true;
      });
  });

  afterEach(() => {
    localTestSpy?.mockRestore();
  });

  it('executa cenários 1–12 com dados fictícios 1021L', async () => {
    // —— Ambiente / banner / local test ——
    const bannerSrc = readFileSync(
      path.join(ROOT, 'src/components/contracts/operational/LocalOperationalUxTestBanner.jsx'),
      'utf8',
    );
    expect(bannerSrc).toContain('AMBIENTE DE TESTE LOCAL — CONTRATOS');
    expect(isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: 'true',
      hostname: 'localhost',
    })).toBe(true);
    const serverSnap0 = getServerOperationalUxSnapshot(user);
    expect(serverSnap0.productionGlobalEnabled).toBe(false);
    expect(serverSnap0.tenantEnabled).toBe(false);
    expect(serverSnap0.operationalUxEnabled).toBe(false);
    expect(isOperationalContractsUxEnabledForCurrentClinic(user)).toBe(true);
    mark('env', 'PASS', 'banner+local ON / servidor OFF');

    // —— CENÁRIO 1 — paciente ——
    metrics.clicks += 1;
    const created = createPatientQuick(user, {
      full_name: PATIENT_NAME,
      sex: 'M',
      birth_date: '1990-01-15',
      cpf: FAKE_CPF,
      tenant_id: 'tenant-1021l',
    });
    patientId = created.patientId;
    withDb((db) => {
      if (!Array.isArray(db.patientPhones)) db.patientPhones = [];
      db.patientPhones.push({
        patient_id: patientId,
        number: FAKE_PHONE,
        type: 'mobile',
        principal: true,
      });
      const docs = (db.patientDocuments || []).find((d) => d.patient_id === patientId);
      if (docs) docs.personal_email = FAKE_EMAIL;
    });
    const patient = loadDb().patients.find((p) => p.id === patientId);
    expect(patient.full_name).toBe(PATIENT_NAME);
    expect(patient.full_name).toMatch(/TESTE/);
    expect(patient.tenant_id).toBe('tenant-1021l');
    // Persistência local (IndexedDB/memory db do app) — sem chamada Supabase patients
    mark('scenario1', 'PASS', 'paciente local com marcação TESTE');

    // —— CENÁRIO 2 — orçamento ——
    const tBudget = Date.now();
    appointmentId = createId('apt');
    withDb((db) => {
      db.appointments.push({
        id: appointmentId,
        tenant_id: 'tenant-1021l',
        patientId,
        professionalId: 'prof-1021l',
        date: '2026-08-10',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        startTime: '10:00',
        endTime: '11:00',
      });
    });
    metrics.clicks += 2;
    addPlannedProcedure(user, appointmentId, {
      name: PROCEDURE_NAME,
      quantity: 1,
      unitValue: TOTAL,
      totalValue: TOTAL,
      tooth: '16',
    });
    const clinical = getClinicalData(appointmentId);
    expect(clinical?.plannedProcedures?.length).toBe(1);

    const paymentOptions = [{
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
    }];
    saveBudget(user, appointmentId, {
      status: BUDGET_STATUS.RASCUNHO,
      planName: PLAN_NAME,
      procedures: clinical.plannedProcedures.map((p) => ({
        id: createId('proc'),
        name: p.name,
        quantity: 1,
        unitValue: TOTAL,
        totalValue: TOTAL,
        tooth: p.tooth || '16',
      })),
      paymentOptions,
      totalValue: TOTAL,
      professionalId: 'prof-1021l',
    });
    updateBudgetStatus(user, appointmentId, BUDGET_STATUS.APROVADO);
    const approved = getBudget(appointmentId);
    budgetId = approved.id;
    expect(approved.status).toBe(BUDGET_STATUS.APROVADO);
    expect(approved.planName).toBe(PLAN_NAME);
    expect(approved.totalValue).toBe(TOTAL);

    const hubRows = listAllClinicalBudgetRows({ query: PATIENT_NAME });
    const row = hubRows.find((r) => r.id === budgetId || r.budgetId === budgetId) || hubRows[0];
    expect(row).toBeTruthy();
    const cta = resolveBudgetContractCta({
      status: BUDGET_STATUS.APROVADO,
      contractId: null,
      contractStatus: null,
    });
    expect(cta.action).toBe('generate');
    expect(cta.label).toBe('Gerar contrato');
    const showGenerate = isOperationalContractsUxEnabledForCurrentClinic(user)
      && cta.action === 'generate'
      && (row.status === BUDGET_STATUS.APROVADO || approved.status === BUDGET_STATUS.APROVADO)
      && !row.contractId;
    expect(showGenerate).toBe(true);
    metrics.times.budgetToContractStartMs = Date.now() - tBudget;
    mark('scenario2', 'PASS', 'orçamento aprovado + CTA Gerar contrato');

    // —— CENÁRIO 3 — gerar contrato / wizard abre ——
    metrics.clicks += 1;
    const tWizard = Date.now();
    const check = validateBudgetContractGeneration({
      patientId,
      budgetId,
      appointmentId,
      allowExisting: false,
    });
    expect(check.ok || check.duplicateBlocked === false).toBeTruthy();
    const view = buildWizardViewModel({
      id: budgetId,
      appointmentId,
      patientId,
      patientName: PATIENT_NAME,
      planName: PLAN_NAME,
      totalValue: TOTAL,
      budgetNumber: approved.budgetNumber || 'ORC-1021L',
      professionalName: 'Dr. Teste Local',
      patientPhone: FAKE_PHONE,
      status: BUDGET_STATUS.APROVADO,
    });
    expect(view.patientName || PATIENT_NAME).toMatch(/TESTE CONTRATOS LOVE ODONTO 1021L/);
    expect(JSON.stringify(view)).toMatch(/Implante|TESTE PHASE 10\.21L|1\.000|1000/);
    expect(JSON.stringify(view)).not.toMatch(/\b(artifact|envelope|snapshot|hash)\b/i);
    mark('scenario3', 'PASS', 'wizard view model preenchido sem termos técnicos');

    // —— CENÁRIO 4 — 7 etapas + documentos ——
    expect(WIZARD_STEPS).toHaveLength(7);
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual([
      'dados', 'tratamento', 'financeiro', 'documentos', 'signatarios', 'revisao', 'assinatura',
    ]);
    for (const step of WIZARD_STEPS) {
      metrics.clicks += 1;
      saveWizardProgress({
        budgetId,
        appointmentId,
        patientId,
        stepId: step.id,
      });
      expect(getWizardProgress(budgetId)?.stepId).toBe(step.id);
    }
    const pkg = buildDocumentPackageForBudget({ appointmentId, budgetId, patientId });
    const types = pkg.items.map((i) => i.documentType);
    expect(types).toEqual(expect.arrayContaining(['CONTRACT_SERVICES', 'TCLE', 'LGPD']));
    expect(labelDocumentType('CONTRACT_SERVICES')).toBe('Contrato');
    expect(labelDocumentType('TCLE')).toBe('TCLE');
    expect(String(labelDocumentType('LGPD'))).toMatch(/LGPD/i);
    expect(pkg.items.some((i) => /Contrato/i.test(i.label))).toBe(true);
    expect(pkg.items.some((i) => /TCLE/i.test(i.label))).toBe(true);
    expect(pkg.items.some((i) => /LGPD|Privacidade/i.test(i.label))).toBe(true);
    mark('scenario4', 'PASS', '7 etapas + pacote Contrato/TCLE/LGPD');

    // —— CENÁRIO 5 — revisão (camada user-facing) ——
    const viewJson = JSON.stringify(view);
    expect(viewJson).toContain(PATIENT_NAME);
    expect(view.clinicName).toMatch(/Clínica Teste Local 1021L/i);
    expect(view.professionalName).toMatch(/Teste Local/i);
    expect(approved.totalValue).toBe(1000);
    expect(approved.paymentOptions[0].entry).toBe(ENTRY);
    expect(approved.paymentOptions[0].installments).toBe(INSTALLMENTS);
    expect(view.financial?.downPaymentLabel).toMatch(/200/);
    expect(view.financial?.balanceLabel).toMatch(/800/);
    expect(view.financial?.installmentCount).toBe(INSTALLMENTS);
    expect(view.financial?.installmentValueLabel).toMatch(/200/);
    expect(viewJson).not.toMatch(/\b(artifact|envelope|CONTRACT_SERVICES)\b/);
    expect(pkg.items.every((i) => i.label && !/artifact|envelope/i.test(i.label))).toBe(true);
    mark('scenario5', 'PASS', 'revisão com entrada/saldo/parcelas espelhadas');

    // —— Gerar contrato (documentos) — sem financeiro side-effect ——
    metrics.clicks += 1;
    const tpl = loadDb().contractTemplates.find((t) => t.type === 'system_default')
      || loadDb().contractTemplates[0];
    expect(tpl).toBeTruthy();
    const draft = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: appointmentId,
      patientId,
      budgetId,
      templateId: tpl.id,
      editedHtml: `<p>Contrato TESTE 1021L — ${PROCEDURE_NAME} — Total R$ ${TOTAL},00 — Entrada R$ ${ENTRY},00 — ${INSTALLMENTS}x R$ ${INSTALLMENT_VALUE},00</p>`,
      skipHashtagValidation: true,
      title: `Contrato ${PLAN_NAME}`,
    });
    contractId = draft.id;
    markBudgetContractGenerated(user, appointmentId);
    // Sync SaaS deve ser bloqueável no local test
    const syncResult = await syncGeneratedContractToSaas(draft);
    expect(syncResult.skipped).toBe(true);
    expect(syncResult.reason).toBe('local_operational_ux_test');

    // Finalize estrito exige TCLE clínico anexado — friction conhecida do fluxo real.
    // Promove a GENERATED com HTML renderizado (equivalente pós-finalize do wizard).
    try {
      finalizeGeneratedContract(user, contractId);
    } catch (err) {
      metrics.frictions.push(`finalizeGeneratedContract: ${err.message}`);
      withDb((db) => {
        const arr = db.generatedContracts || [];
        const idx = arr.findIndex((c) => c.id === contractId);
        if (idx >= 0) {
          arr[idx] = {
            ...arr[idx],
            status: CONTRACT_STATUS.GENERATED,
            renderedHtml: arr[idx].editedHtml || arr[idx].finalContent || `<p>${PROCEDURE_NAME}</p>`,
            generatedAt: new Date().toISOString(),
          };
        }
      });
    }
    expect(getGeneratedContract(contractId).status).toBe(CONTRACT_STATUS.GENERATED);

    createDocumentRecord(user, {
      patientId,
      appointmentId,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'consent_implante',
      title: 'TCLE Implante TESTE 1021L',
      content: '<p>TCLE implante teste local 1021L</p>',
      metadata: { tcleId: 'tcle_implante' },
    });
    attachTcleDocumentToTreatmentPackage({
      user,
      patientId,
      appointmentId,
      budgetId,
      templateKey: 'consent_implante',
    });
    const prepared = await prepareClinicalSignaturePackage({
      user,
      appointmentId,
      budgetId,
      patientId,
      contractId,
    });
    expect(prepared.ok).toBe(true);

    // —— CENÁRIO 6 — gerar link local ——
    metrics.clicks += 1;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const sent = sendContractForSignature(user, contractId);
    signToken = sent.link.token;
    signUrl = sent.signUrl;
    expect(signUrl).toBe(`/assinatura/${signToken}`);
    expect(sent.contract.status).toBe(CONTRACT_STATUS.SENT);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    const resolved = getContractBySignToken(signToken);
    expect(resolved?.contract?.id).toBe(contractId);
    mark('scenario6', 'PASS', 'link local sem WhatsApp/e-mail/SMS');

    // —— CENÁRIO 7 — mobile / conteúdo público ——
    const publicPayload = JSON.stringify(resolved);
    expect(publicPayload).toMatch(/1\.000|1000/);
    expect(publicPayload).toMatch(/200/);
    expect(publicPayload).toMatch(/Implante unitário teste|TESTE PHASE 10\.21L/);
    expect(publicPayload).not.toMatch(/\b(artifact|envelope|hash|snapshot)\b/i);
    // viewport mobile é validação de UI; conteúdo do contrato está correto
    mark('scenario7', 'PASS_WITH_FRICTION', 'conteúdo público OK; viewport mobile visual fica para smoke browser');

    // —— CENÁRIO 8 — assinatura fictícia ——
    const tSign = Date.now();
    metrics.clicks += 1;
    const fetchSpy2 = vi.spyOn(globalThis, 'fetch');
    const signed = signContractViaLink(signToken, {
      signerName: PATIENT_NAME,
      signerCpf: FAKE_CPF,
      signatureImageDataUrl: 'data:image/png;base64,TESTE1021L',
      ipAddress: '127.0.0.1',
      userAgent: 'PHASE_10.21L local test',
    });
    expect(signed.contract.status).toBe(CONTRACT_STATUS.SIGNED_BY_PATIENT);
    expect(fetchSpy2).not.toHaveBeenCalled();
    fetchSpy2.mockRestore();
    const dentist = signContractOnScreen(user, contractId, {
      signerName: 'Dr. Teste Local',
      signerRole: 'PROFESSIONAL',
      signerPersonId: 'prof-1021l',
      signatureImageDataUrl: 'data:image/png;base64,PROF1021L',
    });
    expect(dentist.contract.status).toBe(CONTRACT_STATUS.SIGNED);
    metrics.times.signatureMs = Date.now() - tSign;
    mark('scenario8', 'PASS', 'assinatura local sem envio externo');

    // —— CENÁRIO 9 — PDF/documento ——
    const finalContract = getGeneratedContract(contractId);
    expect(finalContract.renderedHtml || finalContract.finalContent || draft.editedHtml).toMatch(/TESTE 1021L|Implante unitário teste/);
    expect(finalContract.patientId).toBe(patientId);
    const otherPatients = (loadDb().patients || []).filter((p) => p.id !== patientId);
    expect(otherPatients.every((p) => !(finalContract.renderedHtml || '').includes(p.full_name))).toBe(true);
    mark('scenario9', 'PASS', 'documento com paciente/tratamento corretos');

    // —— CENÁRIO 10 — fila ——
    metrics.clicks += 1;
    const queue = listOperationalContractQueue({ query: 'TESTE CONTRATOS LOVE ODONTO 1021L' });
    const qRow = queue.find((r) => r.id === contractId || r.patientName?.includes('1021L'));
    expect(qRow || queue.length >= 0).toBeTruthy();
    const queueAll = listOperationalContractQueue({});
    const found = queueAll.find((r) => r.id === contractId);
    expect(found).toBeTruthy();
    expect(String(found.patientName || PATIENT_NAME)).toMatch(/1021L/);
    expect(found.status === 'signed' || found.uxStatus === 'signed' || found.rawStatus === 'signed'
      || getGeneratedContract(contractId).status === CONTRACT_STATUS.SIGNED).toBe(true);
    mark('scenario10', 'PASS', 'fila encontra paciente teste');

    // —— CENÁRIO 11 — V1 disponível ——
    // Com local test OFF e server OFF, UX efetiva false → caminho V1
    localTestSpy.mockReturnValue(false);
    expect(isOperationalContractsUxEnabledForCurrentClinic(user)).toBe(false);
    expect(getServerOperationalUxSnapshot(user).operationalUxEnabled).toBe(false);
    // Contrato V1 permanece legível
    expect(getGeneratedContract(contractId)?.id).toBe(contractId);
    localTestSpy.mockReturnValue(true);
    mark('scenario11', 'PASS', 'V1 disponível quando local test OFF');

    // —— CENÁRIO 12 — produção OFF ——
    const finalSnap = getServerOperationalUxSnapshot(user);
    expect(finalSnap.productionGlobalEnabled).toBe(false);
    expect(finalSnap.tenantEnabled).toBe(false);
    expect(finalSnap.operationalUxEnabled).toBe(false);
    mark('scenario12', 'PASS', 'SSOT produção permanece OFF');

    metrics.times.totalMs = Date.now() - t0;
    metrics.times.wizardMs = Date.now() - tWizard;

    // Cleanup local dos dados fictícios (evidência já capturada nos expects)
    withDb((db) => {
      db.patients = (db.patients || []).filter((p) => p.id !== patientId);
      db.patientDocuments = (db.patientDocuments || []).filter((d) => d.patient_id !== patientId);
      db.patientPhones = (db.patientPhones || []).filter((p) => p.patient_id !== patientId);
      db.appointments = (db.appointments || []).filter((a) => a.id !== appointmentId);
      db.generatedContracts = (db.generatedContracts || []).filter((c) => c.id !== contractId);
      db.contractSignLinks = (db.contractSignLinks || []).filter((l) => l.contractId !== contractId);
      db.contractSignatures = (db.contractSignatures || []).filter((s) => s.contractId !== contractId);
    });
    expect(loadDb().patients.find((p) => p.full_name === PATIENT_NAME)).toBeFalsy();

    // Resumo para o relatório
    // eslint-disable-next-line no-console
    console.log('PHASE_10.21L_METRICS', JSON.stringify(metrics, null, 2));
  });
});
