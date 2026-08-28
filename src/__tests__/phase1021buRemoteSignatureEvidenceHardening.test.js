/**
 * PHASE_10.21BU — evidência remota, IP, viewedAt, PDF final.
 * Não muta CTR-2026-00003 de produção. Sem e-mail real.
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
  EMAIL_PROVIDER_NOT_CONFIGURED_MSG: 'O envio de e-mail de assinatura não está configurado. O link não foi enviado.',
  EMAIL_PROVIDER_REJECTED_MSG: 'O provedor de e-mail recusou o disparo. O link não foi enviado.',
}));

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS, LEGAL_SIGNATURE_TYPES } from '../contracts/contractConstants.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import {
  getContractBySignToken,
  recordSignLinkFirstView,
  signContractOnScreen,
  signContractViaLink,
} from '../services/contractModuleService.js';
import { sendContractForDigitalSignature } from '../services/contractSignatureFlowService.js';
import { logSignatureAudit } from '../services/contractSignatureAuditService.js';
import { evaluateSignatureCeremony, CEREMONY_STATUS } from '../contracts/clinicalSignatureCeremony.js';
import {
  defaultPrivacyBlock,
  resetConsentAcceptanceMap,
} from '../contracts/publicSigningSummary.js';
import {
  collectPresentedConsents,
  isImmutablePilotContract,
  readEvidenceDocumentHash,
  SIGNATURE_METHOD,
} from '../contracts/remoteSignatureEvidence.js';
import { coerceInternalSignatureType } from '../contracts/internalSignatureClassification.js';
import { resolveSigningClientIp, resolveEvidenceClientIp } from '../contracts/signingClientIp.js';
import { maybeGenerateFinalSignedArtifact } from '../services/finalSignedContractArtifactService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-bu-future';
const JULIANA_COL = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const JULIANA_AUTH = '7d6bf5ac-4c3d-4f6c-a0a2-8f6479c0df30';
const APPT = 'appt-bu-future';
const ORC = 'budget-bu-future';
const CTR = 'gctr-bu-future-00021';

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

function privacyPresented() {
  return collectPresentedConsents(defaultPrivacyBlock());
}

function seed({ includePilot = false, frozenHtml = '<p>Contrato futuro BU</p>' } = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.clinicProfile = { id: 'clinic-bu', tenant_id: TENANT, nomeFantasia: 'Implanprime' };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Dra. Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [{
      id: 'addr-bu',
      principal: true,
      logradouro: 'Rua A',
      numero: '1',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30130-000',
    }];
    db.collaborators = [
      { id: JULIANA_COL, nomeCompleto: 'Juliana de Oliveira Freire', cro: 'CRO-MG 27267', conselhoNumero: '27267', conselhoUf: 'MG', active: true, tenant_id: TENANT },
    ];
    db.collaboratorAccess = [{ collaboratorId: JULIANA_COL, userId: JULIANA_AUTH, role: 'profissional' }];
    db.patients = [{ id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', cpf: '39053344705', birth_date: '1990-01-15', tenant_id: TENANT }];
    db.patientDocuments = [{ patient_id: PATIENT, personal_email: 'paciente.bu@example.invalid' }];
    db.patientAddresses = [{ patient_id: PATIENT, principal: true, logradouro: 'Rua T', numero: '10', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130-000' }];
    db.appointments = [{ id: APPT, patientId: PATIENT, professionalId: JULIANA_COL, status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: TENANT }];
    db.clinicalAppointments = [{
      id: 'clinical-bu',
      appointmentId: APPT,
      patientId: PATIENT,
      budget: {
        id: ORC,
        budgetNumber: 'ORC-BU',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        totalValue: 150,
        procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150, totalValue: 150 }],
        paymentOptions: [{ id: 'pay-1', accepted: true, type: 'a_vista', total: 150 }],
        professionalId: JULIANA_COL,
      },
    }];
    db.generatedContracts = [{
      id: CTR,
      contractNumber: 'CTR-BU-00021',
      budgetId: ORC,
      quoteId: APPT,
      quoteSource: 'clinical_budget',
      patientId: PATIENT,
      status: CONTRACT_STATUS.GENERATED,
      clinicId: 'clinic-bu',
      tenant_id: TENANT,
      version: 1,
      renderedHtml: frozenHtml,
      finalContent: frozenHtml,
      financialSnapshotJson: { valorTotal: 150, formaPagamento: 'à vista' },
      metadata: {},
    }];
    if (includePilot) {
      db.generatedContracts.push({
        id: 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a',
        contractNumber: 'CTR-2026-00003',
        budgetId: 'budget-83f7d5d8-f144-4c1f-bcb0-6b709507fe50',
        status: CONTRACT_STATUS.SIGNED,
        patientId: PATIENT,
        tenant_id: TENANT,
        renderedHtml: '<p>piloto</p>',
        documentHash: 'h3bb6313c',
      });
    }
    db.contractSignatures = [];
    db.contractSignatureRequests = [];
    db.contractSignLinks = [];
    db.contractSignatureAudits = [];
    db.contractAttachments = [];
    db.patientFiles = [];
    db.contractSettings = [{
      clinicId: 'clinic-bu',
      tenant_id: TENANT,
      settings: { signatureProvider: 'internal', signLinkExpiryDays: 7, defaultSignatureType: 'icp_qualified' },
    }];
    return db;
  });
}

async function freezeAndSignJuliana() {
  const prepared = await prepareClinicalSignaturePackage({
    user: julianaUser,
    appointmentId: APPT,
    budgetId: ORC,
    patientId: PATIENT,
    contractId: CTR,
  });
  expect(prepared.ok).toBe(true);
  return signContractOnScreen(julianaUser, CTR, {
    signerName: 'Juliana de Oliveira Freire',
    signerRole: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
    signerPersonId: JULIANA_COL,
    signatureImageDataUrl: 'data:image/png;base64,bu-juliana',
    expectedAppointmentId: APPT,
    expectedBudgetId: ORC,
    expectedPatientId: PATIENT,
  });
}

async function sendInvite() {
  return sendContractForDigitalSignature(julianaUser, CTR, {
    patientName: 'Paulo Henrique Silva de Assis',
    patientEmail: 'paciente.bu@example.invalid',
    patientCpf: '39053344705',
    signatureType: LEGAL_SIGNATURE_TYPES.QUALIFIED,
  });
}

async function signPatient(token, extra = {}) {
  const presented = privacyPresented();
  const acceptanceMap = resetConsentAcceptanceMap(defaultPrivacyBlock());
  acceptanceMap.lgpd_notice = true;
  return signContractViaLink(token, {
    signerName: extra.signerName || 'Paulo Henrique Silva de Assis',
    signerCpf: '39053344705',
    signatureImageDataUrl: extra.stroke || 'data:image/png;base64,bu-paulo',
    presentedConsents: presented,
    acceptanceMap,
    acceptedAtById: { lgpd_notice: extra.acceptedAt || '2026-08-18T15:00:00.000Z' },
    requireConsent: extra.requireConsent !== false,
    observedClientContext: extra.observedClientContext,
    typedSignerName: extra.typedSignerName,
  });
}

describe('PHASE_10.21BU remote signature evidence hardening', () => {
  beforeEach(async () => {
    resetDb();
    initDb();
    deliverSignatureInviteEmail.mockReset();
    deliverSignatureInviteEmail.mockResolvedValue({
      ok: true,
      simulated: false,
      acceptedByTransport: true,
      provider: 'resend',
      messageId: 're_bu_1',
    });
  });

  it('A) consent accepted → persisted in evidence', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    const signed = await signPatient(token);
    const consents = signed.signature.evidenceJson.consentAcceptances;
    expect(consents.find((c) => c.id === 'lgpd_notice')).toMatchObject({
      accepted: true,
      version: 'lgpd_notice.v1',
      acceptedAt: '2026-08-18T15:00:00.000Z',
    });
    expect(readSrc('src/pages/contratos/ContractSignPublicPage.jsx')).toContain('presentedConsents');
    expect(readSrc('src/services/contractModuleService.js')).toContain('consentAcceptances');
  });

  it('B) consent não aceito bloqueia assinatura obrigatória', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    const presented = privacyPresented();
    await expect(signContractViaLink(token, {
      signerName: 'Paulo Henrique Silva de Assis',
      signatureImageDataUrl: 'data:image/png;base64,x',
      presentedConsents: presented,
      acceptanceMap: resetConsentAcceptanceMap(defaultPrivacyBlock()),
      requireConsent: true,
    })).rejects.toThrow(/consentimentos obrigatórios/i);
    expect((loadDb().contractSignatures || []).filter((s) => s.signerRole === 'PATIENT')).toHaveLength(0);
  });

  it('C/D) remote flow não usa OPERATOR_COLLECTED_PRESENCE nem icp_qualified', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    expect(sent.request.signatureType).toBe(LEGAL_SIGNATURE_TYPES.SIMPLE);
    expect(sent.request.signatureType).not.toBe(LEGAL_SIGNATURE_TYPES.QUALIFIED);
    const token = sent.signUrl.replace('/assinatura/', '');
    const signed = await signPatient(token);
    expect(signed.signature.evidenceJson.signatureMethod).toBe(SIGNATURE_METHOD.REMOTE_ON_SCREEN);
    expect(signed.signature.evidenceJson.signatureMethod).not.toBe('OPERATOR_COLLECTED_PRESENCE');
    expect(signed.signature.evidenceJson.signedByUserId).toBeNull();
    expect(signed.signature.evidenceJson.operatorUserId).toBeNull();
    expect(signed.signature.evidenceJson.signingChannel).toBe('public_sign_link');
    expect(signed.signature.evidenceJson.authMethod).toBe('on_screen_link');
    expect(coerceInternalSignatureType('icp_qualified', { signatureProvider: 'internal' })).toBe('electronic_simple');
  });

  it('E) client IP resolvido server-side, frontend não é confiável', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    const signed = await signPatient(token, {
      observedClientContext: { ip: '203.0.113.50', source: 'trusted-proxy' },
    });
    expect(signed.signature.ipAddress).toBe('203.0.113.50');
    expect(signed.signature.evidenceJson.clientIp).toBe('203.0.113.50');
    const spoofed = resolveEvidenceClientIp({
      observedClientContext: null,
      fallbackIp: '8.8.8.8',
      runtime: 'production',
    });
    expect(spoofed.ip).toBe('unavailable');
    const prod = resolveSigningClientIp(
      { socket: { remoteAddress: '10.0.0.5' }, headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.5' } },
      { NODE_ENV: 'production', TRUST_PROXY_HOPS: '1' },
    );
    expect(prod.ip).toBe('203.0.113.9');
    expect(prod.source).toBe('trusted-proxy');
    expect(prod.ip).not.toBe('local');
  });

  it('F) viewedAt first-view idempotent e não consome token', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    const first = recordSignLinkFirstView(token);
    expect(first.viewedAt).toBeTruthy();
    const second = recordSignLinkFirstView(token);
    expect(second.viewedAt).toBe(first.viewedAt);
    expect(getContractBySignToken(token).link.status).toBe('pending');
    expect(recordSignLinkFirstView(token, { prefetch: true })).toBeNull();
  });

  it('G/H) typedName não substitui identidade canônica; nomes divergentes preservados', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    const signed = await signPatient(token, {
      signerName: 'Paulo Henrique Silva Assis',
      typedSignerName: 'Paulo Henrique Silva Assis',
    });
    expect(signed.signature.signerPersonId).toBe(PATIENT);
    expect(signed.signature.evidenceJson.registeredSignerName).toBe('Paulo Henrique Silva de Assis');
    expect(signed.signature.evidenceJson.typedSignerName).toBe('Paulo Henrique Silva Assis');
    expect(signed.signature.evidenceJson.namesDiverged).toBe(true);
  });

  it('I) ceremony finaliza em 2/2 com status canônico', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const signed = await signPatient(sent.signUrl.replace('/assinatura/', ''));
    const ceremony = evaluateSignatureCeremony({
      tenantId: TENANT,
      patientId: PATIENT,
      appointmentId: APPT,
      budgetId: ORC,
      contractId: CTR,
    });
    expect(ceremony.satisfiedCount).toBe(2);
    expect(ceremony.requiredCount).toBe(2);
    expect(ceremony.status).toBe(CEREMONY_STATUS.SIGNED);
    expect(ceremony.status).toBe(CEREMONY_STATUS.COMPLETED);
    expect(signed.contract.status).toBe(CONTRACT_STATUS.SIGNED);
    expect(signed.contract.metadata.signatureCeremony.status).toBe(CEREMONY_STATUS.SIGNED);
    expect(signed.contract.metadata.signatureCeremony.allRequiredSatisfied).toBe(true);
  });

  it('J/V) refresh/replay não cria terceiro stroke e token fica bloqueado', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    await signPatient(token);
    await expect(signPatient(token, { stroke: 'data:image/png;base64,replay' })).rejects.toThrow(/inválido|expirado/i);
    expect(getContractBySignToken(token).replay).toBe(true);
    expect((loadDb().contractSignatures || []).filter((s) => s.contractId === CTR)).toHaveLength(2);
  });

  it('K/L) audit request_created idempotente; resend legítimo continua auditável', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    logSignatureAudit({
      contractId: CTR,
      requestId: sent.request.id,
      action: 'request_created',
      user: julianaUser,
      payload: { documentHash: 'h1' },
    });
    const created = (loadDb().contractSignatureAudits || []).filter((e) => e.action === 'request_created' && e.requestId === sent.request.id);
    expect(created).toHaveLength(1);
    deliverSignatureInviteEmail.mockResolvedValueOnce({
      ok: true, simulated: false, acceptedByTransport: true, provider: 'resend', messageId: 're_bu_resend',
    });
    const { sendSignatureEmail } = await import('../services/signatureProviderService.js');
    await sendSignatureEmail({
      user: julianaUser,
      request: sent.request,
      signUrl: sent.signUrl,
      emailContent: { subject: 'Reenvio', treatmentName: 'Flúor', clinicName: 'Implanprime' },
    });
    const emails = (loadDb().contractSignatureAudits || []).filter((e) => e.action === 'email_sent' && e.requestId === sent.request.id);
    expect(emails.length).toBeGreaterThanOrEqual(2);
    expect(new Set(emails.map((e) => e.metadata?.messageId)).size).toBe(emails.length);
  });

  it('M/N/O) PDF final usa versão/hash assinados, ligado ao contractId e vai ao prontuário', async () => {
    seed({ frozenHtml: '<p>HTML congelado BU v1</p>' });
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const signed = await signPatient(sent.signUrl.replace('/assinatura/', ''));
    expect(signed.finalArtifact?.ok).toBe(true);
    expect(signed.contract.pdfUrl).toMatch(/^data:application\/pdf/);
    expect(signed.contract.metadata.finalArtifactDocumentHash).toBe(signed.contract.documentHash);
    expect(signed.contract.metadata.finalArtifactVersion).toBe(1);
    const att = (loadDb().contractAttachments || []).find((a) => a.contractId === CTR);
    expect(att.contractId).toBe(CTR);
    expect(att.documentHash).toBe(signed.contract.documentHash);
    const chart = (loadDb().patientFiles || []).find((f) => f.mime_type === 'application/pdf' && f.patient_id === PATIENT);
    expect(chart.metadata.contractId).toBe(CTR);
  });

  it('P) falha de PDF não apaga/invalida strokes', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    await signPatient(token);
    const before = (loadDb().contractSignatures || []).filter((s) => s.contractId === CTR);
    withDb((db) => {
      const idx = db.generatedContracts.findIndex((c) => c.id === CTR);
      db.generatedContracts[idx] = {
        ...db.generatedContracts[idx],
        metadata: { ...db.generatedContracts[idx].metadata, finalArtifactStatus: 'failed' },
        pdfUrl: null,
      };
      return db;
    });
    const artifact = await maybeGenerateFinalSignedArtifact({
      contract: { ...loadDb().generatedContracts.find((c) => c.id === CTR), renderedHtml: null, finalContent: null, documentHash: 'hfail' },
      signatures: before,
    });
    void artifact;
    const after = (loadDb().contractSignatures || []).filter((s) => s.contractId === CTR);
    expect(after).toHaveLength(before.length);
    expect(after.map((s) => s.id).sort()).toEqual(before.map((s) => s.id).sort());
    expect(loadDb().generatedContracts.find((c) => c.id === CTR).status).toBe(CONTRACT_STATUS.SIGNED);
  });

  it('Q/R) budget e financial snapshot não são recalculados', async () => {
    seed();
    const beforeBudget = JSON.stringify(loadDb().clinicalAppointments[0].budget);
    const beforeSnap = JSON.stringify(loadDb().generatedContracts[0].financialSnapshotJson);
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    await signPatient(sent.signUrl.replace('/assinatura/', ''));
    expect(JSON.stringify(loadDb().clinicalAppointments[0].budget)).toBe(beforeBudget);
    expect(JSON.stringify(loadDb().generatedContracts.find((c) => c.id === CTR).financialSnapshotJson)).toBe(beforeSnap);
  });

  it('S) Juliana stroke não é duplicado', async () => {
    seed();
    const first = await freezeAndSignJuliana();
    await expect(signContractOnScreen(julianaUser, CTR, {
      signerName: 'Juliana de Oliveira Freire',
      signerRole: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      signerPersonId: JULIANA_COL,
      signatureImageDataUrl: 'data:image/png;base64,dup',
    })).rejects.toThrow(/já assinou/i);
    const juliana = (loadDb().contractSignatures || []).filter((s) => s.signerRole === 'PROFESSIONAL');
    expect(juliana).toHaveLength(1);
    expect(juliana[0].id).toBe(first.signature.id);
  });

  it('T) evidência legada continua legível', () => {
    expect(readEvidenceDocumentHash({ hash: 'h3bb6313c' })).toBe('h3bb6313c');
    expect(readEvidenceDocumentHash({ documentHash: 'hnew', hash: 'hold' })).toBe('hnew');
  });

  it('U) Resend continua o transporte do convite', async () => {
    seed();
    await freezeAndSignJuliana();
    await sendInvite();
    expect(deliverSignatureInviteEmail).toHaveBeenCalled();
    expect(readSrc('src/services/signatureInviteEmailService.js')).toContain('signature-invite-email');
    expect(readSrc('server/lib/contractsSignatureEmailApi.js')).toContain('sendTransactionalEmail');
  });

  it('piloto CTR-2026-00003 não recebe PDF retroativo', async () => {
    expect(isImmutablePilotContract({
      id: 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a',
      contractNumber: 'CTR-2026-00003',
    })).toBe(true);
    const skipped = await maybeGenerateFinalSignedArtifact({
      contract: {
        id: 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a',
        contractNumber: 'CTR-2026-00003',
        status: 'signed',
      },
      signatures: [],
    });
    expect(skipped.skipped).toBe(true);
    expect(skipped.reason).toBe('immutable_pilot');
  });
});
