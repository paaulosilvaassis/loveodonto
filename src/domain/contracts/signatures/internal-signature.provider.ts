/**
 * @module domain/contracts/signatures/internal-signature.provider
 * @description Provider interno composto — Phase 10.6.
 * Sem e-mail/SMS/arquivo/PDF/certificado/serviço externo.
 */

import type {
  CancelSignatureEnvelopeInput,
  CreateSignatureEnvelopeInput,
  CreateSignatureEnvelopeResult,
  DownloadSignatureEvidenceInput,
  DownloadSignedDocumentInput,
  GetSignatureEnvelopeStatusInput,
  SendSignatureEnvelopeInput,
  SignatureEnvelopeStatusResult,
  SignatureProvider,
  SignatureProviderFileResult,
  ValidateSignatureWebhookInput,
  ValidatedSignatureWebhook,
} from './signature-provider.interface.js';
import type { SignatureEnvelopeApplicationService } from './signature-envelope.application-service.js';
import type { SignatureEvidenceRepository } from './signature-memory.repository.js';
import { createContractDomainError } from '../contract.errors.js';
import { SignatureApplicationError } from './signature-envelope.application-service.js';

export interface InternalSignatureProviderDeps {
  envelopeService: SignatureEnvelopeApplicationService;
  evidenceRepository: SignatureEvidenceRepository;
  /** Ator técnico para operações internas do provider. */
  systemActor?: { userId: string; permissions: string[] };
}

const ALL_SIG_PERMS = [
  'contract_signatures:view',
  'contract_signatures:create_envelope',
  'contract_signatures:manage_signers',
  'contract_signatures:send',
  'contract_signatures:cancel_envelope',
  'contract_signatures:view_evidence',
  'contract_signatures:reconcile',
];

/**
 * Composição local das abstrações — não é provedor externo.
 */
export function createInternalSignatureProvider(
  deps: InternalSignatureProviderDeps,
): SignatureProvider & { readonly kind: 'INTERNAL_V2' } {
  const actor = deps.systemActor || {
    userId: 'internal_signature_provider',
    permissions: ALL_SIG_PERMS,
  };

  return {
    name: 'INTERNAL_V2',
    kind: 'INTERNAL_V2' as const,

    async createEnvelope(input: CreateSignatureEnvelopeInput): Promise<CreateSignatureEnvelopeResult> {
      // Interface Phase 10.2 — mapeia para status DRAFT local já existente ou stub
      return {
        providerEnvelopeId: String(input.envelopeId),
        status: 'DRAFT',
        signerRefs: (input.signers || []).map((s) => ({
          signerId: String(s.id),
          providerSignerId: `int_${s.id}`,
        })),
      };
    },

    async sendEnvelope(input: SendSignatureEnvelopeInput): Promise<void> {
      await deps.envelopeService.sendEnvelope(
        input.tenantId,
        input.envelopeId,
        actor,
        {},
      );
    },

    async cancelEnvelope(input: CancelSignatureEnvelopeInput): Promise<void> {
      await deps.envelopeService.cancelEnvelope(
        input.tenantId,
        input.envelopeId,
        { reason: input.reason || 'Cancelado via provider interno' },
        actor,
      );
    },

    async getEnvelopeStatus(
      input: GetSignatureEnvelopeStatusInput,
    ): Promise<SignatureEnvelopeStatusResult> {
      const details = await deps.envelopeService.getEnvelope(
        input.tenantId,
        input.envelopeId,
        actor,
      );
      if (!details) {
        throw new SignatureApplicationError(createContractDomainError(
          'SIGNATURE_ENVELOPE_NOT_FOUND',
          'Envelope não encontrado.',
        ));
      }
      return {
        status: details.envelope.status,
        providerStatus: details.envelope.status,
        signedSignerIds: details.signers.filter((s) => s.status === 'SIGNED').map((s) => s.id),
        declinedSignerIds: details.signers.filter((s) => s.status === 'DECLINED').map((s) => s.id),
      };
    },

    async downloadSignedDocument(
      _input: DownloadSignedDocumentInput,
    ): Promise<SignatureProviderFileResult> {
      throw new SignatureApplicationError(createContractDomainError(
        'SIGNATURE_CAPABILITY_UNAVAILABLE',
        'PDF assinado não disponível nesta fase.',
      ));
    },

    async downloadEvidence(
      input: DownloadSignatureEvidenceInput,
    ): Promise<SignatureProviderFileResult> {
      const items = await deps.evidenceRepository.listByEnvelope(
        input.tenantId,
        input.envelopeId,
      );
      const payload = JSON.stringify(items.map((e) => ({
        signerId: e.signerId,
        evidenceHash: e.evidenceHash,
        signedAt: e.signedAt,
        documentHash: e.documentHash,
        // sem token/OTP/artifact inline
        artifactRef: e.signatureArtifact?.temporaryArtifactId || null,
      })));
      return {
        fileName: `evidence_${input.envelopeId}.json`,
        mimeType: 'application/json',
        content: new TextEncoder().encode(payload),
        storageHint: 'memory-only',
      };
    },

    async validateWebhook(
      _input: ValidateSignatureWebhookInput,
    ): Promise<ValidatedSignatureWebhook> {
      return {
        valid: false,
        errorCode: 'SIGNATURE_CAPABILITY_UNAVAILABLE',
      };
    },
  };
}

/** Stub externo — capability unavailable. */
export function createExternalSignatureProviderStub(): SignatureProvider & {
  readonly kind: 'EXTERNAL_STUB';
} {
  const unavailable = () => {
    throw new SignatureApplicationError(createContractDomainError(
      'SIGNATURE_CAPABILITY_UNAVAILABLE',
      'Provider externo de assinatura não disponível.',
    ));
  };
  return {
    name: 'EXTERNAL_STUB',
    kind: 'EXTERNAL_STUB' as const,
    createEnvelope: unavailable,
    sendEnvelope: unavailable,
    cancelEnvelope: unavailable,
    getEnvelopeStatus: unavailable,
    downloadSignedDocument: unavailable,
    downloadEvidence: unavailable,
    async validateWebhook() {
      return { valid: false, errorCode: 'SIGNATURE_CAPABILITY_UNAVAILABLE' };
    },
  };
}
