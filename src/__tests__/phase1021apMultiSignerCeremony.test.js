/**
 * PHASE_10.21AP — cerimônia clínica multi-signer.
 * Sem comunicação externa. Sem mutar CTR histórico em produção.
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
}));
vi.mock('html2canvas', () => ({ default: async () => ({ toDataURL: () => '' }) }));
vi.mock('jspdf', () => ({ jsPDF: class JsPDF { save() {} } }));

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS, DEFAULT_CONTRACT_SETTINGS } from '../contracts/contractConstants.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import { createDocumentRecord } from '../services/documentService.js';
import { DOCUMENT_APPLICABILITY } from '../contracts/treatmentDocumentRequirements.js';
import { resolveRequiredSigners, CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import {
  evaluateSignatureCeremony,
  addOptionalWitness,
  CEREMONY_STATUS,
} from '../contracts/clinicalSignatureCeremony.js';
import {
  evaluateClinicalSignatureReadiness,
  CLINICAL_SIGNATURE_STEP,
} from '../contracts/clinicalSignatureReadiness.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import { signContractOnScreen, sendContractForSignature } from '../services/contractModuleService.js';
import { getNavStepStatus, STEP_STATUS, getClinicalWorkflowState } from '../components/clinical/clinicalAppointmentConfig.js';
import { ClinicalSignatureSection } from '../components/clinical/ClinicalSignatureSection.jsx';
import { AuthContext } from '../auth/authContext.js';
import ContractsAssinadosPage from '../pages/contratos/ContractsAssinadosPage.jsx';
import ContractsPendentesPage from '../pages/contratos/ContractsPendentesPage.jsx';
import ContractsAssinaturasPage from '../pages/contratos/ContractsAssinaturasPage.jsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT_ID = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const OTHER_PATIENT = 'patient-other-ap';
const APPT_ID = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const BUDGET_ID = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const CONTRACT_ID = 'gctr-ctr-2026-00001';
const DENTIST_ID = 'col-juliana';
const OTHER_DENTIST = 'col-other';
const user = { id: 'user-ap', role: 'admin', tenantId: TENANT, tenant_id: TENANT };

function seed({
  contractStatus = CONTRACT_STATUS.GENERATED,
  birthDate = '1988-01-01',
  guardian = null,
  dentistCro = '27267',
  dentistId = DENTIST_ID,
  rtName = 'Dra. Juliana de Oliveira Freire',
  rtCro = 'CRO-MG 27267',
  settings = {},
  signerRules = {},
  metadata = {},
  planName = 'Aplicação tópica de flúor',
  procedures = [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
} = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }, { id: 'tenant-other-ap', name: 'Outro' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT, nomeFantasia: 'Implanprime' };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: rtName,
      croResponsavelTecnico: rtCro,
    };
    db.collaborators = [
      { id: dentistId, nomeCompleto: 'Juliana de Oliveira Freire', conselhoNumero: dentistCro, conselhoUf: 'MG', tenant_id: TENANT },
      { id: OTHER_DENTIST, nomeCompleto: 'Outro Dentista', conselhoNumero: '99999', conselhoUf: 'MG', tenant_id: TENANT },
    ];
    db.patients = [
      {
        id: PATIENT_ID,
        full_name: 'Paulo Henrique Silva de Assis',
        tenant_id: TENANT,
        cpf: '39053344705',
        birth_date: birthDate,
        guardian_full_name: guardian?.name || '',
        guardian_cpf: guardian?.cpf || '',
        has_financial_responsible: Boolean(guardian?.financial),
      },
      { id: OTHER_PATIENT, full_name: 'Outro Paciente', tenant_id: TENANT, birth_date: '1990-01-01' },
    ];
    db.appointments = [{
      id: APPT_ID,
      patientId: PATIENT_ID,
      professionalId: dentistId,
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      appointmentId: APPT_ID,
      patientId: PATIENT_ID,
      budget: {
        id: BUDGET_ID,
        budgetNumber: 'ORC-001',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        planName,
        procedures,
        totalValue: 150,
        paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
      },
    }];
    db.contractSettings = [{
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      settings: { ...DEFAULT_CONTRACT_SETTINGS, ...settings },
    }];
    db.generatedContracts = [{
      id: CONTRACT_ID,
      contractNumber: 'CTR-2026-00001',
      status: contractStatus,
      quoteSource: 'clinical_budget',
      quoteId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      version: 1,
      renderedHtml: '<p>CTR-2026-00001</p>',
      metadata: { signerRules, ...metadata },
    }];
    db.contractSignatures = [];
    db.documentRecords = [];
  });
}

async function freeze() {
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

function signPatient() {
  return signContractOnScreen(user, CONTRACT_ID, {
    signerName: 'Paulo Henrique Silva de Assis',
    signerCpf: '39053344705',
    signerRole: 'PATIENT',
    signerPersonId: PATIENT_ID,
    signatureImageDataUrl: 'data:image/png;base64,pat',
  });
}

function signDentist(personId = DENTIST_ID) {
  return signContractOnScreen(user, CONTRACT_ID, {
    signerName: 'Juliana de Oliveira Freire',
    signerRole: 'PROFESSIONAL',
    signerPersonId: personId,
    signatureImageDataUrl: 'data:image/png;base64,doc',
  });
}

describe('PHASE_10.21AP multi-signer clinical ceremony', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A patient only required → signed após paciente', async () => {
    seed({ settings: { requireResponsibleProfessional: false } });
    await freeze();
    const signed = signPatient();
    expect(signed.contract.status).toBe(CONTRACT_STATUS.SIGNED);
    expect(evaluateClinicalSignatureReadiness({
      appointmentId: APPT_ID, budgetId: BUDGET_ID, patientId: PATIENT_ID, user,
    }).step).toBe(CLINICAL_SIGNATURE_STEP.SIGNED);
  });

  it('B patient + dentist → paciente sozinho = PARTIAL', async () => {
    seed();
    await freeze();
    const partial = signPatient();
    expect(partial.contract.status).not.toBe(CONTRACT_STATUS.SIGNED);
    expect(evaluateClinicalSignatureReadiness({
      appointmentId: APPT_ID, budgetId: BUDGET_ID, patientId: PATIENT_ID, user,
    }).step).toBe(CLINICAL_SIGNATURE_STEP.PARTIALLY_SIGNED);
  });

  it('C patient + dentist → ambos = SIGNED', async () => {
    seed();
    await freeze();
    signPatient();
    const done = signDentist();
    expect(done.contract.status).toBe(CONTRACT_STATUS.SIGNED);
  });

  it('D/E responsável legal quando menor; ausente bloqueia', () => {
    seed({ birthDate: '2015-05-05', guardian: null });
    const missing = resolveRequiredSigners({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(missing.blockers.some((b) => b.code === 'LEGAL_RESPONSIBLE_MISSING')).toBe(true);
    seed({ birthDate: '2015-05-05', guardian: { name: 'Maria Responsável', cpf: '52998224725' } });
    const ok = resolveRequiredSigners({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(ok.requiredSigners.some((s) => s.role === CLINICAL_SIGNER_ROLE.LEGAL_GUARDIAN && s.required)).toBe(true);
    expect(ok.blockers.some((b) => b.code === 'LEGAL_RESPONSIBLE_MISSING')).toBe(false);
  });

  it('F treating dentist missing CRO → blocked', () => {
    seed({ dentistCro: '' });
    const resolved = resolveRequiredSigners({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(resolved.blockers.some((b) => b.code === 'PROFESSIONAL_CRO_MISSING')).toBe(true);
  });

  it('G/H RT required vs optional', () => {
    seed({
      dentistId: OTHER_DENTIST,
      dentistCro: '99999',
      signerRules: { requireTechnicalResponsible: true },
    });
    const required = resolveRequiredSigners({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(required.requiredSigners.some((s) => s.role === CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE && s.required)).toBe(true);

    seed({ signerRules: { requireTechnicalResponsible: false } });
    const optional = resolveRequiredSigners({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(optional.requiredSigners.some((s) => s.role === CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE && s.required)).toBe(false);
  });

  it('I dentist = RT → deduplicação correta', async () => {
    seed();
    await freeze();
    const resolved = resolveRequiredSigners({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    const dentist = resolved.requiredSigners.find((s) => s.role === CLINICAL_SIGNER_ROLE.PROFESSIONAL);
    expect(dentist.dedupedRoles).toContain(CLINICAL_SIGNER_ROLE.PROFESSIONAL);
    expect(dentist.dedupedRoles).toContain(CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE);
    signPatient();
    const done = signDentist();
    expect(done.signature.rolesSatisfied).toContain(CLINICAL_SIGNER_ROLE.PROFESSIONAL);
    expect(done.contract.status).toBe(CONTRACT_STATUS.SIGNED);
  });

  it('J testemunha optional → não bloqueia', async () => {
    seed();
    await freeze();
    addOptionalWitness({
      user, contractId: CONTRACT_ID, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, name: 'Testemunha Um',
    });
    signPatient();
    const done = signDentist();
    expect(done.contract.status).toBe(CONTRACT_STATUS.SIGNED);
  });

  it('K testemunha required por config → bloqueia', () => {
    seed({ settings: { requireWitness: true } });
    const resolved = resolveRequiredSigners({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(resolved.blockers.some((b) => b.code === 'WITNESS_REQUIRED')).toBe(true);
  });

  it('L one required signer missing → não SIGNED', async () => {
    seed();
    await freeze();
    signPatient();
    expect(loadDb().generatedContracts[0].status).not.toBe(CONTRACT_STATUS.SIGNED);
  });

  it('M manifest not frozen → cannot sign', () => {
    seed();
    expect(() => signPatient()).toThrow(/congelado|manifest/i);
  });

  it('N wrong manifest → reject', async () => {
    seed();
    await freeze();
    expect(() => signContractOnScreen(user, CONTRACT_ID, {
      signerName: 'Paulo Henrique Silva de Assis',
      signerRole: 'PATIENT',
      signerPersonId: PATIENT_ID,
      packageManifestId: 'man-errado',
      signatureImageDataUrl: 'data:image/png;base64,x',
    })).toThrow(/manifest/i);
  });

  it('O/P wrong patient / tenant → reject', () => {
    seed();
    const patient = resolveRequiredSigners({
      tenantId: TENANT, patientId: OTHER_PATIENT, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(patient.rejected || patient.blockers.some((b) => b.code === 'IDENTITY')).toBe(true);
    const tenant = resolveRequiredSigners({
      tenantId: 'tenant-other-ap', patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(tenant.rejected || tenant.blockers.some((b) => b.code === 'IDENTITY')).toBe(true);
  });

  it('Q wrong dentist → reject', async () => {
    seed();
    await freeze();
    signPatient();
    expect(() => signDentist(OTHER_DENTIST)).toThrow(/signatário/i);
  });

  it('R refresh mantém progresso', async () => {
    seed();
    await freeze();
    signPatient();
    const a = evaluateSignatureCeremony({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    const b = evaluateSignatureCeremony({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(a.satisfiedCount).toBe(b.satisfiedCount);
    expect(a.status).toBe(CEREMONY_STATUS.PARTIALLY_SIGNED);
  });

  it('S/T envio e assinatura local não trocam signer', async () => {
    seed();
    await freeze();
    const sent = sendContractForSignature(user, CONTRACT_ID);
    expect(sent.contract.patientId).toBe(PATIENT_ID);
    const signed = signPatient();
    expect(signed.signature.signerPersonId).toBe(PATIENT_ID);
    expect(signed.signature.signerRole).toBe('PATIENT');
  });

  it('U TCLE implante + orçamento flúor continua inelegível', () => {
    seed();
    createDocumentRecord(user, {
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'consent_implante',
      title: 'Implante',
      content: 'avulso',
      metadata: {
        tcleId: 'tcle_implante',
        applicability: DOCUMENT_APPLICABILITY.NOT_APPLICABLE_TO_CURRENT_TREATMENT,
      },
    });
    const resolved = resolveRequiredSigners({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(resolved.tcleApplicable).toBe(false);
    expect(resolved.tcleRequired).toBe(false);
  });

  it('V documentos possuem evidência própria', async () => {
    seed();
    await freeze();
    const signed = signPatient();
    expect(signed.signature.evidenceJson.documentTypes).toEqual(expect.arrayContaining(['CONTRACT_SERVICES', 'LGPD']));
    expect(signed.signature.evidenceJson.packageManifestId).toBeTruthy();
  });

  it('W contrato histórico já assinado permanece intacto', () => {
    seed({
      contractStatus: CONTRACT_STATUS.SIGNED,
      metadata: {},
    });
    const before = JSON.stringify(loadDb().generatedContracts[0]);
    const readiness = evaluateClinicalSignatureReadiness({
      appointmentId: APPT_ID, budgetId: BUDGET_ID, patientId: PATIENT_ID, user,
    });
    expect(readiness.step).toBe(CLINICAL_SIGNATURE_STEP.SIGNED);
    expect(readiness.legacySignedBeforeManifest).toBe(true);
    expect(readiness.manifestLabel).toMatch(/anterior ao manifest/i);
    expect(() => signPatient()).toThrow(/legado|já assinado/i);
    expect(JSON.stringify(loadDb().generatedContracts[0])).toBe(before);
  });

  it('X UI não mostra Concluído prematuramente', async () => {
    seed();
    await freeze();
    signPatient();
    const workflow = getClinicalWorkflowState(APPT_ID, BUDGET_ID);
    expect(getNavStepStatus('assinatura', workflow, 'assinatura')).not.toBe(STEP_STATUS.COMPLETED);
    const html = renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT_ID, patientId: PATIENT_ID, budgetId: BUDGET_ID, user,
    }));
    expect(html).toContain('Assinatura parcial');
    expect(html).toContain('clinical-sign-professional-cta');
  });

  it('Y package visualiza required signers', async () => {
    seed();
    await freeze();
    const html = renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT_ID, patientId: PATIENT_ID, budgetId: BUDGET_ID, user,
    }));
    expect(html).toContain('clinical-signer-list');
    expect(html).toContain('Paciente');
    expect(html).toContain('Profissional responsável');
    expect(html).toContain('clinical-sign-now-cta');
  });

  it('Z nenhuma mutation no mount/render', () => {
    seed();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const before = JSON.stringify(loadDb().generatedContracts);
    renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT_ID, patientId: PATIENT_ID, budgetId: BUDGET_ID, user,
    }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(loadDb().generatedContracts)).toBe(before);
    expect((loadDb().contractSignatures || []).length).toBe(0);
    fetchSpy.mockRestore();
  });

  it('admin Pendentes/Assinados/Assinaturas não crasham', () => {
    seed({ contractStatus: CONTRACT_STATUS.SIGNED, metadata: {} });
    const wrap = (Page, route) => React.createElement(
      AuthContext.Provider,
      { value: { user } },
      React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(Page)),
    );
    expect(() => renderToStaticMarkup(wrap(ContractsAssinadosPage, '/gestao/contratos/assinados'))).not.toThrow();
    expect(() => renderToStaticMarkup(wrap(ContractsPendentesPage, '/gestao/contratos/pendentes'))).not.toThrow();
    expect(() => renderToStaticMarkup(wrap(ContractsAssinaturasPage, '/gestao/contratos/assinaturas'))).not.toThrow();
    const signed = renderToStaticMarkup(wrap(ContractsAssinadosPage, '/gestao/contratos/assinados'));
    expect(signed).toContain('CTR-2026-00001');
    expect(readFileSync(path.join(ROOT, 'src/pages/contratos/ContractsAssinadosPage.jsx'), 'utf8')).toMatch(/import ContractDetailModal/);
  });
});
