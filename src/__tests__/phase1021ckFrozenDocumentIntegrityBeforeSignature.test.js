/**
 * PHASE_10.21CK — SHA-256 congelado revalidado antes de qualquer stroke.
 * Não muta a assinatura real da Juliana. Sem e-mail. Sem link real.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { evaluateSignatureCeremony, CEREMONY_STATUS } from '../contracts/clinicalSignatureCeremony.js';
import { CONTRACT_VERSION_NOT_ESTABLISHED } from '../contracts/generatedContractVersion.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import {
  sendContractForSignature,
  signContractOnScreen,
  signContractViaLink,
} from '../services/contractModuleService.js';
import {
  assertFrozenDocumentIntegrityBeforeSignature,
  findFrozenContractServicesDocument,
  FROZEN_DOCUMENT_CONTENT_MISMATCH,
  FROZEN_DOCUMENT_VERSION_MISMATCH,
  FROZEN_MANIFEST_HASH_MISMATCH,
  FROZEN_MANIFEST_ID_MISMATCH,
} from '../contracts/assertFrozenDocumentIntegrityBeforeSignature.js';
import { hashPackageManifestEntity } from '../domain/contracts/packages/package-manifest-hash.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-ck';
const PATIENT_ID = 'patient-ck-clara';
const JULIANA = 'col-ck-juliana';
const APPT_ID = 'appt-ck';
const BUDGET_ID = 'budget-ck';
const CONTRACT_ID = 'gctr-ck-00005';
const CTR00003 = 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a';
const CTR00004 = 'gctr-930c24bc-f658-4354-81e3-8eea61335361';
const HTML = '<p>Contrato CK flúor</p>';

const julianaUser = {
  id: 'user-ck-juliana',
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
    db.tenants = [{ id: TENANT, name: 'Clínica CK' }];
    db.clinicProfile = { id: 'clinic-ck', tenant_id: TENANT, nomeFantasia: 'Clínica CK' };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Dra. Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.collaborators = [{
      id: JULIANA, nomeCompleto: 'Juliana de Oliveira Freire',
      conselhoNumero: '27267', conselhoUf: 'MG', tenant_id: TENANT,
    }];
    db.collaboratorAccess = [{ collaboratorId: JULIANA, userId: julianaUser.id, role: 'profissional' }];
    db.patients = [{
      id: PATIENT_ID, full_name: 'Clara Closel Franco Segal', tenant_id: TENANT, cpf: '39053344705',
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
        budgetNumber: 'ORC-CK',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        planName: 'Aplicação tópica de flúor',
        procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
        totalValue: 150,
        paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
      },
    }];
    db.generatedContracts = [
      {
        id: CONTRACT_ID,
        contractNumber: 'CTR-CK-00005',
        status: CONTRACT_STATUS.GENERATED,
        quoteSource: 'clinical_budget',
        quoteId: APPT_ID,
        budgetId: BUDGET_ID,
        patientId: PATIENT_ID,
        clinicId: 'clinic-ck',
        tenant_id: TENANT,
        version: 1,
        renderedHtml: HTML,
        finalContent: HTML,
        metadata: {},
      },
      {
        id: CTR00003,
        contractNumber: 'CTR-2026-00003',
        status: CONTRACT_STATUS.SIGNED,
        quoteSource: 'clinical_budget',
        patientId: PATIENT_ID,
        tenant_id: TENANT,
        documentHash: 'h3bb6313c',
        renderedHtml: '<p>CTR-00003 preservado</p>',
      },
      {
        id: CTR00004,
        contractNumber: 'CTR-2026-00004',
        status: CONTRACT_STATUS.GENERATED,
        quoteSource: 'clinical_budget',
        patientId: PATIENT_ID,
        tenant_id: TENANT,
        renderedHtml: '<p>CTR-00004 sem backfill</p>',
      },
    ];
    db.clinicalPackageManifests = [];
    db.contractSignatures = [];
    db.contractSignLinks = [];
    db.contractSignatureRequests = [];
  });
}

async function freeze() {
  const prepared = await prepareClinicalSignaturePackage({
    user: julianaUser,
    appointmentId: APPT_ID,
    budgetId: BUDGET_ID,
    patientId: PATIENT_ID,
    contractId: CONTRACT_ID,
  });
  expect(prepared.ok).toBe(true);
  return prepared;
}

function stroke(role, extra = {}) {
  return {
    signerName: role === 'PROFESSIONAL' ? 'Juliana de Oliveira Freire' : 'Clara Closel Franco Segal',
    signerRole: role,
    signerPersonId: role === 'PROFESSIONAL' ? JULIANA : PATIENT_ID,
    signatureImageDataUrl: 'data:image/png;base64,ck',
    ...extra,
  };
}

function ceremony() {
  return evaluateSignatureCeremony({
    tenantId: TENANT,
    patientId: PATIENT_ID,
    appointmentId: APPT_ID,
    budgetId: BUDGET_ID,
    contractId: CONTRACT_ID,
  });
}

function contractRow() {
  return loadDb().generatedContracts.find((c) => c.id === CONTRACT_ID);
}

function preservedControls() {
  const rows = loadDb().generatedContracts;
  const c3 = rows.find((c) => c.id === CTR00003);
  const c4 = rows.find((c) => c.id === CTR00004);
  expect(c3.documentHash).toBe('h3bb6313c');
  expect(c3.status).toBe(CONTRACT_STATUS.SIGNED);
  expect(c4.status).toBe(CONTRACT_STATUS.GENERATED);
  expect(c4.version).toBeUndefined();
}

describe('PHASE_10.21CK frozen document integrity before signature', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });

  it('A conteúdo atual = frozen contentHash → assinatura permitida', async () => {
    await freeze();
    const gate = await assertFrozenDocumentIntegrityBeforeSignature({ contract: contractRow() });
    expect(gate.ok).toBe(true);
    expect(gate.currentContentSha256).toBe(gate.frozenContentSha256);
    const signed = await signContractOnScreen(julianaUser, CONTRACT_ID, stroke('PROFESSIONAL'));
    expect(signed.signature.signerPersonId).toBe(JULIANA);
    expect(signed.contract.status).not.toBe(CONTRACT_STATUS.SIGNED);
  });

  it('B HTML alterado após freeze → FROZEN_DOCUMENT_CONTENT_MISMATCH', async () => {
    await freeze();
    withDb((db) => {
      const idx = db.generatedContracts.findIndex((c) => c.id === CONTRACT_ID);
      db.generatedContracts[idx] = {
        ...db.generatedContracts[idx],
        renderedHtml: '<p>HTML adulterado após freeze</p>',
        finalContent: '<p>HTML adulterado após freeze</p>',
      };
    });
    await expect(assertFrozenDocumentIntegrityBeforeSignature({ contract: contractRow() }))
      .rejects.toMatchObject({ code: FROZEN_DOCUMENT_CONTENT_MISMATCH });
    await expect(signContractOnScreen(julianaUser, CONTRACT_ID, stroke('PROFESSIONAL')))
      .rejects.toMatchObject({ code: FROZEN_DOCUMENT_CONTENT_MISMATCH });
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('C manifestHash alterado → bloqueado', async () => {
    await freeze();
    withDb((db) => {
      const idx = db.generatedContracts.findIndex((c) => c.id === CONTRACT_ID);
      const row = db.generatedContracts[idx];
      db.generatedContracts[idx] = {
        ...row,
        metadata: { ...row.metadata, packageManifestHash: 'ff'.repeat(32) },
      };
    });
    await expect(signContractOnScreen(julianaUser, CONTRACT_ID, stroke('PROFESSIONAL')))
      .rejects.toMatchObject({ code: FROZEN_MANIFEST_HASH_MISMATCH });
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('D packageManifestId divergente → bloqueado', async () => {
    await freeze();
    await expect(signContractOnScreen(julianaUser, CONTRACT_ID, stroke('PROFESSIONAL', {
      packageManifestId: 'pkgm_divergente',
    }))).rejects.toMatchObject({ code: FROZEN_MANIFEST_ID_MISMATCH });
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('E documentVersion divergente → bloqueado', async () => {
    await freeze();
    withDb((db) => {
      const manifest = db.clinicalPackageManifests[0];
      const doc = findFrozenContractServicesDocument(manifest);
      doc.documentVersion = '9';
    });
    const mutated = loadDb().clinicalPackageManifests[0];
    const newHash = await hashPackageManifestEntity(mutated);
    withDb((db) => {
      db.clinicalPackageManifests[0] = { ...db.clinicalPackageManifests[0], manifestHash: newHash, hash: newHash };
      const idx = db.generatedContracts.findIndex((c) => c.id === CONTRACT_ID);
      const row = db.generatedContracts[idx];
      db.generatedContracts[idx] = {
        ...row,
        metadata: { ...row.metadata, packageManifestHash: newHash },
      };
    });
    await expect(signContractOnScreen(julianaUser, CONTRACT_ID, stroke('PROFESSIONAL')))
      .rejects.toMatchObject({ code: FROZEN_DOCUMENT_VERSION_MISMATCH });
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('F contract.version ausente → bloqueado', async () => {
    await freeze();
    withDb((db) => {
      const idx = db.generatedContracts.findIndex((c) => c.id === CONTRACT_ID);
      const { version, ...rest } = db.generatedContracts[idx];
      void version;
      db.generatedContracts[idx] = rest;
    });
    await expect(signContractOnScreen(julianaUser, CONTRACT_ID, stroke('PROFESSIONAL')))
      .rejects.toMatchObject({ code: CONTRACT_VERSION_NOT_ESTABLISHED });
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('G/H on-screen e remote usam a mesma validação', async () => {
    const writer = readSrc('src/services/contractModuleService.js');
    expect(writer).toContain('assertFrozenDocumentIntegrityBeforeSignature');
    expect(writer).toMatch(/export async function signContractOnScreen[\s\S]*assertFrozenDocumentIntegrityBeforeSignature/);
    expect(writer).toMatch(/export async function signContractViaLink[\s\S]*await signContractOnScreen/);
    expect(readSrc('src/components/contracts/ContractSignModal.jsx')).toContain('await signContractOnScreen');
    expect(readSrc('src/pages/contratos/ContractSignPublicPage.jsx')).toContain('await signContractViaLink');

    await freeze();
    const sent = sendContractForSignature(julianaUser, CONTRACT_ID);
    withDb((db) => {
      const idx = db.generatedContracts.findIndex((c) => c.id === CONTRACT_ID);
      db.generatedContracts[idx] = {
        ...db.generatedContracts[idx],
        renderedHtml: '<p>tamper remote</p>',
        finalContent: '<p>tamper remote</p>',
      };
    });
    await expect(signContractViaLink(sent.link.token, {
      signerName: 'Clara Closel Franco Segal',
      signerCpf: '39053344705',
      signatureImageDataUrl: 'data:image/png;base64,ck-remote',
    })).rejects.toMatchObject({ code: FROZEN_DOCUMENT_CONTENT_MISMATCH });
    expect((loadDb().contractSignatures || []).filter((s) => s.signerRole === 'PATIENT')).toHaveLength(0);
  });

  it('I/J/K profissional existente intacto, paciente pending, sem segundo csig', async () => {
    await freeze();
    const first = await signContractOnScreen(julianaUser, CONTRACT_ID, stroke('PROFESSIONAL'));
    const snap = JSON.stringify(first.signature);
    const snapId = first.signature.id;
    await expect(signContractOnScreen(julianaUser, CONTRACT_ID, stroke('PROFESSIONAL', {
      signatureImageDataUrl: 'data:image/png;base64,ck-dup',
    }))).rejects.toThrow(/já assinou/i);
    const juliana = (loadDb().contractSignatures || []).filter((s) => s.signerRole === 'PROFESSIONAL');
    expect(juliana).toHaveLength(1);
    expect(juliana[0].id).toBe(snapId);
    expect(JSON.stringify(juliana[0])).toBe(snap);
    const snapCeremony = ceremony();
    expect(snapCeremony.status).toBe(CEREMONY_STATUS.PARTIALLY_SIGNED);
    expect(snapCeremony.satisfiedCount).toBe(1);
    expect(snapCeremony.requiredCount).toBe(2);
    expect((loadDb().contractSignatures || []).filter((s) => s.signerRole === 'PATIENT')).toHaveLength(0);
    expect(contractRow().status).not.toBe(CONTRACT_STATUS.SIGNED);
  });

  it('L CTR00003/00004 preservados', async () => {
    await freeze();
    await signContractOnScreen(julianaUser, CONTRACT_ID, stroke('PROFESSIONAL'));
    preservedControls();
  });
});
