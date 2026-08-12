/**
 * PHASE_10.21U — Package cryptographic manifest implementation tests.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  hashPresentedTextContentV1,
  hashPackageManifest,
  buildPackageManifestHashInput,
} from '../domain/contracts/packages/package-manifest-hash.ts';
import {
  PackageManifestMemoryRepository,
  PackageDocumentAcceptanceMemoryRepository,
} from '../domain/contracts/packages/package-manifest.repository.ts';
import { createPackageManifestFreezeService, evaluatePackageManifestSignGate } from '../domain/contracts/packages/package-manifest-freeze.service.ts';
import { createPackageManifestAcceptanceService } from '../domain/contracts/packages/package-manifest-acceptance.service.ts';
import {
  LGPD_CLINIC_POLICY_TEXT_V1,
  resolveLgpdPresentedContent,
} from '../domain/contracts/packages/package-manifest-lgpd.ts';
import { buildSignatureEvidenceReport, evidenceReportToPrintableHtml } from '../domain/contracts/artifacts/signature-evidence-report.ts';
import { SignatureEnvelopeMemoryRepository } from '../domain/contracts/signatures/signature-memory.repository.ts';
import { buildPublicPackageDocumentsFromManifest } from '../components/contracts/public/PublicPackageManifestDocuments.jsx';

const ROOT = process.cwd();
const M036 = resolve(ROOT, 'supabase/migrations/036_app_package_manifest_foundation.sql');

function baseDocs(overrides = {}) {
  return [
    {
      operationalType: 'CONTRACT_SERVICES',
      title: 'Contrato de Prestação de Serviços',
      required: true,
      displayOrder: 1,
      presentedText: overrides.contractText || '<p>Contrato A</p>',
      contentMimeType: 'text/html',
      sourceKind: 'CONTRACT_VERSION',
      sourceId: 'cv1',
      documentVersion: '1',
    },
    {
      operationalType: 'TCLE',
      tcleId: 'tcle_implante',
      title: 'TCLE — Implantes',
      required: true,
      displayOrder: 2,
      presentedText: overrides.tcleText || 'TCLE implante v1',
      contentMimeType: 'text/html',
      sourceKind: 'DOCUMENT_RECORD',
      sourceId: 'doc_tcle_1',
      documentVersion: '1',
    },
    {
      operationalType: 'LGPD',
      title: 'LGPD / Privacidade',
      required: true,
      displayOrder: 3,
      presentedText: overrides.lgpdText || undefined,
      contentMimeType: 'text/plain',
      sourceKind: 'CLINIC_POLICY',
      sourceId: 'lgpd_clinic_policy_v1',
      documentVersion: 'lgpd_clinic_policy_v1',
    },
  ];
}

describe('PHASE_10.21U — package cryptographic manifest', () => {
  it('036 existe e bloqueia production; libera staging/local', () => {
    expect(existsSync(M036)).toBe(true);
    const sql = readFileSync(M036, 'utf8');
    expect(sql).toContain('app_package_manifests');
    expect(sql).toMatch(/DO NOT APPLY to production/i);
    expect(sql).toContain('app_package_document_acceptances');
    expect(sql).toContain('package_manifest_id');
  });

  it('canonicalization: mesmo conteúdo → mesmo hash', async () => {
    const a = await hashPresentedTextContentV1('Hello\r\nWorld');
    const b = await hashPresentedTextContentV1('Hello\nWorld');
    expect(a).toBe(b);
  });

  it('alteração TCLE / LGPD / contrato muda hashes e manifestHash', async () => {
    const freezeA = createPackageManifestFreezeService({
      manifests: new PackageManifestMemoryRepository(),
    });
    const r1 = await freezeA.freezePackageForSignature({
      tenantId: 't1',
      actorUserId: 'u1',
      sourcePackageKey: 'pkg_budget_1',
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      idempotencyKey: 'idem-1',
      documents: baseDocs(),
    });
    expect(r1.ok).toBe(true);

    const freezeB = createPackageManifestFreezeService({
      manifests: new PackageManifestMemoryRepository(),
    });
    const r2 = await freezeB.freezePackageForSignature({
      tenantId: 't1',
      actorUserId: 'u1',
      sourcePackageKey: 'pkg_budget_1',
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      idempotencyKey: 'idem-2',
      documents: baseDocs({ tcleText: 'TCLE alterado' }),
    });
    expect(r2.manifestHash).not.toBe(r1.manifestHash);

    const freezeC = createPackageManifestFreezeService({
      manifests: new PackageManifestMemoryRepository(),
    });
    const r3 = await freezeC.freezePackageForSignature({
      tenantId: 't1',
      actorUserId: 'u1',
      sourcePackageKey: 'pkg_budget_1',
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      idempotencyKey: 'idem-3',
      documents: baseDocs({ lgpdText: 'LGPD custom diferente' }),
    });
    expect(r3.manifestHash).not.toBe(r1.manifestHash);

    const freezeD = createPackageManifestFreezeService({
      manifests: new PackageManifestMemoryRepository(),
    });
    const r4 = await freezeD.freezePackageForSignature({
      tenantId: 't1',
      actorUserId: 'u1',
      sourcePackageKey: 'pkg_budget_1',
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      idempotencyKey: 'idem-4',
      documents: baseDocs({ contractText: '<p>Contrato B</p>' }),
    });
    expect(r4.manifestHash).not.toBe(r1.manifestHash);
  });

  it('remoção/adição de documento muda manifestHash', async () => {
    const docs = baseDocs();
    const h1 = await hashPackageManifest(buildPackageManifestHashInput({
      tenantId: 't1',
      sourcePackageKey: 'pkg',
      manifestVersion: 1,
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      canonicalizationVersion: 'pkg_manifest_v1',
      documents: [
        {
          documentKey: 'contract',
          documentType: 'SERVICE_CONTRACT',
          documentVersion: '1',
          required: true,
          displayOrder: 1,
          contentHash: await hashPresentedTextContentV1('A'),
          contentMimeType: 'text/html',
        },
        {
          documentKey: 'lgpd',
          documentType: 'LGPD_TERM',
          documentVersion: '1',
          required: true,
          displayOrder: 2,
          contentHash: await hashPresentedTextContentV1('L'),
          contentMimeType: 'text/plain',
        },
      ],
    }));
    const h2 = await hashPackageManifest(buildPackageManifestHashInput({
      tenantId: 't1',
      sourcePackageKey: 'pkg',
      manifestVersion: 1,
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      canonicalizationVersion: 'pkg_manifest_v1',
      documents: [
        {
          documentKey: 'contract',
          documentType: 'SERVICE_CONTRACT',
          documentVersion: '1',
          required: true,
          displayOrder: 1,
          contentHash: await hashPresentedTextContentV1('A'),
          contentMimeType: 'text/html',
        },
      ],
    }));
    expect(h1).not.toBe(h2);
    expect(docs.length).toBe(3);
  });

  it('freeze + imutabilidade + idempotência', async () => {
    const manifests = new PackageManifestMemoryRepository();
    const svc = createPackageManifestFreezeService({ manifests });
    const input = {
      tenantId: 't1',
      actorUserId: 'u1',
      sourcePackageKey: 'pkg_x',
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      idempotencyKey: 'idem-freeze-1',
      documents: baseDocs(),
    };
    const first = await svc.freezePackageForSignature(input);
    expect(first.ok).toBe(true);
    expect(first.manifest.status).toBe('FROZEN');
    expect(first.manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);

    const replay = await svc.freezePackageForSignature(input);
    expect(replay.ok).toBe(true);
    expect(replay.duplicate).toBe(true);
    expect(replay.manifestId).toBe(first.manifestId);

    await expect(
      manifests.update('t1', {
        ...first.manifest,
        manifestHash: '0'.repeat(64),
      }),
    ).rejects.toThrow(/IMMUTABLE/);
  });

  it('acceptances idempotentes + sign gate', async () => {
    const manifests = new PackageManifestMemoryRepository();
    const acceptances = new PackageDocumentAcceptanceMemoryRepository();
    const freeze = createPackageManifestFreezeService({ manifests });
    const acceptSvc = createPackageManifestAcceptanceService({ manifests, acceptances });

    const frozen = await freeze.freezePackageForSignature({
      tenantId: 't1',
      actorUserId: 'u1',
      sourcePackageKey: 'pkg_y',
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      idempotencyKey: 'idem-acc-1',
      documents: baseDocs(),
    });

    const doc = frozen.manifest.documents[0];
    const a1 = await acceptSvc.markAccepted({
      tenantId: 't1',
      manifestId: frozen.manifestId,
      manifestDocumentId: doc.id,
      envelopeId: 'env1',
      signerId: 'sig1',
    });
    expect(a1.ok).toBe(true);
    const a2 = await acceptSvc.markAccepted({
      tenantId: 't1',
      manifestId: frozen.manifestId,
      manifestDocumentId: doc.id,
      envelopeId: 'env1',
      signerId: 'sig1',
    });
    expect(a2.duplicate).toBe(true);
    expect(a2.acceptance.id).toBe(a1.acceptance.id);

    const gateEmpty = evaluatePackageManifestSignGate({
      manifest: frozen.manifest,
      envelopeManifestHash: frozen.manifestHash,
      acceptances: [],
    });
    expect(gateEmpty.canSign).toBe(false);

    const allAcc = [];
    for (const d of frozen.manifest.documents.filter((x) => x.required)) {
      const r = await acceptSvc.markAccepted({
        tenantId: 't1',
        manifestId: frozen.manifestId,
        manifestDocumentId: d.id,
        envelopeId: 'env1',
        signerId: 'sig1',
      });
      allAcc.push(r.acceptance);
    }
    const gateOk = evaluatePackageManifestSignGate({
      manifest: frozen.manifest,
      envelopeManifestHash: frozen.manifestHash,
      acceptances: allAcc,
    });
    expect(gateOk.canSign).toBe(true);
  });

  it('LGPD usa conteúdo versionado (não hash estático)', async () => {
    const resolved = resolveLgpdPresentedContent();
    expect(resolved.presentedText).toContain('LGPD');
    expect(resolved.presentedText).toBe(LGPD_CLINIC_POLICY_TEXT_V1);
    const h1 = await hashPresentedTextContentV1(resolved.presentedText);
    const h2 = await hashPresentedTextContentV1(`${resolved.presentedText}\nextra`);
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe('term_lgpd_notice_v1');
  });

  it('tenant isolation: A não lê manifesto B', async () => {
    const manifests = new PackageManifestMemoryRepository();
    const freeze = createPackageManifestFreezeService({ manifests });
    const r = await freeze.freezePackageForSignature({
      tenantId: 'tenant-a',
      actorUserId: 'u1',
      sourcePackageKey: 'pkg',
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      idempotencyKey: 'idem-tenant',
      documents: baseDocs(),
    });
    const fromB = await manifests.findById('tenant-b', r.manifestId);
    expect(fromB).toBeNull();
  });

  it('bind envelope + evidence report package-aware + legacy sem package', async () => {
    const manifests = new PackageManifestMemoryRepository();
    const envelopes = new SignatureEnvelopeMemoryRepository();
    const freeze = createPackageManifestFreezeService({ manifests, envelopes });
    const frozen = await freeze.freezePackageForSignature({
      tenantId: 't1',
      actorUserId: 'u1',
      sourcePackageKey: 'pkg_ev',
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      idempotencyKey: 'idem-ev',
      documents: baseDocs(),
    });

    await envelopes.create('t1', {
      id: 'env1',
      tenantId: 't1',
      contractId: 'c1',
      contractVersionId: 'cv1',
      status: 'COMPLETED',
      provider: 'internal',
      documentHashBeforeSigning: 'a'.repeat(64),
      createdBy: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T01:00:00.000Z',
      rowVersion: 1,
    });

    const bind = await freeze.bindManifestToEnvelope({
      tenantId: 't1',
      envelopeId: 'env1',
      manifestId: frozen.manifestId,
      expectedManifestHash: frozen.manifestHash,
    });
    expect(bind.ok).toBe(true);

    const env = await envelopes.findById('t1', 'env1');
    const report = await buildSignatureEvidenceReport({
      envelope: env,
      signers: [{
        id: 's1',
        tenantId: 't1',
        envelopeId: 'env1',
        signerOrder: 1,
        signerRole: 'PATIENT',
        name: 'Paciente Teste',
        status: 'SIGNED',
        required: true,
        signedAt: '2026-01-01T01:00:00.000Z',
        acceptedTerms: [],
      }],
      policy: null,
      evidences: [{
        signerId: 's1',
        evidenceHash: 'b'.repeat(64),
        packageManifestId: frozen.manifestId,
        packageManifestHash: frozen.manifestHash,
        documentAcceptances: frozen.manifest.documents.map((d) => ({
          documentKey: d.documentKey,
          documentType: d.documentType,
          documentVersion: d.documentVersion,
          contentHash: d.contentHash,
          required: d.required,
          acceptedAt: '2026-01-01T00:50:00.000Z',
        })),
      }],
      contractNumber: 'CT-1',
    });
    expect(report.packageSigned?.packageManifestHash).toBe(frozen.manifestHash);
    expect(evidenceReportToPrintableHtml(report)).toContain('PACOTE ASSINADO');

    // Legacy: sem manifesto
    const legacyEnv = {
      ...env,
      packageManifestId: undefined,
      packageManifestHash: undefined,
      id: 'env-legacy',
    };
    const legacy = await buildSignatureEvidenceReport({
      envelope: legacyEnv,
      signers: [{
        id: 's1',
        tenantId: 't1',
        envelopeId: 'env-legacy',
        signerOrder: 1,
        signerRole: 'PATIENT',
        name: 'Paciente',
        status: 'SIGNED',
        required: true,
        signedAt: '2026-01-01T01:00:00.000Z',
        acceptedTerms: [],
      }],
      policy: null,
      evidences: [{ signerId: 's1', evidenceHash: 'c'.repeat(64) }],
      contractNumber: 'CT-LEG',
    });
    expect(legacy.packageSigned).toBeUndefined();
  });

  it('public package docs builder usa snapshot do manifesto', async () => {
    const manifests = new PackageManifestMemoryRepository();
    const snapshots = new Map();
    const freeze = createPackageManifestFreezeService({ manifests, snapshots });
    const frozen = await freeze.freezePackageForSignature({
      tenantId: 't1',
      actorUserId: 'u1',
      sourcePackageKey: 'pkg_ui',
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      idempotencyKey: 'idem-ui',
      documents: baseDocs({ contractText: '<p>Snap contrato</p>' }),
    });
    const docs = buildPublicPackageDocumentsFromManifest(frozen.manifest, snapshots);
    expect(docs[0].title).toMatch(/Contrato/i);
    expect(docs[0].snapshotHtml).toContain('Snap contrato');
  });
});
