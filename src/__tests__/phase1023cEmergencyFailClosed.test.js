/**
 * PHASE_10.23C — emergency fail-closed: signability, no in-place signed mutation,
 * cancel revokes remote access, artifact immutability. Fixtures only. Sem backfill.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  CONTRACT_NOT_SIGNABLE,
  SIGNED_CONTRACT_IMMUTABLE,
  PILOT_IMMUTABLE,
  CANCEL_NOT_ALLOWED,
  normalizeContractLifecycleStatus,
  assertContractSignable,
  isContractSignable,
  contractHasFinalSignedArtifact,
} from '../contracts/contractLifecycleGuard.js';
import {
  ensureContractsModuleSeeded,
  createContractDraft,
  finalizeGeneratedContract,
  signContractOnScreen,
  signContractViaLink,
  createContractNewVersion,
  getContractBySignToken,
} from '../services/contractModuleService.js';
import { cancelGeneratedContract } from '../services/contractService.js';
import { cancelSignatureRequest } from '../services/signatureProviderService.js';
import { maybeGenerateFinalSignedArtifact } from '../services/finalSignedContractArtifactService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-c-23c';
const CTR00003 = 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a';
const CTR00004 = 'gctr-930c24bc-f658-4354-81e3-8eea61335361';
const CTR00005 = 'gctr-87ca1983-f43c-41ec-ae22-699d5120a39d';
const CTR00005_PDF = 'catt-7520a89d-94e6-4bf3-a061-2f253b04d592';
const CTR00005_PSIG = 'csig-cf6b1dd1-0c43-4b46-98fe-17fd597d6046';
const CTR00005_ASIG = 'csig-0d790a1f-8a3f-4d1f-9c32-16377337f1a1';

const admin = {
  id: 'user-c-admin',
  role: 'admin',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Admin 23C',
};
const professional = {
  id: 'user-c-pro',
  role: 'profissional',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Prof 23C',
};

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function baseDb(extra = {}) {
  return withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Clínica 23C', status: 'active' }];
    db.clinicProfile = { id: 'clinic-1', razaoSocial: 'Clínica 23C', tenant_id: TENANT };
    db.clinicDocumentation = {
      cnpj: '12345678000199',
      responsavelTecnico: 'Dr. RT',
      conselhoRegionalNumero: 'CRO-MG 1',
    };
    db.clinicAddresses = [{
      principal: true,
      logradouro: 'Rua A',
      numero: '1',
      bairro: 'Centro',
      cidade: 'BH',
      uf: 'MG',
      cep: '30100000',
    }];
    db.patients = [{
      id: 'pat-c',
      tenant_id: TENANT,
      full_name: 'Paciente 23C',
      cpf: '52998224725',
      birth_date: '1990-01-01',
      sex: 'M',
    }];
    db.patientAddresses = [{
      patient_id: 'pat-c',
      principal: true,
      logradouro: 'Rua P',
      numero: '10',
      bairro: 'Savassi',
      cidade: 'BH',
      uf: 'MG',
    }];
    db.crmBudgets = [{
      id: 'budget-c',
      title: 'Restauração',
      patientId: 'pat-c',
      leadId: 'lead-c',
      status: 'APROVADO',
      totalValue: 5000,
      paymentMethod: 'À vista',
      itemsJson: [{ description: 'Restauração', value: 5000 }],
      createdAt: new Date().toISOString(),
    }];
    db.generatedContracts = extra.generatedContracts || [];
    db.contractSignatures = extra.contractSignatures || [];
    db.contractSignatureRequests = extra.contractSignatureRequests || [];
    db.contractSignLinks = extra.contractSignLinks || [];
    db.contractAttachments = extra.contractAttachments || [];
    return db;
  });
}

function putContract(overrides = {}) {
  const row = {
    id: 'gctr-c-1',
    contractNumber: 'CTR-C-1',
    clinicId: 'clinic-1',
    tenant_id: TENANT,
    patientId: 'pat-c',
    quoteId: 'budget-c',
    quoteSource: 'crm_budget',
    status: CONTRACT_STATUS.GENERATED,
    renderedHtml: '<p>Contrato 23C</p>',
    finalContent: '<p>Contrato 23C</p>',
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

async function sign(contractId, extra = {}) {
  return signContractOnScreen(extra.user || admin, contractId, {
    signerName: 'Paciente 23C',
    signerCpf: '52998224725',
    signatureImageDataUrl: 'data:image/png;base64,c23',
    ...extra.payload,
  });
}

describe('PHASE_10.23C emergency fail-closed', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    baseDb();
    ensureContractsModuleSeeded();
  });

  it('normalizes aliases and fail-closes unknown', () => {
    expect(normalizeContractLifecycleStatus('canceled')).toBe('cancelled');
    expect(normalizeContractLifecycleStatus('replaced')).toBe('superseded');
    expect(normalizeContractLifecycleStatus('completed')).toBe('signed');
    expect(normalizeContractLifecycleStatus('signed_by_clinic')).toBe('partially_signed');
    expect(normalizeContractLifecycleStatus('sent')).toBe('generated');
    expect(normalizeContractLifecycleStatus('')).toBe('unknown');
    expect(normalizeContractLifecycleStatus('nope')).toBe('unknown');
    expect(isContractSignable({ status: 'nope' })).toBe(false);
    try {
      assertContractSignable({ id: 'x', status: 'nope' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe(CONTRACT_NOT_SIGNABLE);
      expect(err.normalizedStatus).toBe('unknown');
      expect(err.contractId).toBe('x');
    }
  });

  it('T01 generated still signs', async () => {
    const tpl = withDb((db) => db.contractTemplates.find((t) => t.type === 'system_default'));
    const draft = createContractDraft(admin, {
      quoteSource: 'crm_budget',
      quoteId: 'budget-c',
      patientId: 'pat-c',
      templateId: tpl.id,
    });
    const finalized = finalizeGeneratedContract(admin, draft.id);
    const signed = await sign(finalized.id);
    expect(signed.contract.status).toBe(CONTRACT_STATUS.SIGNED);
  });

  it('T02 partially_signed receives remaining signature', async () => {
    putContract({ status: CONTRACT_STATUS.SIGNED_BY_CLINIC });
    withDb((db) => {
      db.contractSignatures = [{
        id: 'csig-pro-1',
        contractId: 'gctr-c-1',
        signerRole: 'PROFESSIONAL',
        signedAt: '2026-08-01T00:00:00.000Z',
      }];
      return db;
    });
    const signed = await sign('gctr-c-1');
    expect(signed.contract.status).toBe(CONTRACT_STATUS.SIGNED);
  });

  it('T03–T11 non-signable statuses fail closed', async () => {
    const cases = [
      ['draft', 'draft'],
      ['canceled', 'cancelled'],
      ['cancelled', 'cancelled'],
      ['signed', 'signed'],
      ['completed', 'signed'],
      ['voided', 'voided'],
      ['superseded', 'superseded'],
      ['replaced', 'superseded'],
      ['mystery', 'unknown'],
    ];
    for (const [raw, normalized] of cases) {
      putContract({ id: `gctr-${raw}`, status: raw });
      const before = (loadDb().contractSignatures || []).length;
      await expect(sign(`gctr-${raw}`)).rejects.toMatchObject({
        code: CONTRACT_NOT_SIGNABLE,
        normalizedStatus: normalized,
      });
      expect((loadDb().contractSignatures || []).length).toBe(before);
    }
  });

  it('T12/T13 cancelled + pending token cannot resurrect', async () => {
    putContract({ status: 'canceled' });
    withDb((db) => {
      db.contractSignatureRequests = [{
        id: 'csreq-zombie',
        contractId: 'gctr-c-1',
        status: 'pending',
      }];
      db.contractSignLinks = [{
        id: 'clnk-zombie',
        contractId: 'gctr-c-1',
        requestId: 'csreq-zombie',
        token: 'csgn-zombie',
        status: 'pending',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }];
      return db;
    });
    const before = (loadDb().contractSignatures || []).length;
    expect(getContractBySignToken('csgn-zombie')).toBeNull();
    await expect(signContractViaLink('csgn-zombie', {
      signerName: 'Paciente 23C',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,c23',
    })).rejects.toThrow(/inválido|expirado|assinável/i);
    await expect(sign('gctr-c-1')).rejects.toMatchObject({ code: CONTRACT_NOT_SIGNABLE });
    expect((loadDb().contractSignatures || []).length).toBe(before);
    expect(loadDb().generatedContracts.find((c) => c.id === 'gctr-c-1').status).toBe('canceled');
  });

  it('T14/T15 cancel unsigned revokes request and link', () => {
    putContract({ status: CONTRACT_STATUS.GENERATED });
    withDb((db) => {
      db.contractSignatureRequests = [{
        id: 'csreq-live',
        contractId: 'gctr-c-1',
        status: 'sent',
      }];
      db.contractSignLinks = [{
        id: 'clnk-live',
        contractId: 'gctr-c-1',
        requestId: 'csreq-live',
        token: 'csgn-live',
        status: 'pending',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }];
      return db;
    });
    cancelGeneratedContract(admin, 'gctr-c-1', { reason: 'erro material' });
    const db = loadDb();
    expect(db.generatedContracts.find((c) => c.id === 'gctr-c-1').status).toBe('canceled');
    expect(db.contractSignatureRequests[0].status).toBe('revoked');
    expect(db.contractSignLinks[0].status).toBe('revoked');
    expect(getContractBySignToken('csgn-live')).toBeNull();
  });

  it('T16–T18 abort 1/2 preserves csig, revokes access, blocks 2/2', async () => {
    putContract({ status: CONTRACT_STATUS.SIGNED_BY_CLINIC });
    withDb((db) => {
      db.contractSignatures = [{
        id: 'csig-keep',
        contractId: 'gctr-c-1',
        signerRole: 'PROFESSIONAL',
        signedAt: '2026-08-01T00:00:00.000Z',
        evidenceJson: { hash: 'hkeep' },
      }];
      db.contractSignatureRequests = [{
        id: 'csreq-pat',
        contractId: 'gctr-c-1',
        status: 'pending',
      }];
      db.contractSignLinks = [{
        id: 'clnk-pat',
        contractId: 'gctr-c-1',
        requestId: 'csreq-pat',
        token: 'csgn-pat',
        status: 'pending',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }];
      return db;
    });
    cancelGeneratedContract(admin, 'gctr-c-1', { reason: 'abort 1/2' });
    const db = loadDb();
    expect(db.contractSignatures.find((s) => s.id === 'csig-keep')).toMatchObject({
      evidenceJson: { hash: 'hkeep' },
    });
    expect(db.contractSignatureRequests[0].status).toBe('revoked');
    expect(db.contractSignLinks[0].status).toBe('revoked');
    const before = db.contractSignatures.length;
    await expect(sign('gctr-c-1')).rejects.toMatchObject({ code: CONTRACT_NOT_SIGNABLE });
    expect(loadDb().contractSignatures).toHaveLength(before);
  });

  it('T19–T21 createContractNewVersion blocks terminal and does not mutate', () => {
    putContract({ id: 'gctr-signed', status: CONTRACT_STATUS.SIGNED, pdfUrl: 'data:application/pdf;base64,QQ==' });
    putContract({ id: 'gctr-completed', status: CONTRACT_STATUS.COMPLETED });
    const before = JSON.stringify(loadDb().generatedContracts);
    expect(() => createContractNewVersion(admin, 'gctr-signed')).toThrow();
    try {
      createContractNewVersion(admin, 'gctr-signed');
    } catch (err) {
      expect(err.code).toBe(SIGNED_CONTRACT_IMMUTABLE);
    }
    try {
      createContractNewVersion(admin, 'gctr-completed');
    } catch (err) {
      expect(err.code).toBe(SIGNED_CONTRACT_IMMUTABLE);
      expect(err.normalizedStatus).toBe('signed');
    }
    expect(JSON.stringify(loadDb().generatedContracts)).toBe(before);
  });

  it('T22–T24 existing final artifact is not overwritten', async () => {
    const pdf = 'data:application/pdf;base64,JVBERi0xLjQK';
    putContract({
      id: CTR00005,
      contractNumber: 'CTR-2026-00005',
      status: CONTRACT_STATUS.SIGNED,
      documentHash: 'h94e01b5',
      pdfUrl: pdf,
      metadata: { finalArtifactStatus: 'generated', finalArtifactAttachmentId: CTR00005_PDF },
    });
    withDb((db) => {
      db.contractAttachments = [{
        id: CTR00005_PDF,
        contractId: CTR00005,
        source: 'final_signed_artifact',
        documentHash: 'h94e01b5',
        fileUrl: pdf,
        immutable: true,
      }];
      return db;
    });
    expect(contractHasFinalSignedArtifact(
      loadDb().generatedContracts.find((c) => c.id === CTR00005),
      loadDb().contractAttachments,
    )).toBe(true);
    const beforeAtt = JSON.stringify(loadDb().contractAttachments);
    const result = await maybeGenerateFinalSignedArtifact({
      contract: loadDb().generatedContracts.find((c) => c.id === CTR00005),
      signatures: [],
    });
    expect(result.skipped || result.alreadyGenerated).toBeTruthy();
    expect(result.reason === 'already_generated' || result.alreadyGenerated).toBeTruthy();
    expect(JSON.stringify(loadDb().contractAttachments)).toBe(beforeAtt);
    expect(loadDb().contractAttachments[0].artifactBinarySha256).toBeUndefined();
  });

  it('T25 cancel does not mutate finance', () => {
    putContract({ status: CONTRACT_STATUS.GENERATED });
    const before = financeSnapshot();
    cancelGeneratedContract(admin, 'gctr-c-1', { reason: 'keep finance', financialAction: 'cancel_future' });
    expect(financeSnapshot()).toBe(before);
  });

  it('T26/T27 explicit request revoke still blocks sign', async () => {
    putContract({ status: CONTRACT_STATUS.GENERATED });
    withDb((db) => {
      db.contractSignatureRequests = [{
        id: 'csreq-rev',
        contractId: 'gctr-c-1',
        status: 'pending',
      }];
      db.contractSignLinks = [{
        id: 'clnk-rev',
        contractId: 'gctr-c-1',
        requestId: 'csreq-rev',
        token: 'csgn-rev',
        status: 'pending',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }];
      return db;
    });
    await cancelSignatureRequest({ user: admin, requestId: 'csreq-rev', reason: 'cancelado pela clínica' });
    expect(loadDb().contractSignatureRequests[0].status).toBe('cancelled');
    expect(loadDb().contractSignLinks[0].status).toBe('cancelled');
    expect(getContractBySignToken('csgn-rev')).toBeNull();
    await expect(signContractViaLink('csgn-rev', {
      signerName: 'Paciente 23C',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,c23',
    })).rejects.toThrow(/inválido|expirado/i);
  });

  it('professional cannot cancel; reception UI has no Nova versão', () => {
    putContract({ status: CONTRACT_STATUS.GENERATED });
    expect(() => cancelGeneratedContract(professional, 'gctr-c-1', { reason: 'x' }))
      .toThrow();
    try {
      cancelGeneratedContract(professional, 'gctr-c-1', { reason: 'x' });
    } catch (err) {
      expect(err.code).toBe(CANCEL_NOT_ALLOWED);
    }
    expect(loadDb().generatedContracts[0].status).toBe(CONTRACT_STATUS.GENERATED);
    const signedPage = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    expect(signedPage).not.toContain('Nova versão');
    expect(signedPage).not.toContain('createContractNewVersion');
    expect(signedPage).toContain('Contratos assinados não podem ser alterados');
    expect(readSrc('src/pages/admin/AdminContratosConsentimentosPage.jsx')).not.toContain('cancelGeneratedContract(user');
  });

  it('historical pilots are blocked from mutation', async () => {
    withDb((db) => {
      db.generatedContracts.push(
        {
          id: CTR00003,
          contractNumber: 'CTR-2026-00003',
          status: CONTRACT_STATUS.SIGNED,
          clinicId: 'clinic-1',
          tenant_id: TENANT,
          documentHash: 'h3bb6313c',
          renderedHtml: '<p>piloto 00003</p>',
        },
        {
          id: CTR00004,
          contractNumber: 'CTR-2026-00004',
          status: CONTRACT_STATUS.GENERATED,
          clinicId: 'clinic-1',
          tenant_id: TENANT,
          documentHash: 'he96548e0',
          renderedHtml: '<p>piloto 00004</p>',
        },
        {
          id: CTR00005,
          contractNumber: 'CTR-2026-00005',
          status: CONTRACT_STATUS.SIGNED,
          clinicId: 'clinic-1',
          tenant_id: TENANT,
          documentHash: 'h94e01b5',
          pdfUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
          renderedHtml: '<p>piloto 00005</p>',
          metadata: { finalArtifactStatus: 'generated', finalArtifactAttachmentId: CTR00005_PDF },
        },
      );
      db.contractSignatures = [
        { id: CTR00005_PSIG, contractId: CTR00005, signerRole: 'PROFESSIONAL' },
        { id: CTR00005_ASIG, contractId: CTR00005, signerRole: 'PATIENT' },
      ];
      db.contractAttachments = [{
        id: CTR00005_PDF,
        contractId: CTR00005,
        source: 'final_signed_artifact',
        documentHash: 'h94e01b5',
        fileUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        immutable: true,
      }];
      return db;
    });
    const before = JSON.stringify({
      contracts: loadDb().generatedContracts.filter((c) => [CTR00003, CTR00004, CTR00005].includes(c.id)),
      sigs: loadDb().contractSignatures,
      atts: loadDb().contractAttachments,
    });
    expect(() => createContractNewVersion(admin, CTR00005)).toThrow();
    await expect(sign(CTR00005)).rejects.toMatchObject({ code: CONTRACT_NOT_SIGNABLE });
    try {
      cancelGeneratedContract(admin, CTR00003, { reason: 'nope' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe(PILOT_IMMUTABLE);
    }
    try {
      cancelGeneratedContract(admin, CTR00004, { reason: 'nope' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.code).toBe(PILOT_IMMUTABLE);
    }
    const artifact = await maybeGenerateFinalSignedArtifact({
      contract: loadDb().generatedContracts.find((c) => c.id === CTR00005),
      signatures: loadDb().contractSignatures.filter((s) => s.contractId === CTR00005),
    });
    expect(artifact.reason === 'already_generated' || artifact.alreadyGenerated || artifact.skipped).toBeTruthy();
    expect(JSON.stringify({
      contracts: loadDb().generatedContracts.filter((c) => [CTR00003, CTR00004, CTR00005].includes(c.id)),
      sigs: loadDb().contractSignatures,
      atts: loadDb().contractAttachments,
    })).toBe(before);
  });

  it('writers call the central guard before persisting csig', () => {
    const writer = readSrc('src/services/contractModuleService.js');
    expect(writer).toMatch(/export async function signContractOnScreen[\s\S]*assertContractSignable/);
    expect(writer).toMatch(/export async function signContractViaLink[\s\S]*await signContractOnScreen/);
    expect(writer).toContain('assertInPlaceReissueBlocked');
    expect(writer).toMatch(/export function uploadSignedContractAttachment[\s\S]*assertContractSignable/);
  });
});
