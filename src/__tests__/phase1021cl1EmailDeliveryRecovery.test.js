/**
 * PHASE_10.21CL.1 — recovery de e-mail no request PATIENT existente.
 * Sem assinar o paciente. Sem e-mail real. Sem novo request/link/token.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../auth/saasSessionResolver.js', () => ({
  getPlatformAccessToken: vi.fn(async () => 'test-jwt-not-a-secret'),
}));

const { deliverSignatureInviteEmail, actualInvite } = vi.hoisted(() => ({
  deliverSignatureInviteEmail: vi.fn(),
  actualInvite: { deliver: null },
}));
vi.mock('../services/signatureInviteEmailService.js', async (importOriginal) => {
  const actual = await importOriginal();
  actualInvite.deliver = actual.deliverSignatureInviteEmail;
  return {
    ...actual,
    deliverSignatureInviteEmail: (...args) => deliverSignatureInviteEmail(...args),
  };
});

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { evaluateSignatureCeremony, CEREMONY_STATUS } from '../contracts/clinicalSignatureCeremony.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import { signContractOnScreen } from '../services/contractModuleService.js';
import { sendContractForDigitalSignature } from '../services/contractSignatureFlowService.js';
import { SIGNATURE_DELIVERY_STATE } from '../services/signatureProviderService.js';
import { buildAdminApiUrl, shouldUseSameOriginAdminApi } from '../config/adminApiBase.js';
import {
  SIGNATURE_INVITE_EMAIL_PATH,
  classifySignatureInviteNetworkError,
} from '../services/signatureInviteEmailService.js';
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-cl1';
const PATIENT_ID = 'patient-cl1-clara';
const JULIANA = 'col-cl1-juliana';
const APPT_ID = 'appt-cl1';
const BUDGET_ID = 'budget-cl1';
const CONTRACT_ID = 'gctr-cl1-00005';
const HTML = '<p>Contrato CL.1 flúor</p>';
const EMAIL = 'clara.cl1@example.invalid';
const LIVE_API = 'https://appgestaoodonto-production.up.railway.app';

const julianaUser = {
  id: 'user-cl1-juliana',
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
    db.tenants = [{ id: TENANT, name: 'Clínica CL1' }];
    db.clinicProfile = { id: 'clinic-cl1', tenant_id: TENANT, nomeFantasia: 'Clínica CL1' };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Dra. Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [{
      principal: true, logradouro: 'Rua CL1', numero: '1', bairro: 'Centro',
      cidade: 'Belo Horizonte', uf: 'MG', cep: '30130000',
    }];
    db.collaborators = [{
      id: JULIANA, nomeCompleto: 'Juliana de Oliveira Freire',
      conselhoNumero: '27267', conselhoUf: 'MG', tenant_id: TENANT,
    }];
    db.collaboratorAccess = [{ collaboratorId: JULIANA, userId: julianaUser.id, role: 'profissional' }];
    db.patients = [{ id: PATIENT_ID, full_name: 'Clara Closel Franco Segal', tenant_id: TENANT, cpf: '39053344705' }];
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
        budgetNumber: 'ORC-CL1',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        planName: 'Aplicação tópica de flúor',
        procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
        totalValue: 150,
        paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
        financialSnapshotJson: { valorTotal: 150 },
      },
    }];
    db.generatedContracts = [{
      id: CONTRACT_ID,
      contractNumber: 'CTR-CL1-00005',
      status: CONTRACT_STATUS.GENERATED,
      quoteSource: 'clinical_budget',
      quoteId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      clinicId: 'clinic-cl1',
      tenant_id: TENANT,
      version: 1,
      renderedHtml: HTML,
      finalContent: HTML,
      financialSnapshotJson: { valorTotal: 150, formaPagamento: 'pix' },
      metadata: {},
    }];
    db.clinicalPackageManifests = [];
    db.contractSignatures = [];
    db.contractSignLinks = [];
    db.contractSignatureRequests = [];
    db.contractEvents = [];
    db.contractSignatureAudits = [];
    db.contractSettings = [{
      clinicId: 'clinic-cl1',
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
    signatureImageDataUrl: 'data:image/png;base64,cl1',
  });
}

function sendPatient() {
  return sendContractForDigitalSignature(julianaUser, CONTRACT_ID, {
    patientName: 'Clara Closel Franco Segal',
    patientEmail: EMAIL,
    patientCpf: '39053344705',
    treatmentName: 'Flúor',
  });
}

describe('PHASE_10.21CL.1 email delivery recovery', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
    deliverSignatureInviteEmail.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('1 URL canônica da Admin API aponta para o endpoint de e-mail', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_APP_ADMIN_API_BASE_URL', LIVE_API);
    expect(SIGNATURE_INVITE_EMAIL_PATH).toBe('/internal/app/contracts/signature-invite-email');
    expect(buildAdminApiUrl(SIGNATURE_INVITE_EMAIL_PATH, 'http://localhost:3000'))
      .toBe(`${LIVE_API}${SIGNATURE_INVITE_EMAIL_PATH}`);
    expect(shouldUseSameOriginAdminApi('https://loveodonto.com.br')).toBe(true);
    expect(buildAdminApiUrl(SIGNATURE_INVITE_EMAIL_PATH, 'https://loveodonto.com.br'))
      .toBe(SIGNATURE_INVITE_EMAIL_PATH);
    expect(readSrc('vercel.json')).toContain(
      '"destination": "https://appgestaoodonto-production.up.railway.app/internal/app/:path*"',
    );
  });

  it('2-4 POST canônico; rede ≠ HTTP', async () => {
    const network = new TypeError('Failed to fetch');
    expect(classifySignatureInviteNetworkError(network)).toMatchObject({
      code: 'EMAIL_REQUEST_FAILED',
      networkError: 'TypeError',
      httpStatus: null,
    });
    const timeout = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    expect(classifySignatureInviteNetworkError(timeout).code).toBe('EMAIL_REQUEST_TIMEOUT');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    getPlatformAccessToken.mockResolvedValue('test-jwt-not-a-secret');

    fetchMock.mockRejectedValueOnce(network);
    await expect(actualInvite.deliver({
      to: EMAIL, signUrl: '/assinatura/csgn-cl1', requestId: 'csreq-cl1',
    })).rejects.toMatchObject({ code: 'EMAIL_REQUEST_FAILED', httpStatus: null, networkError: 'TypeError' });

    fetchMock.mockResolvedValueOnce({
      status: 401,
      ok: false,
      json: async () => ({ error: 'Token do app ausente.', code: 'UNAUTHORIZED' }),
    });
    await expect(actualInvite.deliver({
      to: EMAIL, signUrl: '/assinatura/csgn-cl1', requestId: 'csreq-cl1',
    })).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401, networkError: null });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/internal\/app\/contracts\/signature-invite-email$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-jwt-not-a-secret',
        }),
      }),
    );
    expect(readSrc('server/index.js')).toContain(
      "app.post('/internal/app/contracts/signature-invite-email', requireAppUser, handleContractsSignatureInviteEmail)",
    );
  });

  it('5-12 retry após falha de rede reutiliza request/link/token e não assina Clara', async () => {
    const signed = await freezeAndSignProfessional();
    const julianaId = signed.signature.id;
    const netErr = Object.assign(new Error('Não foi possível conectar à Admin API para enviar o e-mail.'), {
      code: 'EMAIL_REQUEST_FAILED',
      httpStatus: null,
      networkError: 'TypeError',
    });
    deliverSignatureInviteEmail.mockRejectedValueOnce(netErr);
    await expect(sendPatient()).rejects.toMatchObject({ code: 'EMAIL_REQUEST_FAILED' });

    const afterFail = loadDb();
    const failedReq = afterFail.contractSignatureRequests.find((r) => r.contractId === CONTRACT_ID);
    const failedLink = afterFail.contractSignLinks.find((l) => l.requestId === failedReq.id);
    expect(failedReq.status).toBe('pending');
    expect(failedReq.sentAt).toBeFalsy();
    expect(failedReq.deliveryStatus).toBe(SIGNATURE_DELIVERY_STATE.DELIVERY_FAILED);
    expect(failedReq.lastDeliveryErrorCode).toBe('EMAIL_REQUEST_FAILED');
    expect((afterFail.contractEvents || []).filter((e) => e.eventType === 'SENT' && e.contractId === CONTRACT_ID)).toHaveLength(0);
    expect((afterFail.contractSignatureAudits || []).filter((a) => a.action === 'email_sent')).toHaveLength(0);

    deliverSignatureInviteEmail.mockResolvedValueOnce({
      ok: true, simulated: false, acceptedByTransport: true, provider: 'resend', messageId: 're_cl1',
    });
    const retry = await sendPatient();
    expect(retry.request.id).toBe(failedReq.id);
    expect(retry.delivery.ok).toBe(true);

    const db = loadDb();
    const reqs = db.contractSignatureRequests.filter((r) => r.contractId === CONTRACT_ID);
    const links = db.contractSignLinks.filter((l) => l.contractId === CONTRACT_ID);
    expect(reqs).toHaveLength(1);
    expect(links).toHaveLength(1);
    expect(reqs[0].id).toBe(failedReq.id);
    expect(links[0].id).toBe(failedLink.id);
    expect(links[0].token).toBe(failedLink.token);
    expect(reqs[0].sentAt).toBeTruthy();
    expect(reqs[0].deliveryStatus).toBe(SIGNATURE_DELIVERY_STATE.PROVIDER_ACCEPTED);
    expect((db.contractEvents || []).filter((e) => e.eventType === 'SENT' && e.contractId === CONTRACT_ID)).toHaveLength(1);
    expect((db.contractSignatureAudits || []).filter((a) => a.action === 'email_sent' && a.requestId === failedReq.id)).toHaveLength(1);
    expect(db.contractSignatures.find((s) => s.id === julianaId)).toBeTruthy();
    expect(db.contractSignatures.filter((s) => s.signerRole === 'PATIENT')).toHaveLength(0);
    const ceremony = evaluateSignatureCeremony({
      tenantId: TENANT, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID, contractId: CONTRACT_ID,
    });
    expect(ceremony.status).toBe(CEREMONY_STATUS.PARTIALLY_SIGNED);
    expect(ceremony.satisfiedCount).toBe(1);
  });
});
