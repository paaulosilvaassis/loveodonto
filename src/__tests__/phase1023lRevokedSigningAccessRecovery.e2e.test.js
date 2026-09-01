/**
 * PHASE_10.23L — regressão permanente da cadeia do incidente de acesso revogado.
 * Fronteira de serviço. Fixtures only. Sem PII. Sem token em audit asserts.
 * Não muta dados de produção. Não altera writers.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_AUDIT_EVENTS,
  LIFECYCLE_TENANT_MISMATCH,
  describePublicSigningAccessFailure,
  getContractLifecycleUiPolicy,
} from '../contracts/lifecycle/index.js';
import { revokeSigningAccess } from '../services/contractLifecycleCommandService.js';
import {
  replaceRevokedSigningAccess,
  replaceRevokedSigningAccessAndInvite,
} from '../services/contractSigningAccessReplacementService.js';
import { buildSignatureInviteEmail } from '../../server/email/buildSignatureInviteEmail.js';
import {
  ensureContractsModuleSeeded,
  getContractBySignToken,
  sendContractForSignature,
  signContractViaLink,
} from '../services/contractModuleService.js';
import { SIGNING_ACCESS_ACTION_LABELS } from '../components/clinical/PatientRemoteInviteActions.jsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-l-23l';
const TENANT_B = 'tenant-l-23l-b';
const ORIGIN = 'https://loveodonto.com.br';

const admin = {
  id: 'user-l-admin', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin 23L',
};

vi.mock('../services/signatureInviteEmailService.js', () => ({
  deliverSignatureInviteEmail: vi.fn(async ({ signUrl, requestId }) => ({
    ok: true,
    provider: 'smtp',
    messageId: 'mid-l-1',
    acceptedByTransport: true,
    signUrl,
    requestId,
  })),
}));

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function expectCode(fn, code) {
  try {
    fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

function financeSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    clinicalBudgets: db.clinicalBudgets || [],
    accountsReceivable: db.accountsReceivable || [],
    receivablePayments: db.receivablePayments || [],
    financings: db.financings || [],
  });
}

function legalSnapshot(contractId) {
  const db = loadDb();
  const contract = (db.generatedContracts || []).find((row) => row.id === contractId);
  return JSON.stringify({
    id: contract?.id,
    documentHash: contract?.documentHash,
    renderedHtml: contract?.renderedHtml,
    version: contract?.version,
    signatures: (db.contractSignatures || []).filter((row) => row.contractId === contractId),
    manifests: (db.clinicalPackageManifests || []).filter((row) => row.contractId === contractId),
  });
}

/** Recria o defeito de seleção: primeiro link histórico, sem filtro de signability. */
function selectStaleHistoricalLink(db, contractId) {
  return (db.contractSignLinks || []).find((row) => row.contractId === contractId) || null;
}

function putIncidentContract({
  id = 'gctr-l-1',
  status = CONTRACT_STATUS.GENERATED,
  extraContract = {},
} = {}) {
  withDb((db) => {
    db.tenants = [
      { id: TENANT, name: 'Clinica 23L', status: 'active' },
      { id: TENANT_B, name: 'Clinica 23LB', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-1', razaoSocial: 'Clinica 23L', tenant_id: TENANT };
    db.generatedContracts = [{
      id,
      contractNumber: 'CTR-L-1',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      patientId: 'pat-l',
      status,
      renderedHtml: '<p>Contrato L</p>',
      finalContent: '<p>Contrato L</p>',
      documentHash: 'hash-l',
      version: 1,
      ...extraContract,
    }];
    db.contractSignatures = [];
    db.contractSignatureRequests = [];
    db.contractSignLinks = [];
    db.contractLifecycleAudits = [];
    db.clinicalPackageManifests = [{
      id: 'man-l', contractId: id, manifestHash: 'mh-l', status: 'FROZEN',
    }];
    db.patients = [{ id: 'pat-l', full_name: 'Paciente L', tenant_id: TENANT, clinicId: 'clinic-1' }];
    db.clinicalBudgets = [];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    return db;
  });
}

describe('PHASE_10.23L permanent revoked signing access recovery E2E', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    ensureContractsModuleSeeded();
    putIncidentContract();
  });

  it('incident chain: send → revoke → old URL blocked → replace → new email URL → sign → old URL stays blocked', async () => {
    const { deliverSignatureInviteEmail } = await import('../services/signatureInviteEmailService.js');
    const sent = sendContractForSignature(admin, 'gctr-l-1');
    const oldRequestId = sent.request.id;
    const oldLinkId = sent.link.id;
    const oldToken = sent.link.token;
    expect(sent.link.requestId).toBe(oldRequestId);
    expect(getContractBySignToken(oldToken).contract.id).toBe('gctr-l-1');

    revokeSigningAccess({
      user: admin,
      contractId: 'gctr-l-1',
      requestId: oldRequestId,
      reason: 'Revogação explícita do acesso remoto.',
    });
    expect(loadDb().contractSignatureRequests.find((row) => row.id === oldRequestId).status).toBe('revoked');
    expect(loadDb().contractSignLinks.find((row) => row.id === oldLinkId).status).toBe('revoked');
    expect(describePublicSigningAccessFailure(oldToken).kind).toBe('revoked');
    expect(getContractBySignToken(oldToken)).toBeNull();

    const legalBefore = legalSnapshot('gctr-l-1');
    const financeBefore = financeSnapshot();
    const replaced = await replaceRevokedSigningAccessAndInvite({
      user: admin,
      contractId: 'gctr-l-1',
      requestId: oldRequestId,
      reason: 'Novo acesso solicitado após revogação do acesso anterior.',
      origin: ORIGIN,
    });
    expect(replaced.request.id).not.toBe(oldRequestId);
    expect(replaced.link.id).not.toBe(oldLinkId);
    expect(replaced.link.token).not.toBe(oldToken);
    expect(replaced.link.requestId).toBe(replaced.request.id);
    expect(replaced.request.contractId).toBe('gctr-l-1');
    expect(replaced.request.tenant_id).toBe(TENANT);
    expect(replaced.request.signerPersonId).toBe('pat-l');
    expect(replaced.parentRequest.status).toBe('revoked');
    expect(loadDb().contractSignLinks.find((row) => row.id === oldLinkId).status).toBe('revoked');
    expect(loadDb().contractSignLinks.find((row) => row.id === oldLinkId).token).toBe(oldToken);
    expect(loadDb().contractSignatureRequests.filter((row) => ['pending', 'sent'].includes(row.status))).toHaveLength(1);
    expect(loadDb().contractSignLinks.filter((row) => row.status === 'pending')).toHaveLength(1);
    expect(legalSnapshot('gctr-l-1')).toBe(legalBefore);
    expect(financeSnapshot()).toBe(financeBefore);

    expect(deliverSignatureInviteEmail).toHaveBeenCalled();
    const inviteArg = deliverSignatureInviteEmail.mock.calls.at(-1)[0];
    expect(inviteArg.signUrl).toBe(`${ORIGIN}/assinatura/${replaced.link.token}`);
    expect(inviteArg.signUrl).not.toContain(oldToken);
    expect(inviteArg.requestId).toBe(replaced.request.id);

    const email = buildSignatureInviteEmail({
      patientName: 'Paciente L',
      signUrl: inviteArg.signUrl,
      contractNumber: 'CTR-L-1',
    });
    expect(email.html).toContain('REVISAR E ASSINAR CONTRATO');
    expect(email.html).toContain(replaced.link.token);
    expect(email.html).not.toContain(oldToken);

    const stale = selectStaleHistoricalLink(loadDb(), 'gctr-l-1');
    expect(stale.id).toBe(oldLinkId);
    expect(stale.token).toBe(oldToken);
    const buggyEmail = buildSignatureInviteEmail({
      patientName: 'Paciente L',
      signUrl: `${ORIGIN}/assinatura/${stale.token}`,
      contractNumber: 'CTR-L-1',
    });
    expect(buggyEmail.html).toContain(oldToken);
    expect(buggyEmail.html).not.toContain(replaced.link.token);
    expect(email.html).not.toEqual(buggyEmail.html);

    const resolved = getContractBySignToken(replaced.link.token);
    expect(resolved.contract.id).toBe('gctr-l-1');
    expect(resolved.link.id).toBe(replaced.link.id);
    expect(resolved.expired).toBeFalsy();
    const signed = await signContractViaLink(replaced.link.token, {
      signerName: 'Paciente L',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,i',
    });
    expect(signed.signature.evidenceJson.signatureRequestId).toBe(replaced.request.id);
    expect(signed.signature.evidenceJson.signLinkId).toBe(replaced.link.id);
    expect((loadDb().contractSignatures || []).filter((row) => row.contractId === 'gctr-l-1')).toHaveLength(1);
    expect(getContractBySignToken(oldToken)).toBeNull();
    expect(describePublicSigningAccessFailure(oldToken).kind).toBe('revoked');
    expect(JSON.parse(legalSnapshot('gctr-l-1')).manifests).toEqual(JSON.parse(legalBefore).manifests);
    expect(JSON.parse(legalSnapshot('gctr-l-1')).renderedHtml).toBe(JSON.parse(legalBefore).renderedHtml);
    expect(financeSnapshot()).toBe(financeBefore);

    const audit = (loadDb().contractLifecycleAudits || [])
      .find((row) => row.eventType === LIFECYCLE_AUDIT_EVENTS.SIGNING_ACCESS_REPLACED);
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain(oldToken);
    expect(JSON.stringify(audit)).not.toContain(replaced.link.token);
  });

  it('partial ceremony: professional csig and manifest survive patient access replacement', async () => {
    putIncidentContract({
      status: 'partially_signed',
      extraContract: {
        metadata: {
          packageManifestId: 'man-l',
          packageManifestHash: 'mh-l',
          frozenAt: '2026-08-31T12:00:00.000Z',
          signatureCeremony: { status: 'partially_signed', requiredCount: 2, satisfiedCount: 1 },
        },
      },
    });
    withDb((db) => {
      db.contractSignatures = [{
        id: 'csig-l-pro', contractId: 'gctr-l-1', signerRole: 'PROFESSIONAL', signerPersonId: 'pro-l',
        evidenceJson: { hash: 'h-pro' },
      }];
      db.contractSignatureRequests = [{
        id: 'csreq-l-seed', contractId: 'gctr-l-1', tenant_id: TENANT, status: 'pending',
        signerRole: 'PATIENT', signerPersonId: 'pat-l', expiresAt: '2099-01-01T00:00:00.000Z',
        createdAt: '2026-08-31T12:00:00.000Z',
      }];
      db.contractSignLinks = [{
        id: 'clnk-l-seed', contractId: 'gctr-l-1', requestId: 'csreq-l-seed', tenant_id: TENANT,
        token: 'csgn-l-seed', status: 'pending', signerRole: 'PATIENT', signerPersonId: 'pat-l',
        expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-08-31T12:00:00.000Z',
      }];
      return db;
    });
    revokeSigningAccess({
      user: admin, contractId: 'gctr-l-1', requestId: 'csreq-l-seed', reason: 'Revogar acesso do paciente.',
    });
    const beforeSigs = JSON.stringify(loadDb().contractSignatures);
    const beforeMan = JSON.stringify(loadDb().clinicalPackageManifests);
    const beforeCeremony = JSON.stringify(loadDb().generatedContracts[0].metadata?.signatureCeremony);
    const replaced = await replaceRevokedSigningAccessAndInvite({
      user: admin, contractId: 'gctr-l-1', reason: 'Novo acesso após revogação.', origin: ORIGIN, deliverEmail: false,
    });
    expect(JSON.stringify(loadDb().contractSignatures)).toBe(beforeSigs);
    expect(JSON.stringify(loadDb().clinicalPackageManifests)).toBe(beforeMan);
    expect(JSON.stringify(loadDb().generatedContracts[0].metadata?.signatureCeremony)).toBe(beforeCeremony);
    expect(loadDb().generatedContracts[0].status).toBe('partially_signed');
    expect(replaced.request.id).not.toBe('csreq-l-seed');
    expect(replaced.request.signerPersonId).toBe('pat-l');
    expect(replaced.request.signerRole).toBe('PATIENT');
    expect(loadDb().contractSignatures.filter((row) => row.signerRole === 'PROFESSIONAL')).toHaveLength(1);

    const signed = await signContractViaLink(replaced.link.token, {
      signerName: 'Paciente L',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,i',
    });
    expect(signed.signature.evidenceJson.signatureRequestId).toBe(replaced.request.id);
    const sigs = loadDb().contractSignatures.filter((row) => row.contractId === 'gctr-l-1');
    expect(sigs.filter((row) => row.signerRole === 'PROFESSIONAL' && row.id === 'csig-l-pro')).toHaveLength(1);
    expect(sigs.filter((row) => row.signerRole === 'PROFESSIONAL')).toHaveLength(1);
    expect(sigs.filter((row) => row.id === 'csig-l-pro')[0].evidenceJson).toEqual({ hash: 'h-pro' });
    expect(JSON.stringify(loadDb().clinicalPackageManifests)).toBe(beforeMan);
    expect(describePublicSigningAccessFailure('csgn-l-seed').kind).toBe('revoked');
  });

  it('security, UI freeze and writer mapping remain fail-closed', () => {
    const writer = readSrc('src/services/contractSigningAccessReplacementService.js');
    const persist = readSrc('src/contracts/lifecycle/accessReplacement.js');
    expect(writer).toContain('signUrl: publicSignUrl(created.link, origin)');
    expect(persist).toContain('NEW_LINK_WITHOUT_REQUEST_ID');
    expect(writer).not.toMatch(/console\.(log|info|debug|warn).*token/);
    expect(persist).not.toMatch(/console\.(log|info|debug|warn).*token/);

    const rotate = readSrc('src/contracts/lifecycle/accessRotation.js');
    expect(rotate).toContain('SAME_REQUEST');
    expect(readSrc('src/components/clinical/ClinicalSignatureSection.jsx'))
      .toMatch(/mode === 'replace'[\s\S]*replaceRevokedSigningAccessAndInvite/);
    expect(readSrc('src/components/clinical/ClinicalSignatureSection.jsx'))
      .toMatch(/mode === 'rotate'[\s\S]*rotateSigningAccess/);

    expect(SIGNING_ACCESS_ACTION_LABELS.rotate).toBe('Substituir link de assinatura');
    expect(SIGNING_ACCESS_ACTION_LABELS.replace).toBe('Gerar novo acesso');
    expect(SIGNING_ACCESS_ACTION_LABELS.resend).toBe('Reenviar acesso');
    const actions = readSrc('src/components/clinical/PatientRemoteInviteActions.jsx');
    expect(actions).not.toContain('Reativar acesso');
    const revokedBlock = actions.slice(actions.indexOf('if (canReplace)'), actions.indexOf('const overflow'));
    expect(revokedBlock).toContain('SIGNING_ACCESS_ACTION_LABELS.replace');
    expect(revokedBlock).not.toContain('SIGNING_ACCESS_ACTION_LABELS.resend');

    const sent = sendContractForSignature(admin, 'gctr-l-1');
    revokeSigningAccess({
      user: admin, contractId: 'gctr-l-1', requestId: sent.request.id, reason: 'Revogar.',
    });
    const foreign = { ...admin, tenant_id: TENANT_B, tenantId: TENANT_B };
    expectCode(
      () => replaceRevokedSigningAccess({
        user: foreign, contractId: 'gctr-l-1', reason: 'Novo acesso após revogação.',
      }),
      LIFECYCLE_TENANT_MISMATCH,
    );
    for (const status of [CONTRACT_STATUS.SIGNED, 'cancelled', 'voided', 'superseded']) {
      putIncidentContract({ status });
      expectCode(
        () => replaceRevokedSigningAccess({
          user: admin, contractId: 'gctr-l-1', reason: 'Novo acesso após revogação.',
        }),
        CONTRACT_NOT_SIGNABLE,
      );
    }
    const policy = getContractLifecycleUiPolicy({
      contract: { id: 'gctr-x', status: 'generated', tenant_id: TENANT },
      actor: admin,
      request: { id: 'csreq-x', status: 'revoked' },
      link: { id: 'clnk-x', status: 'revoked' },
    });
    expect(policy.canResendAccess).toBe(false);
    expect(policy.canRotateAccess).toBe(false);
    expect(policy.canReplaceRevokedAccess).toBe(true);
  });
});
