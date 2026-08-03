/**
 * @module domain/contracts/artifacts/contract-document-artifact.pipeline
 * @description Pipeline de artefatos documentais — Phase 10.7.
 */

import {
  createContractDomainError,
  type ContractDomainError,
} from '../contract.errors.js';
import {
  isContractFeatureEnabled,
  type ContractFeatureFlagContext,
} from '../contract-feature-flags.js';
import type { Contract, ContractVersion } from '../contract.types.js';
import type { TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type {
  SignatureEnvelope,
  SignatureEvidenceSnapshot,
  SignaturePolicy,
  SignatureSigner,
} from '../signatures/signature.types.js';
import { createContractDocumentRenderModel } from '../rendering/contract-document-render.model.js';
import {
  createContractHtmlRenderer,
  type ContractHtmlRenderer,
  type RenderedContractHtml,
} from '../rendering/contract-html.renderer.js';
import {
  createDeterministicTestPdfRenderer,
  type ContractPdfRenderer,
  type RenderedContractPdf,
} from '../rendering/contract-pdf.renderer.js';
import {
  createMemoryContractPrivateStorage,
  type ContractAuditActor,
  type ContractPrivateStorage,
} from '../files/contract-private-storage.js';
import type { ContractFileArtifact } from '../files/contract-file.types.js';
import { sha256Utf8 } from '../files/contract-binary-hash.js';
import {
  buildSignatureEvidenceReport,
  evidenceReportToPrintableHtml,
  type SignatureEvidenceReport,
} from './signature-evidence-report.js';
import {
  buildContractIntegrityManifest,
  type ContractIntegrityManifest,
} from './contract-integrity-manifest.js';
import type {
  ContractArtifactRepository,
  ContractIntegrityManifestRepository,
  SignatureEvidenceReportRepository,
} from './contract-artifact-memory.repository.js';
import {
  createMemoryContractVerificationCodeService,
  createVerificationQrPayload,
  type ContractVerificationCodeService,
} from '../files/contract-verification-code.service.js';

export interface SignedContractArtifactEffects {
  contractStatusTransitionReady: boolean;
  contractStatusTarget: 'SIGNED';
  financialActivationReady: boolean;
  prontuarioRegistrationReady: boolean;
  patientDeliveryReady: boolean;
  auditLedgerReady: boolean;
  signedPdfFileId?: string;
  evidenceReportFileId?: string;
  integrityManifestFileId?: string;
  /** Todos permanecem não executados nesta fase. */
  effectsExecuted: false;
}

export interface UnsignedArtifactPipelineResult {
  renderModelHash: string;
  html: RenderedContractHtml;
  pdf: RenderedContractPdf;
  file: ContractFileArtifact;
  verificationCode: string;
  qrPayload: ReturnType<typeof createVerificationQrPayload>;
}

export interface SignedArtifactPipelineResult {
  html: RenderedContractHtml;
  signedPdf: RenderedContractPdf;
  evidenceReport: SignatureEvidenceReport;
  evidenceHtml: string;
  manifest: ContractIntegrityManifest;
  files: ContractFileArtifact[];
  effects: SignedContractArtifactEffects;
}

export class ContractArtifactPipelineError extends Error {
  readonly domainError: ContractDomainError;
  constructor(domainError: ContractDomainError) {
    super(domainError.message);
    this.name = 'ContractArtifactPipelineError';
    this.domainError = domainError;
  }
}

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new ContractArtifactPipelineError(createContractDomainError(code, message, field));
}

function requirePerm(actor: ContractAuditActor, permission: string): void {
  if (!(actor.permissions || []).includes(permission)) {
    fail('PERMISSION_DENIED', `Permissão necessária: ${permission}.`);
  }
}

export const CONTRACT_PDF_PERMISSIONS = [
  'contracts:generate_pdf',
  'contracts:generate_signed_artifacts',
  'contracts:download',
  'contracts:download_evidence',
  'contracts:verify_integrity',
  'contracts:view_files',
  'contracts:manage_attachments',
] as const;

export interface ContractDocumentArtifactPipelineDeps {
  storage?: ContractPrivateStorage;
  pdfRenderer?: ContractPdfRenderer;
  htmlRenderer?: ContractHtmlRenderer;
  artifactRepository?: ContractArtifactRepository;
  manifestRepository?: ContractIntegrityManifestRepository;
  evidenceReportRepository?: SignatureEvidenceReportRepository;
  verificationCodes?: ContractVerificationCodeService;
  clock?: ContractClock;
  featureFlagContext?: ContractFeatureFlagContext;
  skipFeatureFlagCheck?: boolean;
}

export interface ContractDocumentArtifactPipeline {
  generateUnsignedArtifacts(
    tenantId: TenantId,
    contract: Contract,
    version: ContractVersion,
    actor: ContractAuditActor,
  ): Promise<UnsignedArtifactPipelineResult>;

  generateSignedArtifacts(
    tenantId: TenantId,
    contract: Contract,
    version: ContractVersion,
    envelope: SignatureEnvelope,
    signers: SignatureSigner[],
    policy: SignaturePolicy | null,
    evidences: SignatureEvidenceSnapshot[],
    actor: ContractAuditActor,
  ): Promise<SignedArtifactPipelineResult>;
}

export function createContractDocumentArtifactPipeline(
  deps: ContractDocumentArtifactPipelineDeps = {},
): ContractDocumentArtifactPipeline {
  const clock = deps.clock || createSystemContractClock();
  const storage = deps.storage || createMemoryContractPrivateStorage({ clock });
  const htmlRenderer = deps.htmlRenderer || createContractHtmlRenderer();
  const pdfRenderer = deps.pdfRenderer || createDeterministicTestPdfRenderer(clock);
  const verificationCodes = deps.verificationCodes
    || createMemoryContractVerificationCodeService(clock);

  function assertFlags(extra: Array<'contract_pdf_v2_enabled' | 'contract_storage_v2_enabled' | 'contract_internal_signature_v2_enabled'> = []) {
    if (deps.skipFeatureFlagCheck) return;
    const ctx = deps.featureFlagContext || {};
    const required = [
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
      ...extra,
    ] as const;
    for (const flag of required) {
      if (!isContractFeatureEnabled(flag, ctx)) {
        fail('FEATURE_FLAG_DISABLED', `Flag desabilitada: ${flag}.`, 'featureFlag');
      }
    }
  }

  return {
    async generateUnsignedArtifacts(tenantId, contract, version, actor) {
      assertFlags(['contract_pdf_v2_enabled', 'contract_storage_v2_enabled']);
      requirePerm(actor, 'contracts:generate_pdf');
      if (contract.tenantId !== tenantId || version.tenantId !== tenantId) {
        fail('TENANT_MISMATCH', 'Tenant diverge.');
      }
      if (version.contractId !== contract.id) {
        fail('CONTRACT_RENDER_MODEL_INVALID', 'Versão não pertence ao contrato.');
      }
      if (!version.lockedAt) fail('VERSION_NOT_LOCKED', 'Versão deve estar bloqueada.');
      if (!version.documentHash) fail('CONTENT_HASH_REQUIRED', 'Hash documental ausente.');

      const verificationCode = await verificationCodes.issue({
        tenantId,
        contractId: contract.id,
        contractVersionId: version.id,
        expiresAt: new Date(clock.now().getTime() + 30 * 24 * 3600_000).toISOString(),
      });
      const qrPayload = createVerificationQrPayload(verificationCode);

      const model = createContractDocumentRenderModel(version, {
        clock,
        contractNumber: contract.contractNumber,
        documentType: contract.documentType,
        title: contract.title,
        verificationCodeHint: verificationCode.slice(0, 8),
      }, contract);

      const html = await htmlRenderer.render(model, { technicalDemoBanner: true });
      const pdf = await pdfRenderer.renderUnsignedPdf({ model, html });
      if (pdf.artifact.mimeType !== 'application/pdf') {
        fail('CONTRACT_FILE_MIME_NOT_ALLOWED', 'PDF deve ser application/pdf.');
      }

      const stored = await storage.put(tenantId, {
        contractId: contract.id,
        contractVersionId: version.id,
        fileType: 'GENERATED_PDF',
        purpose: 'DOCUMENT_OUTPUT',
        binary: pdf.artifact,
        contractNumber: contract.contractNumber,
        versionNumber: version.versionNumber,
        createdBy: actor.userId,
        technicalDemo: true,
        generator: pdf.rendererVersion,
      });

      if (deps.artifactRepository) {
        await deps.artifactRepository.save(tenantId, stored.artifact);
      }
      await storage.verifyIntegrity(tenantId, stored.artifact.id);

      return {
        renderModelHash: await sha256Utf8(JSON.stringify({
          contractId: model.contractId,
          versionId: model.contractVersionId,
          documentHash: model.documentHash,
          sections: model.sections.map((s) => s.key),
        })),
        html,
        pdf,
        file: stored.artifact,
        verificationCode,
        qrPayload,
      };
    },

    async generateSignedArtifacts(
      tenantId,
      contract,
      version,
      envelope,
      signers,
      policy,
      evidences,
      actor,
    ) {
      assertFlags([
        'contract_pdf_v2_enabled',
        'contract_storage_v2_enabled',
        'contract_internal_signature_v2_enabled',
      ]);
      requirePerm(actor, 'contracts:generate_signed_artifacts');

      if (envelope.tenantId !== tenantId || contract.tenantId !== tenantId) {
        fail('TENANT_MISMATCH', 'Tenant diverge.');
      }
      if (envelope.status !== 'COMPLETED') {
        fail('CONTRACT_SIGNED_ARTIFACTS_NOT_READY', 'Envelope não concluído.');
      }
      if (envelope.contractVersionId !== version.id) {
        fail('CONTRACT_SIGNED_ARTIFACTS_NOT_READY', 'Versão do envelope diverge.');
      }
      if (!version.documentHash
        || version.documentHash !== envelope.documentHashBeforeSigning) {
        fail('SIGNATURE_DOCUMENT_HASH_MISMATCH', 'Hash documental diverge.');
      }

      const required = signers.filter((s) => s.required);
      for (const s of required) {
        if (s.status !== 'SIGNED') {
          fail('CONTRACT_SIGNATURE_EVIDENCE_INCOMPLETE', 'Signatário obrigatório não assinado.');
        }
        const ev = evidences.find((e) => e.signerId === s.id) || s.evidenceSnapshot;
        if (!ev?.evidenceHash) {
          fail('CONTRACT_SIGNATURE_EVIDENCE_INCOMPLETE', 'Evidência ausente.');
        }
      }

      const model = createContractDocumentRenderModel(version, {
        clock,
        contractNumber: contract.contractNumber,
        documentType: contract.documentType,
        title: contract.title,
      }, contract);
      const html = await htmlRenderer.render(model, { technicalDemoBanner: true });

      let evidenceReport = await buildSignatureEvidenceReport({
        envelope,
        signers,
        policy,
        evidences,
        contractNumber: contract.contractNumber,
        clock,
      });

      const signedPdf = await pdfRenderer.renderSignedPdf({
        model,
        html,
        evidenceReport,
        documentHashBeforeSigning: envelope.documentHashBeforeSigning!,
      });

      // Atualiza relatório com hash do PDF assinado e recalcula hash
      evidenceReport = await buildSignatureEvidenceReport({
        envelope,
        signers,
        policy,
        evidences,
        contractNumber: contract.contractNumber,
        signedPdfHash: signedPdf.artifact.sha256,
        clock,
      });

      const evidenceHtml = evidenceReportToPrintableHtml(evidenceReport);
      const evidenceJsonBytes = new TextEncoder().encode(
        JSON.stringify(evidenceReport),
      );
      const evidenceJsonHash = await sha256Utf8(JSON.stringify(evidenceReport));

      const signedStored = await storage.put(tenantId, {
        contractId: contract.id,
        contractVersionId: version.id,
        envelopeId: envelope.id,
        fileType: 'SIGNED_PDF',
        purpose: 'DOCUMENT_OUTPUT',
        binary: signedPdf.artifact,
        contractNumber: contract.contractNumber,
        versionNumber: version.versionNumber,
        createdBy: actor.userId,
        technicalDemo: true,
        generator: signedPdf.rendererVersion,
      });

      const evidenceStored = await storage.put(tenantId, {
        contractId: contract.id,
        contractVersionId: version.id,
        envelopeId: envelope.id,
        fileType: 'EVIDENCE_REPORT',
        purpose: 'SIGNATURE_EVIDENCE',
        binary: {
          bytes: evidenceJsonBytes,
          mimeType: 'application/json',
          sizeBytes: evidenceJsonBytes.byteLength,
          sha256: evidenceJsonHash,
        },
        contractNumber: contract.contractNumber,
        versionNumber: version.versionNumber,
        createdBy: actor.userId,
        technicalDemo: true,
        generator: 'evidence-report-v1',
      });

      // Manifesto preliminar com arquivos atuais
      let manifest = await buildContractIntegrityManifest({
        tenantId,
        contractId: contract.id,
        contractVersionId: version.id,
        envelopeId: envelope.id,
        documentContentHash: version.documentHash!,
        files: [signedStored.artifact, evidenceStored.artifact],
        clock,
      });

      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
      const manifestHash = await sha256Utf8(JSON.stringify(manifest));
      // Usar manifestHash do próprio manifesto
      void manifestHash;
      const manifestStored = await storage.put(tenantId, {
        contractId: contract.id,
        contractVersionId: version.id,
        envelopeId: envelope.id,
        fileType: 'INTEGRITY_MANIFEST',
        purpose: 'AUDIT_EVIDENCE',
        binary: {
          bytes: manifestBytes,
          mimeType: 'application/json',
          sizeBytes: manifestBytes.byteLength,
          sha256: await sha256Utf8(JSON.stringify(manifest)),
        },
        contractNumber: contract.contractNumber,
        versionNumber: version.versionNumber,
        createdBy: actor.userId,
        technicalDemo: true,
        generator: 'integrity-manifest-v1',
      });

      manifest = await buildContractIntegrityManifest({
        tenantId,
        contractId: contract.id,
        contractVersionId: version.id,
        envelopeId: envelope.id,
        documentContentHash: version.documentHash!,
        files: [signedStored.artifact, evidenceStored.artifact, manifestStored.artifact],
        clock,
      });

      const files = [signedStored.artifact, evidenceStored.artifact, manifestStored.artifact];
      for (const f of files) {
        await storage.verifyIntegrity(tenantId, f.id);
        if (deps.artifactRepository) await deps.artifactRepository.save(tenantId, f);
      }
      if (deps.evidenceReportRepository) {
        await deps.evidenceReportRepository.save(tenantId, evidenceReport);
      }
      if (deps.manifestRepository) {
        await deps.manifestRepository.save(tenantId, manifest);
      }

      // Contrato NÃO transiciona; efeitos NÃO executados
      const effects: SignedContractArtifactEffects = {
        contractStatusTransitionReady: true,
        contractStatusTarget: 'SIGNED',
        financialActivationReady: false,
        prontuarioRegistrationReady: false,
        patientDeliveryReady: false,
        auditLedgerReady: true,
        signedPdfFileId: signedStored.artifact.id,
        evidenceReportFileId: evidenceStored.artifact.id,
        integrityManifestFileId: manifestStored.artifact.id,
        effectsExecuted: false,
      };

      return {
        html,
        signedPdf,
        evidenceReport,
        evidenceHtml,
        manifest,
        files,
        effects,
      };
    },
  };
}
