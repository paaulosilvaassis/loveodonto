/**
 * @module domain/contracts/runtime/contracts-v2-http-rate-limit
 * @description Adapter HTTP de rate limit — memory (tests) ou persistido — Phase 10.12.
 */

import type { SignatureRateLimitService } from '../signatures/signature-rate-limit.service.js';
import type { SignatureRateLimitOperation } from '../signatures/signature-rate-limit.repository.js';
import {
  DEFAULT_PUBLIC_SIGNING_RATE_LIMITS,
  buildRateLimitKey,
  type PublicSigningRateLimitConfig,
  type PublicSigningRateLimitOperation,
} from './contracts-v2-rate-limit-config.js';

export interface HttpSignatureRateLimitCheckContext {
  ipHash?: string | null;
  sessionId?: string | null;
  signerIdHash?: string | null;
  envelopeId?: string | null;
  tenantIdHash?: string | null;
  /** @deprecated use sessionId — hint truncado sem token bruto */
  sessionHint?: string | null;
}

export interface HttpSignatureRateLimitAdapter {
  check(
    operation: string,
    ctx?: HttpSignatureRateLimitCheckContext,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds?: number }>;
}

const OP_MAP: Record<string, PublicSigningRateLimitOperation> = {
  OPEN: 'open',
  OPEN_SESSION: 'open',
  VIEW: 'view',
  REQUEST_CHALLENGE: 'requestChallenge',
  VERIFY_CHALLENGE: 'verifyChallenge',
  ACCEPT: 'acceptTerms',
  ACCEPT_TERMS: 'acceptTerms',
  SIGN: 'sign',
  DECLINE: 'decline',
  STATUS: 'status',
  DOCUMENT: 'document',
};

const PERSISTED_OP_MAP: Record<string, SignatureRateLimitOperation> = {
  OPEN: 'OPEN_SESSION',
  OPEN_SESSION: 'OPEN_SESSION',
  VIEW: 'OPEN_SESSION',
  STATUS: 'OPEN_SESSION',
  DOCUMENT: 'OPEN_SESSION',
  REQUEST_CHALLENGE: 'REQUEST_CHALLENGE',
  VERIFY_CHALLENGE: 'VERIFY_CHALLENGE',
  ACCEPT: 'SIGN',
  ACCEPT_TERMS: 'SIGN',
  SIGN: 'SIGN',
  DECLINE: 'DECLINE',
};

/** Adapter in-memory — apenas unit tests / memory-test. */
export function createInMemoryHttpSignatureRateLimitAdapter(options: {
  store?: Map<string, { windowStart: number; count: number }>;
  config?: PublicSigningRateLimitConfig;
} = {}): HttpSignatureRateLimitAdapter {
  const store = options.store || new Map();
  const config = options.config || DEFAULT_PUBLIC_SIGNING_RATE_LIMITS;

  return {
    async check(operation, ctx = {}) {
      const mapped = OP_MAP[operation] || OP_MAP[operation.toUpperCase()] || 'open';
      const rule = config[mapped];
      const key = buildRateLimitKey({
        operation: mapped,
        ipHash: ctx.ipHash,
        sessionId: ctx.sessionId || ctx.sessionHint,
        signerIdHash: ctx.signerIdHash,
        envelopeId: ctx.envelopeId,
        tenantIdHash: ctx.tenantIdHash,
        scopes: rule.scopes,
      });
      const now = Date.now();
      const windowMs = rule.windowSeconds * 1000;
      const row = store.get(key) || { windowStart: now, count: 0 };
      if (now - row.windowStart > windowMs) {
        row.windowStart = now;
        row.count = 0;
      }
      row.count += 1;
      store.set(key, row);
      if (row.count > rule.maxAttempts) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil((windowMs - (now - row.windowStart)) / 1000),
        };
      }
      return { allowed: true, remaining: Math.max(0, rule.maxAttempts - row.count) };
    },
  };
}

/**
 * Adapter persistido (restart-safe) via SignatureRateLimitService (Phase 10.10).
 * Falha fechada se serviço/storage indisponível.
 */
export function createPersistedHttpSignatureRateLimitAdapter(input: {
  service: SignatureRateLimitService;
  /** Tenant sintético público quando tenant ainda não derivado. */
  publicTenantId?: string;
}): HttpSignatureRateLimitAdapter {
  const publicTenantId = input.publicTenantId || '00000000-0000-4000-8000-0000000000rl';

  return {
    async check(operation, ctx = {}) {
      if (!input.service) {
        return { allowed: false, remaining: 0 };
      }
      const persistedOp = PERSISTED_OP_MAP[operation] || PERSISTED_OP_MAP[operation.toUpperCase()] || 'OPEN_SESSION';
      const scopeKey = buildRateLimitKey({
        operation: persistedOp,
        ipHash: ctx.ipHash,
        sessionId: ctx.sessionId || ctx.sessionHint,
        signerIdHash: ctx.signerIdHash,
        envelopeId: ctx.envelopeId,
        tenantIdHash: ctx.tenantIdHash,
        scopes: ['ip', 'session', 'operation'],
      });
      try {
        const result = await input.service.checkAndConsume({
          tenantId: (ctx.tenantIdHash
            ? `tenant_hash_${ctx.tenantIdHash}`
            : publicTenantId) as never,
          scopeKey,
          operation: persistedOp,
        });
        return {
          allowed: result.allowed,
          remaining: result.remaining,
          retryAfterSeconds: result.retryAfterMs
            ? Math.ceil(result.retryAfterMs / 1000)
            : undefined,
        };
      } catch {
        return { allowed: false, remaining: 0 };
      }
    },
  };
}
