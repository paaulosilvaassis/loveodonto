/**
 * @module domain/contracts/signatures/signature-rate-limit-memory.repository
 */

import type {
  SignatureRateLimitRecord,
  SignatureRateLimitRepository,
} from './signature-rate-limit.repository.js';

export function createMemorySignatureRateLimitRepository(
  store: Map<string, SignatureRateLimitRecord> = new Map(),
): SignatureRateLimitRepository & { readonly store: Map<string, SignatureRateLimitRecord> } {
  let seq = 0;

  function key(tenantId: string, scopeKey: string, operation: string, windowStartedAt: string) {
    return `${tenantId}|${scopeKey}|${operation}|${windowStartedAt}`;
  }

  return {
    store,
    async findActiveWindow(tenantId, scopeKey, operation, nowIso) {
      const now = Date.parse(nowIso);
      let best: SignatureRateLimitRecord | null = null;
      for (const row of store.values()) {
        if (row.tenantId !== tenantId
          || row.scopeKey !== scopeKey
          || row.operation !== operation) continue;
        if (Date.parse(row.windowEndsAt) <= now) continue;
        if (!best || Date.parse(row.windowStartedAt) > Date.parse(best.windowStartedAt)) {
          best = row;
        }
      }
      return best ? { ...best } : null;
    },

    async upsertIncrement(input) {
      const k = key(
        input.tenantId,
        input.scopeKey,
        input.operation,
        input.windowStartedAt,
      );
      const existing = store.get(k);
      if (existing) {
        const next = {
          ...existing,
          counter: existing.counter + 1,
          blockedUntil: input.blockedUntil || existing.blockedUntil,
          updatedAt: input.windowStartedAt,
          rowVersion: existing.rowVersion + 1,
        };
        store.set(k, next);
        return { ...next };
      }
      seq += 1;
      const now = input.windowStartedAt;
      const record: SignatureRateLimitRecord = {
        id: `rl_mem_${seq}`,
        tenantId: input.tenantId,
        scopeKey: input.scopeKey,
        operation: input.operation,
        windowStartedAt: input.windowStartedAt,
        windowEndsAt: input.windowEndsAt,
        counter: 1,
        blockedUntil: input.blockedUntil || undefined,
        createdAt: now,
        updatedAt: now,
        rowVersion: 1,
      };
      store.set(k, record);
      return { ...record };
    },

    async setBlockedUntil(tenantId, recordId, blockedUntil, expectedRowVersion) {
      for (const [k, row] of store.entries()) {
        if (row.id === recordId && row.tenantId === tenantId) {
          if (row.rowVersion !== expectedRowVersion) {
            throw Object.assign(new Error('Conflito de versão rate limit.'), {
              code: 'SIGNATURE_RATE_LIMIT_STORAGE_UNAVAILABLE',
            });
          }
          const next = {
            ...row,
            blockedUntil,
            rowVersion: row.rowVersion + 1,
            updatedAt: blockedUntil,
          };
          store.set(k, next);
          return { ...next };
        }
      }
      throw Object.assign(new Error('Rate limit não encontrado.'), {
        code: 'SIGNATURE_RATE_LIMIT_STORAGE_UNAVAILABLE',
      });
    },
  };
}
