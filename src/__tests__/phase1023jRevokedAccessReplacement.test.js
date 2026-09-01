/**
 * PHASE_10.23J — substituição de acesso remoto revogado.
 * Fixtures only. Sem token em asserts de audit. Sem backfill. Sem mutar CTR-2026-00006.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  ACCESS_REPLACEMENT_NOT_ALLOWED,
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_AUDIT_EVENTS,
  LIFECYCLE_REASON_REQUIRED,
  LIFECYCLE_TENANT_MISMATCH,
  SIGN_LINK_NOT_SIGNABLE,
  SIGNATURE_REQUEST_NOT_SIGNABLE,
  SIGNING_ACCESS_BINDING_INVALID,
  SIGNING_ACCESS_NOT_REPLACEABLE,
  SIGNING_PARTY_ALREADY_SIGNED,
  describePublicSigningAccessFailure,
  getContractLifecycleUiPolicy,
  getSigningAccessSnapshot,
} from '../contracts/lifecycle/index.js';
import { rotateSigningAccess, resendSigningAccess } from '../services/contractSigningAccessCommandService.js';
import {
  replaceRevokedSigningAccess,
  replaceRevokedSigningAccessAndInvite,
} from '../services/contractSigningAccessReplacementService.js';
import { buildSignatureInviteEmail } from '../../server/email/buildSignatureInviteEmail.js';
import {
  ensureContractsModuleSeeded,
  getContractBySignToken,
  signContractViaLink,
} from '../services/contractModuleService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-j-23j';
const TENANT_B = 'tenant-j-23j-b';

const admin = {
  id: 'user-j-admin', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin 23J',
};
const reception = {
  id: 'user-j-rec', role: 'recepcao', tenant_id: TENANT, tenantId: TENANT, name: 'Recepcao 23J',
};
const professional = {
  id: 'user-j-pro', role: 'profissional', tenant_id: TENANT, tenantId: TENANT, name: 'Prof 23J',
};

vi.mock('../services/signatureInviteEmailService.js', () => ({
  deliverSignatureInviteEmail: vi.fn(async ({ signUrl, requestId }) => ({
    ok: true,
    provider: 'smtp',
    messageId: 'mid-j-1',
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

async function expectCodeAsync(fn, code) {
  try {
    await fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

function future() {
  return new Date(Date.now() + 86400000 * 7).toISOString();
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

function putRevoked({
  contractStatus = CONTRACT_STATUS.GENERATED,
  requestId = 'csreq-j-old',
  linkId = 'clnk-j-old',
  token = 'csgn-j-old',
  extraRequest = {},
  extraContract = {},
  extraLink = {},
} = {}) {
  withDb((db) => {
    db.tenants = [
      { id: TENANT, name: 'Clinica 23J', status: 'active' },
      { id: TENANT_B, name: 'Clinica 23JB', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-1', razaoSocial: 'Clinica 23J', tenant_id: TENANT };
    db.generatedContracts = [{
      id: 'gctr-j-1',
      contractNumber: 'CTR-J-1',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      patientId: 'pat-j',
      status: contractStatus,
      renderedHtml: '<p>Contrato J</p>',
      documentHash: 'hash-j',
      version: 1,
      quoteSource: 'clinical_budget',
      metadata: {
        packageManifestId: 'man-j',
        packageManifestHash: 'mh-j',
        frozenAt: '2026-08-31T12:00:00.000Z',
      },
      ...extraContract,
    }];
    db.clinicalPackageManifests = [{
      id: 'man-j', contractId: 'gctr-j-1', manifestHash: 'mh-j', status: 'FROZEN',
    }];
    db.contractSignatureRequests = [{
      id: requestId,
      contractId: 'gctr-j-1',
      tenant_id: TENANT,
      status: 'revoked',
      signerRole: 'PATIENT',
      signerPersonId: 'pat-j',
      expiresAt: future(),
      recipients: { patientEmail: 'paciente.j@example.invalid', patientName: 'Paciente J' },
      documentHash: 'hash-j',
      contractNumber: 'CTR-J-1',
      createdAt: '2026-08-31T23:50:02.000Z',
      revokedAt: '2026-09-01T00:00:46.000Z',
      revokedBy: 'user-j-admin',
      revokeReason: 'wqdweqdwed',
      previousStatus: 'sent',
      ...extraRequest,
    }];
    db.contractSignLinks = [{
      id: linkId,
      contractId: 'gctr-j-1',
      requestId,
      tenant_id: TENANT,
      token,
      status: 'revoked',
      expiresAt: future(),
      signerRole: 'PATIENT',
      signerPersonId: 'pat-j',
      createdAt: '2026-08-31T23:50:02.000Z',
      revokedAt: '2026-09-01T00:00:46.000Z',
      revokedBy: 'user-j-admin',
      previousStatus: 'pending',
      ...extraLink,
    }];
    db.contractSignatures = [];
    db.contractLifecycleAudits = [];
    db.patients = [{ id: 'pat-j', full_name: 'Paciente J', tenant_id: TENANT, clinicId: 'clinic-1' }];
    db.clinicalBudgets = [];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    return db;
  });
}

describe('PHASE_10.23J revoked signing access replacement', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    ensureContractsModuleSeeded();
    putRevoked();
  });

  it('A01–A13 replacement creates new bound access and keeps old revoked', () => {
    const before = JSON.stringify(loadDb().generatedContracts[0]);
    const financeBefore = financeSnapshot();
    const oldReq = { ...loadDb().contractSignatureRequests[0] };
    const oldLink = { ...loadDb().contractSignLinks[0] };
    const result = replaceRevokedSigningAccess({
      user: admin, contractId: 'gctr-j-1', requestId: 'csreq-j-old', reason: 'Novo acesso após revogação.',
    });
    expect(result.request.id).not.toBe('csreq-j-old');
    expect(result.link.id).not.toBe('clnk-j-old');
    expect(result.link.token).not.toBe('csgn-j-old');
    expect(result.request.contractId).toBe('gctr-j-1');
    expect(result.link.contractId).toBe('gctr-j-1');
    expect(result.request.tenant_id).toBe(TENANT);
    expect(result.link.tenant_id).toBe(TENANT);
    expect(result.request.signerPersonId).toBe('pat-j');
    expect(result.link.signerPersonId).toBe('pat-j');
    expect(result.link.requestId).toBe(result.request.id);
    expect(result.request.status).toBe('pending');
    expect(result.link.status).toBe('pending');

    const db = loadDb();
    const liveOldReq = db.contractSignatureRequests.find((row) => row.id === 'csreq-j-old');
    const liveOldLink = db.contractSignLinks.find((row) => row.id === 'clnk-j-old');
    expect(liveOldReq.status).toBe('revoked');
    expect(liveOldReq.revokedAt).toBe(oldReq.revokedAt);
    expect(liveOldReq.revokedBy).toBe(oldReq.revokedBy);
    expect(liveOldReq.revokeReason).toBe(oldReq.revokeReason);
    expect(liveOldLink.status).toBe('revoked');
    expect(liveOldLink.token).toBe(oldLink.token);
    expect(liveOldLink.revokedAt).toBe(oldLink.revokedAt);
    const signableLinks = db.contractSignLinks.filter((row) => row.status === 'pending');
    expect(signableLinks).toHaveLength(1);
    expect(db.contractSignatureRequests.filter((row) => ['pending', 'sent'].includes(row.status))).toHaveLength(1);
    expect(JSON.stringify(db.generatedContracts[0])).toBe(before);
    expect(financeSnapshot()).toBe(financeBefore);
  });

  it('A14–A17 old revoked stays blocked; new URL is signable', async () => {
    const result = replaceRevokedSigningAccess({
      user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
    });
    await expectCodeAsync(
      () => resendSigningAccess({
        user: admin, contractId: 'gctr-j-1', requestId: 'csreq-j-old', deliverEmail: false,
      }),
      SIGN_LINK_NOT_SIGNABLE,
    );
    expectCode(
      () => rotateSigningAccess({
        user: admin, contractId: 'gctr-j-1', requestId: 'csreq-j-old', reason: 'nope',
      }),
      SIGNATURE_REQUEST_NOT_SIGNABLE,
    );
    expect(describePublicSigningAccessFailure('csgn-j-old').kind).toBe('revoked');
    expect(getContractBySignToken('csgn-j-old')).toBeNull();
    const resolved = getContractBySignToken(result.link.token);
    expect(resolved.contract.id).toBe('gctr-j-1');
    expect(resolved.link.id).toBe(result.link.id);
  });

  it('A18–A21 email uses NEW url; delivery failure keeps new access', async () => {
    const { deliverSignatureInviteEmail } = await import('../services/signatureInviteEmailService.js');
    const created = replaceRevokedSigningAccess({
      user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
    });
    const email = buildSignatureInviteEmail({
      patientName: 'Paciente J',
      signUrl: `https://loveodonto.com.br${created.signUrl}`,
      contractNumber: 'CTR-J-1',
    });
    expect(email.html).toContain('REVISAR E ASSINAR CONTRATO');
    expect(email.html).toContain(created.link.token);
    expect(email.html).not.toContain('csgn-j-old');
    expect(email.signUrl).toContain(created.link.token);

    deliverSignatureInviteEmail.mockRejectedValueOnce(Object.assign(new Error('SMTP down'), { code: 'SMTP_CONNECTION_FAILED' }));
    putRevoked();
    const failed = await replaceRevokedSigningAccessAndInvite({
      user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.', origin: 'https://loveodonto.com.br',
    });
    expect(failed.emailFailed).toBe(true);
    expect(failed.request.status).toBe('pending');
    expect(loadDb().contractSignatureRequests.find((row) => row.id === failed.request.id).status).toBe('pending');
    const resent = await resendSigningAccess({
      user: admin, contractId: 'gctr-j-1', requestId: failed.request.id, deliverEmail: false,
    });
    expect(resent.link.token).toBe(failed.link.token);
  });

  it('A22–A26 terminal and already-signed party are blocked', () => {
    for (const status of [CONTRACT_STATUS.SIGNED, 'cancelled', 'voided', 'superseded']) {
      putRevoked({ contractStatus: status === CONTRACT_STATUS.SIGNED ? CONTRACT_STATUS.SIGNED : status });
      expectCode(
        () => replaceRevokedSigningAccess({
          user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
        }),
        CONTRACT_NOT_SIGNABLE,
      );
    }
    putRevoked();
    withDb((db) => {
      db.contractSignatures = [{
        id: 'csig-j-pat', contractId: 'gctr-j-1', signerRole: 'PATIENT', signerPersonId: 'pat-j',
      }];
      return db;
    });
    expectCode(
      () => replaceRevokedSigningAccess({
        user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
      }),
      SIGNING_PARTY_ALREADY_SIGNED,
    );
  });

  it('A27–A28 partial ceremony preserves professional csig and manifest', () => {
    putRevoked({
      contractStatus: 'partially_signed',
      extraContract: {
        metadata: {
          packageManifestId: 'man-j',
          packageManifestHash: 'mh-j',
          frozenAt: '2026-08-31T12:00:00.000Z',
          signatureCeremony: { status: 'partially_signed', requiredCount: 2, satisfiedCount: 1 },
        },
      },
    });
    withDb((db) => {
      db.contractSignatures = [{
        id: 'csig-j-pro', contractId: 'gctr-j-1', signerRole: 'PROFESSIONAL', signerPersonId: 'pro-j',
        evidenceJson: { hash: 'h-pro' },
      }];
      return db;
    });
    const beforeSigs = JSON.stringify(loadDb().contractSignatures);
    const beforeMan = JSON.stringify(loadDb().clinicalPackageManifests);
    const beforeHash = loadDb().generatedContracts[0].documentHash;
    replaceRevokedSigningAccess({
      user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
    });
    expect(JSON.stringify(loadDb().contractSignatures)).toBe(beforeSigs);
    expect(JSON.stringify(loadDb().clinicalPackageManifests)).toBe(beforeMan);
    expect(loadDb().generatedContracts[0].documentHash).toBe(beforeHash);
    expect(loadDb().generatedContracts[0].status).toBe('partially_signed');
  });

  it('A29–A31 double-click, cross-tenant and wrong party fail-closed', () => {
    const first = replaceRevokedSigningAccess({
      user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
    });
    const second = replaceRevokedSigningAccess({
      user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
    });
    expect(second.idempotent).toBe(true);
    expect(second.request.id).toBe(first.request.id);
    expect(second.link.token).toBe(first.link.token);
    expect(loadDb().contractSignLinks.filter((row) => row.status === 'pending')).toHaveLength(1);

    putRevoked();
    const foreign = { ...admin, tenant_id: TENANT_B, tenantId: TENANT_B };
    expectCode(
      () => replaceRevokedSigningAccess({
        user: foreign, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
      }),
      LIFECYCLE_TENANT_MISMATCH,
    );
    putRevoked({ extraRequest: { signerPersonId: 'pat-other' } });
    expectCode(
      () => replaceRevokedSigningAccess({
        user: admin, contractId: 'gctr-j-1', requestId: 'csreq-j-old', reason: 'Novo acesso após revogação.',
      }),
      SIGNING_ACCESS_BINDING_INVALID,
    );
  });

  it('A32–A35 audit without token; no finance/content mutation; auth + reason', () => {
    const beforeContract = JSON.stringify(loadDb().generatedContracts[0]);
    const beforeFinance = financeSnapshot();
    replaceRevokedSigningAccess({
      user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
    });
    const audit = (loadDb().contractLifecycleAudits || [])
      .find((row) => row.eventType === LIFECYCLE_AUDIT_EVENTS.SIGNING_ACCESS_REPLACED);
    expect(audit).toBeTruthy();
    expect(audit.oldRequestId).toBe('csreq-j-old');
    expect(audit.newLinkId).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain('csgn-');
    expect(JSON.stringify(loadDb().generatedContracts[0])).toBe(beforeContract);
    expect(financeSnapshot()).toBe(beforeFinance);
    expectCode(
      () => replaceRevokedSigningAccess({ user: admin, contractId: 'gctr-j-1' }),
      LIFECYCLE_REASON_REQUIRED,
    );
    putRevoked();
    expectCode(
      () => replaceRevokedSigningAccess({
        user: reception, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
      }),
      ACCESS_REPLACEMENT_NOT_ALLOWED,
    );
    expectCode(
      () => replaceRevokedSigningAccess({
        user: professional, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
      }),
      ACCESS_REPLACEMENT_NOT_ALLOWED,
    );
  });

  it('A17 sign via NEW url binds request/link and keeps one csig', async () => {
    putRevoked({ extraContract: { quoteSource: 'crm' } });
    const created = replaceRevokedSigningAccess({
      user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
    });
    const signed = await signContractViaLink(created.link.token, {
      signerName: 'Paciente J',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,i',
    });
    expect(signed.signature.evidenceJson.signatureRequestId).toBe(created.request.id);
    expect(signed.signature.evidenceJson.signLinkId).toBe(created.link.id);
    expect((loadDb().contractSignatures || []).filter((row) => row.contractId === 'gctr-j-1')).toHaveLength(1);
    expect(getContractBySignToken('csgn-j-old')).toBeNull();
  });

  it('snapshot after replacement is signable; UI copy is not reactivation', () => {
    replaceRevokedSigningAccess({
      user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
    });
    const snap = getSigningAccessSnapshot('gctr-j-1');
    const policy = getContractLifecycleUiPolicy({
      contract: loadDb().generatedContracts[0],
      request: snap.request,
      link: snap.link,
      actor: admin,
    });
    expect(policy.access.kind).not.toBe('revoked');
    expect(policy.canResendAccess).toBe(true);
    expect(policy.canReplaceRevokedAccess).toBe(false);
    const modal = readSrc('src/components/clinical/contract/SigningAccessSecureModal.jsx');
    expect(modal).toContain('O acesso anterior continuará revogado e não poderá ser utilizado.');
    expect(modal).not.toContain('Reativar acesso');
    expect(readSrc('src/components/clinical/PatientRemoteInviteActions.jsx')).toContain('clinical-replace-revoked-access-cta');
    expect(readSrc('src/services/signatureProviderService.js')).toContain('const signable = links.find');
  });

  it('missing revoked parent is fail-closed', () => {
    withDb((db) => {
      db.contractSignatureRequests = [];
      db.contractSignLinks = [];
      return db;
    });
    expectCode(
      () => replaceRevokedSigningAccess({
        user: admin, contractId: 'gctr-j-1', reason: 'Novo acesso após revogação.',
      }),
      SIGNING_ACCESS_NOT_REPLACEABLE,
    );
  });
});
