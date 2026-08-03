/**
 * @module repositories/crm/crmCache
 * @description Cache in-memory por tenant — Wave A leads + Wave B foundation (Phase 6.5).
 * Wave B stores preparados; não ativados com flags OFF.
 */

import { createMemoryCache } from '../shared/repositoryV3CacheBase.js';
import type {
  CrmLegacyFollowUpCore,
  CrmTaskCore,
  ICrmCache,
  LeadCore,
  LeadEventCore,
  StrategicFollowUpCore,
} from './crmTypes.js';

export const CRM_CACHE_TTL_MS = 5 * 60 * 1000;
export const CRM_CACHE_NAMESPACE = 'crm:lead:core';
export const CRM_EVENT_CACHE_NAMESPACE = 'crm:lead-event:core';
export const CRM_TASK_CACHE_NAMESPACE = 'crm:task:core';
export const CRM_LEGACY_FOLLOWUP_CACHE_NAMESPACE = 'crm:legacy-followup:core';
export const CRM_STRATEGIC_FOLLOWUP_CACHE_NAMESPACE = 'crm:strategic-followup:core';

function refsForLead(core: LeadCore): string[] {
  const refs = new Set<string>([core.legacyId]);
  if (core.uuid) refs.add(core.uuid);
  return [...refs].filter(Boolean);
}

function refsForLegacyIdUuid(core: { legacyId: string; uuid: string | null }): string[] {
  const refs = new Set<string>([core.legacyId]);
  if (core.uuid) refs.add(core.uuid);
  return [...refs].filter(Boolean);
}

class CrmCache implements ICrmCache {
  private readonly store = createMemoryCache<LeadCore>(
    { ttlMs: CRM_CACHE_TTL_MS, namespace: CRM_CACHE_NAMESPACE },
    refsForLead,
  );

  private readonly eventStore = createMemoryCache<LeadEventCore>(
    { ttlMs: CRM_CACHE_TTL_MS, namespace: CRM_EVENT_CACHE_NAMESPACE },
    refsForLegacyIdUuid,
  );

  private readonly taskStore = createMemoryCache<CrmTaskCore>(
    { ttlMs: CRM_CACHE_TTL_MS, namespace: CRM_TASK_CACHE_NAMESPACE },
    refsForLegacyIdUuid,
  );

  private readonly legacyFollowUpStore = createMemoryCache<CrmLegacyFollowUpCore>(
    { ttlMs: CRM_CACHE_TTL_MS, namespace: CRM_LEGACY_FOLLOWUP_CACHE_NAMESPACE },
    refsForLegacyIdUuid,
  );

  private readonly strategicFollowUpStore = createMemoryCache<StrategicFollowUpCore>(
    { ttlMs: CRM_CACHE_TTL_MS, namespace: CRM_STRATEGIC_FOLLOWUP_CACHE_NAMESPACE },
    refsForLegacyIdUuid,
  );

  getLead(tenantId: string, ref: string): LeadCore | null {
    return this.store.get(tenantId, ref);
  }

  setLead(tenantId: string, core: LeadCore): void {
    this.store.set(tenantId, core.legacyId, core);
  }

  deleteLead(tenantId: string, ref: string): void {
    this.store.delete(tenantId, ref);
  }

  getLeadEvent(tenantId: string, ref: string): LeadEventCore | null {
    return this.eventStore.get(tenantId, ref);
  }

  setLeadEvent(tenantId: string, core: LeadEventCore): void {
    this.eventStore.set(tenantId, core.legacyId, core);
  }

  getCrmTask(tenantId: string, ref: string): CrmTaskCore | null {
    return this.taskStore.get(tenantId, ref);
  }

  setCrmTask(tenantId: string, core: CrmTaskCore): void {
    this.taskStore.set(tenantId, core.legacyId, core);
  }

  getCrmLegacyFollowUp(tenantId: string, ref: string): CrmLegacyFollowUpCore | null {
    return this.legacyFollowUpStore.get(tenantId, ref);
  }

  setCrmLegacyFollowUp(tenantId: string, core: CrmLegacyFollowUpCore): void {
    this.legacyFollowUpStore.set(tenantId, core.legacyId, core);
  }

  getStrategicFollowUp(tenantId: string, ref: string): StrategicFollowUpCore | null {
    return this.strategicFollowUpStore.get(tenantId, ref);
  }

  setStrategicFollowUp(tenantId: string, core: StrategicFollowUpCore): void {
    this.strategicFollowUpStore.set(tenantId, core.legacyId, core);
  }

  clearTenant(tenantId: string): void {
    this.store.clearTenant(tenantId);
    this.eventStore.clearTenant(tenantId);
    this.taskStore.clearTenant(tenantId);
    this.legacyFollowUpStore.clearTenant(tenantId);
    this.strategicFollowUpStore.clearTenant(tenantId);
  }

  invalidateTenant(tenantId: string): void {
    this.store.invalidateTenant(tenantId);
    this.eventStore.invalidateTenant(tenantId);
    this.taskStore.invalidateTenant(tenantId);
    this.legacyFollowUpStore.invalidateTenant(tenantId);
    this.strategicFollowUpStore.invalidateTenant(tenantId);
  }
}

export function createCrmCache(): ICrmCache {
  return new CrmCache();
}
