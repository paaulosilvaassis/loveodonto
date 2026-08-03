/**
 * @module repositories/collaborator/collaboratorCache
 * @description Cache in-memory write-through para ficha RH core.
 * **Ticket:** Sprint 1A — 1.4 internal wiring
 */

import type { CollaboratorCore, CollaboratorRef } from './collaboratorTypes.js';
import { requireRepositoryTenantId } from './collaboratorRepositoryGuards.js';
import { isCollaboratorLegacyId, isCollaboratorUuid } from './collaboratorMapper.js';

export const COLLABORATOR_CACHE_TTL_MS = 5 * 60 * 1000;
export const COLLABORATOR_CACHE_NAMESPACE = 'rh:collaborator:core';

export type CollaboratorCacheInvalidateReason =
  | 'core_create'
  | 'core_update'
  | 'core_soft_delete'
  | 'access_bundle_save'
  | 'tenant_switch'
  | 'manual_refresh'
  | 'sync_from_remote';

export interface CollaboratorCacheInvalidateEvent {
  tenantId: string;
  reason: CollaboratorCacheInvalidateReason;
  ref?: CollaboratorRef;
  at: string;
}

export interface ICollaboratorCache {
  get(tenantId: string, ref: CollaboratorRef): CollaboratorCore | null;
  set(tenantId: string, core: CollaboratorCore): void;
  delete(tenantId: string, ref: CollaboratorRef): void;
  clearTenant(tenantId: string): void;
  invalidate(event: CollaboratorCacheInvalidateEvent): void;
}

type CacheEntry = {
  core: CollaboratorCore;
  expiresAt: number;
};

function cacheKey(tenantId: string, ref: string): string {
  return `${COLLABORATOR_CACHE_NAMESPACE}:${tenantId}:${ref}`;
}

function refsForCore(core: CollaboratorCore): string[] {
  const refs = new Set<string>([core.legacyId, core.uuid]);
  return [...refs].filter(Boolean);
}

export class CollaboratorCache implements ICollaboratorCache {
  private store = new Map<string, CacheEntry>();

  get(tenantId: string, ref: CollaboratorRef): CollaboratorCore | null {
    requireRepositoryTenantId(tenantId);
    const key = cacheKey(tenantId, String(ref || '').trim());
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.core;
  }

  set(tenantId: string, core: CollaboratorCore): void {
    requireRepositoryTenantId(tenantId);
    requireRepositoryTenantId(core?.tenantId);
    const expiresAt = Date.now() + COLLABORATOR_CACHE_TTL_MS;
    for (const ref of refsForCore(core)) {
      this.store.set(cacheKey(tenantId, ref), { core, expiresAt });
    }
  }

  delete(tenantId: string, ref: CollaboratorRef): void {
    requireRepositoryTenantId(tenantId);
    this.store.delete(cacheKey(tenantId, String(ref || '').trim()));
  }

  clearTenant(tenantId: string): void {
    requireRepositoryTenantId(tenantId);
    const prefix = `${COLLABORATOR_CACHE_NAMESPACE}:${tenantId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  invalidate(event: CollaboratorCacheInvalidateEvent): void {
    requireRepositoryTenantId(event?.tenantId);
    if (event.ref) {
      this.delete(event.tenantId, event.ref);
      return;
    }
    this.clearTenant(event.tenantId);
  }
}

export function createCollaboratorCache(): ICollaboratorCache {
  return new CollaboratorCache();
}

export const collaboratorCache: ICollaboratorCache = createCollaboratorCache();
