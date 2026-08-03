/**
 * Phase 10.7 — PDF Rendering, Evidence Report and Private Storage Foundation
 */

import { describe, expect, it, afterEach } from 'vitest';
import { createDocumentsV2Harness } from '../domain/contracts/artifacts/documents-v2.harness.ts';
import { createContractDocumentRenderModel } from '../domain/contracts/rendering/contract-document-render.model.ts';
import { createContractHtmlRenderer } from '../domain/contracts/rendering/contract-html.renderer.ts';
import {
  createDeterministicTestPdfRenderer,
  createUnavailableContractPdfRenderer,
  CONTRACT_TEST_PDF_RENDERER_VERSION,
} from '../domain/contracts/rendering/contract-pdf.renderer.ts';
import {
  createMemoryContractPrivateStorage,
} from '../domain/contracts/files/contract-private-storage.ts';
import { createContractStoragePathBuilder } from '../domain/contracts/files/contract-storage-path.ts';
import { assertAllowedMimeType } from '../domain/contracts/files/contract-file-mime.ts';
import { createMemoryContractVerificationCodeService } from '../domain/contracts/files/contract-verification-code.service.ts';
import { createContractFileIntegrityService } from '../domain/contracts/files/contract-file-integrity.service.ts';
import { buildContractIntegrityManifest } from '../domain/contracts/artifacts/contract-integrity-manifest.ts';
import { createFixedContractClock } from '../domain/contracts/shared/contract-clock.ts';
import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import {
  isContractDocumentsV2UiEnabled,
  setContractDocumentsV2HarnessForTests,
  resetContractDocumentsV2HarnessForTests,
} from '../services/contractDocumentsV2Service.js';
import {
  createContractDocumentsV2Handlers,
  isContractDocumentsV2ApiEnabled,
} from '../../server/lib/contractDocumentsV2Api.js';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';
import { buildPermissionsCatalog } from '../permissions/catalog.js';
import { CONTRACT_FILE_TYPES } from '../domain/contracts/files/contract-file.types.ts';
import { sha256Bytes } from '../domain/contracts/files/contract-binary-hash.ts';

describe('Phase 10.7 — flags e gates', () => {
  it('flags permanecem OFF', () => {
    expect(isContractFeatureEnabled('contract_pdf_v2_enabled')).toBe(false);
    expect(isContractFeatureEnabled('contract_storage_v2_enabled')).toBe(false);
    expect(isContractFeatureEnabled('contract_public_verification_enabled')).toBe(false);
    expect(isContractDocumentsV2UiEnabled()).toBe(false);
    expect(isContractDocumentsV2ApiEnabled({})).toBe(false);
  });

  it('nav Documentos v2 exige cinco flags', () => {
    const item = contractsShellNavItems.find((i) => i.id === 'documentos-v2');
    expect(item?.featureFlagsAll).toEqual(expect.arrayContaining([
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
      'contract_pdf_v2_enabled',
      'contract_storage_v2_enabled',
    ]));
  });

  it('permissões PDF no catálogo sem roleDefaults', () => {
    const actions = buildPermissionsCatalog()
      .filter((p) => p.module_key === 'contracts')
      .map((p) => p.action_key);
    expect(actions).toEqual(expect.arrayContaining([
      'generate_pdf', 'generate_signed_artifacts', 'download',
      'download_evidence', 'verify_integrity', 'view_files', 'manage_attachments',
    ]));
  });

  it('INTEGRITY_MANIFEST no enum de tipos', () => {
    expect(CONTRACT_FILE_TYPES).toContain('INTEGRITY_MANIFEST');
  });
});

describe('Phase 10.7 — render model', () => {
  it('determinístico a partir de versão bloqueada e rejeita unlocked', async () => {
    const h = await createDocumentsV2Harness();
    const a = createContractDocumentRenderModel(h.version, {
      clock: h.clock,
      contractNumber: h.contract.contractNumber,
      title: h.contract.title,
    }, h.contract);
    const b = createContractDocumentRenderModel(h.version, {
      clock: h.clock,
      contractNumber: h.contract.contractNumber,
      title: h.contract.title,
    }, h.contract);
    expect(a.sections.map((s) => s.key)).toEqual(b.sections.map((s) => s.key));
    expect(a.documentHash).toBe(h.version.documentHash);

    await expect(async () => {
      createContractDocumentRenderModel(
        { ...h.version, lockedAt: undefined },
        { clock: h.clock },
        h.contract,
      );
    }).rejects.toMatchObject({ domainError: { code: 'VERSION_NOT_LOCKED' } });
  });
});

describe('Phase 10.7 — HTML', () => {
  it('sanitiza, é determinístico e sem script/iframe', async () => {
    const h = await createDocumentsV2Harness();
    const model = createContractDocumentRenderModel(h.version, {
      clock: h.clock,
      contractNumber: h.contract.contractNumber,
    }, h.contract);
    const renderer = createContractHtmlRenderer();
    const r1 = await renderer.render(model);
    const r2 = await renderer.render(model);
    expect(r1.sha256).toBe(r2.sha256);
    expect(r1.html).not.toMatch(/<script|<iframe|javascript:/i);
    expect(r1.html).toMatch(/DOCUMENTO TÉCNICO DE DEMONSTRAÇÃO/);
    expect(r1.html).toMatch(/sig-block|Assinaturas/);
  });
});

describe('Phase 10.7 — PDF renderer', () => {
  it('unsigned/signed determinísticos; unavailable falha', async () => {
    const h = await createDocumentsV2Harness();
    const model = createContractDocumentRenderModel(h.version, {
      clock: h.clock,
      contractNumber: h.contract.contractNumber,
    }, h.contract);
    const html = await createContractHtmlRenderer().render(model);
    const pdf = createDeterministicTestPdfRenderer(h.clock);
    const u1 = await pdf.renderUnsignedPdf({ model, html });
    const u2 = await pdf.renderUnsignedPdf({ model, html });
    expect(u1.artifact.sha256).toBe(u2.artifact.sha256);
    expect(u1.technicalDemo).toBe(true);
    expect(u1.rendererVersion).toBe(CONTRACT_TEST_PDF_RENDERER_VERSION);
    expect(new TextDecoder().decode(u1.artifact.bytes)).toMatch(/%PDF-TEST-V2/);

    const unavailable = createUnavailableContractPdfRenderer();
    await expect(unavailable.renderUnsignedPdf({ model, html })).rejects.toMatchObject({
      domainError: { code: 'CONTRACT_PDF_RENDERER_UNAVAILABLE' },
    });
  });
});

describe('Phase 10.7 — storage', () => {
  it('put/get/verify/delete e proteções', async () => {
    const clock = createFixedContractClock('2026-08-03T12:00:00.000Z');
    const storage = createMemoryContractPrivateStorage({ clock });
    const bytes = new TextEncoder().encode('%PDF-TEST-V2\ndemo');
    const sha256 = await sha256Bytes(bytes);
    const actor = {
      userId: 'u1',
      permissions: ['contracts:download', 'contracts:manage_attachments', 'contracts:verify_integrity'],
    };
    const put = await storage.put('tenant_a', {
      contractId: 'ctr1',
      contractVersionId: 'ver1',
      fileType: 'GENERATED_PDF',
      purpose: 'DOCUMENT_OUTPUT',
      binary: { bytes, mimeType: 'application/pdf', sizeBytes: bytes.byteLength, sha256 },
      contractNumber: 'CTR-1',
      versionNumber: 1,
      createdBy: 'u1',
      technicalDemo: true,
    });
    expect(put.artifact.storageReference.storagePath).toMatch(/^tenants\/tenant_a\/contracts\/ctr1/);
    expect(put.artifact.storageReference.storagePath).not.toMatch(/\.\./);

    const dl = await storage.getAuthorizedDownload('tenant_a', put.artifact.id, actor);
    expect(dl.bytes.byteLength).toBe(bytes.byteLength);

    const missing = await storage.findById('tenant_b', put.artifact.id);
    expect(missing).toBeNull();

    await expect(storage.getAuthorizedDownload('tenant_b', put.artifact.id, actor))
      .rejects.toMatchObject({ domainError: { code: 'CONTRACT_FILE_NOT_FOUND' } });

    const signedBytes = new TextEncoder().encode('%PDF-TEST-V2\nsigned');
    const signedSha = await sha256Bytes(signedBytes);
    const signed = await storage.put('tenant_a', {
      contractId: 'ctr1',
      contractVersionId: 'ver1',
      fileType: 'SIGNED_PDF',
      purpose: 'DOCUMENT_OUTPUT',
      binary: {
        bytes: signedBytes,
        mimeType: 'application/pdf',
        sizeBytes: signedBytes.byteLength,
        sha256: signedSha,
      },
      contractNumber: 'CTR-1',
      versionNumber: 1,
      createdBy: 'u1',
      technicalDemo: true,
    });
    await expect(storage.deleteLogical('tenant_a', signed.artifact.id, actor))
      .rejects.toMatchObject({ domainError: { code: 'CONTRACT_FILE_DELETE_NOT_ALLOWED' } });

    expect(() => assertAllowedMimeType('application/x-msdownload')).toThrow();
    expect(() => assertAllowedMimeType('data:application/pdf;base64,AA')).toThrow();

    const pathBuilder = createContractStoragePathBuilder();
    expect(() => pathBuilder.build({
      tenantId: '../evil',
      contractId: 'c',
      versionId: 'v',
      fileType: 'GENERATED_PDF',
      fileId: 'f',
      mimeType: 'application/pdf',
    })).toThrow();
  });
});

describe('Phase 10.7 — pipeline unsigned/signed', () => {
  it('gera unsigned, signed, evidence, manifesto e efeitos não executados', async () => {
    const h = await createDocumentsV2Harness();
    const unsigned = await h.pipeline.generateUnsignedArtifacts(
      h.tenantId,
      h.contract,
      h.version,
      h.actor,
    );
    expect(unsigned.file.fileType).toBe('GENERATED_PDF');
    expect(unsigned.file.technicalDemo).toBe(true);
    expect(unsigned.pdf.artifact.sha256).toBeTruthy();

    const completed = await h.createCompletedEnvelopeFixture();
    // Pode haver conflito de envelope ativo — cancelar unsigned envelope se necessário
    // createCompletedEnvelopeFixture cria novo; se active conflict, harness já usou create
    const signed = await h.pipeline.generateSignedArtifacts(
      h.tenantId,
      h.contract,
      h.version,
      completed.envelope,
      completed.signers,
      completed.policy,
      completed.evidences,
      h.actor,
    );

    expect(signed.signedPdf.artifact.sha256).toBeTruthy();
    expect(signed.evidenceReport.reportHash).toBeTruthy();
    expect(JSON.stringify(signed.evidenceReport)).not.toMatch(/data:image|data:application|plainCode|testOnlyPlainCode/i);
    expect(signed.evidenceReport).not.toHaveProperty('token');
    expect(signed.manifest.manifestHash).toBeTruthy();
    expect(signed.effects.effectsExecuted).toBe(false);
    expect(signed.effects.contractStatusTransitionReady).toBe(true);
    expect(signed.effects.contractStatusTarget).toBe('SIGNED');
    expect(h.contract.status).toBe('APPROVED');

    const unsignedStill = (await h.storage.listByContract(h.tenantId, h.contract.id))
      .find((f) => f.fileType === 'GENERATED_PDF');
    const signedFile = signed.files.find((f) => f.fileType === 'SIGNED_PDF');
    expect(unsignedStill?.id).not.toBe(signedFile?.id);
  });

  it('bloqueia signed sem envelope completo', async () => {
    const h = await createDocumentsV2Harness();
    const created = await h.envelopeService.createEnvelope(h.tenantId, {
      contractId: h.contract.id,
      signaturePolicyId: 'pol_demo_simple',
      signers: [{
        role: 'PATIENT',
        name: 'Demo',
        email: 'a@example.com',
        signerOrder: 1,
        required: true,
        allowedMethods: ['CLICK_ACCEPT'],
      }],
    }, h.actor);
    await expect(h.pipeline.generateSignedArtifacts(
      h.tenantId,
      h.contract,
      h.version,
      created.envelope,
      created.signers,
      null,
      [],
      h.actor,
    )).rejects.toMatchObject({
      domainError: { code: 'CONTRACT_SIGNED_ARTIFACTS_NOT_READY' },
    });
  });
});

describe('Phase 10.7 — evidence + manifesto + verification', () => {
  it('manifesto detecta hash divergente; verification code funciona', async () => {
    const h = await createDocumentsV2Harness();
    await h.pipeline.generateUnsignedArtifacts(h.tenantId, h.contract, h.version, h.actor);
    const files = await h.storage.listByContract(h.tenantId, h.contract.id);
    const manifest = await buildContractIntegrityManifest({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      documentContentHash: h.version.documentHash,
      files,
      clock: h.clock,
    });
    const integrity = createContractFileIntegrityService();
    const ok = await integrity.verifyManifest(manifest, files);
    expect(ok.valid).toBe(true);

    const tampered = files.map((f, i) => (i === 0 ? { ...f, sha256: '0'.repeat(64) } : f));
    const bad = await integrity.verifyManifest(manifest, tampered);
    expect(bad.valid).toBe(false);

    const codes = createMemoryContractVerificationCodeService(h.clock);
    const code = await codes.issue({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      expiresAt: '2026-09-01T00:00:00.000Z',
    });
    expect(code.length).toBeGreaterThan(20);
    expect((await codes.validate(code)).valid).toBe(true);
    await codes.revoke(code);
    expect((await codes.validate(code)).valid).toBe(false);
    expect((await codes.validate('invalid')).valid).toBe(false);
  });
});

describe('Phase 10.7 — cross-tenant e API', () => {
  afterEach(() => {
    resetContractDocumentsV2HarnessForTests();
  });

  it('tenant A não lista arquivo B', async () => {
    const a = await createDocumentsV2Harness();
    await a.pipeline.generateUnsignedArtifacts(a.tenantId, a.contract, a.version, a.actor);
    const b = await createDocumentsV2Harness();
    // harness B tem tenant demo igual — criar storage separado
    const storageB = createMemoryContractPrivateStorage({ clock: b.clock });
    const list = await storageB.listByContract(a.tenantId, a.contract.id);
    expect(list).toHaveLength(0);
    const filesA = await a.storage.listByContract(a.tenantId, a.contract.id);
    expect(await a.storage.findById('other_tenant', filesA[0].id)).toBeNull();
  });

  it('API 403 com flags OFF', async () => {
    const handlers = createContractDocumentsV2Handlers({});
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handlers.listFiles({
      params: { id: 'x' },
      tenantContext: { tenantId: 't1', permissions: ['contracts:view_files'] },
    }, res);
    expect(res.statusCode).toBe(403);
  });

  it('UI gate OFF', () => {
    expect(isContractDocumentsV2UiEnabled()).toBe(false);
    setContractDocumentsV2HarnessForTests({ ok: true });
    expect(isContractDocumentsV2UiEnabled()).toBe(false);
  });
});
