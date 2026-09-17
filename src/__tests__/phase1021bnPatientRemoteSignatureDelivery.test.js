/**
 * PHASE_10.21BN — entrega remota do paciente + conclusão multi-signer.
 * Sem e-mail real. Sem mutar produção. Sem assinar CTR histórico.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.React = React;

const deliverSignatureInviteEmail = vi.fn();

vi.mock('../services/signatureInviteEmailService.js', () => ({
  deliverSignatureInviteEmail: (...args) => deliverSignatureInviteEmail(...args),
  SIGNATURE_INVITE_EMAIL_PATH: '/internal/app/contracts/signature-invite-email',
  SIGNATURE_INVITE_SENT_MSG: 'Solicitação de assinatura enviada por e-mail.',
  EMAIL_PROVIDER_NOT_CONFIGURED_MSG: 'O envio de e-mail de assinatura não está configurado. O link não foi enviado.',
  EMAIL_PROVIDER_REJECTED_MSG: 'O provedor de e-mail recusou o disparo. O link não foi enviado.',
}));

vi.mock('../services/contractPdfService.js', () => ({
  contractHtmlWithSignatures: (html) => html || '',
  downloadContractPdfFromElement: async () => {},
  printContractElement: () => {},
}));

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import {
  getContractBySignToken,
  signContractOnScreen,
  signContractViaLink,
} from '../services/contractModuleService.js';
import {
  buildSignatureSendFormDefaults,
  sendContractForDigitalSignature,
} from '../services/contractSignatureFlowService.js';
import {
  PATIENT_EMAIL_REQUIRED_MSG,
  PATIENT_EMAIL_NOT_REGISTERED_MSG,
  resolvePatientEmail,
} from '../services/patientEmail.js';
import { SIGNATURE_DELIVERY_STATE } from '../services/signatureProviderService.js';
import { evaluateSignatureCeremony } from '../contracts/clinicalSignatureCeremony.js';
import { ClinicalSignatureSection } from '../components/clinical/ClinicalSignatureSection.jsx';
import { getPatient } from '../services/patientService.js';
import { decideAuthenticatedProfessionalSignature } from '../contracts/authenticatedSignerIdentity.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const JULIANA_COL = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const JULIANA_AUTH = '7d6bf5ac-4c3d-4f6c-a0a2-8f6479c0df30';
const PAULO_AUTH = 'user-bn-paulo-operator';
const APPT = 'appt-041ca62b-5bd9-4359-8bdc-c54e175a6ff1';
const ORC3 = 'budget-83f7d5d8-f144-4c1f-bcb0-6b709507fe50';
const CTR3 = 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a';
const CTR1 = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const CTR2 = 'gctr-cc1d92aa-6304-4fdf-9502-cc498679edbd';
const PATIENT_EMAIL = 'paciente.bn@example.invalid';

const julianaUser = {
  id: JULIANA_AUTH,
  role: 'profissional',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Juliana de Oliveira Freire',
};

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function seed({ withEmail = true } = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.clinicProfile = { id: 'clinic-b721c2c9', tenant_id: TENANT, nomeFantasia: 'Implanprime' };
    db.clinicDocumentation = { cnpj: '11222333000181', responsavelTecnico: 'Dra. Juliana de Oliveira Freire', croResponsavelTecnico: 'CRO-MG 27267' };
    db.clinicAddresses = [{ id: 'addr-1', principal: true, logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130-000' }];
    db.collaborators = [
      { id: JULIANA_COL, nomeCompleto: 'Juliana de Oliveira Freire', cro: 'CRO-MG 27267', conselhoNumero: '27267', conselhoUf: 'MG', active: true, tenant_id: TENANT },
      { id: 'col-bn-paulo', nomeCompleto: 'Paulo Henrique Silva de Assis', tenant_id: TENANT },
    ];
    db.collaboratorAccess = [
      { collaboratorId: JULIANA_COL, userId: JULIANA_AUTH, role: 'profissional' },
      { collaboratorId: 'col-bn-paulo', userId: PAULO_AUTH, role: 'admin' },
    ];
    db.patients = [{ id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', cpf: '39053344705', birth_date: '1990-01-15', tenant_id: TENANT }];
    db.patientDocuments = withEmail ? [{ patient_id: PATIENT, personal_email: PATIENT_EMAIL }] : [];
    db.patientAddresses = [{ patient_id: PATIENT, principal: true, logradouro: 'Rua T', numero: '10', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130-000' }];
    db.appointments = [{ id: APPT, patientId: PATIENT, professionalId: JULIANA_COL, status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: TENANT }];
    db.clinicalAppointments = [{
      id: 'clinical-bn',
      appointmentId: APPT,
      patientId: PATIENT,
      budget: {
        id: ORC3,
        budgetNumber: 'ORC-003',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        totalValue: 150,
        procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150, totalValue: 150 }],
        paymentOptions: [{ id: 'pay-1', accepted: true, type: 'a_vista', total: 150 }],
        professionalId: JULIANA_COL,
      },
    }];
    db.generatedContracts = [
      { id: CTR1, contractNumber: 'CTR-2026-00001', budgetId: 'budget-old-1', quoteId: 'appt-old', quoteSource: 'clinical_budget', patientId: PATIENT, status: CONTRACT_STATUS.SIGNED, clinicId: 'clinic-b721c2c9', tenant_id: TENANT, renderedHtml: '<p>1</p>', documentHash: 'h1' },
      { id: CTR2, contractNumber: 'CTR-2026-00002', budgetId: 'budget-old-2', quoteId: APPT, quoteSource: 'clinical_budget', patientId: PATIENT, status: CONTRACT_STATUS.SIGNED, clinicId: 'clinic-b721c2c9', tenant_id: TENANT, renderedHtml: '<p>2</p>', documentHash: 'h2' },
      {
        id: CTR3,
        contractNumber: 'CTR-2026-00003',
        budgetId: ORC3,
        quoteId: APPT,
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        status: CONTRACT_STATUS.GENERATED,
        clinicId: 'clinic-b721c2c9',
        tenant_id: TENANT,
        version: 1,
        renderedHtml: '<p>Contrato CTR-2026-00003</p>',
        finalContent: '<p>Contrato CTR-2026-00003</p>',
        metadata: { attachedTcleIds: [] },
      },
    ];
    db.contractSignatures = [];
    db.contractSignatureRequests = [];
    db.contractSignLinks = [];
    db.contractSettings = [{ clinicId: 'clinic-b721c2c9', tenant_id: TENANT, settings: { signatureProvider: 'internal', signLinkExpiryDays: 7 } }];
    return db;
  });
}

async function freezeAndSignJuliana() {
  const prepared = await prepareClinicalSignaturePackage({
    user: julianaUser,
    appointmentId: APPT,
    budgetId: ORC3,
    patientId: PATIENT,
    contractId: CTR3,
  });
  expect(prepared.ok).toBe(true);
  return signContractOnScreen(julianaUser, CTR3, {
    signerName: 'Juliana de Oliveira Freire',
    signerRole: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
    signerPersonId: JULIANA_COL,
    signatureImageDataUrl: 'data:image/png;base64,bn-juliana',
    expectedAppointmentId: APPT,
    expectedBudgetId: ORC3,
    expectedPatientId: PATIENT,
  });
}

async function sendPatientInvite(email = PATIENT_EMAIL) {
  return sendContractForDigitalSignature(julianaUser, CTR3, {
    patientName: 'Paulo Henrique Silva de Assis',
    patientEmail: email,
    patientCpf: '39053344705',
  });
}

describe('PHASE_10.21BN patient remote signature delivery', () => {
  beforeEach(async () => {
    resetDb();
    initDb();
    deliverSignatureInviteEmail.mockReset();
    deliverSignatureInviteEmail.mockResolvedValue({
      ok: true,
      simulated: false,
      acceptedByTransport: true,
      provider: 'smtp',
      messageId: 'smtp-bn',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('A) recipient usa SSOT personal_email', () => {
    seed({ withEmail: true });
    expect(resolvePatientEmail(getPatient(PATIENT))).toBe(PATIENT_EMAIL);
    expect(buildSignatureSendFormDefaults({ patientId: PATIENT, professional: {}, settings: {} }).patientEmail).toBe(PATIENT_EMAIL);
  });

  it('B) e-mail ausente bloqueia envio', async () => {
    seed({ withEmail: false });
    await freezeAndSignJuliana();
    await expect(sendContractForDigitalSignature(julianaUser, CTR3, {
      patientName: 'Paulo',
      patientEmail: '',
    })).rejects.toThrow(PATIENT_EMAIL_REQUIRED_MSG);
    expect(PATIENT_EMAIL_NOT_REGISTERED_MSG).toBe('E-mail do paciente não cadastrado');
    expect(readSrc('src/components/contracts/SendContractSignatureModal.jsx')).toContain('PATIENT_EMAIL_NOT_REGISTERED_MSG');
    expect((loadDb().contractSignatureRequests || [])).toHaveLength(0);
  });

  it('C/D) request existente é reutilizado e retry não cria contrato', async () => {
    seed();
    await freezeAndSignJuliana();
    const first = await sendPatientInvite();
    const second = await sendPatientInvite();
    expect(second.request.id).toBe(first.request.id);
    expect(second.signUrl).toBe(first.signUrl);
    expect((loadDb().generatedContracts || []).filter((c) => c.budgetId === ORC3)).toHaveLength(1);
    expect((loadDb().generatedContracts || []).find((c) => c.id === CTR3).contractNumber).toBe('CTR-2026-00003');
  });

  it('E) provider ausente não diz enviado', async () => {
    seed();
    await freezeAndSignJuliana();
    deliverSignatureInviteEmail.mockRejectedValueOnce(Object.assign(new Error('SMTP transacional não configurado.'), { code: 'SMTP_NOT_CONFIGURED' }));
    await expect(sendPatientInvite()).rejects.toThrow(/não foi enviado|não está configurado|não configurado/i);
    expect((loadDb().contractSignatureRequests || [])[0]?.status).not.toBe('sent');
    expect(readSrc('src/services/signatureInviteEmailService.js')).not.toMatch(/Enviado com sucesso/);
  });

  it('F) provider failure não cria evidence', async () => {
    seed();
    await freezeAndSignJuliana();
    const before = (loadDb().contractSignatures || []).length;
    deliverSignatureInviteEmail.mockRejectedValueOnce(new Error('O provedor de e-mail recusou o disparo. O link não foi enviado.'));
    await expect(sendPatientInvite()).rejects.toThrow(/provedor|enviado/i);
    expect((loadDb().contractSignatures || [])).toHaveLength(before);
    expect((loadDb().contractSignatureRequests || [])[0]?.deliveryStatus).toBe(SIGNATURE_DELIVERY_STATE.DELIVERY_FAILED);
  });

  it('G) provider accepted registra estado correto', async () => {
    seed();
    await freezeAndSignJuliana();
    const result = await sendPatientInvite();
    expect(result.delivery.ok).toBe(true);
    expect(result.delivery.simulated).toBe(false);
    expect(result.delivery.delivered).toBe(false);
    expect(result.delivery.acceptedByTransport).toBe(true);
    expect(result.delivery.deliveryStatus).toBe(SIGNATURE_DELIVERY_STATE.PROVIDER_ACCEPTED);
    expect((loadDb().contractSignatureRequests || [])[0].status).toBe('sent');
  });

  it('H/I/J) link vinculado ao CTR-00003 e não troca contract/signer pela URL', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendPatientInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    const resolved = getContractBySignToken(token);
    expect(resolved.contract.id).toBe(CTR3);
    expect(resolved.contract.contractNumber).toBe('CTR-2026-00003');
    expect(getContractBySignToken(token, { claimedContractId: CTR1 })).toBeNull();
    expect(getContractBySignToken(token, { claimedSignerRole: 'PROFESSIONAL' })).toBeNull();
    expect(resolved.link.signerRole).toBe(CLINICAL_SIGNER_ROLE.PATIENT);
    expect(resolved.link.signerPersonId).toBe(PATIENT);
  });

  it('K/L/M/N/O) Paulo remoto satisfaz PATIENT, Juliana permanece, 1/2 → 2/2 sem CTR novo', async () => {
    seed();
    const juliana = await freezeAndSignJuliana();
    const julianaId = juliana.signature.id;
    const sent = await sendPatientInvite();
    expect((loadDb().contractSignatures || []).filter((s) => s.contractId === CTR3)).toHaveLength(1);
    const token = sent.signUrl.replace('/assinatura/', '');
    const signed = await signContractViaLink(token, {
      signerName: 'Paulo Henrique Silva de Assis',
      signerCpf: '39053344705',
      signatureImageDataUrl: 'data:image/png;base64,bn-paulo',
    });
    const sigs = (loadDb().contractSignatures || []).filter((s) => s.contractId === CTR3);
    const patient = sigs.find((s) => s.signerRole === 'PATIENT');
    const professional = sigs.find((s) => s.signerRole === 'PROFESSIONAL');
    expect(patient.signerPersonId).toBe(PATIENT);
    expect(patient.evidenceJson.signatureMethod).toBe('REMOTE_ON_SCREEN');
    expect(patient.evidenceJson.operatorUserId).toBeNull();
    expect(professional.id).toBe(julianaId);
    expect(professional.signerPersonId).toBe(JULIANA_COL);
    const ceremony = evaluateSignatureCeremony({
      tenantId: TENANT,
      patientId: PATIENT,
      appointmentId: APPT,
      budgetId: ORC3,
      contractId: CTR3,
    });
    expect(ceremony.satisfiedCount).toBe(2);
    expect(ceremony.requiredCount).toBe(2);
    expect(signed.contract.status).toBe(CONTRACT_STATUS.SIGNED);
    expect((loadDb().generatedContracts || []).filter((c) => String(c.contractNumber || '').startsWith('CTR-2026-'))).toHaveLength(3);
    expect((loadDb().generatedContracts || []).find((c) => c.id === CTR3).id).toBe(CTR3);
  });

  it('P/Q) expired e replay fail closed', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendPatientInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    withDb((db) => {
      const links = db.contractSignLinks || [];
      const idx = links.findIndex((l) => l.token === token);
      links[idx] = { ...links[idx], expiresAt: '2000-01-01T00:00:00.000Z' };
      return db;
    });
    expect(getContractBySignToken(token).expired).toBe(true);
    const rotated = await sendPatientInvite();
    expect(rotated.request.id).toBe(sent.request.id);
    expect(rotated.signUrl).not.toBe(sent.signUrl);
    const freshToken = rotated.signUrl.replace('/assinatura/', '');
    await signContractViaLink(freshToken, {
      signerName: 'Paulo Henrique Silva de Assis',
      signerCpf: '39053344705',
      signatureImageDataUrl: 'data:image/png;base64,bn-paulo-2',
    });
    await expect(signContractViaLink(freshToken, {
      signerName: 'Paulo Henrique Silva de Assis',
      signerCpf: '39053344705',
      signatureImageDataUrl: 'data:image/png;base64,bn-replay',
    })).rejects.toThrow(/inválido|expirado/i);
    expect(getContractBySignToken(freshToken).replay).toBe(true);
  });

  it('R) cross-identity professional guard continua verde', () => {
    seed();
    const paulo = { id: PAULO_AUTH, role: 'admin', tenantId: TENANT, tenant_id: TENANT };
    const decision = decideAuthenticatedProfessionalSignature(paulo, { personId: JULIANA_COL });
    expect(decision.decision).not.toBe('ALLOW');
    expect(readSrc('src/contracts/authenticatedSignerIdentity.js')).toContain('SIGNER_IDENTITY_MISMATCH');
  });

  it('UI mostra Juliana assinada, paciente pendente e copy fail-closed de entrega', async () => {
    seed();
    await freezeAndSignJuliana();
    const html = renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT,
      patientId: PATIENT,
      budgetId: ORC3,
      user: julianaUser,
    }));
    expect(html).toContain('Paulo Henrique Silva de Assis');
    expect(html).toContain('Juliana de Oliveira Freire');
    expect(html).toContain('Assinado');
    expect(html).toContain('Enviar para assinatura');
    expect(html).not.toMatch(/Enviado com sucesso|caixa de entrada/i);
  });
});
