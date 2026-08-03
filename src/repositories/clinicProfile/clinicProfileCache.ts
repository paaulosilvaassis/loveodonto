/**
 * @module repositories/clinicProfile/clinicProfileCache
 * @description Cache in-memory por tenant — perfil core Clinic Profile.
 */

import type { ClinicProfileCore, IClinicProfileCache } from './clinicProfileTypes.js';

export const CLINIC_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
export const CLINIC_PROFILE_CACHE_NAMESPACE = 'clinic:profile:core';

type CacheEntry = {
  core: ClinicProfileCore;
  expiresAt: number;
};

function cacheKey(tenantId: string): string {
  return `${CLINIC_PROFILE_CACHE_NAMESPACE}:${tenantId}`;
}

export class ClinicProfileCache implements IClinicProfileCache {
  private store = new Map<string, CacheEntry>();

  get(tenantId: string): ClinicProfileCore | null {
    const tid = String(tenantId || '').trim();
    if (!tid) return null;
    const entry = this.store.get(cacheKey(tid));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(cacheKey(tid));
      return null;
    }
    return entry.core;
  }

  set(tenantId: string, core: ClinicProfileCore): void {
    const tid = String(tenantId || '').trim();
    if (!tid) return;
    this.store.set(cacheKey(tid), {
      core,
      expiresAt: Date.now() + CLINIC_PROFILE_CACHE_TTL_MS,
    });
  }

  clearTenant(tenantId: string): void {
    const tid = String(tenantId || '').trim();
    if (!tid) return;
    this.store.delete(cacheKey(tid));
  }
}

export function createClinicProfileCache(): IClinicProfileCache {
  return new ClinicProfileCache();
}
