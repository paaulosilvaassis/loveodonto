/**
 * PHASE_10.21CO — future-only remote binding + SHA-256 binário do PDF final.
 * Não muta CTR-2026-00003 / 00004 / 00005. Sem e-mail real. Sem backfill.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
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
  signContractOnScreen,
  signContractViaLink,
} from '../services/contractModuleService.js';
import { sendContractForDigitalSignature } from '../services/contractSignatureFlowService.js';
import { evaluateSignatureCeremony, CEREMONY_STATUS } from '../contracts/clinicalSignatureCeremony.js';
import {
  defaultPrivacyBlock,
  resetConsentAcceptanceMap,
} from '../contracts/publicSigningSummary.js';
import {
  collectPresentedConsents,
  computeEvidenceHash,
  SIGNATURE_METHOD,
  SIGNING_CHANNEL,
} from '../contracts/remoteSignatureEvidence.js';
import {
  REMOTE_SIGNATURE_BINDING_MISSING,
  REMOTE_SIGNATURE_BINDING_MISMATCH,
  assertRemoteSignatureBinding,
} from '../contracts/remoteSignatureBinding.js';
import { maybeGenerateFinalSignedArtifact } from '../services/finalSignedContractArtifactService.js';
import {
  FINAL_ARTIFACT_HASH_FAILED,
  decodePdfDataUrlToBytes,
  hashPersistedPdfBytes,
} from '../services/finalSignedArtifactCrypto.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-co-future';
const JULIANA_COL = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const JULIANA_AUTH = '7d6bf5ac-4c3d-4f6c-a0a2-8f6479c0df30';
const APPT = 'appt-co-future';
const ORC = 'budget-co-future';
const CTR = 'gctr-co-future-00021';
const OTHER_CTR = 'gctr-co-other-contract';
const OTHER_REQ = 'csreq-co-other-request';
const OTHER_LINK = 'clnk-co-other-link';
const CTR00003 = 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a';
const CTR00004 = 'gctr-930c24bc-f658-4354-81e3-8eea61335361';
const CTR00005 = 'gctr-87ca1983-f43c-41ec-ae22-699d5120a39d';
const CTR00005_PDF = 'catt-7520a89d-94e6-4bf3-a061-2f253b04d592';
const CTR00005_PSIG = 'csig-cf6b1dd1-0c43-4b46-98fe-17fd597d6046';
const CTR00005_ASIG = 'csig-0d790a1f-8a3f-4d1f-9c32-16377337f1a1';

const julianaUser = {
  id: JULIANA_AUTH,
  role: 'profissional',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Juliana de Oliveira Freire',
};

const publicActor = {
  id: null,
  name: 'Clara Closel Franco Segal',
  tenantId: TENANT,
  tenant_id: TENANT,
  publicSignLink: true,
};

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function independentSha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

function privacyPresented() {
  return collectPresentedConsents(defaultPrivacyBlock());
}

function seed() {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.clinicProfile = { id: 'clinic-co', tenant_id: TENANT, nomeFantasia: 'Implanprime' };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Dra. Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [{
      id: 'addr-co',
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
    db.patients = [{ id: PATIENT, full_name: 'Clara Closel Franco Segal', cpf: '39053344705', birth_date: '1990-01-15', tenant_id: TENANT }];
    db.patientDocuments = [{ patient_id: PATIENT, personal_email: 'paciente.co@example.invalid' }];
    db.patientAddresses = [{ patient_id: PATIENT, principal: true, logradouro: 'Rua T', numero: '10', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130-000' }];
    db.appointments = [{ id: APPT, patientId: PATIENT, professionalId: JULIANA_COL, status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: TENANT }];
    db.clinicalAppointments = [{
      id: 'clinical-co',
      appointmentId: APPT,
      patientId: PATIENT,
      budget: {
        id: ORC,
        budgetNumber: 'ORC-CO',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        totalValue: 150,
        procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150, totalValue: 150 }],
        paymentOptions: [{ id: 'pay-1', accepted: true, type: 'a_vista', total: 150 }],
        professionalId: JULIANA_COL,
      },
    }];
    db.generatedContracts = [
      {
        id: CTR,
        contractNumber: 'CTR-CO-00021',
        budgetId: ORC,
        quoteId: APPT,
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        status: CONTRACT_STATUS.GENERATED,
        clinicId: 'clinic-co',
        tenant_id: TENANT,
        version: 1,
        renderedHtml: '<p>Contrato futuro CO</p>',
        finalContent: '<p>Contrato futuro CO</p>',
        financialSnapshotJson: { valorTotal: 150, formaPagamento: 'à vista' },
        metadata: {},
      },
      {
        id: CTR00003,
        contractNumber: 'CTR-2026-00003',
        status: CONTRACT_STATUS.SIGNED,
        patientId: PATIENT,
        tenant_id: TENANT,
        documentHash: 'h3bb6313c',
        renderedHtml: '<p>piloto 00003</p>',
      },
      {
        id: CTR00004,
        contractNumber: 'CTR-2026-00004',
        status: CONTRACT_STATUS.GENERATED,
        patientId: PATIENT,
        tenant_id: TENANT,
        documentHash: 'he96548e0',
        renderedHtml: '<p>piloto 00004</p>',
      },
      {
        id: CTR00005,
        contractNumber: 'CTR-2026-00005',
        status: CONTRACT_STATUS.SIGNED,
        patientId: PATIENT,
        tenant_id: TENANT,
        version: 1,
        documentHash: 'h94e01b5',
        pdfUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        renderedHtml: '<p>piloto 00005</p>',
        metadata: {
          finalArtifactStatus: 'generated',
          finalArtifactAttachmentId: CTR00005_PDF,
        },
      },
    ];
    db.contractSignatures = [
      { id: CTR00005_PSIG, contractId: CTR00005, signerRole: 'PROFESSIONAL', evidenceJson: { signingChannel: 'clinic_app' } },
      { id: CTR00005_ASIG, contractId: CTR00005, signerRole: 'PATIENT', evidenceJson: { signingChannel: 'public_sign_link' } },
    ];
    db.contractSignatureRequests = [];
    db.contractSignLinks = [];
    db.contractSignatureAudits = [];
    db.contractAttachments = [{
      id: CTR00005_PDF,
      contractId: CTR00005,
      source: 'final_signed_artifact',
      documentHash: 'h94e01b5',
      fileUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
      immutable: true,
    }];
    db.patientFiles = [];
    db.contractSettings = [{
      clinicId: 'clinic-co',
      tenant_id: TENANT,
      settings: { signatureProvider: 'internal', signLinkExpiryDays: 7, defaultSignatureType: 'icp_qualified' },
    }];
    return db;
  });
}

function seedForeignBinding() {
  withDb((db) => {
    db.generatedContracts.push({
      id: OTHER_CTR,
      contractNumber: 'CTR-CO-OTHER',
      status: CONTRACT_STATUS.GENERATED,
      tenant_id: TENANT,
      patientId: PATIENT,
    });
    db.contractSignatureRequests.push({
      id: OTHER_REQ,
      contractId: OTHER_CTR,
      status: 'pending',
    });
    db.contractSignLinks.push({
      id: OTHER_LINK,
      contractId: OTHER_CTR,
      requestId: OTHER_REQ,
      status: 'pending',
    });
    return db;
  });
}

function preservedPilots() {
  const rows = loadDb().generatedContracts;
  const c3 = rows.find((c) => c.id === CTR00003);
  const c4 = rows.find((c) => c.id === CTR00004);
  const c5 = rows.find((c) => c.id === CTR00005);
  expect(c3.status).toBe(CONTRACT_STATUS.SIGNED);
  expect(c3.documentHash).toBe('h3bb6313c');
  expect(c4.status).toBe(CONTRACT_STATUS.GENERATED);
  expect(c4.documentHash).toBe('he96548e0');
  expect(c5.status).toBe(CONTRACT_STATUS.SIGNED);
  expect(c5.documentHash).toBe('h94e01b5');
  const att = (loadDb().contractAttachments || []).find((a) => a.id === CTR00005_PDF);
  expect(att.artifactBinarySha256).toBeUndefined();
  expect(att.documentHash).toBe('h94e01b5');
  const sigs = (loadDb().contractSignatures || []).filter((s) => s.contractId === CTR00005);
  expect(sigs.map((s) => s.id).sort()).toEqual([CTR00005_ASIG, CTR00005_PSIG].sort());
  expect(sigs.find((s) => s.id === CTR00005_ASIG).evidenceJson.signatureRequestId).toBeUndefined();
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
    signatureImageDataUrl: 'data:image/png;base64,co-juliana',
    expectedAppointmentId: APPT,
    expectedBudgetId: ORC,
    expectedPatientId: PATIENT,
  });
}

async function sendInvite() {
  return sendContractForDigitalSignature(julianaUser, CTR, {
    patientName: 'Clara Closel Franco Segal',
    patientEmail: 'paciente.co@example.invalid',
    patientCpf: '39053344705',
    signatureType: LEGAL_SIGNATURE_TYPES.QUALIFIED,
  });
}

async function signPatient(token, extra = {}) {
  const presented = privacyPresented();
  const acceptanceMap = resetConsentAcceptanceMap(defaultPrivacyBlock());
  acceptanceMap.lgpd_notice = true;
  return signContractViaLink(token, {
    signerName: extra.signerName || 'Clara Closel Franco Segal',
    signerCpf: '39053344705',
    signatureImageDataUrl: extra.stroke || 'data:image/png;base64,co-clara',
    presentedConsents: presented,
    acceptanceMap,
    acceptedAtById: { lgpd_notice: extra.acceptedAt || '2026-08-28T15:00:00.000Z' },
    requireConsent: extra.requireConsent !== false,
    typedSignerName: extra.typedSignerName,
  });
}

function remoteOnScreenPayload(extra = {}) {
  return {
    signerName: 'Clara Closel Franco Segal',
    signerCpf: '39053344705',
    signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
    signerPersonId: PATIENT,
    signatureImageDataUrl: 'data:image/png;base64,co-remote',
    signingChannel: SIGNING_CHANNEL.PUBLIC_SIGN_LINK,
    ...extra,
  };
}

function evidenceFieldsFromSignature(sig) {
  return {
    contractId: sig.contractId,
    documentHash: sig.evidenceJson.documentHash,
    contractVersion: sig.evidenceJson.contractVersion,
    signerPersonId: sig.signerPersonId,
    signerRole: sig.signerRole,
    signedAt: sig.signedAt,
    signatureMethod: sig.evidenceJson.signatureMethod,
    signingChannel: sig.evidenceJson.signingChannel,
    authMethod: sig.evidenceJson.authMethod,
    registeredSignerName: sig.evidenceJson.registeredSignerName,
    typedSignerName: sig.evidenceJson.typedSignerName,
    consentAcceptances: sig.evidenceJson.consentAcceptances,
    clientIp: sig.evidenceJson.clientIp,
    signatureRequestId: sig.evidenceJson.signatureRequestId,
    signLinkId: sig.evidenceJson.signLinkId,
  };
}

async function expectCode(promise, code) {
  try {
    await promise;
    throw new Error(`esperava ${code}`);
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

describe('PHASE_10.21CO legal evidence hardening', () => {
  beforeEach(async () => {
    resetDb();
    initDb();
    deliverSignatureInviteEmail.mockReset();
    deliverSignatureInviteEmail.mockResolvedValue({
      ok: true,
      simulated: false,
      acceptedByTransport: true,
      provider: 'resend',
      messageId: 're_co_1',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1-3) PATIENT via public link grava requestId e linkId reais do mesmo fluxo', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    const resolved = getContractBySignToken(token);
    const signed = await signPatient(token);
    const ev = signed.signature.evidenceJson;
    expect(ev.signingChannel).toBe(SIGNING_CHANNEL.PUBLIC_SIGN_LINK);
    expect(ev.signatureMethod).toBe(SIGNATURE_METHOD.REMOTE_ON_SCREEN);
    expect(ev.signatureRequestId).toBe(resolved.link.requestId);
    expect(ev.signLinkId).toBe(resolved.link.id);
    expect(ev.signatureRequestId).toBe(sent.request.id);
    expect(ev.signLinkId).not.toBe(OTHER_LINK);
    expect(resolved.link.contractId).toBe(CTR);
    expect(resolved.contract.id).toBe(CTR);
    const req = (loadDb().contractSignatureRequests || []).find((r) => r.id === ev.signatureRequestId);
    const link = (loadDb().contractSignLinks || []).find((l) => l.id === ev.signLinkId);
    expect(req.contractId).toBe(CTR);
    expect(link.contractId).toBe(CTR);
    expect(link.requestId).toBe(req.id);
    preservedPilots();
  });

  it('4) request ausente bloqueia assinatura remota', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    await expectCode(
      signContractOnScreen(publicActor, CTR, remoteOnScreenPayload({ signLinkId: 'clnk-only' })),
      REMOTE_SIGNATURE_BINDING_MISSING,
    );
    expect((loadDb().contractSignatures || []).filter((s) => s.contractId === CTR && s.signerRole === 'PATIENT')).toHaveLength(0);

    const token = sent.signUrl.replace('/assinatura/', '');
    withDb((db) => {
      const links = db.contractSignLinks || [];
      const idx = links.findIndex((l) => l.token === token);
      const { requestId, ...rest } = links[idx];
      void requestId;
      links[idx] = rest;
      return db;
    });
    await expectCode(signPatient(token), REMOTE_SIGNATURE_BINDING_MISSING);
  });

  it('5) link ausente bloqueia assinatura remota', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    await expectCode(
      signContractOnScreen(publicActor, CTR, remoteOnScreenPayload({
        signatureRequestId: sent.request.id,
      })),
      REMOTE_SIGNATURE_BINDING_MISSING,
    );
    expect((loadDb().contractSignatures || []).filter((s) => s.contractId === CTR && s.signerRole === 'PATIENT')).toHaveLength(0);
  });

  it('6) request de outro contrato é bloqueado', async () => {
    seed();
    seedForeignBinding();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const token = sent.signUrl.replace('/assinatura/', '');
    const ownLink = getContractBySignToken(token).link.id;
    await expectCode(
      signContractOnScreen(publicActor, CTR, remoteOnScreenPayload({
        signatureRequestId: OTHER_REQ,
        signLinkId: ownLink,
      })),
      REMOTE_SIGNATURE_BINDING_MISMATCH,
    );
  });

  it('7) link de outro contrato é bloqueado', async () => {
    seed();
    seedForeignBinding();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    await expectCode(
      signContractOnScreen(publicActor, CTR, remoteOnScreenPayload({
        signatureRequestId: sent.request.id,
        signLinkId: OTHER_LINK,
      })),
      REMOTE_SIGNATURE_BINDING_MISMATCH,
    );
  });

  it('8) assinatura PROFESSIONAL autenticada continua sem request/link', async () => {
    seed();
    const signed = await freezeAndSignJuliana();
    expect(signed.signature.evidenceJson.signatureMethod).toBe(SIGNATURE_METHOD.AUTHENTICATED_ELECTRONIC);
    expect(signed.signature.evidenceJson.signingChannel).toBe(SIGNING_CHANNEL.CLINIC_APP);
    expect(signed.signature.evidenceJson.signatureRequestId).toBeUndefined();
    expect(signed.signature.evidenceJson.signLinkId).toBeUndefined();
    expect(signed.signature.evidenceJson.manifestId || signed.signature.evidenceJson.packageManifestId).toBeTruthy();
    expect(signed.signature.evidenceJson.frozenContentSha256).toBeTruthy();
    expect(signed.signature.evidenceJson.contractVersion).toBe(1);
  });

  it('9) PATIENT interno/on-screen não remoto permanece compatível', async () => {
    seed();
    await prepareClinicalSignaturePackage({
      user: julianaUser,
      appointmentId: APPT,
      budgetId: ORC,
      patientId: PATIENT,
      contractId: CTR,
    });
    const signed = await signContractOnScreen(julianaUser, CTR, {
      signerName: 'Clara Closel Franco Segal',
      signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
      signerPersonId: PATIENT,
      signatureImageDataUrl: 'data:image/png;base64,co-internal',
    });
    expect(signed.signature.evidenceJson.signatureMethod).toBe(SIGNATURE_METHOD.OPERATOR_COLLECTED_PRESENCE);
    expect(signed.signature.evidenceJson.signingChannel).toBe(SIGNING_CHANNEL.CLINIC_APP);
    expect(signed.signature.evidenceJson.signatureRequestId).toBeUndefined();
    expect(signed.signature.evidenceJson.signLinkId).toBeUndefined();
    expect(signed.contract.status).not.toBe(CONTRACT_STATUS.SIGNED);
  });

  it('10) não há fallback para último request/link', async () => {
    seed();
    await freezeAndSignJuliana();
    await sendInvite();
    const requests = loadDb().contractSignatureRequests.filter((r) => r.contractId === CTR);
    const links = loadDb().contractSignLinks.filter((l) => l.contractId === CTR);
    expect(requests.length).toBeGreaterThan(0);
    expect(links.length).toBeGreaterThan(0);
    await expectCode(
      signContractOnScreen(publicActor, CTR, remoteOnScreenPayload()),
      REMOTE_SIGNATURE_BINDING_MISSING,
    );
    const bindingSrc = readSrc('src/contracts/remoteSignatureBinding.js');
    expect(bindingSrc).toContain('row?.id === requestId');
    expect(bindingSrc).toContain('row?.id === linkId');
    expect(bindingSrc).not.toContain('getLatestSignatureRequest');
    expect(bindingSrc).not.toContain('lastRequest');
    expect(bindingSrc).toMatch(/find\(\(row\) => row\?\.id === requestId\)/);
    expect(bindingSrc).toMatch(/find\(\(row\) => row\?\.id === linkId\)/);
    expect(assertRemoteSignatureBinding({
      contractId: CTR,
      signingChannel: SIGNING_CHANNEL.CLINIC_APP,
      signatureMethod: SIGNATURE_METHOD.AUTHENTICATED_ELECTRONIC,
    }).required).toBe(false);
  });

  it('11) evidenceHash é calculado sobre a evidência final com request/link', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const signed = await signPatient(sent.signUrl.replace('/assinatura/', ''));
    const sig = signed.signature;
    expect(sig.evidenceJson.evidenceHash).toBe(computeEvidenceHash(evidenceFieldsFromSignature(sig)));
    expect(sig.evidenceJson.packageManifestId).toBeTruthy();
    expect(sig.evidenceJson.packageManifestHash).toBeTruthy();
    expect(sig.evidenceJson.frozenContentSha256).toBeTruthy();
    expect(sig.evidenceJson.authenticatedPersonId).toBe(PATIENT);
    expect(sig.evidenceJson.clientIpSource).toBeTruthy();
  });

  it('PDF: SHA-256 dos bytes persistidos, byteLength, generatedAt e consistência attachment/prontuário', async () => {
    seed();
    await freezeAndSignJuliana();
    const sent = await sendInvite();
    const signed = await signPatient(sent.signUrl.replace('/assinatura/', ''));
    expect(signed.finalArtifact?.ok).toBe(true);
    const att = (loadDb().contractAttachments || []).find((a) => a.contractId === CTR && a.source === 'final_signed_artifact');
    const bytes = decodePdfDataUrlToBytes(att.fileUrl);
    const independent = independentSha256(bytes);
    expect(att.artifactBinarySha256).toBe(independent);
    expect(signed.finalArtifact.artifactBinarySha256).toBe(independent);
    expect(att.artifactByteLength).toBe(bytes.byteLength);
    expect(att.artifactGeneratedAt).toBeTruthy();
    expect(signed.contract.metadata.artifactBinarySha256).toBe(independent);
    expect(signed.contract.metadata.artifactByteLength).toBe(bytes.byteLength);
    expect(signed.contract.metadata.artifactGeneratedAt).toBe(att.artifactGeneratedAt);
    const chart = (loadDb().patientFiles || []).find((f) => f.metadata?.contractId === CTR && f.metadata?.source === 'final_signed_artifact');
    expect(chart.metadata.artifactBinarySha256).toBe(independent);
    expect(chart.metadata.artifactByteLength).toBe(bytes.byteLength);
    expect(chart.metadata.artifactGeneratedAt).toBe(att.artifactGeneratedAt);
    expect(att.documentHash).toBe(signed.contract.documentHash);
    expect(att.documentHash).toMatch(/^h[0-9a-f]+$/);
    expect(att.artifactBinarySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(att.artifactBinarySha256).not.toBe(att.documentHash);
    expect(evaluateSignatureCeremony({
      tenantId: TENANT,
      patientId: PATIENT,
      appointmentId: APPT,
      budgetId: ORC,
      contractId: CTR,
    }).status).toBe(CEREMONY_STATUS.SIGNED);
    preservedPilots();
  });

  it('tamper: alterar 1 byte da cópia muda o SHA-256; artefato persistido intacto', async () => {
    seed();
    await freezeAndSignJuliana();
    const signed = await signPatient((await sendInvite()).signUrl.replace('/assinatura/', ''));
    const att = (loadDb().contractAttachments || []).find((a) => a.contractId === CTR);
    const bytes = decodePdfDataUrlToBytes(att.fileUrl);
    const tampered = Uint8Array.from(bytes);
    tampered[Math.min(20, tampered.length - 1)] ^= 0xff;
    expect(independentSha256(tampered)).not.toBe(att.artifactBinarySha256);
    expect(decodePdfDataUrlToBytes(att.fileUrl)).toEqual(bytes);
    expect(signed.finalArtifact.artifactBinarySha256).toBe(att.artifactBinarySha256);
  });

  it('imutabilidade: segundo generate não recalcula nem backfilla hash histórico', async () => {
    seed();
    await freezeAndSignJuliana();
    await signPatient((await sendInvite()).signUrl.replace('/assinatura/', ''));
    const first = (loadDb().contractAttachments || []).find((a) => a.contractId === CTR);
    const second = await maybeGenerateFinalSignedArtifact({
      contract: loadDb().generatedContracts.find((c) => c.id === CTR),
      signatures: (loadDb().contractSignatures || []).filter((s) => s.contractId === CTR),
    });
    expect(second.skipped || second.alreadyGenerated).toBeTruthy();
    const atts = (loadDb().contractAttachments || []).filter((a) => a.contractId === CTR && a.source === 'final_signed_artifact');
    expect(atts).toHaveLength(1);
    expect(atts[0].id).toBe(first.id);
    expect(atts[0].artifactBinarySha256).toBe(first.artifactBinarySha256);

    const historical = await maybeGenerateFinalSignedArtifact({
      contract: loadDb().generatedContracts.find((c) => c.id === CTR00005),
      signatures: (loadDb().contractSignatures || []).filter((s) => s.contractId === CTR00005),
    });
    expect(historical.reason).toBe('already_generated');
    expect((loadDb().contractAttachments || []).find((a) => a.id === CTR00005_PDF).artifactBinarySha256).toBeUndefined();
    preservedPilots();
  });

  it('fail-closed: SHA-256 indisponível não declara artefato pronto nem persiste hash null', async () => {
    seed();
    await freezeAndSignJuliana();
    await signPatient((await sendInvite()).signUrl.replace('/assinatura/', ''));
    withDb((db) => {
      const idx = db.generatedContracts.findIndex((c) => c.id === CTR);
      db.generatedContracts[idx] = {
        ...db.generatedContracts[idx],
        pdfUrl: null,
        signedPdfUrl: null,
        metadata: {
          ...db.generatedContracts[idx].metadata,
          finalArtifactStatus: 'failed',
          artifactBinarySha256: undefined,
          artifactByteLength: undefined,
          artifactGeneratedAt: undefined,
          finalArtifactAttachmentId: undefined,
        },
      };
      db.contractAttachments = (db.contractAttachments || []).filter((a) => a.contractId !== CTR);
      db.patientFiles = (db.patientFiles || []).filter((f) => f.metadata?.contractId !== CTR);
      return db;
    });
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('subtle down'));
    const artifact = await maybeGenerateFinalSignedArtifact({
      contract: loadDb().generatedContracts.find((c) => c.id === CTR),
      signatures: (loadDb().contractSignatures || []).filter((s) => s.contractId === CTR),
    });
    expect(artifact.ok).toBe(false);
    expect(artifact.code).toBe(FINAL_ARTIFACT_HASH_FAILED);
    expect(artifact.strokesPreserved).toBe(true);
    const live = loadDb().generatedContracts.find((c) => c.id === CTR);
    expect(live.metadata.finalArtifactStatus).toBe('failed');
    expect(live.metadata.artifactBinarySha256).toBeUndefined();
    expect(live.pdfUrl).toBeFalsy();
    expect((loadDb().contractAttachments || []).filter((a) => a.contractId === CTR)).toHaveLength(0);
    expect((loadDb().contractSignatures || []).filter((s) => s.contractId === CTR)).toHaveLength(2);
  });

  it('hashPersistedPdfBytes e data URL inválida falham fechado', async () => {
    await expect(hashPersistedPdfBytes(new Uint8Array())).rejects.toMatchObject({ code: FINAL_ARTIFACT_HASH_FAILED });
    expect(() => decodePdfDataUrlToBytes('data:text/html,not-a-pdf')).toThrow();
    try {
      decodePdfDataUrlToBytes('data:text/html,not-a-pdf');
    } catch (err) {
      expect(err.code).toBe(FINAL_ARTIFACT_HASH_FAILED);
    }
  });

  it('artefato histórico sem campos futuros permanece legível', () => {
    seed();
    const att = (loadDb().contractAttachments || []).find((a) => a.id === CTR00005_PDF);
    expect(att.documentHash).toBe('h94e01b5');
    expect('artifactBinarySha256' in att).toBe(false);
    expect(att.artifactByteLength).toBeUndefined();
    expect(readSrc('src/services/finalSignedContractArtifactService.js')).toContain('documentHash');
    expect(readSrc('src/services/finalSignedContractArtifactService.js')).toContain('artifactBinarySha256');
    expect(readSrc('src/services/finalSignedArtifactCrypto.js')).toContain('sha256Bytes');
    expect(readSrc('src/services/finalSignedArtifactCrypto.js')).not.toMatch(/from ['"].*simpleHash/);
    preservedPilots();
  });
});
