/**
 * @module repositories/crm/crmActivityRepository
 * @description Activity Stream read facade — Phase 6.6.
 * Unifica Timeline / Tasks / FollowUps na Repository Layer (stores intactas).
 * Primary Read usa IndexedDB via mappers (sem Admin API HTTP nesta phase).
 */

import { crmIndexedDbRepository } from './crmIndexedDbRepository.js';
import type { ICrmIndexedDbReader } from './crmTypes.js';
import type {
  CrmActivity,
  CrmActivityCompareResult,
  CrmActivityListFilters,
  CrmActivitySource,
} from './crmActivityTypes.js';
import {
  compareCrmActivities,
  mapCrmLegacyFollowUpToActivity,
  mapCrmTaskToActivity,
  mapLeadEventToActivity,
  mapStrategicFollowUpToActivity,
  sortActivitiesByTimestampDesc,
} from './crmActivityMapper.js';
import type { CrmActivityFlagsInput } from './crmActivityFlags.js';
import {
  getCrmActivityFlags,
  isCrmActivityReadPrimaryEnabled,
  shouldCompareCrmActivity,
  shouldRunCrmActivityShadowRead,
} from './crmActivityFlags.js';
import { logRepositoryDev } from '../shared/repositoryV3SyncHelpers.js';

export interface CrmActivityRepositoryDeps {
  indexedDb?: ICrmIndexedDbReader;
  flagsInput?: CrmActivityFlagsInput;
}

function requireTenantId(tenantId: string): string {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenant_id ausente para Activity Stream.');
  return tid;
}

function matchesSourceFilter(
  source: CrmActivitySource,
  filter?: CrmActivitySource | CrmActivitySource[],
): boolean {
  if (!filter) return true;
  const list = Array.isArray(filter) ? filter : [filter];
  return list.includes(source);
}

function matchesActivityFilters(activity: CrmActivity, filters: CrmActivityListFilters): boolean {
  if (filters.leadId && activity.leadId !== filters.leadId) return false;
  if (filters.patientId && activity.patientId !== filters.patientId) return false;
  if (filters.status && activity.status !== filters.status) return false;
  if (filters.pending === true) {
    if (activity.status !== 'pending') return false;
  }
  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    if (!types.includes(activity.type)) return false;
  }
  if (!matchesSourceFilter(activity.source, filters.source)) return false;
  return true;
}

export class CrmActivityRepository {
  private readonly indexedDb: ICrmIndexedDbReader;
  private readonly flagsInput: CrmActivityFlagsInput;

  constructor(deps: CrmActivityRepositoryDeps = {}) {
    this.indexedDb = deps.indexedDb ?? crmIndexedDbRepository;
    this.flagsInput = deps.flagsInput ?? {};
  }

  private resolveTenant(filters: CrmActivityListFilters): string {
    return requireTenantId(String(filters.tenantId || '').trim());
  }

  listLeadEventActivities(filters: CrmActivityListFilters = {}): CrmActivity[] {
    const tenantId = this.resolveTenant(filters);
    const rows = this.indexedDb.listLeadEventsLegacySync(filters.leadId || '', {
      tenantId,
      leadId: filters.leadId,
      type: typeof filters.type === 'string' ? undefined : undefined,
    });
    return rows
      .map((row) => mapLeadEventToActivity(row, tenantId))
      .filter((a): a is CrmActivity => Boolean(a))
      .filter((a) => matchesActivityFilters(a, { ...filters, source: 'crmLeadEvents' }));
  }

  getLeadEventActivity(ref: string, tenantId: string): CrmActivity | null {
    const tid = requireTenantId(tenantId);
    const id = String(ref || '').trim();
    if (!id) return null;
    const rows = this.indexedDb.listLeadEventsLegacySync('', { tenantId: tid });
    const row = rows.find((item) => String(item.id) === id) || null;
    return mapLeadEventToActivity(row, tid);
  }

  listCrmLegacyFollowUpActivities(filters: CrmActivityListFilters = {}): CrmActivity[] {
    const tenantId = this.resolveTenant(filters);
    const rows = this.indexedDb.listCrmLegacyFollowUpsLegacySync({
      tenantId,
      leadId: filters.leadId,
      pending: filters.pending,
      status: filters.status,
    });
    return rows
      .map((row) => mapCrmLegacyFollowUpToActivity(row, tenantId))
      .filter((a): a is CrmActivity => Boolean(a))
      .filter((a) => matchesActivityFilters(a, { ...filters, source: 'crmFollowUps' }));
  }

  getCrmLegacyFollowUpActivity(ref: string, tenantId: string): CrmActivity | null {
    const tid = requireTenantId(tenantId);
    const row = this.indexedDb.getCrmLegacyFollowUpLegacySync(ref);
    return mapCrmLegacyFollowUpToActivity(row, tid);
  }

  listCrmTaskActivities(filters: CrmActivityListFilters = {}): CrmActivity[] {
    const tenantId = this.resolveTenant(filters);
    const rows = this.indexedDb.listCrmTasksLegacySync({
      tenantId,
      leadId: filters.leadId,
      patientId: filters.patientId,
      clinicId: filters.clinicId,
      pending: filters.pending,
      status: filters.status,
    });
    return rows
      .map((row) => mapCrmTaskToActivity(row, tenantId))
      .filter((a): a is CrmActivity => Boolean(a))
      .filter((a) => matchesActivityFilters(a, { ...filters, source: 'crmTasks' }));
  }

  getCrmTaskActivity(ref: string, tenantId: string): CrmActivity | null {
    const tid = requireTenantId(tenantId);
    const row = this.indexedDb.getCrmTaskLegacySync(ref);
    return mapCrmTaskToActivity(row, tid);
  }

  listStrategicFollowUpActivities(filters: CrmActivityListFilters = {}): CrmActivity[] {
    const tenantId = this.resolveTenant(filters);
    const rows = this.indexedDb.listStrategicFollowUpsLegacySync({
      tenantId,
      leadId: filters.leadId,
      patientId: filters.patientId,
      clinicId: filters.clinicId,
      pending: filters.pending,
      status: filters.status,
    });
    return rows
      .map((row) => mapStrategicFollowUpToActivity(row, tenantId))
      .filter((a): a is CrmActivity => Boolean(a))
      .filter((a) => matchesActivityFilters(a, { ...filters, source: 'followUps' }));
  }

  getStrategicFollowUpActivity(ref: string, tenantId: string): CrmActivity | null {
    const tid = requireTenantId(tenantId);
    const row = this.indexedDb.getStrategicFollowUpLegacySync(ref);
    return mapStrategicFollowUpToActivity(row, tid);
  }

  /** Stream unificado — todas as sources (ou filtradas). */
  listActivities(filters: CrmActivityListFilters = {}): CrmActivity[] {
    const sources = filters.source
      ? (Array.isArray(filters.source) ? filters.source : [filters.source])
      : (['crmLeadEvents', 'crmFollowUps', 'crmTasks', 'followUps'] as CrmActivitySource[]);

    const items: CrmActivity[] = [];
    if (sources.includes('crmLeadEvents')) {
      items.push(...this.listLeadEventActivities({ ...filters, source: undefined }));
    }
    if (sources.includes('crmFollowUps')) {
      items.push(...this.listCrmLegacyFollowUpActivities({ ...filters, source: undefined }));
    }
    if (sources.includes('crmTasks')) {
      items.push(...this.listCrmTaskActivities({ ...filters, source: undefined }));
    }
    if (sources.includes('followUps')) {
      items.push(...this.listStrategicFollowUpActivities({ ...filters, source: undefined }));
    }
    return sortActivitiesByTimestampDesc(items);
  }

  /**
   * Shadow: monta Activity Stream e descarta.
   * Logs apenas em DEV.
   */
  shadowReadDiscard(tenantId: string, filters: CrmActivityListFilters = {}): void {
    if (!shouldRunCrmActivityShadowRead(this.flagsInput)) return;
    const normalized = requireTenantId(tenantId);
    try {
      const items = this.listActivities({ ...filters, tenantId: normalized });
      logRepositoryDev('CRM_ACTIVITY_SHADOW', 'shadow-read', {
        tenantId: normalized,
        count: items.length,
        discarded: true,
      });
    } catch (err) {
      logRepositoryDev('CRM_ACTIVITY_SHADOW', 'shadow-read-error', {
        tenantId: normalized,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Compare: Activity Stream vs re-leitura IDB (mesma fonte — valida mapper).
   * Nunca altera resposta ao caller.
   */
  compareActivityStream(
    tenantId: string,
    filters: CrmActivityListFilters = {},
  ): CrmActivityCompareResult[] | null {
    if (!shouldCompareCrmActivity(this.flagsInput)) return null;
    const normalized = requireTenantId(tenantId);
    const primary = this.listActivities({ ...filters, tenantId: normalized });
    const secondary = this.listActivities({ ...filters, tenantId: normalized });
    const byId = new Map(secondary.map((item) => [`${item.source}:${item.id}`, item]));
    const results: CrmActivityCompareResult[] = [];
    for (const item of primary) {
      const other = byId.get(`${item.source}:${item.id}`) || null;
      const comparison = compareCrmActivities(item, other);
      if (!comparison.match) {
        results.push(comparison);
        logRepositoryDev('CRM_ACTIVITY_COMPARE', 'mismatch', {
          tenantId: normalized,
          id: item.id,
          source: item.source,
          diffs: comparison.diffs,
        });
      }
    }
    logRepositoryDev('CRM_ACTIVITY_COMPARE', 'summary', {
      tenantId: normalized,
      compared: primary.length,
      mismatches: results.length,
    });
    return results;
  }

  isReadPrimaryEnabled(): boolean {
    return isCrmActivityReadPrimaryEnabled(this.flagsInput);
  }

  getFlags() {
    return getCrmActivityFlags(this.flagsInput);
  }
}

export function createCrmActivityRepository(
  deps: CrmActivityRepositoryDeps = {},
): CrmActivityRepository {
  return new CrmActivityRepository(deps);
}
