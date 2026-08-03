/**
 * @module repositories/shared/repositoryV3Idempotency
 * @description Idempotência in-memory reutilizável — Repository V3 Write Toolkit.
 * Sem persistência definitiva; TTL 5 minutos.
 */

export interface RepositoryWriteMeta {
  correlationId?: string;
  idempotencyKey?: string;
  retryCount?: number;
  writeSource?: string;
}

const TTL_MS = 5 * 60 * 1000;
const recentWrites = new Map<string, number>();

export function buildRepositoryIdempotencyKey(
  domain: string,
  tenantId: string,
  legacyId: string,
  operation: string,
): string {
  return `${domain}:${tenantId}:${legacyId}:${operation}`;
}

export function buildRepositoryCorrelationId(seed?: string, prefix = 'repo-corr'): string {
  const base = String(seed || '').trim();
  if (base) return base;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function resolveRepositoryWriteMeta(
  domain: string,
  tenantId: string,
  legacyId: string,
  operation: string,
  partial: RepositoryWriteMeta = {},
  options: { defaultWriteSource?: string; correlationPrefix?: string } = {},
): Required<Pick<RepositoryWriteMeta, 'correlationId' | 'idempotencyKey' | 'retryCount' | 'writeSource'>> {
  return {
    correlationId: partial.correlationId || buildRepositoryCorrelationId(legacyId, options.correlationPrefix),
    idempotencyKey: partial.idempotencyKey || buildRepositoryIdempotencyKey(domain, tenantId, legacyId, operation),
    retryCount: partial.retryCount ?? 0,
    writeSource: partial.writeSource || options.defaultWriteSource || 'legacy-dual-write',
  };
}

export function shouldSkipDuplicateRepositoryWrite(idempotencyKey: string): boolean {
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

export function markRepositoryWriteIdempotent(idempotencyKey: string): void {
  const key = String(idempotencyKey || '').trim();
  if (!key) return;
  recentWrites.set(key, Date.now());
}

export function __clearRepositoryWriteIdempotencyForTest(): void {
  recentWrites.clear();
}
