/**
 * PHASE_10.21AB — Staging bridge: clinical send freezes OPTION_C package.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import {
  freezeStagingClinicalPackageOnSend,
  getStagingPublicPackageByToken,
  recordStagingPackageAcceptance,
  evaluateStagingPackageSignGate,
  listStagingPackageDocMeta,
} from '../domain/contracts/staging/stagingClinicalPackageManifestBridge.js';
import { LGPD_CLINIC_POLICY_VERSION } from '../domain/contracts/packages/package-manifest-lgpd.ts';

vi.mock('../domain/contracts/staging/staging-browser-test-mode.ts', () => ({
  isStagingTestModeEnabled: () => true,
}));

const user = {
  id: 'u-ab',
  role: 'admin',
  isMaster: true,
  tenant_id: 'tenant-ab-staging',
};

describe('PHASE_10.21AB staging clinical package manifest bridge', () => {
  beforeEach(() => {
    initDb();
    resetDb();
    withDb((db) => {
      db.clinicProfile = { ...(db.clinicProfile || {}), id: 'clinic-ab', tenant_id: 'tenant-ab-staging' };
      db.generatedContracts = [{
        id: 'gctr-ab',
        clinicId: 'clinic-ab',
        patientId: 'patient-ab',
        quoteId: 'appt-ab',
        quoteSource: 'clinical_budget',
        budgetId: 'budget-ab',
        templateVersion: 1,
        contractNumber: 'CTR-2026-00042',
        finalContent: '<p>Contrato AB</p>',
        renderedHtml: '<p>Contrato AB · R$ 1.000,00</p>',
        status: 'generated',
        metadata: { attachedTcleIds: ['tcle_implante'] },
      }];
      return db;
    });
  });

  afterEach(() => {
    resetDb();
  });

  it('freeze creates CONTRACT+TCLE+LGPD with real LGPD version hash', async () => {
    const contract = { id: 'gctr-ab', patientId: 'patient-ab', quoteId: 'appt-ab', budgetId: 'budget-ab', renderedHtml: '<p>Contrato AB</p>', finalContent: '<p>Contrato AB</p>', templateVersion: 1, metadata: { attachedTcleIds: ['tcle_implante'] } };
    const result = await freezeStagingClinicalPackageOnSend({
      user,
      contract,
      request: { id: 'csreq-ab' },
      link: { token: 'csgn-ab-token' },
    });
    expect(result.ok).toBe(true);
    expect(result.manifestId).toBeTruthy();
    expect(result.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.canonicalizationVersion).toBe('pkg_manifest_v1');

    const meta = listStagingPackageDocMeta('csgn-ab-token');
    expect(meta).toHaveLength(3);
    expect(meta.map((m) => m.documentType).sort()).toEqual(expect.arrayContaining([
      'SERVICE_CONTRACT',
      'IMPLANT_CONSENT',
      'LGPD_TERM',
    ]));
    expect(meta.every((m) => m.hashPresent)).toBe(true);
    const lgpd = meta.find((m) => m.documentType === 'LGPD_TERM');
    expect(lgpd.version).toBe(LGPD_CLINIC_POLICY_VERSION);

    const pkg = getStagingPublicPackageByToken('csgn-ab-token');
    expect(pkg.publicDocs.every((d) => d.snapshotHtml)).toBe(true);
  });

  it('sign gate blocks until all required acceptances; idempotent accept', async () => {
    const contract = { id: 'gctr-ab', patientId: 'patient-ab', quoteId: 'appt-ab', budgetId: 'budget-ab', renderedHtml: '<p>C</p>', finalContent: '<p>C</p>', templateVersion: 1, metadata: { attachedTcleIds: ['tcle_implante'] } };
    await freezeStagingClinicalPackageOnSend({
      user,
      contract,
      request: { id: 'csreq-ab2' },
      link: { token: 'csgn-gate' },
    });

    let gate = evaluateStagingPackageSignGate('csgn-gate');
    expect(gate.canSign).toBe(false);

    const pkg = getStagingPublicPackageByToken('csgn-gate');
    for (const doc of pkg.manifest.documents.filter((d) => d.required)) {
      const first = await recordStagingPackageAcceptance({ token: 'csgn-gate', documentId: doc.id });
      expect(first.ok).toBe(true);
      const second = await recordStagingPackageAcceptance({ token: 'csgn-gate', documentId: doc.id });
      expect(second.ok).toBe(true);
      expect(second.duplicate).toBe(true);
    }

    gate = evaluateStagingPackageSignGate('csgn-gate');
    expect(gate.canSign).toBe(true);
  });
});
