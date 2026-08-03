/**
 * @module domain/contracts/signatures/signature.repository
 */

import type {
  SignatureEnvelopeId,
  SignatureSignerId,
  TenantId,
} from '../contract.ids.js';
import type { SignatureEnvelope, SignatureSigner } from './signature.types.js';

export interface SignatureEnvelopeRepository {
  findById(
    tenantId: TenantId,
    envelopeId: SignatureEnvelopeId,
  ): Promise<SignatureEnvelope | null>;

  findByContract(
    tenantId: TenantId,
    contractId: string,
  ): Promise<SignatureEnvelope[]>;

  create(
    tenantId: TenantId,
    envelope: SignatureEnvelope,
  ): Promise<SignatureEnvelope>;

  update(
    tenantId: TenantId,
    envelopeId: SignatureEnvelopeId,
    envelope: SignatureEnvelope,
  ): Promise<SignatureEnvelope>;

  listSigners(
    tenantId: TenantId,
    envelopeId: SignatureEnvelopeId,
  ): Promise<SignatureSigner[]>;

  upsertSigner(
    tenantId: TenantId,
    signer: SignatureSigner,
  ): Promise<SignatureSigner>;

  findSignerById(
    tenantId: TenantId,
    signerId: SignatureSignerId,
  ): Promise<SignatureSigner | null>;
}
