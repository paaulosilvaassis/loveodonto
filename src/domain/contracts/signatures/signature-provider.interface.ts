/**
 * @module domain/contracts/signatures/signature-provider.interface
 * @description Abstração independente de fornecedor — sem implementação real (Phase 10.2).
 */

import type {
  ContractFileId,
  SignatureEnvelopeId,
  TenantId,
} from '../contract.ids.js';
import type {
  SignatureEnvelopeStatus,
  SignatureMethod,
  SignatureSigner,
} from './signature.types.js';

export interface CreateSignatureEnvelopeInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  documentHash: string;
  signers: Array<Pick<SignatureSigner, 'id' | 'name' | 'email' | 'phone' | 'signerRole' | 'signerOrder' | 'required'>>;
  allowedMethods: SignatureMethod[];
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSignatureEnvelopeResult {
  providerEnvelopeId: string;
  status: SignatureEnvelopeStatus;
  signerRefs: Array<{ signerId: string; providerSignerId?: string; inviteUrl?: string }>;
}

export interface SendSignatureEnvelopeInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  providerEnvelopeId: string;
}

export interface CancelSignatureEnvelopeInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  providerEnvelopeId: string;
  reason?: string;
}

export interface GetSignatureEnvelopeStatusInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  providerEnvelopeId: string;
}

export interface SignatureEnvelopeStatusResult {
  status: SignatureEnvelopeStatus;
  providerStatus?: string;
  signedSignerIds: string[];
  declinedSignerIds: string[];
  raw?: unknown;
}

export interface DownloadSignedDocumentInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  providerEnvelopeId: string;
}

export interface DownloadSignatureEvidenceInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  providerEnvelopeId: string;
}

export interface SignatureProviderFileResult {
  fileName: string;
  mimeType: string;
  /** Bytes ou referência — nunca data URL como contrato definitivo. */
  content?: Uint8Array;
  storageHint?: string;
  sha256?: string;
  fileIdHint?: ContractFileId;
}

export interface ValidateSignatureWebhookInput {
  tenantId: TenantId;
  provider: string;
  headers: Record<string, string>;
  rawBody: string | Uint8Array;
}

export interface ValidatedSignatureWebhook {
  valid: boolean;
  eventType?: string;
  providerEnvelopeId?: string;
  providerSignerId?: string;
  occurredAt?: string;
  payload?: unknown;
  errorCode?: string;
}

/**
 * Provider abstraction — implementações futuras:
 * InternalSignatureProvider | ExternalSignatureProvider | QualifiedSignatureProvider
 */
export interface SignatureProvider {
  readonly name: string;

  createEnvelope(
    input: CreateSignatureEnvelopeInput,
  ): Promise<CreateSignatureEnvelopeResult>;

  sendEnvelope(input: SendSignatureEnvelopeInput): Promise<void>;

  cancelEnvelope(input: CancelSignatureEnvelopeInput): Promise<void>;

  getEnvelopeStatus(
    input: GetSignatureEnvelopeStatusInput,
  ): Promise<SignatureEnvelopeStatusResult>;

  downloadSignedDocument(
    input: DownloadSignedDocumentInput,
  ): Promise<SignatureProviderFileResult>;

  downloadEvidence(
    input: DownloadSignatureEvidenceInput,
  ): Promise<SignatureProviderFileResult>;

  validateWebhook(
    input: ValidateSignatureWebhookInput,
  ): Promise<ValidatedSignatureWebhook>;
}
