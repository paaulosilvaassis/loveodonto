/**
 * @module domain/contracts/signatures/signature-challenge.repository
 * @description Persistência de challenges OTP — Phase 10.10.
 * Nunca persiste OTP bruto; codeHash nunca retornado em APIs públicas.
 */

import type {
  SignatureEnvelopeId,
  SignatureSignerId,
  TenantId,
} from '../contract.ids.js';

export type SignatureChallengeStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'INVALIDATED'
  | 'LOCKED';

export interface SignatureChallengeRecord {
  id: string;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  sessionId: string;
  challengeType: string;
  destinationHash?: string;
  /** Interno — repositories podem carregar; serviços públicos não devem expor. */
  codeHash: string;
  status: SignatureChallengeStatus;
  attemptCount: number;
  maxAttempts: number;
  issuedAt: string;
  expiresAt: string;
  verifiedAt?: string;
  consumedAt?: string;
  invalidatedAt?: string;
  createdAt: string;
  rowVersion: number;
}

/** Visão pública sem codeHash. */
export type SignatureChallengePublicView = Omit<SignatureChallengeRecord, 'codeHash'>;

export interface CreateSignatureChallengeInput {
  id?: string;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  sessionId: string;
  challengeType: string;
  destinationHash?: string;
  codeHash: string;
  maxAttempts: number;
  issuedAt: string;
  expiresAt: string;
}

export interface SignatureAuthenticationChallengeRepository {
  create(input: CreateSignatureChallengeInput): Promise<SignatureChallengeRecord>;
  findById(
    tenantId: TenantId,
    challengeId: string,
  ): Promise<SignatureChallengeRecord | null>;
  invalidateActiveForSigner(
    tenantId: TenantId,
    envelopeId: SignatureEnvelopeId,
    signerId: SignatureSignerId,
    invalidatedAt: string,
  ): Promise<number>;
  recordFailedAttempt(
    tenantId: TenantId,
    challengeId: string,
    expectedRowVersion: number,
  ): Promise<SignatureChallengeRecord>;
  markVerified(
    tenantId: TenantId,
    challengeId: string,
    verifiedAt: string,
    expectedRowVersion: number,
  ): Promise<SignatureChallengeRecord>;
  markConsumed(
    tenantId: TenantId,
    challengeId: string,
    consumedAt: string,
    expectedRowVersion: number,
  ): Promise<SignatureChallengeRecord>;
  markExpired(
    tenantId: TenantId,
    challengeId: string,
    at: string,
    expectedRowVersion: number,
  ): Promise<SignatureChallengeRecord>;
}

export function toChallengePublicView(
  record: SignatureChallengeRecord,
): SignatureChallengePublicView {
  const { codeHash: _omit, ...rest } = record;
  return rest;
}
