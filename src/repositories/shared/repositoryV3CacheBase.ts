/**
 * @module repositories/shared/repositoryV3CacheBase
 * @description Factory de cache in-memory com TTL — Repository V3 toolkit.
 */

export interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface MemoryCacheOptions {
  ttlMs: number;
  namespace: string;
}

export interface IMemoryCache<T> {
  get(tenantId: string, ref: string): T | null;
  set(tenantId: string, ref: string, value: T): void;
  delete(tenantId: string, ref: string): void;
  clearTenant(tenantId: string): void;
  invalidateTenant(tenantId: string, reason?: string): void;
}

function buildCacheKey(namespace: string, tenantId: string, ref: string): string {
  return `${namespace}:${tenantId}:${ref}`;
}

export function createMemoryCache<T>(
  options: MemoryCacheOptions,
  resolveRefs: (value: T) => string[] = (value) => [String((value as { legacyId?: string }).legacyId || '')],
): IMemoryCache<T> {
  const store = new Map<string, MemoryCacheEntry<T>>();
  const { ttlMs, namespace } = options;

  return {
    get(tenantId: string, ref: string): T | null {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle) return null;
      const entry = store.get(buildCacheKey(namespace, tid, needle));
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(buildCacheKey(namespace, tid, needle));
        return null;
      }
      return entry.value;
    },

    set(tenantId: string, ref: string, value: T): void {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle) return;
      const expiresAt = Date.now() + ttlMs;
      const refs = new Set([needle, ...resolveRefs(value).filter(Boolean)]);
      for (const key of refs) {
        store.set(buildCacheKey(namespace, tid, key), { value, expiresAt });
      }
    },

    delete(tenantId: string, ref: string): void {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle) return;
      store.delete(buildCacheKey(namespace, tid, needle));
    },

    clearTenant(tenantId: string): void {
      const tid = String(tenantId || '').trim();
      if (!tid) return;
      const prefix = `${namespace}:${tid}:`;
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    },

    invalidateTenant(tenantId: string): void {
      this.clearTenant(tenantId);
    },
  };
}
