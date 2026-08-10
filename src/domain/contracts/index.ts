/**
 * @module domain/contracts
 * @description Barrel da fundação de domínio Contracts V2 — Phase 10.2.
 * Isolado do legado operacional em `src/contracts/*` e `src/services/contract*`.
 */

export * from './contract.ids.js';
export * from './contract.constants.js';
export * from './contract.errors.js';
export * from './contract.types.js';
export * from './contract-status.machine.js';
export * from './contract.validators.js';
export * from './contract.repository.js';
export * from './contract.service.js';
export * from './contract-feature-flags.js';
export * from './contract.events.js';

export * from './templates/contract-template.types.js';
export * from './templates/contract-template.validators.js';
export * from './templates/contract-template.repository.js';
export * from './templates/contract-template-content.schema.js';
export * from './templates/contract-template-variables.catalog.js';
export * from './templates/contract-template-parser.js';
export * from './templates/contract-template-sanitize.js';
export * from './templates/contract-template-status.machine.js';
export * from './templates/contract-template-validation.js';
export * from './templates/contract-template.application-repository.js';
export * from './templates/contract-template.application-service.js';
export * from './templates/contract-template-memory.repository.js';
export * from './templates/contract-template-unavailable.repository.js';
export * from './templates/contract-clause.types.js';
export * from './templates/contract-clause.library.js';

export * from './shared/contract-clock.js';
export * from './shared/contract-id-factory.js';
export * from './hash/contract-content-hasher.js';
export * from './numbering/contract-number.generator.js';
export * from './idempotency/contract-idempotency.js';
export * from './snapshots/contract-snapshot.factories.js';
export * from './generation/contract-generation.types.js';
export * from './generation/contract-generation.pipeline.js';
export * from './application/contract-memory.repository.js';
export * from './application/contract-readiness.js';
export * from './application/contract.application-service.js';
export * from './application/contract-package.application-service.js';
export * from './audit/contract-audit.factory.js';
export * from './fixtures/contract-v2.fixtures.js';

export * from './signatures/signature.types.js';
export * from './signatures/signature.validators.js';
export * from './signatures/signature.repository.js';
export * from './signatures/signature-provider.interface.js';
export * from './signatures/signature-envelope-status.machine.js';
export * from './signatures/signature-signer-status.machine.js';
export * from './signatures/signing-session-token.service.js';
export * from './signatures/signature-authentication-challenge.service.js';
export * from './signatures/signature-evidence.hash.js';
export {
  SignaturePolicyMemoryRepository,
  SignatureEnvelopeMemoryRepository,
  SignatureSignerMemoryRepository,
  SignatureEvidenceMemoryRepository,
} from './signatures/signature-memory.repository.js';
export type {
  SignaturePolicyRepository,
  SignatureSignerRepository,
  SignatureEvidenceRepository,
} from './signatures/signature-memory.repository.js';
export {
  createSignatureEnvelopeApplicationService,
  SignatureApplicationError,
  SIGNATURE_PERMISSIONS,
} from './signatures/signature-envelope.application-service.js';
export type {
  SignatureEnvelopeApplicationService,
  SignatureEnvelopeDetails,
  SignatureEnvelopeReconciliationResult,
  SendSignatureEnvelopeResult,
  SignatureOperationActor,
  AddSignatureSignerInput,
  UpdateSignatureSignerInput,
  ContractLookupForSignature,
} from './signatures/signature-envelope.application-service.js';
export {
  createSignatureSignerApplicationService,
} from './signatures/signature-signer.application-service.js';
export type {
  SignatureSignerApplicationService,
} from './signatures/signature-signer.application-service.js';
export {
  createSignaturePolicyApplicationService,
} from './signatures/signature-policy.application-service.js';
export type {
  SignaturePolicyApplicationService,
  CreateSignaturePolicyInput,
} from './signatures/signature-policy.application-service.js';
export {
  createInternalSignatureProvider,
  createExternalSignatureProviderStub,
} from './signatures/internal-signature.provider.js';
export {
  createSignatureV2Harness,
  createApprovedContractFixture,
} from './signatures/signature-v2.harness.js';
export type { SignatureV2Harness } from './signatures/signature-v2.harness.js';
export {
  createSignaturePublicV2Harness,
} from './signatures/signature-public-v2.harness.js';
export type {
  SignaturePublicV2Harness,
  PrepareInviteFixtureResult,
} from './signatures/signature-public-v2.harness.js';
export * from './signatures/signature-delivery.types.js';
export * from './signatures/signature-delivery.repository.js';
export { createMemorySignatureDeliveryAttemptRepository } from './signatures/signature-delivery-memory.repository.js';
export * from './signatures/signature-delivery.providers.js';
export {
  createSignatureInvitationService,
  buildPublicSigningLink,
  assertAllowedPublicSigningOrigin,
} from './signatures/signature-invitation.service.js';
export type { SignatureInvitationService } from './signatures/signature-invitation.service.js';
export * from './signatures/signature-public-observability.js';
export * from './fixtures/signature-v2.fixtures.js';

export * from './packages/contract-package.types.js';
export * from './packages/contract-package.validators.js';
export * from './packages/contract-package.repository.js';

export * from './files/contract-file.types.js';
export * from './files/contract-file.repository.js';
export * from './files/contract-file-limits.js';
export * from './files/contract-file-mime.js';
export * from './files/contract-file-names.js';
export * from './files/contract-storage-path.js';
export * from './files/contract-binary-hash.js';
export {
  createMemoryContractPrivateStorage,
  createUnavailableContractPrivateStorage,
} from './files/contract-private-storage.js';
export type {
  ContractPrivateStorage,
  ContractAuditActor,
} from './files/contract-private-storage.js';
export * from './files/contract-object-storage-driver.js';
export * from './files/supabase-contract-private-storage.js';
export * from './files/contract-file-reconciliation.service.js';
export * from './files/signature-graphic-artifact.service.js';
export * from './signatures/signing-session.repository.js';
export * from './signatures/signing-session-memory.repository.js';
export * from './signatures/signature-challenge.repository.js';
export * from './signatures/signature-challenge-memory.repository.js';
export * from './signatures/signature-rate-limit.repository.js';
export * from './signatures/signature-rate-limit-memory.repository.js';
export * from './signatures/signature-rate-limit.service.js';
export * from './signatures/persisted-signing-session-token.service.js';
export * from './signatures/persisted-signature-authentication-challenge.service.js';
export * from './files/contract-file-integrity.service.js';
export * from './files/contract-verification-code.service.js';

export * from './rendering/contract-document-render.model.js';
export * from './rendering/contract-html.renderer.js';
export {
  createDeterministicTestPdfRenderer,
  createUnavailableContractPdfRenderer,
  CONTRACT_TEST_PDF_RENDERER_VERSION,
} from './rendering/contract-pdf.renderer.js';
export type {
  ContractPdfRenderer,
  RenderedContractPdf,
} from './rendering/contract-pdf.renderer.js';

export * from './artifacts/signature-evidence-report.js';
export * from './artifacts/contract-integrity-manifest.js';
export {
  ContractArtifactMemoryRepository,
  ContractIntegrityManifestMemoryRepository,
  SignatureEvidenceReportMemoryRepository,
} from './artifacts/contract-artifact-memory.repository.js';
export {
  createContractDocumentArtifactPipeline,
  CONTRACT_PDF_PERMISSIONS,
  ContractArtifactPipelineError,
} from './artifacts/contract-document-artifact.pipeline.js';
export type {
  ContractDocumentArtifactPipeline,
  SignedContractArtifactEffects,
} from './artifacts/contract-document-artifact.pipeline.js';
export { createDocumentsV2Harness } from './artifacts/documents-v2.harness.js';

export * from './ledger/contract-ledger.types.js';
export * from './ledger/contract-ledger.hash.js';
export {
  ContractLedgerMemoryRepository,
} from './ledger/contract-ledger.repository.js';
export type { ContractLedgerRepository } from './ledger/contract-ledger.repository.js';

export {
  validateContractSigningCompletion,
} from './completion/contract-signing-completion.validator.js';
export type {
  ContractSigningCompletionValidationResult,
  ValidateContractSigningCompletionInput,
} from './completion/contract-signing-completion.validator.js';
export {
  deriveContractSignedPendingEffects,
} from './completion/contract-signed-effects.policy.js';
export type {
  ContractPendingEffect,
  ContractSignedPendingEffects,
} from './completion/contract-signed-effects.policy.js';
export {
  createContractSigningCompletionService,
  CONTRACT_COMPLETION_PERMISSIONS,
  ContractSigningCompletionError,
} from './completion/contract-signing-completion.service.js';
export type {
  CompleteContractSigningInput,
  CompleteContractSigningResult,
  ContractSigningCompletionService,
} from './completion/contract-signing-completion.service.js';
export {
  createContractSignedReconciliationService,
} from './completion/contract-signed-reconciliation.service.js';
export type {
  ContractSignedReconciliationResult,
  ContractSignedReconciliationService,
} from './completion/contract-signed-reconciliation.service.js';
export { createSigningCompletionHarness } from './completion/signing-completion.harness.js';

export * from './audit/contract-audit.types.js';
export * from './audit/contract-audit.repository.js';

export * from './legacy/legacy-contract.types.js';
export * from './legacy/legacy-contract.mapper.js';

/** Runtime hardening — Phase 10.12 */
export * from './runtime/index.js';

/** Staging feature-flag pilot — Phase 10.14 */
export * from './staging/contracts-v2-staging-pilot.js';

/** Technical harness isolation — Phase 10.16 */
export * from './contracts-v2-technical-harness.js';
