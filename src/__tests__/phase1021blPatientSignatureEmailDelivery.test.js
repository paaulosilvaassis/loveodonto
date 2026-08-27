/**
 * PHASE_10.21BL — envio remoto de assinatura do paciente.
 * Sem assinar, sem e-mail real, sem mutar CTR-00001/00002.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const deliverSignatureInviteEmail = vi.fn();

vi.mock('../services/signatureInviteEmailService.js', () => ({
  deliverSignatureInviteEmail: (...args) => deliverSignatureInviteEmail(...args),
  SIGNATURE_INVITE_EMAIL_PATH: '/internal/app/contracts/signature-invite-email',
  EMAIL_PROVIDER_NOT_CONFIGURED_MSG: 'O envio de e-mail de assinatura não está configurado. O link não foi enviado.',
  EMAIL_PROVIDER_REJECTED_MSG: 'O provedor de e-mail recusou o disparo. O link não foi enviado.',
}));

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import { signContractOnScreen } from '../services/contractModuleService.js';
import {
  buildSignatureSendFormDefaults,
  canSendContractForSignature,
  sendContractForDigitalSignature,
} from '../services/contractSignatureFlowService.js';
import { PATIENT_EMAIL_REQUIRED_MSG, resolvePatientEmail } from '../services/patientEmail.js';
import { resolveContractForSelectedBudget } from '../contracts/resolveContractForSelectedBudget.js';
import { getPatient } from '../services/patientService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const JULIANA_COL = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const JULIANA_AUTH = '7d6bf5ac-4c3d-4f6c-a0a2-8f6479c0df30';
const APPT = 'appt-041ca62b-5bd9-4359-8bdc-c54e175a6ff1';
const ORC3 = 'budget-83f7d5d8-f144-4c1f-bcb0-6b709507fe50';
const CTR3 = 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a';
const CTR1 = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const CTR2 = 'gctr-cc1d92aa-6304-4fdf-9502-cc498679edbd';
const ORC1 = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const ORC2 = 'budget-26cb84bf-f9ea-41da-b8a3-9cab0c26884b';
const PATIENT_EMAIL = 'paciente.bl@example.invalid';

const julianaUser = {
  id: JULIANA_AUTH,
  role: 'profissional',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Juliana de Oliveira Freire',
};

function snapshot(id) {
  const row = (loadDb().generatedContracts || []).find((c) => c.id === id);
  return row ? JSON.stringify({
    id: row.id,
    contractNumber: row.contractNumber,
    budgetId: row.budgetId,
    status: row.status,
    documentHash: row.documentHash,
  }) : null;
}

function seed({ withEmail = true } = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.clinicProfile = { id: 'clinic-b721c2c9', tenant_id: TENANT, nomeFantasia: 'Implanprime', email: 'contato@loveodonto.com.br' };
    db.clinicDocumentation = { cnpj: '11222333000181', responsavelTecnico: 'Dra. Juliana de Oliveira Freire', croResponsavelTecnico: 'CRO-MG 27267' };
    db.clinicAddresses = [{ id: 'addr-1', principal: true, logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130-000' }];
    db.collaborators = [{ id: JULIANA_COL, nomeCompleto: 'Juliana de Oliveira Freire', cro: 'CRO-MG 27267', active: true, tenant_id: TENANT }];
    db.collaboratorAccess = [{ collaboratorId: JULIANA_COL, userId: JULIANA_AUTH, role: 'profissional' }];
    db.patients = [{
      id: PATIENT,
      full_name: 'Paulo Henrique Silva de Assis',
      cpf: '39053344705',
      birth_date: '1990-01-15',
      tenant_id: TENANT,
    }];
    db.patientDocuments = withEmail ? [{ patient_id: PATIENT, personal_email: PATIENT_EMAIL }] : [];
    db.patientAddresses = [{
      patient_id: PATIENT,
      principal: true,
      logradouro: 'Rua Teste',
      numero: '10',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30130-000',
    }];
    db.appointments = [{ id: APPT, patientId: PATIENT, professionalId: JULIANA_COL, status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: TENANT }];
    db.clinicalAppointments = [{
      id: 'clinical-bl',
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
      budgetHistory: [{ id: ORC2, status: BUDGET_STATUS.HISTORICO }],
    }];
    db.generatedContracts = [
      { id: CTR1, contractNumber: 'CTR-2026-00001', budgetId: ORC1, quoteId: 'appt-old', quoteSource: 'clinical_budget', patientId: PATIENT, status: CONTRACT_STATUS.SIGNED, clinicId: 'clinic-b721c2c9', tenant_id: TENANT, renderedHtml: '<p>1</p>', documentHash: 'h1' },
      { id: CTR2, contractNumber: 'CTR-2026-00002', budgetId: ORC2, quoteId: APPT, quoteSource: 'clinical_budget', patientId: PATIENT, status: CONTRACT_STATUS.SIGNED, clinicId: 'clinic-b721c2c9', tenant_id: TENANT, renderedHtml: '<p>2</p>', documentHash: 'h2' },
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
    signatureImageDataUrl: 'data:image/png;base64,bl',
    expectedAppointmentId: APPT,
    expectedBudgetId: ORC3,
    expectedPatientId: PATIENT,
  });
}

describe('PHASE_10.21BL patient signature email delivery', () => {
  beforeEach(async () => {
    resetDb();
    initDb();
    deliverSignatureInviteEmail.mockReset();
    deliverSignatureInviteEmail.mockResolvedValue({
      ok: true,
      simulated: false,
      provider: 'resend',
      messageId: 'msg_bl',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('A/B) e-mail vazio bloqueia submit e informa obrigatoriedade', async () => {
    seed({ withEmail: false });
    const defaults = buildSignatureSendFormDefaults({ patientId: PATIENT, professional: {}, settings: {} });
    expect(defaults.patientEmail).toBe('');
    await expect(sendContractForDigitalSignature(julianaUser, CTR3, {
      ...defaults,
      patientEmail: '',
    })).rejects.toThrow(PATIENT_EMAIL_REQUIRED_MSG);
    const modal = readFileSync(path.join(ROOT, 'src/components/contracts/SendContractSignatureModal.jsx'), 'utf8');
    expect(modal).toContain('PATIENT_EMAIL_REQUIRED_MSG');
    expect(modal).toContain('disabled={busy || !String(form.patientEmail || \'\')');
    expect((loadDb().contractSignatureRequests || [])).toHaveLength(0);
  });

  it('C) e-mail cadastrado em personal_email carrega no modal', () => {
    seed({ withEmail: true });
    const bundle = getPatient(PATIENT);
    expect(resolvePatientEmail(bundle)).toBe(PATIENT_EMAIL);
    const defaults = buildSignatureSendFormDefaults({ patientId: PATIENT, professional: {}, settings: {} });
    expect(defaults.patientEmail).toBe(PATIENT_EMAIL);
  });

  it('C2) e-mail digitado no request anterior preenche o modal sem gravar cadastro', () => {
    seed({ withEmail: false });
    withDb((db) => {
      db.contractSignatureRequests = [{
        id: 'csreq-prev',
        contractId: CTR3,
        status: 'sent',
        recipients: { patientEmail: 'typed@example.invalid' },
        createdAt: new Date().toISOString(),
      }];
      return db;
    });
    const defaults = buildSignatureSendFormDefaults({
      patientId: PATIENT,
      professional: {},
      settings: {},
      contractId: CTR3,
    });
    expect(defaults.patientEmail).toBe('typed@example.invalid');
    expect(String(getPatient(PATIENT)?.documents?.personal_email || '')).toBe('');
  });

  it('D/E/F/G/I) envio confirma provedor, reutiliza CTR-00003 e preserva Juliana', async () => {
    seed();
    await freezeAndSignJuliana();
    const snap1 = snapshot(CTR1);
    const snap2 = snapshot(CTR2);
    const julianaBefore = (loadDb().contractSignatures || []).filter((s) => s.contractId === CTR3);
    expect(julianaBefore).toHaveLength(1);

    const result = await sendContractForDigitalSignature(julianaUser, CTR3, {
      patientName: 'Paulo Henrique Silva de Assis',
      patientEmail: PATIENT_EMAIL,
      patientCpf: '39053344705',
      treatmentName: 'Flúor',
    });
    expect(result.delivery.simulated).toBe(false);
    expect(result.delivery.provider).toBe('resend');
    expect(deliverSignatureInviteEmail).toHaveBeenCalledTimes(1);
    const payload = deliverSignatureInviteEmail.mock.calls[0][0];
    expect(payload.to).toBe(PATIENT_EMAIL);
    expect(String(payload.signUrl)).toMatch(/^\/assinatura\//);

    const contract = (loadDb().generatedContracts || []).find((c) => c.id === CTR3);
    expect(contract.contractNumber).toBe('CTR-2026-00003');
    expect(contract.budgetId).toBe(ORC3);
    expect(contract.status).toBe(CONTRACT_STATUS.SIGNED_BY_CLINIC);
    expect((loadDb().contractSignatures || []).filter((s) => s.contractId === CTR3)).toHaveLength(1);
    expect((loadDb().contractSignatures || []).some((s) => s.contractId === CTR3 && s.signerRole === 'PATIENT')).toBe(false);
    expect(resolveContractForSelectedBudget({ budgetId: ORC3, appointmentId: APPT, patientId: PATIENT }).contract.id).toBe(CTR3);
    expect(snapshot(CTR1)).toBe(snap1);
    expect(snapshot(CTR2)).toBe(snap2);
  });

  it('H) falha HTTP/provider não marca enviado', async () => {
    seed();
    await freezeAndSignJuliana();
    deliverSignatureInviteEmail.mockRejectedValueOnce(new Error('O provedor de e-mail recusou o disparo. O link não foi enviado.'));
    await expect(sendContractForDigitalSignature(julianaUser, CTR3, {
      patientName: 'Paulo',
      patientEmail: PATIENT_EMAIL,
      patientCpf: '39053344705',
    })).rejects.toThrow(/provedor|enviado/i);
    const req = (loadDb().contractSignatureRequests || []).find((r) => r.contractId === CTR3);
    expect(req?.status).not.toBe('sent');
    expect(req?.sentAt).toBeFalsy();
  });

  it('J/K/L) retry reutiliza request/link e não cria contrato nem evidence extra', async () => {
    seed();
    await freezeAndSignJuliana();
    const first = await sendContractForDigitalSignature(julianaUser, CTR3, {
      patientName: 'Paulo',
      patientEmail: PATIENT_EMAIL,
      patientCpf: '39053344705',
    });
    const second = await sendContractForDigitalSignature(julianaUser, CTR3, {
      patientName: 'Paulo',
      patientEmail: PATIENT_EMAIL,
      patientCpf: '39053344705',
    });
    expect(second.request.id).toBe(first.request.id);
    expect(second.signUrl).toBe(first.signUrl);
    expect((loadDb().generatedContracts || []).filter((c) => c.budgetId === ORC3)).toHaveLength(1);
    expect((loadDb().contractSignatureRequests || []).filter((r) => r.contractId === CTR3)).toHaveLength(1);
    expect((loadDb().contractSignLinks || []).filter((l) => l.contractId === CTR3)).toHaveLength(1);
    expect((loadDb().contractSignatures || []).filter((s) => s.contractId === CTR3)).toHaveLength(1);
    expect((loadDb().generatedContracts || []).find((c) => c.id === CTR1)?.status).toBe(CONTRACT_STATUS.SIGNED);
    expect((loadDb().generatedContracts || []).find((c) => c.id === CTR2)?.status).toBe(CONTRACT_STATUS.SIGNED);
  });

  it('M) UI/serviço não vazam token completo em mensagem de sucesso', () => {
    const modal = readFileSync(path.join(ROOT, 'src/components/contracts/SendContractSignatureModal.jsx'), 'utf8');
    const flow = readFileSync(path.join(ROOT, 'src/services/contractSignatureFlowService.js'), 'utf8');
    expect(modal).not.toContain('window.location.origin}${signUrl}');
    expect(flow).toContain('recipientEmail');
    expect(canSendContractForSignature({
      contract: { status: CONTRACT_STATUS.SIGNED_BY_CLINIC, quoteId: APPT, budgetId: ORC3 },
      budget: { id: ORC3, status: BUDGET_STATUS.CONTRATO_GERADO, paymentOptions: [{ accepted: true }] },
    })).toBe(true);
  });
});
