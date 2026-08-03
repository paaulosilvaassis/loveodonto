/**
 * @module repositories/agenda/agendaCache
 * @description Cache in-memory por tenant — appointments core (Phase 5.7 foundation).
 */

import type { AppointmentCore, IAgendaCache } from './agendaTypes.js';

export const AGENDA_CACHE_TTL_MS = 5 * 60 * 1000;
export const AGENDA_CACHE_NAMESPACE = 'agenda:appointment:core';

type CacheEntry = {
  core: AppointmentCore;
  expiresAt: number;
};

function cacheKey(tenantId: string, ref: string): string {
  return `${AGENDA_CACHE_NAMESPACE}:${tenantId}:${ref}`;
}

function refsForCore(core: AppointmentCore): string[] {
  const refs = new Set<string>([core.legacyId]);
  if (core.uuid) refs.add(core.uuid);
  return [...refs].filter(Boolean);
}

export class AgendaCache implements IAgendaCache {
  private store = new Map<string, CacheEntry>();

  get(tenantId: string, ref: string): AppointmentCore | null {
    const tid = String(tenantId || '').trim();
    const needle = String(ref || '').trim();
    if (!tid || !needle) return null;
    const entry = this.store.get(cacheKey(tid, needle));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(cacheKey(tid, needle));
      return null;
    }
    return entry.core;
  }

  set(tenantId: string, core: AppointmentCore): void {
    const tid = String(tenantId || '').trim();
    if (!tid || !core?.legacyId) return;
    const expiresAt = Date.now() + AGENDA_CACHE_TTL_MS;
    for (const ref of refsForCore(core)) {
      this.store.set(cacheKey(tid, ref), { core, expiresAt });
    }
  }

  delete(tenantId: string, ref: string): void {
    const tid = String(tenantId || '').trim();
    const needle = String(ref || '').trim();
    if (!tid || !needle) return;
    this.store.delete(cacheKey(tid, needle));
  }

  clearTenant(tenantId: string): void {
    const tid = String(tenantId || '').trim();
    if (!tid) return;
    const prefix = `${AGENDA_CACHE_NAMESPACE}:${tid}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  invalidateTenant(tenantId: string): void {
    this.clearTenant(tenantId);
  }
}

export function createAgendaCache(): IAgendaCache {
  return new AgendaCache();
}
