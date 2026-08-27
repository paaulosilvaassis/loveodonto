/**
 * PHASE_10.21CL — entrega remota PATIENT com bindings de freeze.
 * Sem assinar o paciente. Sem e-mail real.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const deliverSignatureInviteEmail = vi.fn();
vi.mock('../services/signatureInviteEmailService.js', () => ({
  deliverSignatureInviteEmail: (...args) => deliverSignatureInviteEmail(...args),
  SIGNATURE_INVITE_EMAIL_PATH: '/internal/app/contracts/signature-invite-email',
  SIGNATURE_INVITE_SENT_MSG: 'Solicitação de assinatura enviada por e-mail.',
}));

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { evaluateSignatureCeremony, CEREMONY_STATUS } from '../contracts/clinicalSignatureCeremony.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import { signContractOnScreen } from '../services/contractModuleService.js';
import { sendContractForDigitalSignature } from '../services/contractSignatureFlowService.js';
import { FROZEN_DOCUMENT_CONTENT_MISMATCH } from '../contracts/assertFrozenDocumentIntegrityBeforeSignature.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-cl';
const PATIENT_ID = 'patient-cl-clara';
const JULIANA = 'col-cl-juliana';
const APPT_ID = 'appt-cl';
const BUDGET_ID = 'budget-cl';
const CONTRACT_ID = 'gctr-cl-00005';
const CTR00003 = 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a';
const CTR00004 = 'gctr-930c24bc-f658-4354-81e3-8eea61335361';
const HTML = '<p>Contrato CL flúor</p>';
const EMAIL = 'clara.cl@example.invalid';

const julianaUser = {
  id: 'user-cl-juliana',
  role: 'profissional',
  tenantId: TENANT,
  tenant_id: TENANT,
  name: 'Juliana de Oliveira Freire',
};

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function seed() {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Clínica CL' }];
    db.clinicProfile = { id: 'clinic-cl', tenant_id: TENANT, nomeFantasia: 'Clínica CL', email: 'clinic@example.invalid' };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Dra. Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [{
      principal: true, logradouro: 'Rua CL', numero: '1', bairro: 'Centro',
      cidade: 'Belo Horizonte', uf: 'MG', cep: '30130000',
    }];
    db.collaborators = [{
      id: JULIANA, nomeCompleto: 'Juliana de Oliveira Freire',
      conselhoNumero: '27267', conselhoUf: 'MG', tenant_id: TENANT,
    }];
    db.collaboratorAccess = [{ collaboratorId: JULIANA, userId: julianaUser.id, role: 'profissional' }];
    db.patients = [{
      id: PATIENT_ID, full_name: 'Clara Closel Franco Segal', tenant_id: TENANT, cpf: '39053344705',
    }];
    db.patientDocuments = [{ patient_id: PATIENT_ID, personal_email: EMAIL }];
    db.patientAddresses = [{
      patient_id: PATIENT_ID, principal: true, logradouro: 'Rua Paciente',
      numero: '10', bairro: 'Savassi', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130000',
    }];
    db.appointments = [{
      id: APPT_ID, patientId: PATIENT_ID, professionalId: JULIANA,
      clinicalProfessionalId: JULIANA,
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      appointmentId: APPT_ID,
      patientId: PATIENT_ID,
      budget: {
        id: BUDGET_ID,
        budgetNumber: 'ORC-CL',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        planName: 'Aplicação tópica de flúor',
        procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
        totalValue: 150,
        paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
        financialSnapshotJson: { valorTotal: 150 },
      },
    }];
    db.generatedContracts = [
      {
        id: CONTRACT_ID,
        contractNumber: 'CTR-CL-00005',
        status: CONTRACT_STATUS.GENERATED,
        quoteSource: 'clinical_budget',
        quoteId: APPT_ID,
        budgetId: BUDGET_ID,
        patientId: PATIENT_ID,
        clinicId: 'clinic-cl',
        tenant_id: TENANT,
        version: 1,
        renderedHtml: HTML,
        finalContent: HTML,
        financialSnapshotJson: { valorTotal: 150, formaPagamento: 'pix' },
        metadata: {},
      },
      {
        id: CTR00003,
        contractNumber: 'CTR-2026-00003',
        status: CONTRACT_STATUS.SIGNED,
        quoteSource: 'clinical_budget',
        patientId: PATIENT_ID,
        tenant_id: TENANT,
        documentHash: 'h3bb6313c',
        renderedHtml: '<p>CTR-00003 preservado</p>',
      },
      {
        id: CTR00004,
        contractNumber: 'CTR-2026-00004',
        status: CONTRACT_STATUS.GENERATED,
        quoteSource: 'clinical_budget',
        patientId: PATIENT_ID,
        tenant_id: TENANT,
        renderedHtml: '<p>CTR-00004 sem backfill</p>',
      },
    ];
    db.clinicalPackageManifests = [];
    db.contractSignatures = [];
    db.contractSignLinks = [];
    db.contractSignatureRequests = [];
    db.contractSettings = [{
      clinicId: 'clinic-cl',
      tenant_id: TENANT,
      settings: { signatureProvider: 'internal', signLinkExpiryDays: 7 },
    }];
  });
}

async function freezeAndSignProfessional() {
  const prepared = await prepareClinicalSignaturePackage({
    user: julianaUser,
    appointmentId: APPT_ID,
    budgetId: BUDGET_ID,
    patientId: PATIENT_ID,
    contractId: CONTRACT_ID,
  });
  expect(prepared.ok).toBe(true);
  return signContractOnScreen(julianaUser, CONTRACT_ID, {
    signerName: 'Juliana de Oliveira Freire',
    signerRole: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
    signerPersonId: JULIANA,
    signatureImageDataUrl: 'data:image/png;base64,cl',
  });
}

function sendPatient(extra = {}) {
  return sendContractForDigitalSignature(julianaUser, CONTRACT_ID, {
    patientName: 'Clara Closel Franco Segal',
    patientEmail: EMAIL,
    patientCpf: '39053344705',
    treatmentName: 'Flúor',
    ...extra,
  });
}

describe('PHASE_10.21CL patient remote delivery bindings', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
    deliverSignatureInviteEmail.mockReset();
    deliverSignatureInviteEmail.mockResolvedValue({
      ok: true,
      simulated: false,
      acceptedByTransport: true,
      provider: 'resend',
      messageId: 're_cl_1',
    });
  });

  it('A request PATIENT nasce com freeze bindings e não assina o paciente', async () => {
    const signed = await freezeAndSignProfessional();
    const julianaId = signed.signature.id;
    const sent = await sendPatient();
    expect(sent.delivery.ok).toBe(true);
    const request = (loadDb().contractSignatureRequests || []).find((r) => r.contractId === CONTRACT_ID);
    const link = (loadDb().contractSignLinks || []).find((l) => l.requestId === request.id);
    const contract = loadDb().generatedContracts.find((c) => c.id === CONTRACT_ID);
    expect(request.signerRole).toBe(CLINICAL_SIGNER_ROLE.PATIENT);
    expect(request.signerPersonId).toBe(PATIENT_ID);
    expect(request.packageManifestId).toBe(contract.metadata.packageManifestId);
    expect(request.packageManifestHash).toBe(contract.metadata.packageManifestHash);
    expect(request.contractVersion).toBe(1);
    expect(request.signerRole).not.toBe(CLINICAL_SIGNER_ROLE.PROFESSIONAL);
    expect(link.signerRole).toBe(CLINICAL_SIGNER_ROLE.PATIENT);
    expect((loadDb().contractSignatures || []).filter((s) => s.signerRole === 'PATIENT')).toHaveLength(0);
    expect((loadDb().contractSignatures || []).filter((s) => s.signerRole === 'PROFESSIONAL')).toHaveLength(1);
    expect(loadDb().contractSignatures.find((s) => s.id === julianaId).id).toBe(julianaId);
    const ceremony = evaluateSignatureCeremony({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(ceremony.status).toBe(CEREMONY_STATUS.PARTIALLY_SIGNED);
    expect(ceremony.satisfiedCount).toBe(1);
    expect(contract.status).toBe(CONTRACT_STATUS.SIGNED_BY_CLINIC);
  });

  it('B HTML adulterado bloqueia o envio', async () => {
    await freezeAndSignProfessional();
    withDb((db) => {
      const idx = db.generatedContracts.findIndex((c) => c.id === CONTRACT_ID);
      db.generatedContracts[idx] = {
        ...db.generatedContracts[idx],
        renderedHtml: '<p>tamper</p>',
        finalContent: '<p>tamper</p>',
      };
    });
    await expect(sendPatient()).rejects.toMatchObject({ code: FROZEN_DOCUMENT_CONTENT_MISMATCH });
    expect((loadDb().contractSignatureRequests || []).filter((r) => r.contractId === CONTRACT_ID)).toHaveLength(0);
    expect(deliverSignatureInviteEmail).not.toHaveBeenCalled();
  });

  it('C segundo envio reutiliza o mesmo request/link', async () => {
    await freezeAndSignProfessional();
    const first = await sendPatient();
    const second = await sendPatient();
    expect(second.request.id).toBe(first.request.id);
    expect((loadDb().contractSignatureRequests || []).filter((r) => r.contractId === CONTRACT_ID)).toHaveLength(1);
    expect((loadDb().contractSignLinks || []).filter((l) => l.contractId === CONTRACT_ID)).toHaveLength(1);
  });

  it('D CTA canônico e writer compartilham o gate; 00003/00004 preservados', async () => {
    const src = readSrc('src/services/signatureProviderService.js');
    expect(src).toContain('assertFrozenDocumentIntegrityBeforeSignature');
    expect(src).toContain('persistPatientRemoteRequestBindings');
    expect(readSrc('src/components/contracts/SendContractSignatureModal.jsx')).toContain('Enviar para assinatura');
    expect(readSrc('src/components/clinical/ClinicalContractSection.jsx')).toContain('Enviar para assinatura');
    const finBefore = JSON.stringify(loadDb().generatedContracts.find((c) => c.id === CONTRACT_ID).financialSnapshotJson);
    await freezeAndSignProfessional();
    await sendPatient();
    const c3 = loadDb().generatedContracts.find((c) => c.id === CTR00003);
    const c4 = loadDb().generatedContracts.find((c) => c.id === CTR00004);
    expect(c3.documentHash).toBe('h3bb6313c');
    expect(c3.status).toBe(CONTRACT_STATUS.SIGNED);
    expect(c4.status).toBe(CONTRACT_STATUS.GENERATED);
    expect(c4.version).toBeUndefined();
    expect(JSON.stringify(loadDb().generatedContracts.find((c) => c.id === CONTRACT_ID).financialSnapshotJson)).toBe(finBefore);
  });
});
