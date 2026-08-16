/**
 * PHASE_10.21AM — Elegibilidade documental / TCLE SSOT / package guard.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import { createDocumentRecord } from '../services/documentService.js';
import {
  attachTcleDocumentToTreatmentPackage,
  attachEligibleTcleToTreatmentPackage,
} from '../services/tclePackageAttachmentService.js';
import { buildDocumentPackageForBudget } from '../services/operationalContractWizardService.js';
import { getContractReadinessChecklist } from '../services/contractValidationService.js';
import { createContractDraft, ensureContractsModuleSeeded, getContractStatusForQuote } from '../services/contractModuleService.js';
import {
  getTreatmentDocumentRequirements,
  evaluateTcleTemplateEligibility,
  DOCUMENT_APPLICABILITY,
  TCLE_NOT_REQUIRED_REASON,
} from '../contracts/treatmentDocumentRequirements.js';
import {
  getClinicalWorkflowState,
  getNavStepStatus,
  STEP_STATUS,
} from '../components/clinical/clinicalAppointmentConfig.js';
import { resolveRequiredTcles } from '../contracts/contractTcleRegistry.js';
import { detectAllTreatmentTypes } from '../components/clinical/contract/detectTreatmentType.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-1021am';
const PATIENT_ID = 'patient-1021am';
const OTHER_PATIENT = 'patient-other-am';
const APPT_ID = 'appt-1021am';
const OTHER_APPT = 'appt-other-am';
const BUDGET_ID = 'budget-1021am';
const OTHER_BUDGET = 'budget-other-am';
const user = { id: 'user-am', role: 'admin', tenantId: TENANT, tenant_id: TENANT };

function seedScenario({
  planName = 'Aplicação tópica de flúor',
  procedures = [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
  contractStatus = CONTRACT_STATUS.GENERATED,
  tenantId = TENANT,
  patientId = PATIENT_ID,
  appointmentId = APPT_ID,
  budgetId = BUDGET_ID,
  withContract = true,
} = {}) {
  withDb((db) => {
    db.tenants = [{ id: tenantId, name: 'AM' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: tenantId, nomeFantasia: 'AM' };
    db.clinicDocumentation = { cnpj: '11222333000181', responsavelTecnico: 'Dr AM', croResponsavelTecnico: 'CRO-MG 1' };
    db.clinicAddresses = [{ principal: true, cidade: 'Belo Horizonte', uf: 'MG', logradouro: 'Rua AM', numero: '1' }];
    db.patients = [
      { id: patientId, full_name: 'Paulo Henrique Silva de Assis', tenant_id: tenantId, cpf: '39053344705' },
      { id: OTHER_PATIENT, full_name: 'Outro Paciente', tenant_id: tenantId },
    ];
    db.appointments = [
      { id: appointmentId, patientId, professionalId: 'col-am', status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: tenantId },
      { id: OTHER_APPT, patientId: OTHER_PATIENT, professionalId: 'col-am', status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: tenantId },
    ];
    db.clinicalAppointments = [{
      appointmentId,
      patientId,
      budget: {
        id: budgetId,
        status: BUDGET_STATUS.CONTRATO_GERADO,
        planName,
        procedures,
        totalValue: 150,
        paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
      },
      budgetHistory: [],
    }, {
      appointmentId: OTHER_APPT,
      patientId: OTHER_PATIENT,
      budget: {
        id: OTHER_BUDGET,
        status: BUDGET_STATUS.APROVADO,
        planName: 'Implante unitário',
        procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
      },
    }];
    db.documentRecords = [];
    db.generatedContracts = withContract ? [{
      id: 'gc-1021am',
      contractNumber: 'CTR-2026-00001',
      status: contractStatus,
      quoteSource: 'clinical_budget',
      quoteId: appointmentId,
      budgetId,
      patientId,
      clinicId: 'clinic-1',
      tenant_id: tenantId,
      version: 1,
      renderedHtml: '<p>CTR</p>',
      metadata: {},
    }] : [];
  });
  ensureContractsModuleSeeded();
}

describe('PHASE_10.21AM document eligibility SSOT', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A) flúor somente → TCLE not required', () => {
    seedScenario();
    const req = getTreatmentDocumentRequirements({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(req.documents.tcle.required).toBe(false);
    expect(req.documents.tcle.applicable).toBe(false);
    expect(req.documents.tcle.reason).toBe(TCLE_NOT_REQUIRED_REASON);
    expect(req.documents.tcle.ready).toBe(true);
  });

  it('B) flúor + abrir TCLE Implante → TCLE continua not required', () => {
    seedScenario();
    createDocumentRecord(user, {
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'consent_implante',
      title: 'Implante',
      content: 'TCLE implante avulso',
      metadata: {
        tcleId: 'tcle_implante',
        applicability: DOCUMENT_APPLICABILITY.NOT_APPLICABLE_TO_CURRENT_TREATMENT,
        origin: DOCUMENT_APPLICABILITY.MANUAL,
      },
    });
    const req = getTreatmentDocumentRequirements({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(req.documents.tcle.required).toBe(false);
    expect(req.documents.tcle.ready).toBe(true);
    const eligibility = evaluateTcleTemplateEligibility({
      templateKey: 'consent_implante',
      treatmentTypes: req.treatmentTypes,
    });
    expect(eligibility.eligibleForPackage).toBe(false);
    expect(eligibility.reason).toBe(TCLE_NOT_REQUIRED_REASON);
  });

  it('C) flúor → TCLE Implante não entra automaticamente no package', () => {
    seedScenario();
    const attached = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      templateKey: 'consent_implante',
    });
    expect(attached.ok).toBe(false);
    expect(attached.attached).toBe(false);
    const contract = getContractStatusForQuote(APPT_ID, 'clinical_budget', BUDGET_ID, PATIENT_ID);
    expect(contract.metadata?.attachedTcleIds || []).toHaveLength(0);
    const pkg = buildDocumentPackageForBudget({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    const tcle = pkg.items.find((i) => i.documentType === 'TCLE');
    expect(tcle.required).toBe(false);
    expect(tcle.ready).toBe(true);
    expect(tcle.detail).toMatch(/Não exigido/i);
  });

  it('D) flúor → Vincular último/elegível TCLE não vincula incompatível', () => {
    seedScenario();
    createDocumentRecord(user, {
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'consent_implante',
      title: 'Implante',
      content: 'x',
    });
    const result = attachEligibleTcleToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(TCLE_NOT_REQUIRED_REASON);
    expect(getContractStatusForQuote(APPT_ID, 'clinical_budget', BUDGET_ID, PATIENT_ID).metadata?.attachedTcleIds || []).toHaveLength(0);
  });

  it('E) implante → TCLE Implante required', () => {
    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
    });
    const req = getTreatmentDocumentRequirements({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(req.documents.tcle.required).toBe(true);
    expect(req.documents.tcle.applicable).toBe(true);
    expect(req.documents.tcle.requiredTcles.some((t) => t.id === 'tcle_implante')).toBe(true);
  });

  it('F) implante + TCLE correto → satisfied', () => {
    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
    });
    createDocumentRecord(user, {
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'consent_implante',
      title: 'Implante',
      content: 'ok',
      metadata: { tcleId: 'tcle_implante' },
    });
    const req = getTreatmentDocumentRequirements({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(req.documents.tcle.ready).toBe(true);
    expect(req.requiredApplicableSatisfied).toBe(true);
  });

  it('G) implante + TCLE incompatível → continua pending', () => {
    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
    });
    createDocumentRecord(user, {
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'consent_ortodontia',
      title: 'Ortodontia',
      content: 'outro',
      metadata: { tcleId: 'tcle_ortodontia' },
    });
    const req = getTreatmentDocumentRequirements({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(req.documents.tcle.ready).toBe(false);
    expect(req.requiredApplicableSatisfied).toBe(false);
    const attach = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      templateKey: 'consent_ortodontia',
    });
    expect(attach.ok).toBe(false);
  });

  it('H) documento opcional ausente não mantém Documents pending', () => {
    seedScenario();
    const req = getTreatmentDocumentRequirements({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(req.documents.imageConsent.required).toBe(false);
    expect(req.documents.imageConsent.ready).toBe(false);
    expect(req.requiredApplicableSatisfied).toBe(true);
  });

  it('I) todos required/applicable satisfeitos → Documents concluded', () => {
    seedScenario();
    const workflow = getClinicalWorkflowState(APPT_ID, BUDGET_ID);
    expect(getNavStepStatus('documentos', workflow, 'contratos')).toBe(STEP_STATUS.COMPLETED);
  });

  it('J) TCLE não aplicável: Contract Readiness e Documents mesma decisão', () => {
    seedScenario();
    const req = getTreatmentDocumentRequirements({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    const types = detectAllTreatmentTypes({
      planName: 'Aplicação tópica de flúor',
      procedures: [{ name: 'Aplicação tópica de flúor' }],
    });
    expect(resolveRequiredTcles(types)).toHaveLength(0);
    const checklist = getContractReadinessChecklist({
      quoteSource: 'clinical_budget',
      quoteId: APPT_ID,
      patientId: PATIENT_ID,
      currentUser: user,
      attachedTcleIds: [],
      strict: true,
    });
    expect(checklist.requiredTcles).toHaveLength(0);
    expect(req.documents.tcle.required).toBe(false);
    expect(req.documents.tcle.reason).toBe(TCLE_NOT_REQUIRED_REASON);
  });

  it('K) package builder rejeita documento incompatível', () => {
    seedScenario();
    const pkg = buildDocumentPackageForBudget({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(pkg.items.find((i) => i.documentType === 'TCLE').required).toBe(false);
    const attach = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      templateKey: 'consent_implante',
    });
    expect(attach.ok).toBe(false);
    expect(attach.packageSnapshot).toBeNull();
  });

  it('L) cross-patient document → reject', () => {
    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
    });
    const doc = createDocumentRecord(user, {
      patientId: OTHER_PATIENT,
      appointmentId: OTHER_APPT,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'consent_implante',
      title: 'Implante',
      content: 'x',
      metadata: { tcleId: 'tcle_implante' },
    });
    const attach = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      documentId: doc.id,
      templateKey: 'consent_implante',
    });
    expect(attach.ok).toBe(false);
    expect(attach.error).toMatch(/paciente/i);
  });

  it('M) cross-tenant document → reject', () => {
    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
    });
    const otherUser = { id: 'user-other', role: 'admin', tenantId: 'tenant-other', tenant_id: 'tenant-other' };
    const attach = attachTcleDocumentToTreatmentPackage({
      user: otherUser,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      templateKey: 'consent_implante',
    });
    expect(attach.ok).toBe(false);
    expect(attach.error).toMatch(/tenant/i);
  });

  it('N) cross-budget document → reject quando metadata.budgetId diverge', () => {
    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
    });
    const doc = createDocumentRecord(user, {
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'consent_implante',
      title: 'Implante',
      content: 'x',
      metadata: { tcleId: 'tcle_implante', budgetId: OTHER_BUDGET },
    });
    const attach = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      documentId: doc.id,
      templateKey: 'consent_implante',
    });
    expect(attach.ok).toBe(false);
    expect(attach.error).toMatch(/orçamento/i);
  });

  it('O) documento/contrato frozen → nunca sobrescrever', () => {
    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
      contractStatus: CONTRACT_STATUS.SIGNED,
    });
    withDb((db) => {
      const c = db.generatedContracts[0];
      c.metadata = { packageManifestId: 'man-frozen', packageManifestHash: 'abc', attachedTcleIds: ['tcle_implante'] };
    });
    const before = JSON.stringify(loadDb().generatedContracts[0].metadata);
    const attach = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      templateKey: 'consent_implante',
    });
    expect(attach.ok).toBe(false);
    expect(attach.frozen).toBe(true);
    expect(JSON.stringify(loadDb().generatedContracts[0].metadata)).toBe(before);
  });

  it('P) duplicação de documento não duplica package item', () => {
    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
    });
    const first = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      templateKey: 'consent_implante',
    });
    const second = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      templateKey: 'consent_implante',
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    const ids = getContractStatusForQuote(APPT_ID, 'clinical_budget', BUDGET_ID, PATIENT_ID).metadata.attachedTcleIds;
    expect(ids).toEqual(['tcle_implante']);
  });

  it('Q) refresh/reload → readiness determinístico', () => {
    seedScenario();
    const a = getTreatmentDocumentRequirements({ appointmentId: APPT_ID, budgetId: BUDGET_ID, patientId: PATIENT_ID });
    const b = getTreatmentDocumentRequirements({ appointmentId: APPT_ID, budgetId: BUDGET_ID, patientId: PATIENT_ID });
    expect(a.documents.tcle).toEqual(b.documents.tcle);
    expect(a.requiredApplicableSatisfied).toBe(true);
    expect(getNavStepStatus('documentos', getClinicalWorkflowState(APPT_ID, BUDGET_ID), null)).toBe(STEP_STATUS.COMPLETED);
  });

  it('R) contrato CTR-2026-00001 não é duplicado', () => {
    seedScenario();
    const existing = getContractStatusForQuote(APPT_ID, 'clinical_budget', BUDGET_ID, PATIENT_ID);
    expect(existing.contractNumber).toBe('CTR-2026-00001');
    const reused = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: APPT_ID,
      patientId: PATIENT_ID,
      budgetId: BUDGET_ID,
      templateId: loadDb().contractTemplates.find((t) => t.type === 'system_default').id,
      editedHtml: '<p>x</p>',
      skipHashtagValidation: true,
    });
    expect(reused.id).toBe(existing.id);
    expect((loadDb().generatedContracts || []).filter((c) => c.quoteId === APPT_ID)).toHaveLength(1);
  });

  it('UX: CTAs de package não sugerem TCLE quando não exigido', () => {
    const modal = readFileSync(path.join(ROOT, 'src/components/clinical/DocumentsSection.jsx'), 'utf8');
    expect(modal).toContain('canAttachToPackage');
    expect(modal).toContain('tcle-incompatible-warning');
    expect(modal).toContain('Vincular TCLE elegível ao pacote');
    expect(modal).not.toContain('Vincular último TCLE ao pacote');
    expect(modal).toContain('tcleRequired && (returnToContractHref');
  });
});
