/**
 * @module repositories/financial/financialWriteIdempotency
 * @description Idempotência in-memory para writes financeiros — Phase 5.13 (sem persistência).
 */

import type { FinancialDomain, FinancialWriteMeta } from './financialTypes.js';

const TTL_MS = 5 * 60 * 1000;
const recentWrites = new Map<string, number>();

export function buildFinancialIdempotencyKey(
  domain: FinancialDomain,
  tenantId: string,
  legacyId: string,
  operation: string,
): string {
  return `${domain}:${tenantId}:${legacyId}:${operation}`;
}

export function buildFinancialCorrelationId(seed?: string): string {
  const base = String(seed || '').trim();
  if (base) return base;
  return `fin-corr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function resolveFinancialWriteMeta(
  domain: FinancialDomain,
  tenantId: string,
  legacyId: string,
  operation: string,
  partial: FinancialWriteMeta = {},
): Required<Pick<FinancialWriteMeta, 'correlationId' | 'idempotencyKey' | 'retryCount' | 'writeSource'>> {
  return {
    correlationId: partial.correlationId || buildFinancialCorrelationId(legacyId),
    idempotencyKey: partial.idempotencyKey || buildFinancialIdempotencyKey(domain, tenantId, legacyId, operation),
    retryCount: partial.retryCount ?? 0,
    writeSource: partial.writeSource || 'legacy-dual-write',
  };
}

export function shouldSkipDuplicateFinancialWrite(idempotencyKey: string): boolean {
  const key = String(idempotencyKey || '').trim();
  if (!key) return false;
  const seenAt = recentWrites.get(key);
  if (!seenAt) return false;
  if (Date.now() - seenAt > TTL_MS) {
    recentWrites.delete(key);
    return false;
  }
  return true;
}

export function markFinancialWriteIdempotent(idempotencyKey: string): void {
  const key = String(idempotencyKey || '').trim();
  if (!key) return;
  recentWrites.set(key, Date.now());
}

export function __clearFinancialWriteIdempotencyForTest(): void {
  recentWrites.clear();
}
