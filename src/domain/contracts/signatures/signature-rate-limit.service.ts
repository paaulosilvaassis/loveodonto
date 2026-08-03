/**
 * @module domain/contracts/signatures/signature-rate-limit.service
 * @description Rate limiting com clock injetável — Phase 10.10.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import {
  DEFAULT_SIGNATURE_RATE_LIMITS,
  type SignatureRateLimitCheckResult,
  type SignatureRateLimitConfig,
  type SignatureRateLimitOperation,
  type SignatureRateLimitRepository,
} from './signature-rate-limit.repository.js';

export interface SignatureRateLimitService {
  checkAndConsume(input: {
    tenantId: TenantId;
    scopeKey: string;
    operation: SignatureRateLimitOperation;
  }): Promise<SignatureRateLimitCheckResult>;
}

export function createSignatureRateLimitService(
  repo: SignatureRateLimitRepository,
  options: {
    clock?: ContractClock;
    limits?: Partial<Record<SignatureRateLimitOperation, SignatureRateLimitConfig>>;
  } = {},
): SignatureRateLimitService {
  const clock = options.clock || createSystemContractClock();
  const limits = { ...DEFAULT_SIGNATURE_RATE_LIMITS, ...(options.limits || {}) };

  return {
    async checkAndConsume({ tenantId, scopeKey, operation }) {
      if (!repo) {
        throw Object.assign(new Error('Rate limit storage indisponível.'), {
          domainError: createContractDomainError(
            'SIGNATURE_RATE_LIMIT_STORAGE_UNAVAILABLE',
            'Rate limit storage indisponível.',
          ),
          code: 'SIGNATURE_RATE_LIMIT_STORAGE_UNAVAILABLE',
        });
      }

      const cfg = limits[operation];
      const now = clock.now();
      const nowIso = clock.nowIso();
      const active = await repo.findActiveWindow(tenantId, scopeKey, operation, nowIso);

      if (active?.blockedUntil && Date.parse(active.blockedUntil) > now.getTime()) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Date.parse(active.blockedUntil) - now.getTime(),
          record: active,
        };
      }

      let windowStartedAt: string;
      let windowEndsAt: string;
      if (active && Date.parse(active.windowEndsAt) > now.getTime()) {
        windowStartedAt = active.windowStartedAt;
        windowEndsAt = active.windowEndsAt;
      } else {
        windowStartedAt = nowIso;
        windowEndsAt = new Date(now.getTime() + cfg.windowMs).toISOString();
      }

      const record = await repo.upsertIncrement({
        tenantId,
        scopeKey,
        operation,
        windowStartedAt,
        windowEndsAt,
      });

      if (record.counter > cfg.maxRequests) {
        const blockedUntil = new Date(now.getTime() + cfg.blockMs).toISOString();
        const blocked = await repo.setBlockedUntil(
          tenantId,
          record.id,
          blockedUntil,
          record.rowVersion,
        );
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: cfg.blockMs,
          record: blocked,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, cfg.maxRequests - record.counter),
        record,
      };
    },
  };
}

export function assertRateLimitAllowed(result: SignatureRateLimitCheckResult): void {
  if (!result.allowed) {
    throw Object.assign(new Error('Limite de tentativas excedido.'), {
      domainError: createContractDomainError(
        'SIGNATURE_RATE_LIMIT_EXCEEDED',
        'Limite de tentativas excedido.',
      ),
      code: 'SIGNATURE_RATE_LIMIT_EXCEEDED',
    });
  }
}
