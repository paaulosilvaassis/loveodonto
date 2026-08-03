/**
 * @module repositories/crm/crmRepositorySync
 * @description Helpers de sync/hydrate/compare — Phase 6.1 foundation (não ativados).
 */

import { withDb } from '../../db/index.js';
import {
  compareCoreFieldSets,
  isBrowserOffline,
  isRemoteReadUnavailableError,
  logRepositoryDev,
} from '../shared/repositoryV3SyncHelpers.js';
import type { ICrmCache, LeadCore, PipelineStageCore } from './crmTypes.js';
import {
  mapCoreToLeadLegacyRow,
  mapCoreToPipelineStageLegacyRow,
  mapLegacyRowToLeadCore,
} from './crmMapper.js';

export { isBrowserOffline, isRemoteReadUnavailableError };

const LEAD_COMPARE_FIELDS = [
  'legacyId',
  'stageKey',
  'patientId',
  'assignedToUserId',
  'name',
  'phone',
  'source',
  'createdAt',
  'updatedAt',
] as const;

const PIPELINE_COMPARE_FIELDS = [
  'legacyId',
  'key',
  'label',
  'order',
  'isActive',
  'stageType',
] as const;

/**
 * Hidrata cache em memória + espelho IndexedDB a partir do roster remoto.
 * Não altera services legados — apenas crmLeads[] mirror.
 */
export function hydrateCrmIdbCache(
  items: LeadCore[],
  tenantId: string,
  cache: ICrmCache,
): number {
  const tid = String(tenantId || '').trim();
  if (!tid || !Array.isArray(items)) return 0;
  let count = 0;
  withDb((db) => {
    if (!Array.isArray(db.crmLeads)) db.crmLeads = [];
    for (const core of items) {
      if (core.tenantId !== tid) continue;
      const legacy = mapCoreToLeadLegacyRow(core);
      const idx = db.crmLeads.findIndex((row) => String(row.id) === legacy.id);
      if (idx >= 0) {
        db.crmLeads[idx] = { ...db.crmLeads[idx], ...legacy };
      } else {
        db.crmLeads.push(legacy);
      }
      cache.setLead(tid, core);
      count += 1;
    }
    return db;
  });
  return count;
}

/**
 * Hidrata espelho IndexedDB para pipeline stages após primary write.
 * Não ativa sync global — apenas merge pontual pós-escrita.
 */
export function hydrateCrmPipelineStageIdbCache(
  items: PipelineStageCore[],
  tenantId: string,
): number {
  const tid = String(tenantId || '').trim();
  if (!tid || !Array.isArray(items)) return 0;
  let count = 0;
  withDb((db) => {
    if (!Array.isArray(db.crmPipelineStages)) db.crmPipelineStages = [];
    for (const core of items) {
      if (core.tenantId !== tid) continue;
      const legacy = mapCoreToPipelineStageLegacyRow(core);
      const idx = db.crmPipelineStages.findIndex((row) => String(row.id) === legacy.id);
      if (idx >= 0) {
        db.crmPipelineStages[idx] = { ...db.crmPipelineStages[idx], ...legacy };
      } else {
        db.crmPipelineStages.push(legacy);
      }
      count += 1;
    }
    return db;
  });
  return count;
}

/** Remove stage do IndexedDB após delete remoto em primary write. */
export function removeCrmPipelineStageFromIdb(
  tenantId: string,
  legacyId: string,
): boolean {
  const tid = String(tenantId || '').trim();
  const ref = String(legacyId || '').trim();
  if (!tid || !ref) return false;
  let removed = false;
  withDb((db) => {
    if (!Array.isArray(db.crmPipelineStages)) return db;
    const before = db.crmPipelineStages.length;
    db.crmPipelineStages = db.crmPipelineStages.filter(
      (row) => !(String(row.id) === ref && String(row.tenant_id) === tid),
    );
    removed = db.crmPipelineStages.length < before;
    return db;
  });
  return removed;
}

export function compareLeadShapes(
  idbCore: LeadCore | null,
  remoteCore: LeadCore | null,
): Record<string, unknown> {
  return compareCoreFieldSets(idbCore, remoteCore, LEAD_COMPARE_FIELDS);
}

export function comparePipelineStageShapes(
  idbCore: import('./crmTypes.js').PipelineStageCore | null,
  remoteCore: import('./crmTypes.js').PipelineStageCore | null,
): Record<string, unknown> {
  return compareCoreFieldSets(idbCore, remoteCore, PIPELINE_COMPARE_FIELDS);
}

export async function shadowReadDiscardRemote(
  fetchFn: () => Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    const result = await fetchFn();
    const count = Array.isArray(result) ? result.length : result ? 1 : 0;
    logCrmShadowDev('shadow-read', { label, count, discarded: true });
  } catch (err) {
    logCrmShadowDev('shadow-read-error', {
      label,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function logCrmReadDev(event: string, payload: Record<string, unknown>): void {
  logRepositoryDev('CRM_READ', event, payload);
}

export function logCrmShadowDev(event: string, payload: Record<string, unknown>): void {
  logRepositoryDev('CRM_SHADOW', event, payload);
}

export function logCrmWriteDev(event: string, payload: Record<string, unknown>): void {
  logRepositoryDev('CRM_WRITE', event, payload);
}

export function compareCrmWriteLegacyVsRemote(
  domain: 'lead' | 'pipeline-stage',
  legacyCore: LeadCore | import('./crmTypes.js').PipelineStageCore | null,
  remoteCore: LeadCore | import('./crmTypes.js').PipelineStageCore | null,
): Record<string, unknown> {
  if (domain === 'lead') {
    return compareLeadShapes(legacyCore as LeadCore | null, remoteCore as LeadCore | null);
  }
  return comparePipelineStageShapes(
    legacyCore as import('./crmTypes.js').PipelineStageCore | null,
    remoteCore as import('./crmTypes.js').PipelineStageCore | null,
  );
}

export { mapLegacyRowToLeadCore };
