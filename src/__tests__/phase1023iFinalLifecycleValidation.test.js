/**
 * PHASE_10.23I — validação final do lifecycle jurídico.
 * Fixtures only. Sem PII/token em asserts. Sem backfill.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  CONTRACT_LIFECYCLE_STATES,
  CONTRACT_LIFECYCLE_TRANSITION_INVALID,
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_AUDIT_EVENTS,
  LIFECYCLE_TENANT_MISMATCH,
  REISSUE_NOT_ALLOWED,
  ROTATE_NOT_ALLOWED,
  VOID_NOT_ALLOWED,
  assertContractSignable,
  assertContractTransition,
  canTransitionContract,
  deriveCeremonyProgress,
  getContractLifecycleUiPolicy,
  isContractSignable,
  normalizeContractLifecycleStatus,
} from '../contracts/lifecycle/index.js';
import { cancelUnsignedContract, abortPartialCeremony } from '../services/contractLifecycleCommandService.js';
import { voidSignedContract, reissueContract } from '../services/contractVoidReissueCommandService.js';
import { rotateSigningAccess, resendSigningAccess } from '../services/contractSigningAccessCommandService.js';
import {
  ensureContractsModuleSeeded,
  getContractBySignToken,
  sendContractForSignature,
  signContractViaLink,
} from '../services/contractModuleService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-i-23i';
const TENANT_B = 'tenant-i-23i-b';

const admin = {
  id: 'user-i-admin', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin 23I',
};
const master = {
  id: 'user-i-master', role: 'admin', isMaster: true, tenant_id: TENANT, tenantId: TENANT, name: 'Master 23I',
};
const gerente = {
  id: 'user-i-ger', role: 'gerente', tenant_id: TENANT, tenantId: TENANT, name: 'Gerente 23I',
};
const reception = {
  id: 'user-i-rec', role: 'recepcao', tenant_id: TENANT, tenantId: TENANT, name: 'Recepcao 23I',
};
const professional = {
  id: 'user-i-pro', role: 'profissional', tenant_id: TENANT, tenantId: TENANT, name: 'Prof 23I',
};

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
    signatures: (db.contractSignatures || []).filter((row) => row.contractId === contractId),
    attachments: (db.contractAttachments || []).filter((row) => row.contractId === contractId),
    manifests: (db.clinicalPackageManifests || []).filter((row) => row.contractId === contractId),
    pdfUrl: contract?.pdfUrl,
    signedPdfUrl: contract?.signedPdfUrl,
    documentHash: contract?.documentHash,
    renderedHtml: contract?.renderedHtml,
    version: contract?.version,
  });
}

function putBase() {
  withDb((db) => {
    db.tenants = [
      { id: TENANT, name: 'Clinica 23I', status: 'active' },
      { id: TENANT_B, name: 'Clinica 23IB', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-1', razaoSocial: 'Clinica 23I', tenant_id: TENANT };
    db.generatedContracts = [];
    db.contractSignatures = [];
    db.contractSignatureRequests = [];
    db.contractSignLinks = [];
    db.contractAttachments = [];
    db.clinicalPackageManifests = [];
    db.contractLifecycleAudits = [];
    db.clinicalBudgets = [];
    db.accountsReceivable = [];
    db.receivablePayments = [];
    db.financings = [];
    return db;
  });
}

function putGenerated(overrides = {}) {
  const row = {
    id: 'gctr-i-1',
    contractNumber: 'CTR-I-1',
    clinicId: 'clinic-1',
    tenant_id: TENANT,
    patientId: 'pat-i',
    status: CONTRACT_STATUS.GENERATED,
    renderedHtml: '<p>Contrato 23I</p>',
    finalContent: '<p>Contrato 23I</p>',
    documentHash: 'hash-i',
    version: 1,
    ...overrides,
  };
  withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === row.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
    else arr.push(row);
    return db;
  });
  return row;
}

function putSignedEvidence(contractId = 'gctr-i-1') {
  withDb((db) => {
    db.contractSignatures = [
      { id: 'csig-i-1', contractId, signerRole: 'PROFESSIONAL', evidenceJson: { hash: 'h-i1' } },
      { id: 'csig-i-2', contractId, signerRole: 'PATIENT', evidenceJson: { hash: 'h-i2' } },
    ];
    db.contractSignatureRequests = [{
      id: 'csreq-i', contractId, tenant_id: TENANT, status: 'completed',
    }];
    db.contractSignLinks = [{
      id: 'clnk-i', contractId, requestId: 'csreq-i', tenant_id: TENANT,
      token: 'csgn-i-hist', status: 'signed',
    }];
    db.contractAttachments = [{
      id: 'catt-i', contractId, source: 'final_signed_artifact',
      documentHash: 'hash-i', fileUrl: 'data:application/pdf;base64,QQ==', immutable: true,
    }];
    db.clinicalPackageManifests = [{
      id: 'man-i', contractId, manifestHash: 'mh-i', hash: 'mh-i', status: 'FROZEN',
    }];
    return db;
  });
}

describe('PHASE_10.23I final legal lifecycle validation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    putBase();
    ensureContractsModuleSeeded();
  });

  it('I01 sendContractForSignature binds requestId tenant and party', () => {
    putGenerated();
    const sent = sendContractForSignature(admin, 'gctr-i-1');
    expect(sent.request.id).toBeTruthy();
    expect(sent.link.requestId).toBe(sent.request.id);
    expect(sent.link.tenant_id).toBe(TENANT);
    expect(sent.request.tenant_id).toBe(TENANT);
    expect(sent.request.contractId).toBe('gctr-i-1');
    expect(sent.link.contractId).toBe('gctr-i-1');
    expect(sent.link.signerPersonId).toBe('pat-i');
    expect(sent.request.signerPersonId).toBe('pat-i');
    expect(loadDb().contractSignLinks.every((row) => row.requestId)).toBe(true);
  });

  it('I02 double send reuses the same request/link/token', () => {
    putGenerated();
    const first = sendContractForSignature(admin, 'gctr-i-1');
    const second = sendContractForSignature(admin, 'gctr-i-1');
    expect(second.request.id).toBe(first.request.id);
    expect(second.link.id).toBe(first.link.id);
    expect(second.link.token).toBe(first.link.token);
    const pending = loadDb().contractSignLinks.filter((row) => row.status === 'pending');
    expect(pending).toHaveLength(1);
  });

  it('I03 remote sign after send satisfies 10.21CO binding', async () => {
    putGenerated();
    withDb((db) => {
      db.patients = [{
        id: 'pat-i', full_name: 'Paciente I', tenant_id: TENANT, clinicId: 'clinic-1',
      }];
      return db;
    });
    const sent = sendContractForSignature(admin, 'gctr-i-1');
    const signed = await signContractViaLink(sent.link.token, {
      signerName: 'Paciente I',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,i',
    });
    expect(signed.signature.evidenceJson.signatureRequestId).toBe(sent.request.id);
    expect(signed.signature.evidenceJson.signLinkId).toBe(sent.link.id);
    expect((loadDb().contractSignatures || []).filter((row) => row.contractId === 'gctr-i-1')).toHaveLength(1);
  });

  it('I04 canonical states aliases and unknown fail-closed', () => {
    expect(Object.values(CONTRACT_LIFECYCLE_STATES)).toEqual([
      'draft', 'generated', 'partially_signed', 'signed', 'cancelled', 'voided', 'superseded',
    ]);
    expect(normalizeContractLifecycleStatus('canceled')).toBe('cancelled');
    expect(normalizeContractLifecycleStatus('completed')).toBe('signed');
    expect(normalizeContractLifecycleStatus('vigente')).toBe('signed');
    expect(normalizeContractLifecycleStatus('replaced')).toBe('superseded');
    expect(normalizeContractLifecycleStatus('sent')).toBe('generated');
    expect(normalizeContractLifecycleStatus('not-a-state')).toBe('unknown');
    expect(isContractSignable({ status: 'not-a-state' })).toBe(false);
    expectCode(
      () => assertContractTransition('unknown', 'signed', 'RECORD_SIGNATURE'),
      CONTRACT_LIFECYCLE_TRANSITION_INVALID,
    );
  });

  it('I05 blocked resurrection transitions', () => {
    for (const from of ['cancelled', 'voided', 'superseded']) {
      expect(canTransitionContract(from, 'signed')).toBe(false);
      expect(canTransitionContract(from, 'generated')).toBe(false);
      expect(canTransitionContract(from, 'partially_signed')).toBe(false);
    }
    expect(canTransitionContract('signed', 'generated')).toBe(false);
    expect(canTransitionContract('draft', 'generated')).toBe(true);
    expect(canTransitionContract('generated', 'cancelled')).toBe(true);
    expect(canTransitionContract('partially_signed', 'signed')).toBe(true);
    expect(canTransitionContract('signed', 'voided')).toBe(true);
  });

  it('I06 signability matrix', () => {
    expect(isContractSignable({ status: 'generated' })).toBe(true);
    expect(isContractSignable({ status: 'partially_signed' })).toBe(true);
    expect(isContractSignable({ status: 'sent' })).toBe(true);
    for (const status of ['draft', 'signed', 'cancelled', 'voided', 'superseded', 'bogus']) {
      expect(isContractSignable({ status })).toBe(false);
      expectCode(() => assertContractSignable({ id: 'x', status }), CONTRACT_NOT_SIGNABLE);
    }
  });

  it('I07 ceremony progress is dynamic not hardcoded two signers', () => {
    const three = deriveCeremonyProgress({
      ceremony: {
        requiredSigners: [
          { role: 'PROFESSIONAL', required: true, status: 'signed' },
          { role: 'CLINIC_REPRESENTATIVE', required: true, status: 'pending' },
          { role: 'PATIENT', required: true, status: 'pending' },
        ],
      },
    });
    expect(three.requiredCount).toBe(3);
    expect(three.completedCount).toBe(1);
    expect(three.remainingCount).toBe(2);
    expect(three.label).toBe('1 de 3 assinaturas concluídas');
    expect(readSrc('src/contracts/lifecycle/ceremonyProgress.js')).toContain('required.length');
    expect(readSrc('src/contracts/lifecycle/ceremonyProgress.js')).not.toContain('profissional primeiro');
  });

  it('I08 abort preserves csig evidence and revokes access', () => {
    putGenerated({ status: CONTRACT_STATUS.SIGNED_BY_CLINIC });
    withDb((db) => {
      db.contractSignatures = [{
        id: 'csig-i-keep', contractId: 'gctr-i-1', signerRole: 'PROFESSIONAL',
        evidenceJson: { hash: 'keep-i' },
      }];
      db.clinicalPackageManifests = [{
        id: 'man-i', contractId: 'gctr-i-1', manifestHash: 'mh-i', hash: 'mh-i', status: 'FROZEN',
      }];
      db.contractSignatureRequests = [{
        id: 'csreq-i-a', contractId: 'gctr-i-1', tenant_id: TENANT, status: 'sent',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }];
      db.contractSignLinks = [{
        id: 'clnk-i-a', contractId: 'gctr-i-1', requestId: 'csreq-i-a', tenant_id: TENANT,
        token: 'csgn-i-abort', status: 'pending', expiresAt: '2099-01-01T00:00:00.000Z',
      }];
      return db;
    });
    const before = legalSnapshot('gctr-i-1');
    abortPartialCeremony({ user: admin, contractId: 'gctr-i-1', reason: 'paciente desistiu' });
    expect(legalSnapshot('gctr-i-1')).toBe(before);
    expect(loadDb().contractSignatures[0].id).toBe('csig-i-keep');
    expect(loadDb().contractSignLinks[0].status).toBe('revoked');
    expect(isContractSignable(loadDb().generatedContracts[0])).toBe(false);
    expect(loadDb().contractLifecycleAudits.some((row) => (
      row.eventType === LIFECYCLE_AUDIT_EVENTS.CEREMONY_ABORTED
    ))).toBe(true);
  });

  it('I09 void does not mutate signed evidence', () => {
    putGenerated({ status: CONTRACT_STATUS.SIGNED, pdfUrl: 'data:application/pdf;base64,QQ==' });
    putSignedEvidence();
    const before = legalSnapshot('gctr-i-1');
    const beforeFin = financeSnapshot();
    voidSignedContract({ user: admin, contractId: 'gctr-i-1', reason: 'erro material' });
    expect(legalSnapshot('gctr-i-1')).toBe(before);
    expect(financeSnapshot()).toBe(beforeFin);
    expect(isContractSignable(loadDb().generatedContracts[0])).toBe(false);
  });

  it('I10–I11 reissue identities and cancelled source policy', () => {
    putGenerated({ status: 'cancelled' });
    const result = reissueContract({ user: admin, contractId: 'gctr-i-1', reason: 'nova proposta' });
    expect(result.newContract.id).not.toBe('gctr-i-1');
    expect(result.newContract.status).toBe('draft');
    expect(result.contract.status).toBe('superseded');
    expect(result.newContract.documentHash).toBeNull();
    expect((loadDb().contractSignatures || []).filter((row) => row.contractId === result.newContract.id)).toHaveLength(0);
    expect((loadDb().clinicalPackageManifests || []).filter((row) => row.contractId === result.newContract.id)).toHaveLength(0);
    expect((loadDb().contractSignLinks || []).filter((row) => row.contractId === result.newContract.id)).toHaveLength(0);
    expect(isContractSignable(loadDb().generatedContracts.find((row) => row.id === 'gctr-i-1'))).toBe(false);

    putGenerated({
      id: 'gctr-i-signed', status: CONTRACT_STATUS.SIGNED, version: 1,
      renderedHtml: '<p>S</p>', finalContent: '<p>S</p>',
    });
    putSignedEvidence('gctr-i-signed');
    const fromSigned = reissueContract({ user: admin, contractId: 'gctr-i-signed', reason: 'substituir' });
    expect(fromSigned.newContract.id).not.toBe('gctr-i-signed');
    expect(fromSigned.newContract.signedPdfUrl).toBeNull();
    expect(fromSigned.contract.status).toBe('superseded');
  });

  it('I12 withDb rollback prevents orphan successor', () => {
    putGenerated({ status: CONTRACT_STATUS.SIGNED });
    const before = JSON.stringify(loadDb().generatedContracts);
    expect(() => withDb((db) => {
      db.generatedContracts[0] = { ...db.generatedContracts[0], status: 'voided' };
      db.generatedContracts.push({ id: 'orphan-i', status: 'draft', tenant_id: TENANT });
      throw new Error('inject-before-save');
    })).toThrow('inject-before-save');
    expect(JSON.stringify(loadDb().generatedContracts)).toBe(before);
    const writer = readSrc('src/services/contractVoidReissueCommandService.js');
    const reissueFn = writer.slice(writer.indexOf('export function reissueContract'));
    expect(reissueFn).toContain('return withDb');
    expect(reissueFn.split('withDb(').length).toBe(2);
  });

  it('I13 competing reissue is idempotent one successor', () => {
    putGenerated({ status: 'cancelled' });
    const first = reissueContract({ user: admin, contractId: 'gctr-i-1', reason: 'primeira' });
    const second = reissueContract({ user: admin, contractId: 'gctr-i-1', reason: 'segunda' });
    expect(second.idempotent).toBe(true);
    expect(second.newContract.id).toBe(first.newContract.id);
    expect(loadDb().generatedContracts.filter((row) => row.previousContractId === 'gctr-i-1')).toHaveLength(1);
  });

  it('I14–I17 rotate resend expire and one signable link', async () => {
    putGenerated();
    const sent = sendContractForSignature(admin, 'gctr-i-1');
    const rotated = rotateSigningAccess({
      user: admin, contractId: 'gctr-i-1', requestId: sent.request.id, reason: 'token vazado',
    });
    expect(rotated.request.id).toBe(sent.request.id);
    expect(rotated.link.id).not.toBe(sent.link.id);
    expect(rotated.link.token).not.toBe(sent.link.token);
    expect(getContractBySignToken(sent.link.token)).toBeNull();
    const pending = loadDb().contractSignLinks.filter((row) => (
      row.requestId === sent.request.id && row.status === 'pending'
    ));
    expect(pending).toHaveLength(1);

    const beforeResend = loadDb().contractSignLinks.find((row) => row.id === rotated.link.id);
    const resent = await resendSigningAccess({
      user: reception, contractId: 'gctr-i-1', requestId: sent.request.id, deliverEmail: false,
    });
    expect(resent.link.token).toBe(beforeResend.token);
    expect(resent.expiresAt).toBe(beforeResend.expiresAt);

    expect(JSON.stringify(loadDb().contractLifecycleAudits)).not.toContain(rotated.link.token);
    expect(financeSnapshot()).toBe(JSON.stringify({
      clinicalBudgets: [], accountsReceivable: [], receivablePayments: [], financings: [],
    }));
  });

  it('I18 tenant isolation on high-impact writers', () => {
    putGenerated({ status: CONTRACT_STATUS.SIGNED });
    const foreign = { ...admin, tenant_id: TENANT_B, tenantId: TENANT_B };
    expectCode(
      () => voidSignedContract({ user: foreign, contractId: 'gctr-i-1', reason: 'cross' }),
      LIFECYCLE_TENANT_MISMATCH,
    );
    putGenerated({ id: 'gctr-i-can', status: 'cancelled' });
    expectCode(
      () => reissueContract({ user: foreign, contractId: 'gctr-i-can', reason: 'cross' }),
      LIFECYCLE_TENANT_MISMATCH,
    );
  });

  it('I19 RBAC UI vs writer and professional rotate consistency', () => {
    putGenerated({ status: CONTRACT_STATUS.SIGNED });
    const signedPolicy = getContractLifecycleUiPolicy({ contract: loadDb().generatedContracts[0], actor: gerente });
    expect(signedPolicy.canVoidSigned).toBe(false);
    expect(signedPolicy.canReissue).toBe(false);
    expectCode(
      () => voidSignedContract({ user: gerente, contractId: 'gctr-i-1', reason: 'nope' }),
      VOID_NOT_ALLOWED,
    );
    expectCode(
      () => reissueContract({ user: reception, contractId: 'gctr-i-1', reason: 'nope' }),
      REISSUE_NOT_ALLOWED,
    );
    expect(getContractLifecycleUiPolicy({
      contract: loadDb().generatedContracts[0], actor: master,
    }).canVoidSigned).toBe(true);

    putGenerated();
    const sent = sendContractForSignature(admin, 'gctr-i-1');
    const genPolicy = getContractLifecycleUiPolicy({
      contract: loadDb().generatedContracts[0],
      actor: professional,
      request: sent.request,
      link: sent.link,
    });
    expect(genPolicy.canRotateAccess).toBe(true);
    expect(genPolicy.canVoidSigned).toBe(false);
    expect(rotateSigningAccess({
      user: professional, contractId: 'gctr-i-1', requestId: sent.request.id, reason: 'cerimonia',
    }).ok).toBe(true);
    putGenerated({ id: 'gctr-i-rot', status: CONTRACT_STATUS.GENERATED });
    sendContractForSignature(admin, 'gctr-i-rot');
    expectCode(
      () => rotateSigningAccess({
        user: reception,
        contractId: 'gctr-i-rot',
        requestId: loadDb().contractSignatureRequests.find((row) => row.contractId === 'gctr-i-rot').id,
        reason: 'nope',
      }),
      ROTATE_NOT_ALLOWED,
    );
  });

  it('I20–I22 static secrecy hard-delete and writers', () => {
    const lifecycle = [
      'src/services/contractModuleService.js',
      'src/services/signatureProviderService.js',
      'src/services/contractLifecycleCommandService.js',
      'src/services/contractVoidReissueCommandService.js',
      'src/services/contractSigningAccessCommandService.js',
      'src/contracts/lifecycle/lifecycleAudit.js',
      'src/contracts/lifecycle/accessRotation.js',
    ].map(readSrc).join('\n');
    expect(lifecycle).not.toMatch(/console\.(log|info|debug|warn)\([^)]*token/i);
    expect(readSrc('src/contracts/lifecycle/lifecycleAudit.js')).not.toContain('token:');
    expect(readSrc('src/pages/contratos/ContractsPendentesPage.jsx')).not.toContain('{link.token}');
    expect(lifecycle).not.toMatch(/generatedContracts\.splice|contractSignatures\.splice|hardDelete|deleteContract\(/);
    expect(readSrc('src/services/contractModuleService.js')).toContain('NEW_LINK_WITHOUT_REQUEST_ID');
    expect(readSrc('src/services/signatureProviderService.js')).toContain('requestId: request.id');
    expect(readSrc('src/contracts/lifecycle/accessRotation.js')).toContain('requestId: request.id');
  });

  it('I23 public terminal tokens fail closed', () => {
    putGenerated({ id: 'gctr-i-void', status: 'voided' });
    withDb((db) => {
      db.contractSignLinks.push({
        id: 'clnk-i-stale', contractId: 'gctr-i-void', requestId: 'csreq-stale',
        tenant_id: TENANT, token: 'csgn-i-stale', status: 'pending',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      return db;
    });
    expect(getContractBySignToken('csgn-i-stale')).toBeNull();
    expect(getContractBySignToken('missing-token')).toBeNull();
  });

  it('I24 legacy versionless reissue derives successor version', () => {
    putGenerated({ id: 'gctr-i-legacy', status: 'cancelled', version: null });
    const result = reissueContract({ user: admin, contractId: 'gctr-i-legacy', reason: 'legado' });
    expect(result.newContract.version).toBe(2);
    expect(loadDb().generatedContracts.find((row) => row.id === 'gctr-i-legacy').version).toBeNull();
  });

  it('I25 cancel unsigned does not create financial side effects', () => {
    putGenerated();
    const before = financeSnapshot();
    cancelUnsignedContract({ user: admin, contractId: 'gctr-i-1', reason: 'desiste' });
    expect(financeSnapshot()).toBe(before);
    expect(isContractSignable(loadDb().generatedContracts[0])).toBe(false);
  });
});
