/**
 * @module domain/contracts/signatures/signing-session.repository
 * @description Persistência de sessões de assinatura — Phase 10.10.
 * Nunca persiste token bruto.
 */

import type {
  SignatureEnvelopeId,
  SignatureSignerId,
  TenantId,
} from '../contract.ids.js';

export type SigningSessionStatus =
  | 'ACTIVE'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'LOCKED';

export interface SigningSessionRecord {
  id: string;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  tokenId: string;
  tokenHash: string;
  status: SigningSessionStatus;
  issuedAt: string;
  expiresAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
  consumedAt?: string;
  ipHash?: string;
  userAgentHash?: string;
  createdAt: string;
  rowVersion: number;
}

export interface CreateSigningSessionInput {
  id?: string;
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  tokenId: string;
  tokenHash: string;
  issuedAt: string;
  expiresAt: string;
  ipHash?: string;
  userAgentHash?: string;
}

export interface SigningSessionRepository {
  create(input: CreateSigningSessionInput): Promise<SigningSessionRecord>;
  findByTokenHash(
    tenantId: TenantId | null,
    tokenHash: string,
  ): Promise<SigningSessionRecord | null>;
  findByTokenId(
    tenantId: TenantId,
    tokenId: string,
  ): Promise<SigningSessionRecord | null>;
  /** Lookup backend-only por tokenId (sem filtrar tenant na query; valida no retorno). */
  findByTokenIdAny(tokenId: string): Promise<SigningSessionRecord | null>;
  touchLastUsed(
    tenantId: TenantId,
    sessionId: string,
    lastUsedAt: string,
    expectedRowVersion: number,
  ): Promise<SigningSessionRecord>;
  revoke(
    tenantId: TenantId,
    sessionId: string,
    revokedAt: string,
    expectedRowVersion: number,
  ): Promise<SigningSessionRecord>;
  revokeForEnvelope(
    tenantId: TenantId,
    envelopeId: SignatureEnvelopeId,
    revokedAt: string,
  ): Promise<number>;
  consume(
    tenantId: TenantId,
    sessionId: string,
    consumedAt: string,
    expectedRowVersion: number,
  ): Promise<SigningSessionRecord>;
  markExpired(
    tenantId: TenantId,
    sessionId: string,
    at: string,
    expectedRowVersion: number,
  ): Promise<SigningSessionRecord>;
}
