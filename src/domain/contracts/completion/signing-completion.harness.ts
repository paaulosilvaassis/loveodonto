/**
 * @module domain/contracts/completion/signing-completion.harness
 * @description Harness técnico de conclusão SIGNED — Phase 10.8.
 */

import { createDocumentsV2Harness } from '../artifacts/documents-v2.harness.js';
import { ContractMemoryRepository } from '../application/contract-memory.repository.js';
import { createMemoryContractIdempotencyRepository } from '../idempotency/contract-idempotency.js';
import { ContractLedgerMemoryRepository } from '../ledger/contract-ledger.repository.js';
import {
  createContractSigningCompletionService,
  CONTRACT_COMPLETION_PERMISSIONS,
} from './contract-signing-completion.service.js';
import { createContractSignedReconciliationService } from './contract-signed-reconciliation.service.js';
import type { ContractIntegrityManifest } from '../artifacts/contract-integrity-manifest.js';
import type { ContractFileArtifact } from '../files/contract-file.types.js';
import { CONTRACT_PDF_PERMISSIONS } from '../artifacts/contract-document-artifact.pipeline.js';
import { SIGNATURE_PERMISSIONS } from '../signatures/signature-envelope.application-service.js';

export async function createSigningCompletionHarness(options: {
  failAfterLedgerAppends?: number;
} = {}) {
  const docs = await createDocumentsV2Harness();
  const contractRepo = new ContractMemoryRepository();
  await contractRepo.create(docs.tenantId, docs.contract);
  await contractRepo.saveVersion(docs.tenantId, docs.version);

  const ledger = new ContractLedgerMemoryRepository();
  const idempotency = createMemoryContractIdempotencyRepository();

  const actor = {
    userId: 'user_demo_complete',
    permissions: [
      ...SIGNATURE_PERMISSIONS,
      ...CONTRACT_PDF_PERMISSIONS,
      ...CONTRACT_COMPLETION_PERMISSIONS,
      'contracts:view',
    ],
  };

  async function loadManifest(
    _tenantId: string,
    file: ContractFileArtifact,
  ): Promise<ContractIntegrityManifest | null> {
    const dl = await docs.storage.getAuthorizedDownload(
      docs.tenantId,
      file.id,
      actor,
    );
    const text = new TextDecoder().decode(dl.bytes);
    return JSON.parse(text) as ContractIntegrityManifest;
  }

  const completion = createContractSigningCompletionService({
    contractRepository: contractRepo,
    envelopeRepository: docs.envelopeRepo,
    signerRepository: docs.signerRepo,
    evidenceRepository: docs.evidenceRepo,
    storage: docs.storage,
    loadManifest,
    ledgerRepository: ledger,
    idempotency,
    clock: docs.clock,
    ids: docs.ids,
    skipFeatureFlagCheck: true,
    failAfterLedgerAppends: options.failAfterLedgerAppends,
  });

  const reconciliation = createContractSignedReconciliationService({
    contractRepository: contractRepo,
    envelopeRepository: docs.envelopeRepo,
    storage: docs.storage,
    ledgerRepository: ledger,
    clock: docs.clock,
  });

  async function prepareSignedArtifacts() {
    const completed = await docs.createCompletedEnvelopeFixture();
    const artifacts = await docs.pipeline.generateSignedArtifacts(
      docs.tenantId,
      docs.contract,
      docs.version,
      completed.envelope,
      completed.signers,
      completed.policy,
      completed.evidences,
      actor,
    );
    for (const f of artifacts.files) {
      await docs.storage.verifyIntegrity(docs.tenantId, f.id);
    }
    // Refresh verified artifacts
    const signedPdf = await docs.storage.findById(
      docs.tenantId,
      artifacts.effects.signedPdfFileId!,
    );
    const evidenceReport = await docs.storage.findById(
      docs.tenantId,
      artifacts.effects.evidenceReportFileId!,
    );
    const integrityManifest = await docs.storage.findById(
      docs.tenantId,
      artifacts.effects.integrityManifestFileId!,
    );
    return {
      ...completed,
      artifacts,
      signedPdf: signedPdf!,
      evidenceReport: evidenceReport!,
      integrityManifest: integrityManifest!,
    };
  }

  return {
    ...docs,
    contractRepo,
    ledger,
    idempotency,
    completion,
    reconciliation,
    actor,
    prepareSignedArtifacts,
  };
}

export type SigningCompletionHarness = Awaited<
  ReturnType<typeof createSigningCompletionHarness>
>;
