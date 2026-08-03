/**
 * @module domain/contracts/signatures/signature-delivery.repository
 */

import type {
  SignatureEnvelopeId,
  SignatureSignerId,
  TenantId,
} from '../contract.ids.js';
import type {
  SignatureDeliveryAttempt,
  SignatureDeliveryAttemptId,
  SignatureDeliveryChannel,
  SignatureDeliveryPurpose,
  SignatureDeliveryStatus,
} from './signature-delivery.types.js';

export interface CreateSignatureDeliveryAttemptInput {
  id?: SignatureDeliveryAttemptId;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  channel: SignatureDeliveryChannel;
  purpose: SignatureDeliveryPurpose;
  destinationMasked?: string;
  status: SignatureDeliveryStatus;
  provider: string;
  providerMessageId?: string;
  idempotencyKey: string;
  attemptNumber: number;
  requestedAt: string;
  completedAt?: string;
  failedAt?: string;
  failureCode?: string;
  metadata?: Record<string, unknown>;
}

export interface SignatureDeliveryAttemptRepository {
  create(input: CreateSignatureDeliveryAttemptInput): Promise<SignatureDeliveryAttempt>;
  findByIdempotencyKey(
    tenantId: TenantId,
    idempotencyKey: string,
  ): Promise<SignatureDeliveryAttempt | null>;
  listByEnvelope(
    tenantId: TenantId,
    envelopeId: SignatureEnvelopeId,
  ): Promise<SignatureDeliveryAttempt[]>;
  listBySigner(
    tenantId: TenantId,
    signerId: SignatureSignerId,
  ): Promise<SignatureDeliveryAttempt[]>;
  countBySignerPurpose(
    tenantId: TenantId,
    signerId: SignatureSignerId,
    purpose: SignatureDeliveryPurpose,
  ): Promise<number>;
  findLatestBySignerPurpose(
    tenantId: TenantId,
    signerId: SignatureSignerId,
    purpose: SignatureDeliveryPurpose,
  ): Promise<SignatureDeliveryAttempt | null>;
}
