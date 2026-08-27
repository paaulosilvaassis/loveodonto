/**
 * PHASE_10.21AO — etapa Assinatura na régua clínica, reusando SSOT de package/manifest.
 * Sem comunicação externa. Sem assinatura real em produção.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.React = React;

vi.mock('../services/contractPdfService.js', () => ({
  contractHtmlWithSignatures: (html) => html || '',
  downloadContractPdfFromElement: async () => {},
  printContractElement: () => {},
}));
vi.mock('html2canvas', () => ({ default: async () => ({ toDataURL: () => '' }) }));
vi.mock('jspdf', () => ({ jsPDF: class JsPDF { save() {} } }));

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import { createDocumentRecord } from '../services/documentService.js';
import { attachTcleDocumentToTreatmentPackage } from '../services/tclePackageAttachmentService.js';
import {
  getTreatmentDocumentRequirements,
  DOCUMENT_APPLICABILITY,
  TCLE_NOT_REQUIRED_REASON,
} from '../contracts/treatmentDocumentRequirements.js';
import {
  evaluateClinicalSignatureReadiness,
  assertClinicalSignatureReady,
  CLINICAL_SIGNATURE_STEP,
} from '../contracts/clinicalSignatureReadiness.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import {
  signContractOnScreen,
  sendContractForSignature,
} from '../services/contractModuleService.js';
import { createSignatureRequest as createProviderSignatureRequest } from '../services/signatureProviderService.js';
import {
  CLINICAL_NAV_ITEMS,
  CLINICAL_WORKFLOW_STEPS,
  getClinicalWorkflowState,
  getNavStepStatus,
  STEP_STATUS,
} from '../components/clinical/clinicalAppointmentConfig.js';
import { ClinicalSignatureSection } from '../components/clinical/ClinicalSignatureSection.jsx';
import { buildClinicalAppointmentUrl } from '../services/budgetNavigationService.js';
import { AuthContext } from '../auth/authContext.js';
import ContractsAssinadosPage from '../pages/contratos/ContractsAssinadosPage.jsx';
import ContractsPendentesPage from '../pages/contratos/ContractsPendentesPage.jsx';
import ContractsAssinaturasPage from '../pages/contratos/ContractsAssinaturasPage.jsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT_ID = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const OTHER_PATIENT = 'patient-other-ao';
const APPT_ID = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const OTHER_APPT = 'appt-other-ao';
const CLINICAL_ID = 'clinical-9df8fac3-12e3-4b59-bf45-616880d1190b';
const BUDGET_ID = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const OTHER_BUDGET = 'budget-other-ao';
const CONTRACT_ID = 'gctr-ctr-2026-00001';
const OTHER_CONTRACT = 'gctr-other-ao';
const user = { id: 'user-ao', role: 'admin', tenantId: TENANT, tenant_id: TENANT };
const dentistUser = { id: 'user-juliana-ao', role: 'profissional', tenantId: TENANT, tenant_id: TENANT };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function seedScenario({
  planName = 'Aplicação tópica de flúor',
  procedures = [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
  contractStatus = CONTRACT_STATUS.GENERATED,
  tenantId = TENANT,
  patientId = PATIENT_ID,
  appointmentId = APPT_ID,
  budgetId = BUDGET_ID,
  contractId = CONTRACT_ID,
  metadata = {},
  extraContract = null,
} = {}) {
  withDb((db) => {
    db.tenants = [{ id: tenantId, name: 'Implanprime' }, { id: 'tenant-other-ao', name: 'Outro' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: tenantId, nomeFantasia: 'Implanprime' };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Dra. Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.collaborators = [{
      id: 'col-ao',
      nomeCompleto: 'Juliana de Oliveira Freire',
      conselhoNumero: '27267',
      conselhoUf: 'MG',
      tenant_id: tenantId,
    }];
    db.collaboratorAccess = [
      { collaboratorId: 'col-ao', userId: 'user-juliana-ao', role: 'profissional' },
    ];
    db.clinicAddresses = [{ principal: true, cidade: 'Belo Horizonte', uf: 'MG', logradouro: 'Rua AO', numero: '1' }];
    db.patients = [
      { id: patientId, full_name: 'Paulo Henrique Silva de Assis', tenant_id: tenantId, cpf: '39053344705' },
      { id: OTHER_PATIENT, full_name: 'Outro Paciente', tenant_id: tenantId },
    ];
    db.appointments = [
      { id: appointmentId, patientId, professionalId: 'col-ao', status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: tenantId },
      { id: OTHER_APPT, patientId: OTHER_PATIENT, professionalId: 'col-ao', status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: tenantId },
    ];
    db.clinicalAppointments = [{
      id: CLINICAL_ID,
      appointmentId,
      patientId,
      budget: {
        id: budgetId,
        budgetNumber: 'ORC-001',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        planName,
        procedures,
        totalValue: procedures[0]?.unitValue || 150,
        paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
      },
      budgetHistory: [],
    }, {
      appointmentId: OTHER_APPT,
      patientId: OTHER_PATIENT,
      budget: {
        id: OTHER_BUDGET,
        status: BUDGET_STATUS.APROVADO,
        planName: 'Outro plano',
        procedures: [{ name: 'Profilaxia', quantity: 1, unitValue: 80 }],
      },
    }];
    db.documentRecords = [];
    db.generatedContracts = [{
      id: contractId,
      contractNumber: 'CTR-2026-00001',
      status: contractStatus,
      quoteSource: 'clinical_budget',
      quoteId: appointmentId,
      budgetId,
      patientId,
      clinicId: 'clinic-1',
      tenant_id: tenantId,
      version: 1,
      renderedHtml: '<p>CTR-2026-00001 flúor</p>',
      metadata: { ...metadata },
    }];
    if (extraContract) db.generatedContracts.push(extraContract);
    db.clinicalPackageManifests = [];
    db.contractSignatures = [];
    db.contractSignLinks = [];
    db.contractSignatureRequests = [];
  });
}

function evalReady(overrides = {}) {
  return evaluateClinicalSignatureReadiness({
    appointmentId: APPT_ID,
    budgetId: BUDGET_ID,
    patientId: PATIENT_ID,
    tenantId: TENANT,
    contractId: CONTRACT_ID,
    user,
    ...overrides,
  });
}

async function freezeReadyFluor() {
  seedScenario();
  const prepared = await prepareClinicalSignaturePackage({
    user,
    appointmentId: APPT_ID,
    budgetId: BUDGET_ID,
    patientId: PATIENT_ID,
    contractId: CONTRACT_ID,
  });
  expect(prepared.ok).toBe(true);
  return prepared;
}

function wrapAdmin(node, route = '/gestao/contratos/assinados') {
  return React.createElement(
    AuthContext.Provider,
    { value: { user } },
    React.createElement(MemoryRouter, { initialEntries: [route] }, node),
  );
}

describe('PHASE_10.21AO clinical signature step', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('1) DRAFT → Assinatura bloqueada e sign recusado', async () => {
    seedScenario({ contractStatus: CONTRACT_STATUS.DRAFT });
    const readiness = evalReady();
    expect(readiness.signatureReady).toBe(false);
    expect(readiness.canSignNow).toBe(false);
    expect(readiness.canSend).toBe(false);
    expect(readiness.step).toBe(CLINICAL_SIGNATURE_STEP.BLOCKED);
    expect(readiness.blockers.some((b) => b.code === 'CONTRACT_NOT_FINALIZED')).toBe(true);
    expect(readiness.blockers.find((b) => b.code === 'CONTRACT_NOT_FINALIZED').ctaSection).toBe('contratos');
    await expect(signContractOnScreen(user, CONTRACT_ID, {
      signerName: 'Paulo',
      signatureImageDataUrl: 'data:image/png;base64,abc',
    })).rejects.toThrow(/rascunho/i);
  });

  it('2) Finalized sem package → bloqueada', () => {
    seedScenario({ contractStatus: CONTRACT_STATUS.GENERATED, metadata: {} });
    const readiness = evalReady();
    expect(readiness.contractFinalized).toBe(true);
    expect(readiness.manifestFrozen).toBe(false);
    expect(readiness.signatureReady).toBe(false);
    expect(readiness.canSignNow).toBe(false);
    expect(readiness.step).toBe(CLINICAL_SIGNATURE_STEP.PREPARING_PACKAGE);
    expect(readiness.blockers.some((b) => b.code === 'MANIFEST_NOT_FROZEN')).toBe(true);
  });

  it('3) Package incompleto (implante sem TCLE) → bloqueada', () => {
    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
    });
    const readiness = evalReady();
    expect(readiness.packageReady).toBe(false);
    expect(readiness.documentsSatisfied).toBe(false);
    expect(readiness.signatureReady).toBe(false);
    expect(readiness.blockers.some((b) => b.code === 'DOCUMENTS_PENDING')).toBe(true);
    expect(readiness.blockers.find((b) => b.code === 'DOCUMENTS_PENDING').ctaSection).toBe('documentos');
  });

  it('4) Manifest não frozen → bloqueada', () => {
    seedScenario();
    const readiness = evalReady();
    expect(readiness.packageReady).toBe(true);
    expect(readiness.manifestFrozen).toBe(false);
    expect(readiness.signatureReady).toBe(false);
    expect(readiness.blockers.some((b) => b.code === 'MANIFEST_NOT_FROZEN')).toBe(true);
    expect(readiness.blockers.find((b) => b.code === 'MANIFEST_NOT_FROZEN').action).toBe('prepare_package');
  });

  it('5) signatureReady → CTA Assinar agora', async () => {
    await freezeReadyFluor();
    const readiness = evalReady();
    expect(readiness.step).toBe(CLINICAL_SIGNATURE_STEP.READY_TO_SIGN);
    expect(readiness.signatureReady).toBe(true);
    expect(readiness.canSignNow).toBe(true);
    const html = renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT_ID,
      patientId: PATIENT_ID,
      budgetId: BUDGET_ID,
      user,
    }));
    expect(html).toContain('clinical-sign-now-cta');
    expect(html).toContain('Assinar agora');
    expect(html).toContain('CTR-2026-00001');
  });

  it('6) signatureReady → CTA Enviar assinatura', async () => {
    await freezeReadyFluor();
    const readiness = evalReady();
    expect(readiness.canSend).toBe(true);
    const html = renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT_ID,
      patientId: PATIENT_ID,
      budgetId: BUDGET_ID,
      user,
    }));
    expect(html).toContain('clinical-send-signature-cta');
    expect(html).toContain('Enviar para assinatura');
    expect(html).not.toMatch(/whatsapp|sms/i);
  });

  it('7) flúor não exige TCLE', () => {
    seedScenario();
    const req = getTreatmentDocumentRequirements({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(req.documents.tcle.required).toBe(false);
    expect(req.documents.tcle.applicable).toBe(false);
    expect(req.documents.tcle.reason).toBe(TCLE_NOT_REQUIRED_REASON);
    const readiness = evalReady();
    expect(readiness.tcleRequired).toBe(false);
    expect(readiness.tcleApplicable).toBe(false);
  });

  it('8) TCLE implante avulso não entra no package de flúor', async () => {
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
    const attach = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      templateKey: 'consent_implante',
    });
    expect(attach.ok).toBe(false);
    const prepared = await prepareClinicalSignaturePackage({
      user,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      contractId: CONTRACT_ID,
    });
    expect(prepared.ok).toBe(true);
    const frozen = (loadDb().clinicalPackageManifests || [])[0];
    const payload = JSON.stringify(frozen || {});
    expect(payload).not.toMatch(/IMPLANT_CONSENT|tcle_implante|tcle:/i);
  });

  it('9) paciente sozinho = parcial; paciente+profissional → Assinado', async () => {
    await freezeReadyFluor();
    const partial = await signContractOnScreen(user, CONTRACT_ID, {
      signerName: 'Paulo Henrique Silva de Assis',
      signerCpf: '39053344705',
      signerRole: 'PATIENT',
      signerPersonId: PATIENT_ID,
      signatureImageDataUrl: 'data:image/png;base64,abc',
    });
    expect(partial.contract.status).not.toBe(CONTRACT_STATUS.SIGNED);
    expect(evalReady().step).toBe(CLINICAL_SIGNATURE_STEP.PARTIALLY_SIGNED);
    const signed = await signContractOnScreen(dentistUser, CONTRACT_ID, {
      signerName: 'Juliana de Oliveira Freire',
      signerRole: 'PROFESSIONAL',
      signerPersonId: 'col-ao',
      signatureImageDataUrl: 'data:image/png;base64,def',
    });
    expect(signed.contract.status).toBe(CONTRACT_STATUS.SIGNED);
    const readiness = evalReady();
    expect(readiness.step).toBe(CLINICAL_SIGNATURE_STEP.SIGNED);
    expect(readiness.label).toBe('Assinado');
    const workflow = getClinicalWorkflowState(APPT_ID, BUDGET_ID);
    expect(getNavStepStatus('assinatura', workflow, 'assinatura')).toBe(STEP_STATUS.COMPLETED);
  });

  it('10) refresh preserva estado', async () => {
    await freezeReadyFluor();
    const a = evalReady();
    const b = evalReady();
    expect(a.step).toBe(b.step);
    expect(a.identity.contractId).toBe(CONTRACT_ID);
    expect(a.identity.packageManifestId).toBe(b.identity.packageManifestId);
    expect(a.identity.contractNumber).toBe('CTR-2026-00001');
  });

  it('11) atendimento correto usa contrato correto', () => {
    seedScenario({
      extraContract: {
        id: OTHER_CONTRACT,
        contractNumber: 'CTR-2026-99999',
        status: CONTRACT_STATUS.GENERATED,
        quoteSource: 'clinical_budget',
        quoteId: OTHER_APPT,
        budgetId: OTHER_BUDGET,
        patientId: OTHER_PATIENT,
        clinicId: 'clinic-1',
        tenant_id: TENANT,
        renderedHtml: '<p>OUTRO</p>',
        metadata: {},
      },
    });
    const readiness = evalReady();
    expect(readiness.identity.contractId).toBe(CONTRACT_ID);
    expect(readiness.identity.contractNumber).toBe('CTR-2026-00001');
    expect(readiness.contract.id).toBe(CONTRACT_ID);
    expect(readiness.identity.appointmentId).toBe(APPT_ID);
    expect(readiness.identity.budgetId).toBe(BUDGET_ID);
  });

  it('12) cross-patient reject', () => {
    seedScenario();
    const readiness = evalReady({ patientId: OTHER_PATIENT });
    expect(readiness.signatureReady).toBe(false);
    expect(readiness.canSignNow).toBe(false);
    expect(readiness.step).toBe(CLINICAL_SIGNATURE_STEP.BLOCKED);
    expect(() => assertClinicalSignatureReady({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: OTHER_PATIENT,
      contractId: CONTRACT_ID,
      user,
    }, { forSign: true })).toThrow();
  });

  it('13) cross-tenant reject', () => {
    seedScenario();
    const readiness = evalReady({ tenantId: 'tenant-other-ao' });
    expect(readiness.signatureReady).toBe(false);
    expect(readiness.step).toBe(CLINICAL_SIGNATURE_STEP.BLOCKED);
  });

  it('14) cross-budget reject', () => {
    seedScenario();
    const readiness = evalReady({ budgetId: OTHER_BUDGET });
    expect(readiness.signatureReady).toBe(false);
    expect(readiness.canSignNow).toBe(false);
    expect(readiness.step).toBe(CLINICAL_SIGNATURE_STEP.BLOCKED);
  });

  it('15) administrativo Pendentes/Assinados/Assinaturas continua funcionando', () => {
    seedScenario({ contractStatus: CONTRACT_STATUS.SIGNED });
    expect(() => renderToStaticMarkup(wrapAdmin(React.createElement(ContractsAssinadosPage)))).not.toThrow();
    expect(() => renderToStaticMarkup(wrapAdmin(React.createElement(ContractsPendentesPage), '/gestao/contratos/pendentes'))).not.toThrow();
    expect(() => renderToStaticMarkup(wrapAdmin(React.createElement(ContractsAssinaturasPage), '/gestao/contratos/assinaturas'))).not.toThrow();
    const signed = renderToStaticMarkup(wrapAdmin(React.createElement(ContractsAssinadosPage)));
    expect(signed).toContain('CTR-2026-00001');
    expect(signed).not.toContain('ContractDetailModal is not defined');
    const page = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    expect(page).toMatch(/import ContractDetailModal from/);
  });

  it('16) sem duplicar package/envelope/signature request', async () => {
    const first = await freezeReadyFluor();
    const second = await prepareClinicalSignaturePackage({
      user,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      contractId: CONTRACT_ID,
    });
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.manifestId).toBe(first.manifestId);
    expect((loadDb().clinicalPackageManifests || []).length).toBe(1);
    expect((loadDb().contractSignatureRequests || []).length).toBe(0);
    expect((loadDb().contractSignLinks || []).length).toBe(0);
  });

  it('17) régua renumerada sem quebrar deep links', () => {
    expect(CLINICAL_NAV_ITEMS.map((i) => i.id)).toEqual([
      'planejamento',
      'orcamento',
      'contratos',
      'documentos',
      'assinatura',
      'dados-clinicos',
      'observacoes',
    ]);
    expect(CLINICAL_NAV_ITEMS[4].label).toBe('Assinatura');
    expect(CLINICAL_NAV_ITEMS[5].label).toBe('Dados Clínicos');
    expect(CLINICAL_NAV_ITEMS[6].label).toBe('Observações');
    expect(CLINICAL_WORKFLOW_STEPS.map((s) => s.id)).toEqual([
      'planejamento',
      'orcamento',
      'contrato',
      'documentos',
      'assinatura',
      'dados-clinicos',
      'observacoes',
    ]);
    const page = readSrc('src/pages/ClinicalAppointmentPage.jsx');
    expect(page).toContain("sectionParam === 'signature' ? 'assinatura'");
    expect(page).toContain("sectionParam === 'contrato' ? 'contratos'");
    expect(page).toContain("activeSection === 'assinatura'");
    expect(page).toContain("activeSection === 'dados-clinicos'");
    expect(page).toContain("activeSection === 'observacoes'");
    const url = buildClinicalAppointmentUrl({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      section: 'assinatura',
    });
    expect(url).toContain(APPT_ID);
    expect(url).toContain('section=assinatura');
    expect(url).toContain(`budgetId=${BUDGET_ID}`);
  });

  it('18) actionable blockers funcionam', () => {
    seedScenario({ contractStatus: CONTRACT_STATUS.DRAFT });
    const draft = evalReady();
    expect(draft.blockers.every((b) => b.ctaLabel && (b.ctaSection || b.action))).toBe(true);

    seedScenario({
      planName: 'Implante unitário',
      procedures: [{ name: 'Implante dentário', quantity: 1, unitValue: 8000 }],
    });
    const docs = evalReady();
    const docBlocker = docs.blockers.find((b) => b.code === 'DOCUMENTS_PENDING');
    expect(docBlocker.ctaLabel).toBe('Ir para Documentos');
    expect(docBlocker.ctaSection).toBe('documentos');

    seedScenario();
    const pkg = evalReady();
    const freezeBlocker = pkg.blockers.find((b) => b.code === 'MANIFEST_NOT_FROZEN');
    expect(freezeBlocker.ctaLabel).toMatch(/preparação|pacote/i);
    expect(freezeBlocker.action).toBe('prepare_package');

    const html = renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT_ID,
      patientId: PATIENT_ID,
      budgetId: BUDGET_ID,
      user,
    }));
    expect(html).toContain('clinical-signature-blockers');
    expect(html).toContain('Finalizar preparação');
    expect(html).not.toContain('clinical-sign-now-cta');
    expect(html).not.toContain('clinical-send-signature-cta');
  });

  it('services fail-closed: send/sign/createSignatureRequest recusam DRAFT e clinical sem freeze', async () => {
    seedScenario({ contractStatus: CONTRACT_STATUS.DRAFT });
    await expect(createProviderSignatureRequest({
      user,
      contract: loadDb().generatedContracts[0],
      formData: {},
      settings: { signatureProvider: 'internal' },
    })).rejects.toThrow(/rascunho/i);

    seedScenario({ contractStatus: CONTRACT_STATUS.GENERATED });
    expect(() => sendContractForSignature(user, CONTRACT_ID)).toThrow(/congelado|pacote/i);
    await expect(signContractOnScreen(user, CONTRACT_ID, {
      signerName: 'Paulo',
      signatureImageDataUrl: 'data:image/png;base64,abc',
    })).rejects.toThrow(/congelado|pacote/i);
  });

  it('seção Assinatura não dispara envio/assinatura no mount', () => {
    seedScenario();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT_ID,
      patientId: PATIENT_ID,
      budgetId: BUDGET_ID,
      user,
    }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((loadDb().contractSignLinks || []).length).toBe(0);
    expect((loadDb().contractSignatures || []).length).toBe(0);
    fetchSpy.mockRestore();
  });
});
