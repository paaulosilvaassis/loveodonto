/**
 * @module domain/contracts/artifacts/documents-v2.harness
 * @description Harness técnico de documentos/PDF — Phase 10.7.
 */

import { createSignatureV2Harness, type SignatureV2Harness } from '../signatures/signature-v2.harness.js';
import { createContractDocumentArtifactPipeline } from './contract-document-artifact.pipeline.js';
import { createMemoryContractPrivateStorage } from '../files/contract-private-storage.js';
import {
  ContractArtifactMemoryRepository,
  ContractIntegrityManifestMemoryRepository,
  SignatureEvidenceReportMemoryRepository,
} from './contract-artifact-memory.repository.js';
import { createDeterministicTestPdfRenderer } from '../rendering/contract-pdf.renderer.js';
import { CONTRACT_PDF_PERMISSIONS } from './contract-document-artifact.pipeline.js';
import { SIGNATURE_PERMISSIONS } from '../signatures/signature-envelope.application-service.js';
import { demoSignerPatient } from '../fixtures/signature-v2.fixtures.js';

export async function createDocumentsV2Harness() {
  const sig = await createSignatureV2Harness({ deterministicOtp: '123456' });
  const storage = createMemoryContractPrivateStorage({ clock: sig.clock, ids: sig.ids });
  const artifactRepo = new ContractArtifactMemoryRepository();
  const manifestRepo = new ContractIntegrityManifestMemoryRepository();
  const evidenceReportRepo = new SignatureEvidenceReportMemoryRepository();
  const pipeline = createContractDocumentArtifactPipeline({
    storage,
    pdfRenderer: createDeterministicTestPdfRenderer(sig.clock),
    artifactRepository: artifactRepo,
    manifestRepository: manifestRepo,
    evidenceReportRepository: evidenceReportRepo,
    clock: sig.clock,
    skipFeatureFlagCheck: true,
  });

  const actor = {
    userId: 'user_demo_docs',
    permissions: [...SIGNATURE_PERMISSIONS, ...CONTRACT_PDF_PERMISSIONS, 'contracts:view'],
  };

  return {
    ...sig,
    storage,
    artifactRepo,
    manifestRepo,
    evidenceReportRepo,
    pipeline,
    actor,
    async createCompletedEnvelopeFixture() {
      const created = await sig.envelopeService.createEnvelope(sig.tenantId, {
        contractId: sig.contract.id,
        signaturePolicyId: 'pol_demo_simple',
        signers: [{
          ...demoSignerPatient,
          allowedMethods: ['CLICK_ACCEPT'],
        }],
      }, actor);
      const sent = await sig.envelopeService.sendEnvelope(
        sig.tenantId,
        created.envelope.id,
        actor,
      );
      const token = sent.issuedSessions[0].token;
      await sig.signerService.viewDocument({ token });
      const session = await sig.signerService.openSigningSession({ token });
      const ids = (session.requiredTerms || []).filter((t) => t.required).map((t) => t.id);
      await sig.signerService.acceptRequiredTerms({ token, acceptanceIds: ids });
      const signed = await sig.signerService.sign({
        token,
        method: 'CLICK_ACCEPT',
      });
      const evidences = await sig.evidenceRepo.listByEnvelope(sig.tenantId, signed.envelope.id);
      return {
        envelope: signed.envelope,
        signers: (await sig.signerRepo.listByEnvelope(sig.tenantId, signed.envelope.id)),
        evidences,
        policy: await sig.policyRepo.findById(sig.tenantId, 'pol_demo_simple' as never),
      };
    },
  };
}

export type DocumentsV2Harness = Awaited<ReturnType<typeof createDocumentsV2Harness>> & SignatureV2Harness;
