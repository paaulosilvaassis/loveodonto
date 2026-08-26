/**
 * PHASE_10.21CH — freeze documentVersion fail-closed.
 * Sem criar manifesto em produção. Sem assinar. Sem e-mail.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { INITIAL_GENERATED_CONTRACT_VERSION } from '../contracts/generatedContractVersion.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import {
  createContractDraft,
  ensureContractsModuleSeeded,
  finalizeGeneratedContract,
} from '../services/contractModuleService.js';
import { getGeneratedContract } from '../services/contractService.js';
import { PackageManifestMemoryRepository } from '../domain/contracts/packages/package-manifest.repository.ts';
import {
  createPackageManifestFreezeService,
  evaluatePackageManifestSignGate,
} from '../domain/contracts/packages/package-manifest-freeze.service.ts';
import {
  PACKAGE_DOCUMENT_VERSION_MISSING,
  requireFreezeDocumentVersion,
} from '../domain/contracts/packages/package-manifest-document-version.ts';
import { freezeStagingClinicalPackageOnSend } from '../domain/contracts/staging/stagingClinicalPackageManifestBridge.js';
import { buildDocumentPackageForBudget } from '../services/operationalContractWizardService.js';

vi.mock('../domain/contracts/staging/staging-browser-test-mode.ts', () => ({
  isStagingTestModeEnabled: () => true,
}));

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-ch';
const user = { id: 'user-ch', name: 'Dr. CH', role: 'admin', tenant_id: TENANT, tenantId: TENANT };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function contractDoc(documentVersion, extra = {}) {
  return {
    operationalType: 'CONTRACT_SERVICES',
    title: 'Contrato de Prestação de Serviços',
    required: true,
    displayOrder: 1,
    presentedText: '<p>Contrato CH</p>',
    contentMimeType: 'text/html',
    sourceKind: 'CONTRACT_VERSION',
    sourceId: 'cv-ch',
    documentVersion,
    ...extra,
  };
}

async function freezeWith(documentVersion, extra = {}) {
  const freeze = createPackageManifestFreezeService({
    manifests: new PackageManifestMemoryRepository(),
  });
  return freeze.freezePackageForSignature({
    tenantId: TENANT,
    actorUserId: user.id,
    sourcePackageKey: 'pkg_ch',
    primaryContractId: 'c-ch',
    primaryContractVersionId: 'cv-ch',
    idempotencyKey: `idem-ch-${Math.random()}`,
    documents: [contractDoc(documentVersion, extra)],
  });
}

function seedClinical() {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Clínica CH', status: 'active' }];
    db.clinicProfile = { id: 'clinic-ch', razaoSocial: 'Clínica CH', tenant_id: TENANT };
    db.clinicDocumentation = {
      cnpj: '12345678000199',
      responsavelTecnico: 'Dr. CH',
      conselhoRegionalNumero: 'CRO-MG 1',
    };
    db.clinicAddresses = [{
      principal: true, logradouro: 'Rua CH', numero: '1', bairro: 'Centro',
      cidade: 'Belo Horizonte', uf: 'MG', cep: '30100000',
    }];
    db.patients = [{
      id: 'pat-ch', tenant_id: TENANT, full_name: 'Paciente CH',
      cpf: '52998224725', birth_date: '1990-01-01', sex: 'M',
    }];
    db.patientAddresses = [{
      patient_id: 'pat-ch', principal: true, logradouro: 'Rua Paciente',
      numero: '10', bairro: 'Savassi', cidade: 'Belo Horizonte', uf: 'MG',
    }];
    db.appointments = [{
      id: 'appt-ch', patientId: 'pat-ch', professionalId: 'col-ch',
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      appointmentId: 'appt-ch',
      patientId: 'pat-ch',
      budget: {
        id: 'budget-ch-clinical',
        budgetNumber: 'ORC-CH',
        status: BUDGET_STATUS.APROVADO,
        planName: 'Aplicação tópica de flúor',
        procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
        totalValue: 150,
        paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
      },
    }];
    return db;
  });
  ensureContractsModuleSeeded();
}

describe('PHASE_10.21CH freeze documentVersion fail-closed', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedClinical();
  });

  it('A — documentVersion "1" é aceito', async () => {
    const r = await freezeWith('1');
    expect(r.ok).toBe(true);
    expect(r.manifest.documents[0].documentVersion).toBe('1');
  });

  it('B — documentVersion numérico 1 normaliza para "1"', async () => {
    expect(requireFreezeDocumentVersion(1)).toBe('1');
    const r = await freezeWith(1);
    expect(r.ok).toBe(true);
    expect(r.manifest.documents[0].documentVersion).toBe('1');
  });

  it('C/D/E — undefined, null e "" bloqueiam freeze', async () => {
    for (const value of [undefined, null, '']) {
      expect(() => requireFreezeDocumentVersion(value)).toThrow();
      try {
        requireFreezeDocumentVersion(value);
      } catch (err) {
        expect(err.code).toBe(PACKAGE_DOCUMENT_VERSION_MISSING);
      }
      const r = await freezeWith(value);
      expect(r.ok).toBe(false);
      expect(r.errorCode).toBe(PACKAGE_DOCUMENT_VERSION_MISSING);
      expect(r.manifestId).toBeFalsy();
    }
  });

  it('F — templateVersion presente não substitui documentVersion ausente', async () => {
    const r = await freezeWith(undefined, { templateVersion: '9', manifestVersion: 3 });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe(PACKAGE_DOCUMENT_VERSION_MISSING);

    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-ch-template-only',
        clinicId: 'clinic-ch',
        patientId: 'pat-ch',
        quoteId: 'appt-ch',
        quoteSource: 'clinical_budget',
        budgetId: 'budget-ch-clinical',
        status: CONTRACT_STATUS.GENERATED,
        templateVersion: 9,
        renderedHtml: '<p>sem version persistida</p>',
        metadata: {},
      }];
    });
    const prepared = await prepareClinicalSignaturePackage({
      user,
      appointmentId: 'appt-ch',
      budgetId: 'budget-ch-clinical',
      patientId: 'pat-ch',
      contractId: 'gctr-ch-template-only',
    });
    expect(prepared.ok).toBe(false);
    expect(prepared.error).toMatch(/versão/i);
    expect(getGeneratedContract('gctr-ch-template-only').metadata?.packageManifestId).toBeFalsy();
  });

  it('G — contrato novo version=1 congela CONTRACT_SERVICES.documentVersion="1"', async () => {
    const tpl = withDb((db) => db.contractTemplates.find((t) => t.type === 'system_default'));
    const draft = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: 'appt-ch',
      patientId: 'pat-ch',
      budgetId: 'budget-ch-clinical',
      templateId: tpl.id,
      editedHtml: '<p>Contrato CH flúor</p>',
      skipHashtagValidation: true,
    });
    expect(draft.version).toBe(INITIAL_GENERATED_CONTRACT_VERSION);
    const finalized = finalizeGeneratedContract(user, draft.id);
    expect(finalized.version).toBe(1);

    const pkg = buildDocumentPackageForBudget({
      appointmentId: 'appt-ch',
      budgetId: 'budget-ch-clinical',
      patientId: 'pat-ch',
    });
    const contractItem = pkg.items.find((i) => i.documentType === 'CONTRACT_SERVICES');
    expect(contractItem.version).toBe('1');

    const prepared = await prepareClinicalSignaturePackage({
      user,
      appointmentId: 'appt-ch',
      budgetId: 'budget-ch-clinical',
      patientId: 'pat-ch',
      contractId: draft.id,
    });
    expect(prepared.ok).toBe(true);
    const frozen = (loadDb().clinicalPackageManifests || [])[0];
    const contractDocRow = (frozen?.documents || []).find(
      (d) => d.documentType === 'SERVICE_CONTRACT' || d.documentKey === 'contract',
    );
    expect(String(contractDocRow?.documentVersion)).toBe('1');
    const lgpd = (frozen?.documents || []).find((d) => d.documentType === 'LGPD_TERM' || d.documentKey === 'lgpd');
    expect(lgpd.documentVersion).toBe('lgpd_clinic_policy_v1');
    expect(lgpd.documentVersion).not.toBe('1');
  });

  it('H — contrato sem version persistida bloqueia antes do manifesto', async () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-ch-no-version',
        clinicId: 'clinic-ch',
        patientId: 'pat-ch',
        quoteId: 'appt-ch',
        quoteSource: 'clinical_budget',
        budgetId: 'budget-ch-clinical',
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>legado</p>',
        metadata: {},
      }];
      db.clinicalPackageManifests = [];
    });
    const prepared = await prepareClinicalSignaturePackage({
      user,
      appointmentId: 'appt-ch',
      budgetId: 'budget-ch-clinical',
      patientId: 'pat-ch',
      contractId: 'gctr-ch-no-version',
    });
    expect(prepared.ok).toBe(false);
    expect(prepared.error).toMatch(/versão/i);
    expect((loadDb().clinicalPackageManifests || []).length).toBe(0);
    expect(getGeneratedContract('gctr-ch-no-version').metadata?.packageManifestId).toBeFalsy();
  });

  it('I — writer de freeze não contém fallback literal \'1\'', () => {
    const freezeSrc = readSrc('src/domain/contracts/packages/package-manifest-freeze.service.ts');
    const helperSrc = readSrc('src/domain/contracts/packages/package-manifest-document-version.ts');
    const clinicalSrc = readSrc('src/services/clinicalSignaturePackageService.js');
    const stagingSrc = readSrc('src/domain/contracts/staging/stagingClinicalPackageManifestBridge.js');
    const wizardSrc = readSrc('src/services/operationalContractWizardService.js');
    expect(freezeSrc).not.toMatch(/documentVersion\s*\|\|\s*['"]1['"]/);
    expect(freezeSrc).toContain('requireFreezeDocumentVersion');
    expect(helperSrc).not.toMatch(/['"]1['"]\s*\)/);
    expect(helperSrc).toContain(PACKAGE_DOCUMENT_VERSION_MISSING);
    expect(clinicalSrc).toContain('requirePersistedContractVersion(contract)');
    expect(clinicalSrc).not.toMatch(/templateVersion\s*\|\|/);
    expect(stagingSrc).toContain('requirePersistedContractVersion(contract)');
    expect(stagingSrc).not.toMatch(/templateVersion\s*\|\|\s*['"]1['"]/);
    expect(wizardSrc).not.toMatch(/templateVersion\s*\|\|\s*contract\?\.version\s*\|\|\s*['"]1['"]/);
    expect(wizardSrc).toContain('DISPLAY_ONLY');
  });

  it('J — reader legado avalia manifesto histórico; novo freeze inseguro continua bloqueado', async () => {
    const historical = {
      id: 'pkgm-legacy',
      status: 'FROZEN',
      manifestHash: 'ab'.repeat(32),
      documents: [{
        id: 'doc-legacy',
        documentKey: 'contract',
        documentType: 'SERVICE_CONTRACT',
        documentVersion: '1',
        required: true,
        contentHash: 'cd'.repeat(32),
      }],
    };
    const gate = evaluatePackageManifestSignGate({
      manifest: historical,
      envelopeManifestHash: historical.manifestHash,
      acceptances: [{
        manifestDocumentId: 'doc-legacy',
        acceptedAt: '2026-01-01T00:00:00.000Z',
        contentHash: 'cd'.repeat(32),
      }],
    });
    expect(gate.hasManifest).toBe(true);
    expect(gate.canSign).toBe(true);

    const blocked = await freezeWith(undefined);
    expect(blocked.ok).toBe(false);
    expect(blocked.errorCode).toBe(PACKAGE_DOCUMENT_VERSION_MISSING);
  });

  it('staging com apenas templateVersion não congela', async () => {
    const result = await freezeStagingClinicalPackageOnSend({
      user,
      contract: {
        id: 'gctr-ch-stg',
        templateVersion: 1,
        renderedHtml: '<p>staging</p>',
        metadata: { attachedTcleIds: ['tcle_implante'] },
      },
      request: { id: 'csreq-ch' },
      link: { token: 'csgn-ch' },
    });
    expect(result.ok).toBe(false);
    expect(String(result.error || result.errorCode)).toMatch(/versão|VERSION/i);
  });
});
