/**
 * @module domain-events/read-models/shared/readModelCache
 * @description Cache in-memory compartilhado para Read Models — Phase 8.0.
 * Sem Redis. Sem banco.
 */

import {
  recordReadModelCacheHitMetric,
  recordReadModelCacheMissMetric,
  recordReadModelInvalidationMetric,
} from './readModelMetrics.js';
import type { ReadModelSnapshotEnvelope } from './readModelTypes.js';

export interface ReadModelCacheEntry {
  readonly key: string;
  readonly snapshot: ReadModelSnapshotEnvelope;
  readonly storedAt: number;
  readonly expiresAt: number;
}

const cache = new Map<string, ReadModelCacheEntry>();
let defaultTtlMs = 60_000;
let maxEntries = 100;

function cacheKey(readModelId: string, tenantId: string | null | undefined): string {
  return `${String(readModelId || '').trim()}::${tenantId == null ? '_' : String(tenantId)}`;
}

export function setReadModelCachePolicy(options: {
  ttlMs?: number;
  maxEntries?: number;
}): void {
  if (options.ttlMs != null) defaultTtlMs = Math.max(0, Math.floor(options.ttlMs));
  if (options.maxEntries != null) maxEntries = Math.max(1, Math.floor(options.maxEntries));
  while (cache.size > maxEntries) {
    const first = cache.keys().next().value;
    if (first == null) break;
    cache.delete(first);
  }
}

export function getReadModelCachePolicy(): { ttlMs: number; maxEntries: number; size: number } {
  return { ttlMs: defaultTtlMs, maxEntries, size: cache.size };
}

export function putReadModelCache(
  readModelId: string,
  snapshot: ReadModelSnapshotEnvelope,
  options: { tenantId?: string | null; ttlMs?: number; nowMs?: number } = {},
): ReadModelCacheEntry {
  const now = options.nowMs ?? Date.now();
  const ttl = options.ttlMs ?? defaultTtlMs;
  const key = cacheKey(readModelId, options.tenantId ?? snapshot.tenantId);
  const entry: ReadModelCacheEntry = Object.freeze({
    key,
    snapshot,
    storedAt: now,
    expiresAt: now + Math.max(0, ttl),
  });
  cache.set(key, entry);
  while (cache.size > maxEntries) {
    const first = cache.keys().next().value;
    if (first == null || first === key) break;
    cache.delete(first);
  }
  return entry;
}

export function getReadModelCache(
  readModelId: string,
  options: { tenantId?: string | null; nowMs?: number } = {},
): ReadModelSnapshotEnvelope | null {
  const key = cacheKey(readModelId, options.tenantId);
  const entry = cache.get(key);
  if (!entry) {
    recordReadModelCacheMissMetric(readModelId);
    return null;
  }
  const now = options.nowMs ?? Date.now();
  if (entry.expiresAt <= now) {
    cache.delete(key);
    recordReadModelCacheMissMetric(readModelId);
    recordReadModelInvalidationMetric(readModelId);
    return null;
  }
  recordReadModelCacheHitMetric(readModelId);
  return entry.snapshot;
}

export function invalidateReadModelCache(
  readModelId: string,
  options: { tenantId?: string | null } = {},
): boolean {
  const key = cacheKey(readModelId, options.tenantId);
  const deleted = cache.delete(key);
  if (deleted) recordReadModelInvalidationMetric(readModelId);
  return deleted;
}

export function clearReadModelCache(): void {
  const size = cache.size;
  cache.clear();
  for (let i = 0; i < size; i += 1) recordReadModelInvalidationMetric();
}

export function __clearReadModelCacheForTest(): void {
  cache.clear();
  defaultTtlMs = 60_000;
  maxEntries = 100;
}
