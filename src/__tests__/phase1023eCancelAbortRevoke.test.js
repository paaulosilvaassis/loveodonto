/**
 * PHASE_10.23E — CANCEL_UNSIGNED + ABORT_PARTIAL + REVOKE_SIGNING_ACCESS.
 * Fixtures only. Sem backfill. Sem secrets/tokens em asserts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  CANCEL_NOT_ALLOWED,
  CEREMONY_NOT_ABORTABLE,
  CONTRACT_LIFECYCLE_TRANSITION_INVALID,
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_ACTOR_REQUIRED,
  LIFECYCLE_AUDIT_EVENTS,
  LIFECYCLE_REASON_REQUIRED,
  LIFECYCLE_TENANT_MISMATCH,
  SIGNING_ACCESS_BINDING_INVALID,
} from '../contracts/lifecycle/index.js';
import { cancelUnsignedContract, abortPartialCeremony, revokeSigningAccess } from '../services/contractLifecycleCommandService.js';
import {
  ensureContractsModuleSeeded,
  signContractOnScreen,
  signContractViaLink,
  getContractBySignToken,
} from '../services/contractModuleService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-e-23e';
const TENANT_B = 'tenant-e-23e-b';

const admin = {
  id: 'user-e-admin',
  role: 'admin',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Admin 23E',
};
const master = {
  id: 'user-e-master',
  role: 'admin',
  isMaster: true,
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Master 23E',
};
const reception = {
  id: 'user-e-rec',
  role: 'recepcao',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Recepcao 23E',
};
const professional = {
  id: 'user-e-pro',
  role: 'profissional',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Prof 23E',
};
const tenantBAdmin = {
  id: 'user-e-b',
  role: 'admin',
  tenant_id: TENANT_B,
  tenantId: TENANT_B,
  name: 'Admin B',
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

function legalSnapshot(contractId) {
  const db = loadDb();
  return JSON.stringify({
    signatures: (db.contractSignatures || []).filter((row) => row.contractId === contractId),
    attachments: (db.contractAttachments || []).filter((row) => row.contractId === contractId),
    manifests: (db.clinicalPackageManifests || []).filter((row) => row.contractId === contractId),
    patientFiles: (db.patientFiles || []).filter((row) => row.contractId === contractId),
    html: (db.generatedContracts || []).find((row) => row.id === contractId)?.renderedHtml,
    documentHash: (db.generatedContracts || []).find((row) => row.id === contractId)?.documentHash,
  });
}

function baseDb() {
  return withDb((db) => {
    db.tenants = [
      { id: TENANT, name: 'Clinica 23E', status: 'active' },
      { id: TENANT_B, name: 'Clinica 23EB', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-1', razaoSocial: 'Clinica 23E', tenant_id: TENANT };
    db.clinicDocumentation = {
      cnpj: '12345678000199',
      responsavelTecnico: 'Dr. RT',
      conselhoRegionalNumero: 'CRO-MG 1',
    };
    db.clinicAddresses = [{
      principal: true, logradouro: 'Rua A', numero: '1', bairro: 'Centro',
      cidade: 'BH', uf: 'MG', cep: '30100000',
    }];
    db.patients = [{
      id: 'pat-e', tenant_id: TENANT, full_name: 'Paciente 23E',
      cpf: '52998224725', birth_date: '1990-01-01', sex: 'M',
    }];
    db.patientAddresses = [{
      patient_id: 'pat-e', principal: true, logradouro: 'Rua P', numero: '10',
      bairro: 'Savassi', cidade: 'BH', uf: 'MG',
    }];
    db.crmBudgets = [{
      id: 'budget-e', title: 'Restauracao', patientId: 'pat-e', leadId: 'lead-e',
      status: 'APROVADO', totalValue: 5000, paymentMethod: 'A vista',
      itemsJson: [{ description: 'Restauracao', value: 5000 }],
      createdAt: new Date().toISOString(),
    }];
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

function putContract(overrides = {}) {
  const row = {
    id: 'gctr-e-1',
    contractNumber: 'CTR-E-1',
    clinicId: 'clinic-1',
    tenant_id: TENANT,
    patientId: 'pat-e',
    quoteId: 'budget-e',
    quoteSource: 'crm_budget',
    status: CONTRACT_STATUS.GENERATED,
    renderedHtml: '<p>Contrato 23E</p>',
    finalContent: '<p>Contrato 23E</p>',
    documentHash: 'hash-e-doc',
    version: 1,
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

function putAccess({
  requestId = 'csreq-e',
  linkId = 'clnk-e',
  token = 'csgn-e',
  requestStatus = 'pending',
  linkStatus = 'pending',
  contractId = 'gctr-e-1',
  tenantId = TENANT,
} = {}) {
  withDb((db) => {
    db.contractSignatureRequests = [{
      id: requestId,
      contractId,
      tenant_id: tenantId,
      status: requestStatus,
    }];
    db.contractSignLinks = [{
      id: linkId,
      contractId,
      requestId,
      tenant_id: tenantId,
      token,
      status: linkStatus,
      expiresAt: '2099-01-01T00:00:00.000Z',
    }];
    return db;
  });
}

function putPartialCeremony() {
  putContract({ status: CONTRACT_STATUS.SIGNED_BY_CLINIC });
  withDb((db) => {
    db.contractSignatures = [{
      id: 'csig-keep-e',
      contractId: 'gctr-e-1',
      signerRole: 'PROFESSIONAL',
      signedAt: '2026-08-01T00:00:00.000Z',
      evidenceJson: { hash: 'hkeep-e' },
    }];
    return db;
  });
  putAccess({ requestId: 'csreq-pat-e', linkId: 'clnk-pat-e', token: 'csgn-pat-e' });
}

function expectCode(fn, code) {
  try {
    fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

async function sign(contractId, extra = {}) {
  return signContractOnScreen(extra.user || admin, contractId, {
    signerName: 'Paciente 23E',
    signerCpf: '52998224725',
    signatureImageDataUrl: 'data:image/png;base64,e23',
    ...extra.payload,
  });
}

describe('PHASE_10.23E cancel abort revoke', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    baseDb();
    ensureContractsModuleSeeded();
  });

  it('E01–E09 cancel preconditions', () => {
    putContract({ status: CONTRACT_STATUS.DRAFT });
    const draft = cancelUnsignedContract({ user: admin, contractId: 'gctr-e-1', reason: 'rascunho incorreto' });
    expect(draft.contract.status).toBe('canceled');
    expect(draft.previousState).toBe('draft');

    putContract({ id: 'gctr-e-gen', status: CONTRACT_STATUS.GENERATED });
    const generated = cancelUnsignedContract({ user: admin, contractId: 'gctr-e-gen', reason: 'erro material' });
    expect(generated.contract.status).toBe('canceled');
    expect(generated.previousState).toBe('generated');

    putContract({ id: 'gctr-e-miss', status: CONTRACT_STATUS.GENERATED });
    expectCode(() => cancelUnsignedContract({ user: admin, contractId: 'gctr-e-miss' }), LIFECYCLE_REASON_REQUIRED);
    expectCode(
      () => cancelUnsignedContract({ user: admin, contractId: 'gctr-e-miss', reason: '   ' }),
      LIFECYCLE_REASON_REQUIRED,
    );
    expectCode(
      () => cancelUnsignedContract({ user: { role: 'admin', tenant_id: TENANT, tenantId: TENANT }, contractId: 'gctr-e-miss', reason: 'x' }),
      LIFECYCLE_ACTOR_REQUIRED,
    );

    putContract({ id: 'gctr-e-part', status: CONTRACT_STATUS.SIGNED_BY_CLINIC });
    expectCode(
      () => cancelUnsignedContract({ user: admin, contractId: 'gctr-e-part', reason: 'nope' }),
      CONTRACT_LIFECYCLE_TRANSITION_INVALID,
    );

    putContract({ id: 'gctr-e-sig', status: CONTRACT_STATUS.SIGNED });
    expectCode(
      () => cancelUnsignedContract({ user: admin, contractId: 'gctr-e-sig', reason: 'nope' }),
      CANCEL_NOT_ALLOWED,
    );
    putContract({ id: 'gctr-e-void', status: 'voided' });
    expectCode(
      () => cancelUnsignedContract({ user: admin, contractId: 'gctr-e-void', reason: 'nope' }),
      CANCEL_NOT_ALLOWED,
    );
    putContract({ id: 'gctr-e-sup', status: 'superseded' });
    expectCode(
      () => cancelUnsignedContract({ user: admin, contractId: 'gctr-e-sup', reason: 'nope' }),
      CANCEL_NOT_ALLOWED,
    );
  });

  it('E10–E18 cancel metadata, audit, revoke, token', async () => {
    putContract({ status: CONTRACT_STATUS.GENERATED });
    putAccess({ requestStatus: 'pending' });
    const result = cancelUnsignedContract({ user: admin, contractId: 'gctr-e-1', reason: 'erro material' });
    const row = result.contract;
    expect(row.canceledBy).toBe(admin.id);
    expect(row.cancelReason).toBe('erro material');
    expect(row.canceledAt).toBe(result.actedAt);
    expect(row.previousLifecycleState).toBe('generated');
    const audits = (loadDb().contractLifecycleAudits || []).filter((a) => a.contractId === 'gctr-e-1');
    expect(audits.some((a) => a.eventType === LIFECYCLE_AUDIT_EVENTS.CONTRACT_CANCELLED)).toBe(true);
    expect(loadDb().contractSignatureRequests[0].status).toBe('revoked');

    putContract({ id: 'gctr-e-sent', status: CONTRACT_STATUS.GENERATED });
    putAccess({
      contractId: 'gctr-e-sent',
      requestId: 'csreq-sent',
      linkId: 'clnk-sent',
      token: 'csgn-sent',
      requestStatus: 'sent',
    });
    cancelUnsignedContract({ user: admin, contractId: 'gctr-e-sent', reason: 'revoga sent' });
    expect(loadDb().contractSignatureRequests.find((r) => r.id === 'csreq-sent').status).toBe('revoked');
    expect(loadDb().contractSignLinks.find((l) => l.id === 'clnk-sent').status).toBe('revoked');
    expect(getContractBySignToken('csgn-sent')).toBeNull();
    await expect(signContractViaLink('csgn-sent', {
      signerName: 'Paciente 23E',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,e23',
    })).rejects.toThrow(/inválido|expirado|assinável/i);
  });

  it('E19–E27 abort 1/2 preserves evidence and blocks 2/2', async () => {
    putPartialCeremony();
    withDb((db) => {
      db.clinicalPackageManifests = [{
        id: 'man-e-1', contractId: 'gctr-e-1', manifestHash: 'mh-e', hash: 'mh-e', status: 'FROZEN',
      }];
      return db;
    });
    const beforeLegal = legalSnapshot('gctr-e-1');
    expectCode(
      () => abortPartialCeremony({ user: admin, contractId: 'gctr-e-1' }),
      LIFECYCLE_REASON_REQUIRED,
    );
    expectCode(
      () => abortPartialCeremony({
        user: { role: 'admin', tenant_id: TENANT, tenantId: TENANT },
        contractId: 'gctr-e-1',
        reason: 'abort',
      }),
      LIFECYCLE_ACTOR_REQUIRED,
    );
    const aborted = abortPartialCeremony({ user: admin, contractId: 'gctr-e-1', reason: 'paciente desistiu' });
    expect(aborted.contract.status).toBe('canceled');
    expect(aborted.contract.metadata.signatureCeremony.status).toBe('aborted');
    expect(loadDb().contractSignatures.map((s) => s.id)).toEqual(['csig-keep-e']);
    expect(loadDb().contractSignatures[0].evidenceJson).toEqual({ hash: 'hkeep-e' });
    expect(legalSnapshot('gctr-e-1')).toBe(beforeLegal);
    expect(loadDb().contractSignatureRequests[0].status).toBe('revoked');
    expect(loadDb().contractSignLinks[0].status).toBe('revoked');
    const beforeSigs = loadDb().contractSignatures.length;
    await expect(sign('gctr-e-1')).rejects.toMatchObject({ code: CONTRACT_NOT_SIGNABLE });
    expect(loadDb().contractSignatures).toHaveLength(beforeSigs);
    withDb((db) => {
      db.contractSignatureRequests[0] = { ...db.contractSignatureRequests[0], status: 'pending' };
      db.contractSignLinks[0] = { ...db.contractSignLinks[0], status: 'pending' };
      return db;
    });
    await expect(sign('gctr-e-1')).rejects.toMatchObject({ code: CONTRACT_NOT_SIGNABLE });
    expect(loadDb().contractSignatures).toHaveLength(beforeSigs);

    putContract({ id: 'gctr-e-22', status: CONTRACT_STATUS.SIGNED });
    withDb((db) => {
      db.contractSignatures = [
        { id: 'csig-a', contractId: 'gctr-e-22' },
        { id: 'csig-b', contractId: 'gctr-e-22' },
      ];
      return db;
    });
    expectCode(
      () => abortPartialCeremony({ user: admin, contractId: 'gctr-e-22', reason: 'nope' }),
      CEREMONY_NOT_ABORTABLE,
    );
  });

  it('E28–E34 explicit revoke', async () => {
    putContract({ status: CONTRACT_STATUS.GENERATED });
    putAccess();
    expectCode(
      () => revokeSigningAccess({ user: admin, contractId: 'gctr-e-1', requestId: 'csreq-e' }),
      LIFECYCLE_REASON_REQUIRED,
    );
    expectCode(
      () => revokeSigningAccess({
        user: { role: 'admin', tenant_id: TENANT, tenantId: TENANT },
        contractId: 'gctr-e-1',
        requestId: 'csreq-e',
        reason: 'revoke',
      }),
      LIFECYCLE_ACTOR_REQUIRED,
    );
    const revoked = revokeSigningAccess({
      user: admin,
      contractId: 'gctr-e-1',
      requestId: 'csreq-e',
      reason: 'convite indevido',
    });
    expect(revoked.request.status).toBe('revoked');
    expect(revoked.links[0].status).toBe('revoked');
    expect(loadDb().generatedContracts[0].status).toBe(CONTRACT_STATUS.GENERATED);
    expect(loadDb().contractSignatureRequests).toHaveLength(1);
    expect(loadDb().contractSignLinks).toHaveLength(1);
    expect(getContractBySignToken('csgn-e')).toBeNull();
    await expect(signContractViaLink('csgn-e', {
      signerName: 'Paciente 23E',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,e23',
    })).rejects.toThrow(/inválido|expirado|assinável/i);

    const original = {
      revokedAt: loadDb().contractSignatureRequests[0].revokedAt,
      revokeReason: loadDb().contractSignatureRequests[0].revokeReason,
      revokedBy: loadDb().contractSignatureRequests[0].revokedBy,
    };
    const retry = revokeSigningAccess({
      user: admin,
      contractId: 'gctr-e-1',
      requestId: 'csreq-e',
      reason: 'tentativa repetida',
    });
    expect(retry.idempotent).toBe(true);
    expect(loadDb().contractSignatureRequests[0].revokedAt).toBe(original.revokedAt);
    expect(loadDb().contractSignatureRequests[0].revokeReason).toBe(original.revokeReason);
    expect(loadDb().contractSignatureRequests[0].revokedBy).toBe(original.revokedBy);
  });

  it('E35–E38 tenant and binding isolation', () => {
    putContract({ status: CONTRACT_STATUS.GENERATED, tenant_id: TENANT_B });
    expectCode(
      () => cancelUnsignedContract({ user: admin, contractId: 'gctr-e-1', reason: 'cross' }),
      LIFECYCLE_TENANT_MISMATCH,
    );

    putContract({ id: 'gctr-e-a', status: CONTRACT_STATUS.GENERATED, tenant_id: TENANT });
    withDb((db) => {
      db.contractSignatureRequests = [{
        id: 'csreq-b', contractId: 'gctr-e-a', tenant_id: TENANT_B, status: 'pending',
      }];
      return db;
    });
    expectCode(
      () => revokeSigningAccess({
        user: admin, contractId: 'gctr-e-a', requestId: 'csreq-b', reason: 'cross req',
      }),
      LIFECYCLE_TENANT_MISMATCH,
    );

    withDb((db) => {
      db.contractSignatureRequests = [{
        id: 'csreq-foreign', contractId: 'gctr-other', tenant_id: TENANT, status: 'pending',
      }];
      return db;
    });
    expectCode(
      () => revokeSigningAccess({
        user: admin, contractId: 'gctr-e-a', requestId: 'csreq-foreign', reason: 'mismatch',
      }),
      SIGNING_ACCESS_BINDING_INVALID,
    );

    putAccess({ contractId: 'gctr-e-a', requestId: 'csreq-ok', linkId: 'clnk-ok', token: 'csgn-ok' });
    withDb((db) => {
      db.contractSignLinks = [{
        id: 'clnk-bad',
        contractId: 'gctr-other',
        requestId: 'csreq-ok',
        tenant_id: TENANT,
        token: 'csgn-bad',
        status: 'pending',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }];
      return db;
    });
    expectCode(
      () => revokeSigningAccess({
        user: admin,
        contractId: 'gctr-e-a',
        requestId: 'csreq-ok',
        signLinkId: 'clnk-bad',
        reason: 'bad link',
      }),
      SIGNING_ACCESS_BINDING_INVALID,
    );
  });

  it('E39–E43 financial, artifact and manifest isolation', () => {
    putContract({ status: CONTRACT_STATUS.GENERATED, pdfUrl: 'data:application/pdf;base64,QQ==' });
    withDb((db) => {
      db.contractAttachments = [{
        id: 'catt-e', contractId: 'gctr-e-1', source: 'final_signed_artifact',
        documentHash: 'hash-e-doc', fileUrl: 'data:application/pdf;base64,QQ==', immutable: true,
      }];
      db.clinicalPackageManifests = [{
        id: 'man-e', contractId: 'gctr-e-1', manifestHash: 'mh-e', hash: 'mh-e', status: 'FROZEN',
      }];
      return db;
    });
    const beforeFin = financeSnapshot();
    const beforeLegal = legalSnapshot('gctr-e-1');
    cancelUnsignedContract({ user: admin, contractId: 'gctr-e-1', reason: 'keep finance' });
    expect(financeSnapshot()).toBe(beforeFin);
    expect(legalSnapshot('gctr-e-1')).toBe(beforeLegal);

    putPartialCeremony();
    putContract({
      id: 'gctr-e-1',
      status: CONTRACT_STATUS.SIGNED_BY_CLINIC,
      renderedHtml: '<p>Contrato 23E</p>',
      documentHash: 'hash-e-doc',
    });
    withDb((db) => {
      db.clinicalPackageManifests = [{
        id: 'man-abort', contractId: 'gctr-e-1', manifestHash: 'mh-e', hash: 'mh-e', status: 'FROZEN',
      }];
      db.contractAttachments = [{
        id: 'catt-abort', contractId: 'gctr-e-1', source: 'final_signed_artifact',
        documentHash: 'hash-e-doc', fileUrl: 'data:application/pdf;base64,QQ==', immutable: true,
      }];
      return db;
    });
    const abortFin = financeSnapshot();
    const abortLegal = legalSnapshot('gctr-e-1');
    abortPartialCeremony({ user: admin, contractId: 'gctr-e-1', reason: 'abort keep' });
    expect(financeSnapshot()).toBe(abortFin);
    expect(legalSnapshot('gctr-e-1')).toBe(abortLegal);

    putContract({ id: 'gctr-e-rev', status: CONTRACT_STATUS.GENERATED });
    putAccess({ contractId: 'gctr-e-rev', requestId: 'csreq-rev-e', linkId: 'clnk-rev-e', token: 'csgn-rev-e' });
    const revFin = financeSnapshot();
    revokeSigningAccess({
      user: admin, contractId: 'gctr-e-rev', requestId: 'csreq-rev-e', reason: 'revoke keep',
    });
    expect(financeSnapshot()).toBe(revFin);
  });

  it('E44–E45 cancelled resurrection still fail-closed', async () => {
    putContract({ status: CONTRACT_STATUS.GENERATED });
    putAccess({ token: 'csgn-z' });
    cancelUnsignedContract({ user: admin, contractId: 'gctr-e-1', reason: 'cancel then zombie' });
    withDb((db) => {
      db.contractSignatureRequests[0] = { ...db.contractSignatureRequests[0], status: 'pending' };
      db.contractSignLinks[0] = { ...db.contractSignLinks[0], status: 'pending' };
      return db;
    });
    const before = (loadDb().contractSignatures || []).length;
    await expect(sign('gctr-e-1')).rejects.toMatchObject({ code: CONTRACT_NOT_SIGNABLE });
    expect((loadDb().contractSignatures || []).length).toBe(before);
  });

  it('E46–E48 authorization', () => {
    putContract({ status: CONTRACT_STATUS.GENERATED });
    expectCode(
      () => cancelUnsignedContract({ user: reception, contractId: 'gctr-e-1', reason: 'nope' }),
      CANCEL_NOT_ALLOWED,
    );
    putPartialCeremony();
    expectCode(
      () => abortPartialCeremony({ user: professional, contractId: 'gctr-e-1', reason: 'nope' }),
      CANCEL_NOT_ALLOWED,
    );
    putContract({ id: 'gctr-e-ok', status: CONTRACT_STATUS.GENERATED });
    const adminOk = cancelUnsignedContract({ user: admin, contractId: 'gctr-e-ok', reason: 'admin path' });
    expect(adminOk.ok).toBe(true);
    putContract({ id: 'gctr-e-master', status: CONTRACT_STATUS.GENERATED });
    const masterOk = cancelUnsignedContract({ user: master, contractId: 'gctr-e-master', reason: 'master path' });
    expect(masterOk.ok).toBe(true);
    expect(tenantBAdmin.id).toBeTruthy();
  });

  it('idempotent cancel does not rewrite original legal metadata', () => {
    putContract({ status: CONTRACT_STATUS.GENERATED });
    const first = cancelUnsignedContract({ user: admin, contractId: 'gctr-e-1', reason: 'primeiro' });
    const second = cancelUnsignedContract({ user: admin, contractId: 'gctr-e-1', reason: 'segundo' });
    expect(second.idempotent).toBe(true);
    expect(loadDb().generatedContracts[0].cancelReason).toBe('primeiro');
    expect(loadDb().generatedContracts[0].canceledBy).toBe(admin.id);
    expect(loadDb().generatedContracts[0].canceledAt).toBe(first.actedAt);
    const cancelAudits = (loadDb().contractLifecycleAudits || [])
      .filter((a) => a.eventType === LIFECYCLE_AUDIT_EVENTS.CONTRACT_CANCELLED);
    expect(cancelAudits).toHaveLength(1);
  });

  it('legacy writers delegate; no unsafe bypass in LIVE UI', () => {
    const service = readSrc('src/services/contractService.js');
    const provider = readSrc('src/services/signatureProviderService.js');
    const clinical = readSrc('src/components/clinical/ClinicalContractSection.jsx');
    expect(service).toContain('dispatchCancelOrAbort');
    expect(provider).toContain('revokeSigningAccess');
    expect(clinical).toContain('cancelContractSecure');
    expect(clinical).toContain('Cancelar cerimônia/contrato');
    expect(readSrc('src/pages/admin/AdminContratosConsentimentosPage.jsx')).not.toContain('cancelGeneratedContract(user');
  });
});
