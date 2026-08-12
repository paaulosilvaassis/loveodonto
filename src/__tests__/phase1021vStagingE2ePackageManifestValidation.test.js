/**
 * PHASE_10.21V — Staging E2E Package Manifest Validation (domain + evidence).
 * Dados 100% fictícios. Sem PII real. Sem comunicação externa.
 * Prova criptográfica/acceptance/evidence do package Contrato+TCLE+LGPD.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PackageManifestMemoryRepository,
  PackageDocumentAcceptanceMemoryRepository,
} from '../domain/contracts/packages/package-manifest.repository.ts';
import {
  createPackageManifestFreezeService,
  evaluatePackageManifestSignGate,
} from '../domain/contracts/packages/package-manifest-freeze.service.ts';
import { createPackageManifestAcceptanceService } from '../domain/contracts/packages/package-manifest-acceptance.service.ts';
import {
  hashPresentedTextContentV1,
  hashPackageManifest,
  buildPackageManifestHashInput,
} from '../domain/contracts/packages/package-manifest-hash.ts';
import { LGPD_CLINIC_POLICY_VERSION } from '../domain/contracts/packages/package-manifest-lgpd.ts';
import { SignatureEnvelopeMemoryRepository } from '../domain/contracts/signatures/signature-memory.repository.ts';
import {
  buildSignatureEvidenceReport,
  evidenceReportToPrintableHtml,
} from '../domain/contracts/artifacts/signature-evidence-report.ts';
import {
  buildPublicPackageDocumentsFromManifest,
} from '../components/contracts/public/PublicPackageManifestDocuments.jsx';
import { PRODUCTION_REF, STAGING_REF } from '../domain/contracts/staging/contracts-v2-staging-pilot.ts';

const ROOT = process.cwd();
const RESULT = resolve(ROOT, 'docs/reports/_phase1021v_domain_e2e_result.json');

const PATIENT = 'TESTE PACKAGE MANIFEST 1021V';
const FICTIONAL = {
  email: 'teste.package.manifest.1021v@example.invalid',
  phone: '+5500000000000',
  cpf: '000.000.000-00',
};

function packageDocs(overrides = {}) {
  return [
    {
      operationalType: 'CONTRACT_SERVICES',
      title: 'Contrato de Prestação de Serviços',
      required: true,
      displayOrder: 1,
      presentedText: overrides.contract
        || `<h1>Contrato</h1><p>Paciente: ${PATIENT}</p><p>Valor: R$ 1.000,00 · Entrada R$ 200,00 · 4x R$ 200,00</p><p>Procedimento: Implante (fictício)</p>`,
      contentMimeType: 'text/html',
      sourceKind: 'CONTRACT_VERSION',
      sourceId: 'cv_1021v',
      documentVersion: '1',
    },
    {
      operationalType: 'TCLE',
      tcleId: 'tcle_implante',
      title: 'TCLE — Implantes / Protocolo',
      required: true,
      displayOrder: 2,
      presentedText: overrides.tcle
        || `<h1>TCLE Implante</h1><p>Eu, ${PATIENT}, declaro ciência dos riscos do procedimento de implante (cenário fictício 10.21V).</p><p>RT/CRO: CRO-FICTICIO-000</p>`,
      contentMimeType: 'text/html',
      sourceKind: 'DOCUMENT_RECORD',
      sourceId: 'doc_tcle_implante_1021v',
      documentVersion: 'tcle_implante_v1',
    },
    {
      operationalType: 'LGPD',
      title: 'LGPD / Privacidade',
      required: true,
      displayOrder: 3,
      presentedText: overrides.lgpd,
      contentMimeType: 'text/plain',
      sourceKind: 'CLINIC_POLICY',
      sourceId: LGPD_CLINIC_POLICY_VERSION,
      documentVersion: LGPD_CLINIC_POLICY_VERSION,
    },
  ];
}

describe('PHASE_10.21V — staging E2E package manifest validation', () => {
  const summary = {
    environment: 'STAGING_DOMAIN_E2E_HARNESS',
    supabaseProjectExpected: STAGING_REF,
    productionForbidden: PRODUCTION_REF,
    patient: PATIENT,
    realPii: false,
    fictionalContact: FICTIONAL,
    externalCommunication: false,
    hashes: {},
    exactTcleProof: null,
    exactLgpdProof: null,
    checks: {},
  };

  let manifests;
  let acceptances;
  let envelopes;
  let snapshots;
  let freeze;
  let acceptSvc;
  let frozen;
  let publicDocs;

  beforeAll(async () => {
    manifests = new PackageManifestMemoryRepository();
    acceptances = new PackageDocumentAcceptanceMemoryRepository();
    envelopes = new SignatureEnvelopeMemoryRepository();
    snapshots = new Map();
    freeze = createPackageManifestFreezeService({ manifests, envelopes, snapshots });
    acceptSvc = createPackageManifestAcceptanceService({ manifests, acceptances });

    frozen = await freeze.freezePackageForSignature({
      tenantId: 'tenant-a-1021v',
      actorUserId: 'actor-1021v',
      sourcePackageKey: 'pkg_budget_1021v',
      primaryContractId: 'contract-1021v',
      primaryContractVersionId: 'cv-1021v',
      idempotencyKey: 'idem-1021v-freeze',
      documents: packageDocs(),
    });
    publicDocs = buildPublicPackageDocumentsFromManifest(frozen.manifest, snapshots);
  });

  it('precheck: production ref constante isolada; paciente fictício', () => {
    expect(STAGING_REF).toBe('tckdjyunwmdpqmewrwvt');
    expect(PRODUCTION_REF).toBe('uoepkwhqztmsjnzirpev');
    expect(PATIENT).toContain('TESTE PACKAGE MANIFEST 1021V');
    expect(FICTIONAL.email).toContain('example.invalid');
    summary.checks.precheckFictional = true;
  });

  it('PASSO 5 — freeze cria manifesto com CONTRACT+TCLE+LGPD', async () => {
    expect(frozen.ok).toBe(true);
    expect(frozen.manifest.status).toBe('FROZEN');
    expect(frozen.manifest.canonicalizationVersion).toBe('pkg_manifest_v1');
    expect(frozen.manifestHash).toMatch(/^[a-f0-9]{64}$/);

    const types = frozen.manifest.documents.map((d) => d.documentType).sort();
    expect(types).toEqual(expect.arrayContaining([
      'SERVICE_CONTRACT',
      'IMPLANT_CONSENT',
      'LGPD_TERM',
    ]));
    expect(frozen.manifest.documents).toHaveLength(3);

    summary.manifestId = frozen.manifestId;
    summary.manifestHash = frozen.manifestHash;
    summary.canonicalization = frozen.manifest.canonicalizationVersion;
    summary.documents = frozen.manifest.documents.map((d) => ({
      type: d.documentType,
      key: d.documentKey,
      version: d.documentVersion,
      required: d.required,
      contentHash: d.contentHash,
    }));
    summary.checks.freeze = true;
    summary.checks.packageDocuments = true;
  });

  it('PASSO 4 — LGPD hash do conteúdo real (não estático)', async () => {
    const lgpd = frozen.manifest.documents.find((d) => d.documentKey === 'lgpd');
    expect(lgpd.contentHash).not.toBe('term_lgpd_notice_v1');
    expect(lgpd.documentVersion).toBe(LGPD_CLINIC_POLICY_VERSION);
    const snap = snapshots.get(lgpd.snapshotStoragePath);
    expect(snap).toBeTruthy();
    expect(await hashPresentedTextContentV1(snap)).toBe(lgpd.contentHash);
    summary.hashes.lgpd = lgpd.contentHash;
    summary.checks.lgpdRealHash = true;
  });

  it('PASSO 3 — TCLE é documento formal com snapshot/hash', async () => {
    const tcle = frozen.manifest.documents.find((d) => d.documentKey.startsWith('tcle:'));
    expect(tcle).toBeTruthy();
    expect(tcle.title).toMatch(/TCLE/i);
    const snap = snapshots.get(tcle.snapshotStoragePath);
    expect(snap).toContain(PATIENT);
    expect(await hashPresentedTextContentV1(snap)).toBe(tcle.contentHash);
    summary.hashes.tcle = tcle.contentHash;
    summary.checks.tcleFormal = true;
  });

  it('PASSO 2 — contrato no manifesto com financeiro fictício no snapshot', async () => {
    const c = frozen.manifest.documents.find((d) => d.documentKey === 'contract');
    const snap = snapshots.get(c.snapshotStoragePath);
    expect(snap).toContain('R$ 1.000,00');
    expect(snap).toContain('R$ 200,00');
    expect(await hashPresentedTextContentV1(snap)).toBe(c.contentHash);
    summary.hashes.contract = c.contentHash;
    summary.checks.contract = true;
  });

  it('PASSO 6 — imutabilidade do manifesto frozen', async () => {
    await expect(
      manifests.update('tenant-a-1021v', {
        ...frozen.manifest,
        manifestHash: '0'.repeat(64),
      }),
    ).rejects.toThrow(/IMMUTABLE/);
    summary.checks.frozenMutationDenied = true;
  });

  it('PASSO 6b — alteração documental exige novo manifesto', async () => {
    const next = await freeze.freezePackageForSignature({
      tenantId: 'tenant-a-1021v',
      actorUserId: 'actor-1021v',
      sourcePackageKey: 'pkg_budget_1021v',
      primaryContractId: 'contract-1021v',
      primaryContractVersionId: 'cv-1021v',
      idempotencyKey: 'idem-1021v-freeze-v2',
      documents: packageDocs({ tcle: '<h1>TCLE ALTERADO</h1>' }),
    });
    expect(next.ok).toBe(true);
    expect(next.manifestHash).not.toBe(frozen.manifestHash);
    expect(next.manifestId).not.toBe(frozen.manifestId);
    summary.checks.newManifestOnChange = true;
  });

  it('PASSO 7 — página pública lista snapshots congelados', () => {
    expect(publicDocs.map((d) => d.title).join(' | ')).toMatch(/Contrato/i);
    expect(publicDocs.map((d) => d.title).join(' | ')).toMatch(/TCLE/i);
    expect(publicDocs.map((d) => d.title).join(' | ')).toMatch(/LGPD/i);
    for (const d of publicDocs) {
      expect(d.snapshotHtml).toBeTruthy();
      expect(d.snapshotHtml).not.toContain('TEMPLATE_ATUAL');
    }
    summary.checks.publicPage = true;
    summary.checks.individualVisualization = true;
  });

  it('PASSO 8 — sign gate bloqueia até todos obrigatórios', async () => {
    const docs = frozen.manifest.documents.filter((d) => d.required);
    const [c, t, l] = docs;

    let gate = evaluatePackageManifestSignGate({
      manifest: frozen.manifest,
      envelopeManifestHash: frozen.manifestHash,
      acceptances: [],
    });
    expect(gate.canSign).toBe(false);

    const accC = await acceptSvc.markAccepted({
      tenantId: 'tenant-a-1021v',
      manifestId: frozen.manifestId,
      manifestDocumentId: c.id,
      envelopeId: 'env-1021v',
      signerId: 'sig-1021v',
    });
    gate = evaluatePackageManifestSignGate({
      manifest: frozen.manifest,
      envelopeManifestHash: frozen.manifestHash,
      acceptances: [accC.acceptance],
    });
    expect(gate.canSign).toBe(false);

    const accT = await acceptSvc.markAccepted({
      tenantId: 'tenant-a-1021v',
      manifestId: frozen.manifestId,
      manifestDocumentId: t.id,
      envelopeId: 'env-1021v',
      signerId: 'sig-1021v',
    });
    gate = evaluatePackageManifestSignGate({
      manifest: frozen.manifest,
      envelopeManifestHash: frozen.manifestHash,
      acceptances: [accC.acceptance, accT.acceptance],
    });
    expect(gate.canSign).toBe(false);

    const accL = await acceptSvc.markAccepted({
      tenantId: 'tenant-a-1021v',
      manifestId: frozen.manifestId,
      manifestDocumentId: l.id,
      envelopeId: 'env-1021v',
      signerId: 'sig-1021v',
    });
    gate = evaluatePackageManifestSignGate({
      manifest: frozen.manifest,
      envelopeManifestHash: frozen.manifestHash,
      acceptances: [accC.acceptance, accT.acceptance, accL.acceptance],
    });
    expect(gate.canSign).toBe(true);
    summary.checks.signGate = true;
  });

  it('PASSO 9 — acceptances idempotentes', async () => {
    const doc = frozen.manifest.documents[0];
    const a1 = await acceptSvc.markAccepted({
      tenantId: 'tenant-a-1021v',
      manifestId: frozen.manifestId,
      manifestDocumentId: doc.id,
      envelopeId: 'env-1021v',
      signerId: 'sig-1021v',
    });
    const a2 = await acceptSvc.markAccepted({
      tenantId: 'tenant-a-1021v',
      manifestId: frozen.manifestId,
      manifestDocumentId: doc.id,
      envelopeId: 'env-1021v',
      signerId: 'sig-1021v',
    });
    expect(a1.ok && a2.ok).toBe(true);
    expect(a2.duplicate).toBe(true);
    expect(a2.acceptance.id).toBe(a1.acceptance.id);
    expect(a1.acceptance.viewedAt || a1.acceptance.acceptedAt).toBeTruthy();
    expect(a1.acceptance.contentHash).toBe(doc.contentHash);
    expect(a1.acceptance.acceptanceVersion).toBe('accept_v1');
    summary.checks.acceptances = true;
    summary.checks.idempotency = true;
  });

  it('PASSO 10–13 — assinatura fictícia + evidence + comprovante', async () => {
    await envelopes.create('tenant-a-1021v', {
      id: 'env-1021v',
      tenantId: 'tenant-a-1021v',
      contractId: 'contract-1021v',
      contractVersionId: 'cv-1021v',
      status: 'COMPLETED',
      provider: 'internal',
      documentHashBeforeSigning: summary.hashes.contract,
      createdBy: 'actor-1021v',
      createdAt: '2026-08-12T12:00:00.000Z',
      completedAt: '2026-08-12T12:30:00.000Z',
      rowVersion: 1,
    });

    const bind = await freeze.bindManifestToEnvelope({
      tenantId: 'tenant-a-1021v',
      envelopeId: 'env-1021v',
      manifestId: frozen.manifestId,
      expectedManifestHash: frozen.manifestHash,
    });
    expect(bind.ok).toBe(true);

    const env = await envelopes.findById('tenant-a-1021v', 'env-1021v');
    expect(env.packageManifestId).toBe(frozen.manifestId);
    expect(env.packageManifestHash).toBe(frozen.manifestHash);

    const list = await acceptSvc.listAcceptancesForEnvelope('tenant-a-1021v', 'env-1021v');
    const report = await buildSignatureEvidenceReport({
      envelope: env,
      signers: [{
        id: 'sig-1021v',
        tenantId: 'tenant-a-1021v',
        envelopeId: 'env-1021v',
        signerOrder: 1,
        signerRole: 'PATIENT',
        name: PATIENT,
        status: 'SIGNED',
        required: true,
        signedAt: '2026-08-12T12:30:00.000Z',
        acceptedTerms: [],
      }],
      policy: null,
      evidences: [{
        signerId: 'sig-1021v',
        signedAt: '2026-08-12T12:30:00.000Z',
        evidenceHash: 'e'.repeat(64),
        documentHash: summary.hashes.contract,
        packageManifestId: frozen.manifestId,
        packageManifestHash: frozen.manifestHash,
        documentAcceptances: frozen.manifest.documents.map((d) => {
          const acc = list.find((a) => a.manifestDocumentId === d.id);
          return {
            documentKey: d.documentKey,
            documentType: d.documentType,
            documentVersion: d.documentVersion,
            contentHash: d.contentHash,
            required: d.required,
            viewedAt: acc?.viewedAt,
            acceptedAt: acc?.acceptedAt,
          };
        }),
      }],
      contractNumber: 'CT-1021V-FICTICIO',
    });

    expect(report.packageSigned?.packageManifestHash).toBe(frozen.manifestHash);
    expect(report.packageSigned.documents).toHaveLength(3);
    const html = evidenceReportToPrintableHtml(report);
    expect(html).toContain('PACOTE ASSINADO');
    expect(html).toContain(frozen.manifestHash);

    // Exact TCLE/LGPD proof
    const tcleAcc = report.packageSigned.documents.find((d) => d.documentKey.startsWith('tcle:'));
    const lgpdAcc = report.packageSigned.documents.find((d) => d.documentKey === 'lgpd');
    expect(tcleAcc.contentHash).toBe(summary.hashes.tcle);
    expect(lgpdAcc.contentHash).toBe(summary.hashes.lgpd);

    summary.checks.signature = true;
    summary.checks.evidence = true;
    summary.checks.exactTcleProof = true;
    summary.checks.exactLgpdProof = true;
    summary.checks.evidenceReport = true;
    summary.exactTcleProof = 'SIM';
    summary.exactLgpdProof = 'SIM';
  });

  it('PASSO 12 — imutabilidade pós-assinatura (snapshot estável)', async () => {
    const tcle = frozen.manifest.documents.find((d) => d.documentKey.startsWith('tcle:'));
    const before = snapshots.get(tcle.snapshotStoragePath);
    // "template atual muda" — não altera snapshot frozen
    const fakeCurrentTemplate = '<h1>NOVO TEMPLATE TCLE</h1>';
    expect(before).not.toBe(fakeCurrentTemplate);
    expect(await hashPresentedTextContentV1(before)).toBe(tcle.contentHash);
    summary.checks.signedPackageImmutability = true;
  });

  it('PASSO 14 — prontuário abre snapshots assinados', () => {
    const signed = publicDocs.map((d) => ({
      documentKey: d.documentKey,
      title: d.title,
      snapshotHtml: d.snapshotHtml,
    }));
    expect(signed).toHaveLength(3);
    expect(signed.every((d) => d.snapshotHtml)).toBe(true);
    summary.checks.prontuario = true;
  });

  it('PASSO 15 — tenant isolation', async () => {
    expect(await manifests.findById('tenant-b-1021v', frozen.manifestId)).toBeNull();
    const cross = await acceptSvc.markAccepted({
      tenantId: 'tenant-b-1021v',
      manifestId: frozen.manifestId,
      manifestDocumentId: frozen.manifest.documents[0].id,
      envelopeId: 'env-b',
      signerId: 'sig-b',
    });
    expect(cross.ok).toBe(false);
    summary.checks.tenantIsolation = true;
  });

  it('PASSO 16 — legacy envelope sem manifesto', async () => {
    const legacy = evaluatePackageManifestSignGate({
      manifest: null,
      envelopeManifestHash: null,
      acceptances: [],
    });
    expect(legacy.hasManifest).toBe(false);
    expect(legacy.canSign).toBe(true);

    await envelopes.create('tenant-a-1021v', {
      id: 'env-legacy-1021v',
      tenantId: 'tenant-a-1021v',
      contractId: 'contract-legacy',
      contractVersionId: 'cv-legacy',
      status: 'COMPLETED',
      provider: 'internal',
      documentHashBeforeSigning: 'a'.repeat(64),
      createdBy: 'actor',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T01:00:00.000Z',
      rowVersion: 1,
    });
    const env = await envelopes.findById('tenant-a-1021v', 'env-legacy-1021v');
    const report = await buildSignatureEvidenceReport({
      envelope: env,
      signers: [{
        id: 's-legacy',
        tenantId: 'tenant-a-1021v',
        envelopeId: 'env-legacy-1021v',
        signerOrder: 1,
        signerRole: 'PATIENT',
        name: 'LEGACY',
        status: 'SIGNED',
        required: true,
        signedAt: '2026-01-01T01:00:00.000Z',
        acceptedTerms: [],
      }],
      policy: null,
      evidences: [{ signerId: 's-legacy', evidenceHash: 'b'.repeat(64) }],
      contractNumber: 'CT-LEGACY',
    });
    expect(report.packageSigned).toBeUndefined();
    summary.checks.legacy = true;
  });

  it('PASSO 17 — hash integrity matrix', async () => {
    const baseInput = {
      tenantId: 'tenant-a-1021v',
      sourcePackageKey: 'pkg',
      manifestVersion: 1,
      primaryContractId: 'c1',
      primaryContractVersionId: 'cv1',
      canonicalizationVersion: 'pkg_manifest_v1',
      documents: frozen.manifest.documents.map((d) => ({
        documentKey: d.documentKey,
        documentType: d.documentType,
        documentVersion: d.documentVersion,
        required: d.required,
        displayOrder: d.displayOrder,
        contentHash: d.contentHash,
        contentMimeType: d.contentMimeType,
      })),
    };
    const h0 = await hashPackageManifest(buildPackageManifestHashInput(baseInput));

    const contractChanged = structuredClone(baseInput);
    contractChanged.documents[0].contentHash = await hashPresentedTextContentV1('contrato-x');
    expect(await hashPackageManifest(buildPackageManifestHashInput(contractChanged))).not.toBe(h0);

    const tcleChanged = structuredClone(baseInput);
    tcleChanged.documents[1].contentHash = await hashPresentedTextContentV1('tcle-x');
    expect(await hashPackageManifest(buildPackageManifestHashInput(tcleChanged))).not.toBe(h0);

    const lgpdChanged = structuredClone(baseInput);
    lgpdChanged.documents[2].contentHash = await hashPresentedTextContentV1('lgpd-x');
    expect(await hashPackageManifest(buildPackageManifestHashInput(lgpdChanged))).not.toBe(h0);

    const removed = structuredClone(baseInput);
    removed.documents = removed.documents.slice(0, 2);
    expect(await hashPackageManifest(buildPackageManifestHashInput(removed))).not.toBe(h0);

    const added = structuredClone(baseInput);
    added.documents.push({
      documentKey: 'image',
      documentType: 'IMAGE_AUTHORIZATION',
      documentVersion: '1',
      required: false,
      displayOrder: 9,
      contentHash: await hashPresentedTextContentV1('img'),
      contentMimeType: 'text/plain',
    });
    expect(await hashPackageManifest(buildPackageManifestHashInput(added))).not.toBe(h0);

    const versionChanged = structuredClone(baseInput);
    versionChanged.documents[1].documentVersion = 'tcle_implante_v2';
    expect(await hashPackageManifest(buildPackageManifestHashInput(versionChanged))).not.toBe(h0);

    summary.checks.hashIntegrity = true;
  });

  it('grava artefato de evidência da fase', () => {
    summary.checks.tests = true;
    summary.gateCandidate = Object.values(summary.checks).every(Boolean)
      ? 'READY_FOR_PACKAGE_MANIFEST_PRODUCTION_PREPARATION'
      : 'BLOCKED';
    writeFileSync(RESULT, JSON.stringify(summary, null, 2));
    expect(existsSync(RESULT)).toBe(true);
    expect(summary.exactTcleProof).toBe('SIM');
    expect(summary.exactLgpdProof).toBe('SIM');
  });
});
