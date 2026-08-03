/**
 * @module domain/contracts/signatures/signature-rate-limit.repository
 * @description Rate limiting persistido — Phase 10.10.
 */

import type { TenantId } from '../contract.ids.js';

export const SIGNATURE_RATE_LIMIT_OPERATIONS = [
  'OPEN_SESSION',
  'REQUEST_CHALLENGE',
  'VERIFY_CHALLENGE',
  'SIGN',
  'DECLINE',
] as const;

export type SignatureRateLimitOperation =
  (typeof SIGNATURE_RATE_LIMIT_OPERATIONS)[number];

export interface SignatureRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  blockMs: number;
}

/** Limites centrais — testes podem injetar overrides. */
export const DEFAULT_SIGNATURE_RATE_LIMITS: Record<
  SignatureRateLimitOperation,
  SignatureRateLimitConfig
> = {
  OPEN_SESSION: { windowMs: 60_000, maxRequests: 20, blockMs: 120_000 },
  REQUEST_CHALLENGE: { windowMs: 60_000, maxRequests: 5, blockMs: 300_000 },
  VERIFY_CHALLENGE: { windowMs: 60_000, maxRequests: 10, blockMs: 300_000 },
  SIGN: { windowMs: 60_000, maxRequests: 10, blockMs: 120_000 },
  DECLINE: { windowMs: 60_000, maxRequests: 10, blockMs: 120_000 },
};

export interface SignatureRateLimitRecord {
  id: string;
  tenantId: TenantId;
  scopeKey: string;
  operation: SignatureRateLimitOperation;
  windowStartedAt: string;
  windowEndsAt: string;
  counter: number;
  blockedUntil?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface SignatureRateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
  record?: SignatureRateLimitRecord;
}

export interface SignatureRateLimitRepository {
  findActiveWindow(
    tenantId: TenantId,
    scopeKey: string,
    operation: SignatureRateLimitOperation,
    nowIso: string,
  ): Promise<SignatureRateLimitRecord | null>;

  upsertIncrement(input: {
    tenantId: TenantId;
    scopeKey: string;
    operation: SignatureRateLimitOperation;
    windowStartedAt: string;
    windowEndsAt: string;
    blockedUntil?: string | null;
  }): Promise<SignatureRateLimitRecord>;

  setBlockedUntil(
    tenantId: TenantId,
    recordId: string,
    blockedUntil: string,
    expectedRowVersion: number,
  ): Promise<SignatureRateLimitRecord>;
}

export function buildSignatureRateLimitScope(parts: {
  envelopeId?: string;
  signerId?: string;
  sessionId?: string;
  ipHash?: string;
}): string {
  return [
    parts.envelopeId || '-',
    parts.signerId || '-',
    parts.sessionId || '-',
    parts.ipHash || '-',
  ].join('|');
}
