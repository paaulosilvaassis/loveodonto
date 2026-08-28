/**
 * PHASE_10.23F — VOID_SIGNED + REISSUE (novo ID) + SUPERSEDE interno.
 * Fixtures only. Sem backfill. Sem copiar evidência jurídica.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_ACTOR_REQUIRED,
  LIFECYCLE_AUDIT_EVENTS,
  LIFECYCLE_REASON_REQUIRED,
  LIFECYCLE_TENANT_MISMATCH,
  PILOT_IMMUTABLE,
  REISSUE_NOT_ALLOWED,
  SIGNED_CONTRACT_IMMUTABLE,
  VOID_NOT_ALLOWED,
  assertContractSignable,
} from '../contracts/lifecycle/index.js';
import {
  reissueContract,
  voidSignedContract,
} from '../services/contractVoidReissueCommandService.js';
import {
  createContractNewVersion,
  ensureContractsModuleSeeded,
} from '../services/contractModuleService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-f-23f';
const TENANT_B = 'tenant-f-23f-b';
const CTR00005 = 'gctr-87ca1983-f43c-41ec-ae22-699d5120a39d';

const admin = {
  id: 'user-f-admin', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin 23F',
};
const master = {
  id: 'user-f-master', role: 'admin', isMaster: true, tenant_id: TENANT, tenantId: TENANT, name: 'Master 23F',
};
const reception = {
  id: 'user-f-rec', role: 'recepcao', tenant_id: TENANT, tenantId: TENANT, name: 'Recepcao 23F',
};
const professional = {
  id: 'user-f-pro', role: 'profissional', tenant_id: TENANT, tenantId: TENANT, name: 'Prof 23F',
};
const gerente = {
  id: 'user-f-ger', role: 'gerente', tenant_id: TENANT, tenantId: TENANT, name: 'Gerente 23F',
};

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function financeSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    clinicalBudgets: db.clinicalBudgets || [],
    accountsReceivable: db.accountsReceivable || [],
    receivablePayments: db.receivablePayments || [],
    financings: db.financings || [],
    crmBudgets: db.crmBudgets || [],
  });
}

function evidenceSnapshot(contractId) {
  const db = loadDb();
  const contract = (db.generatedContracts || []).find((row) => row.id === contractId);
  return JSON.stringify({
    signatures: (db.contractSignatures || []).filter((row) => row.contractId === contractId),
    attachments: (db.contractAttachments || []).filter((row) => row.contractId === contractId),
    manifests: (db.clinicalPackageManifests || []).filter((row) => row.contractId === contractId),
    requests: (db.contractSignatureRequests || []).filter((row) => row.contractId === contractId),
    links: (db.contractSignLinks || []).filter((row) => row.contractId === contractId),
    pdfUrl: contract?.pdfUrl,
    documentHash: contract?.documentHash,
    renderedHtml: contract?.renderedHtml,
    version: contract?.version,
  });
}

function expectCode(fn, code) {
  try {
    fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

function baseDb() {
  return withDb((db) => {
    db.tenants = [
      { id: TENANT, name: 'Clinica 23F', status: 'active' },
      { id: TENANT_B, name: 'Clinica 23FB', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-1', razaoSocial: 'Clinica 23F', tenant_id: TENANT };
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
    db.crmBudgets = [];
    return db;
  });
}

function putSigned(overrides = {}) {
  const row = {
    id: 'gctr-f-1',
    contractNumber: 'CTR-F-1',
    clinicId: 'clinic-1',
    tenant_id: TENANT,
    patientId: 'pat-f',
    quoteId: 'budget-f',
    quoteSource: 'crm_budget',
    status: CONTRACT_STATUS.SIGNED,
    version: 1,
    renderedHtml: '<p>Contrato 23F</p>',
    finalContent: '<p>Contrato 23F</p>',
    documentHash: 'hash-f-doc',
    pdfUrl: 'data:application/pdf;base64,QQ==',
    metadata: {
      finalArtifactStatus: 'generated',
      finalArtifactAttachmentId: 'catt-f',
      packageManifestId: 'man-f',
    },
    ...overrides,
  };
  withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === row.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
    else arr.push(row);
    db.generatedContracts = arr;
    return db;
  });
  return row;
}

function putEvidence(contractId = 'gctr-f-1') {
  withDb((db) => {
    db.contractSignatures = [{
      id: 'csig-f-1', contractId, signerRole: 'PROFESSIONAL', evidenceJson: { hash: 'h-f' },
    }, {
      id: 'csig-f-2', contractId, signerRole: 'PATIENT', evidenceJson: { hash: 'h-f2' },
    }];
    db.contractSignatureRequests = [{
      id: 'csreq-f', contractId, tenant_id: TENANT, status: 'completed',
    }];
    db.contractSignLinks = [{
      id: 'clnk-f', contractId, requestId: 'csreq-f', token: 'csgn-f', status: 'signed',
    }];
    db.contractAttachments = [{
      id: 'catt-f', contractId, source: 'final_signed_artifact',
      documentHash: 'hash-f-doc', fileUrl: 'data:application/pdf;base64,QQ==', immutable: true,
    }];
    db.clinicalPackageManifests = [{
      id: 'man-f', contractId, manifestHash: 'mh-f', hash: 'mh-f', status: 'FROZEN',
    }];
    return db;
  });
}

describe('PHASE_10.23F void and reissue', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    baseDb();
    ensureContractsModuleSeeded();
  });

  it('F01–F08 void preconditions, reason, actor, idempotency', () => {
    putSigned();
    const voided = voidSignedContract({ user: admin, contractId: 'gctr-f-1', reason: 'erro material grave' });
    expect(voided.contract.status).toBe('voided');
    expect(voided.contract.voidedBy).toBe(admin.id);
    expect(voided.contract.voidReason).toBe('erro material grave');
    expect(voided.contract.voidedAt).toBe(voided.actedAt);
    expect(voided.previousState).toBe('signed');

    putSigned({ id: 'gctr-f-miss' });
    expectCode(() => voidSignedContract({ user: admin, contractId: 'gctr-f-miss' }), LIFECYCLE_REASON_REQUIRED);
    expectCode(
      () => voidSignedContract({ user: admin, contractId: 'gctr-f-miss', reason: '   ' }),
      LIFECYCLE_REASON_REQUIRED,
    );
    expectCode(
      () => voidSignedContract({
        user: { role: 'admin', tenant_id: TENANT, tenantId: TENANT },
        contractId: 'gctr-f-miss',
        reason: 'x',
      }),
      LIFECYCLE_ACTOR_REQUIRED,
    );

    putSigned({ id: 'gctr-f-gen', status: CONTRACT_STATUS.GENERATED });
    expectCode(
      () => voidSignedContract({ user: admin, contractId: 'gctr-f-gen', reason: 'nope' }),
      VOID_NOT_ALLOWED,
    );
    putSigned({ id: 'gctr-f-can', status: 'canceled' });
    expectCode(
      () => voidSignedContract({ user: admin, contractId: 'gctr-f-can', reason: 'nope' }),
      VOID_NOT_ALLOWED,
    );
    const retry = voidSignedContract({ user: admin, contractId: 'gctr-f-1', reason: 'segundo' });
    expect(retry.idempotent).toBe(true);
    expect(loadDb().generatedContracts.find((c) => c.id === 'gctr-f-1').voidReason).toBe('erro material grave');
  });

  it('F09–F14 void preserves evidence, finance, audit and blocks sign', () => {
    putSigned();
    putEvidence();
    const beforeEv = evidenceSnapshot('gctr-f-1');
    const beforeFin = financeSnapshot();
    voidSignedContract({ user: admin, contractId: 'gctr-f-1', reason: 'preserva' });
    expect(evidenceSnapshot('gctr-f-1')).toBe(beforeEv);
    expect(financeSnapshot()).toBe(beforeFin);
    const audits = (loadDb().contractLifecycleAudits || []).filter((a) => a.contractId === 'gctr-f-1');
    expect(audits.some((a) => a.eventType === LIFECYCLE_AUDIT_EVENTS.CONTRACT_VOIDED)).toBe(true);
    const row = loadDb().generatedContracts.find((c) => c.id === 'gctr-f-1');
    expect(() => assertContractSignable(row)).toThrowError();
    try {
      assertContractSignable(row);
    } catch (err) {
      expect(err.code).toBe(CONTRACT_NOT_SIGNABLE);
    }
  });

  it('F15–F20 authorization and tenant', () => {
    putSigned();
    expectCode(
      () => voidSignedContract({ user: reception, contractId: 'gctr-f-1', reason: 'nope' }),
      VOID_NOT_ALLOWED,
    );
    expectCode(
      () => voidSignedContract({ user: professional, contractId: 'gctr-f-1', reason: 'nope' }),
      VOID_NOT_ALLOWED,
    );
    expectCode(
      () => voidSignedContract({ user: gerente, contractId: 'gctr-f-1', reason: 'nope' }),
      VOID_NOT_ALLOWED,
    );
    const ok = voidSignedContract({ user: admin, contractId: 'gctr-f-1', reason: 'admin void' });
    expect(ok.ok).toBe(true);
    putSigned({ id: 'gctr-f-m' });
    expect(voidSignedContract({ user: master, contractId: 'gctr-f-m', reason: 'master void' }).ok).toBe(true);
    putSigned({ id: 'gctr-f-b', tenant_id: TENANT_B });
    expectCode(
      () => voidSignedContract({ user: admin, contractId: 'gctr-f-b', reason: 'cross' }),
      LIFECYCLE_TENANT_MISMATCH,
    );
  });

  it('F21–F28 reissue creates new identity and does not copy evidence', () => {
    putSigned({ version: 3 });
    putEvidence();
    const beforeOld = evidenceSnapshot('gctr-f-1');
    const beforeFin = financeSnapshot();
    const result = reissueContract({ user: admin, contractId: 'gctr-f-1', reason: 'nova via jurídica' });
    expect(result.newContract.id).not.toBe('gctr-f-1');
    expect(result.newContract.version).toBe(4);
    expect(result.newContract.status).toBe('draft');
    expect(result.contract.status).toBe('superseded');
    expect(result.contract.replacedById).toBe(result.newContract.id);
    expect(result.newContract.previousContractId).toBe('gctr-f-1');
    expect(evidenceSnapshot('gctr-f-1')).toBe(beforeOld);
    expect(financeSnapshot()).toBe(beforeFin);
    const db = loadDb();
    expect(db.contractSignatures.filter((s) => s.contractId === result.newContract.id)).toHaveLength(0);
    expect(db.clinicalPackageManifests.filter((m) => m.contractId === result.newContract.id)).toHaveLength(0);
    expect(db.contractSignatureRequests.filter((r) => r.contractId === result.newContract.id)).toHaveLength(0);
    expect(db.contractSignLinks.filter((l) => l.contractId === result.newContract.id)).toHaveLength(0);
    expect(result.newContract.pdfUrl).toBeNull();
    expect(db.contractAttachments.filter((a) => a.contractId === result.newContract.id)).toHaveLength(0);
    expect(db.generatedContracts.find((c) => c.id === 'gctr-f-1').id).toBe('gctr-f-1');
  });

  it('F29 createContractNewVersion remains in-place blocked', () => {
    putSigned();
    const before = JSON.stringify(loadDb().generatedContracts);
    expectCode(() => createContractNewVersion(admin, 'gctr-f-1'), SIGNED_CONTRACT_IMMUTABLE);
    expect(JSON.stringify(loadDb().generatedContracts)).toBe(before);
  });

  it('F30–F36 reissue sources, blocks and idempotency', () => {
    putSigned({ id: 'gctr-f-can', status: 'canceled', version: 1, pdfUrl: null, metadata: {} });
    const fromCancel = reissueContract({ user: admin, contractId: 'gctr-f-can', reason: 'apos cancel' });
    expect(fromCancel.newContract.id).not.toBe('gctr-f-can');
    expect(fromCancel.contract.status).toBe('superseded');

    putSigned({ id: 'gctr-f-void', status: 'voided', version: 2, pdfUrl: null, metadata: {} });
    const fromVoid = reissueContract({ user: admin, contractId: 'gctr-f-void', reason: 'apos void' });
    expect(fromVoid.newContract.version).toBe(3);

    putSigned({ id: 'gctr-f-gen', status: CONTRACT_STATUS.GENERATED });
    expectCode(
      () => reissueContract({ user: admin, contractId: 'gctr-f-gen', reason: 'nope' }),
      REISSUE_NOT_ALLOWED,
    );
    putSigned({ id: 'gctr-f-part', status: CONTRACT_STATUS.SIGNED_BY_CLINIC });
    expectCode(
      () => reissueContract({ user: admin, contractId: 'gctr-f-part', reason: 'nope' }),
      REISSUE_NOT_ALLOWED,
    );

    const retry = reissueContract({ user: admin, contractId: 'gctr-f-can', reason: 'retry' });
    expect(retry.idempotent).toBe(true);
    expect(retry.newContract.id).toBe(fromCancel.newContract.id);
    expect(loadDb().generatedContracts.filter((c) => c.previousContractId === 'gctr-f-can')).toHaveLength(1);

    putSigned({ id: 'gctr-f-r' });
    expectCode(() => reissueContract({ user: admin, contractId: 'gctr-f-r' }), LIFECYCLE_REASON_REQUIRED);
    expectCode(
      () => reissueContract({
        user: { role: 'admin', tenant_id: TENANT, tenantId: TENANT },
        contractId: 'gctr-f-r',
        reason: 'x',
      }),
      LIFECYCLE_ACTOR_REQUIRED,
    );
  });

  it('F37–F41 finance, pilots and UI path', () => {
    putSigned();
    const beforeFin = financeSnapshot();
    reissueContract({ user: admin, contractId: 'gctr-f-1', reason: 'fin keep' });
    expect(financeSnapshot()).toBe(beforeFin);

    putSigned({ id: CTR00005, contractNumber: 'CTR-2026-00005', status: CONTRACT_STATUS.SIGNED });
    expectCode(
      () => voidSignedContract({ user: admin, contractId: CTR00005, reason: 'piloto' }),
      PILOT_IMMUTABLE,
    );
    expectCode(
      () => reissueContract({ user: admin, contractId: CTR00005, reason: 'piloto' }),
      PILOT_IMMUTABLE,
    );

    const signedPage = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    expect(signedPage).not.toContain('Nova versão');
    expect(signedPage).not.toContain('createContractNewVersion');
    expect(signedPage).toContain('reissueContract');
    expect(signedPage).toContain('voidSignedContract');
    expect(signedPage).toContain('Reemitir contrato');
    expect(signedPage).toContain('Contratos assinados não podem ser alterados');
  });
});
