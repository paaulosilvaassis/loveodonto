/**
 * @module repositories/crm/crmActivityHydrate
 * @description Hydrate pontual pós Primary Write — Phase 6.8.
 * Sem hydrate global / sem sync permanente.
 */

import { withDb } from '../../db/index.js';
import type { CrmActivity, CrmActivitySource } from './crmActivityTypes.js';
import {
  mapActivityToCrmLegacyFollowUpLegacy,
  mapActivityToCrmTaskLegacy,
  mapActivityToLeadEventLegacy,
  mapActivityToStrategicFollowUpLegacy,
} from './crmActivityMapper.js';
import type { CrmActivityWriteOperation } from './crmActivityWritePipeline.js';

function mergeById(
  collection: Array<{ id?: string }>,
  legacy: { id: string },
): number {
  const idx = collection.findIndex((row) => String(row.id) === legacy.id);
  if (idx >= 0) {
    collection[idx] = { ...collection[idx], ...legacy };
  } else {
    collection.push(legacy);
  }
  return 1;
}

/**
 * Espelha Activity remota nas stores IDB canônicas.
 * Delete remove o registro da store correspondente.
 */
export function hydrateCrmActivityIdbFromRemote(
  activity: CrmActivity,
  operation: CrmActivityWriteOperation,
  sourceStore: CrmActivitySource,
): number {
  const tid = String(activity.tenantId || '').trim();
  if (!tid || !activity.id) return 0;

  if (operation === 'delete') {
    // Idempotente: remove se existir; ausência (já deletado no legado) também conta como ok.
    removeCrmActivityFromIdb(sourceStore, tid, activity.id);
    return 1;
  }

  let count = 0;
  withDb((db) => {
    if (sourceStore === 'crmLeadEvents') {
      if (!Array.isArray(db.crmLeadEvents)) db.crmLeadEvents = [];
      const legacy = mapActivityToLeadEventLegacy(activity);
      count = mergeById(db.crmLeadEvents, legacy);
    } else if (sourceStore === 'crmFollowUps') {
      if (!Array.isArray(db.crmFollowUps)) db.crmFollowUps = [];
      const legacy = mapActivityToCrmLegacyFollowUpLegacy(activity);
      count = mergeById(db.crmFollowUps, legacy);
    } else if (sourceStore === 'crmTasks') {
      if (!Array.isArray(db.crmTasks)) db.crmTasks = [];
      const legacy = mapActivityToCrmTaskLegacy(activity);
      count = mergeById(db.crmTasks, legacy);
    } else if (sourceStore === 'followUps') {
      if (!Array.isArray(db.followUps)) db.followUps = [];
      const legacy = mapActivityToStrategicFollowUpLegacy(activity);
      count = mergeById(db.followUps, legacy);
    }
    return db;
  });
  return count;
}

export function removeCrmActivityFromIdb(
  sourceStore: CrmActivitySource,
  tenantId: string,
  legacyId: string,
): boolean {
  const tid = String(tenantId || '').trim();
  const ref = String(legacyId || '').trim();
  if (!tid || !ref) return false;
  let removed = false;
  withDb((db) => {
    if (sourceStore === 'crmLeadEvents' && Array.isArray(db.crmLeadEvents)) {
      const before = db.crmLeadEvents.length;
      db.crmLeadEvents = db.crmLeadEvents.filter((row) => String(row.id) !== ref);
      removed = db.crmLeadEvents.length < before;
    } else if (sourceStore === 'crmFollowUps' && Array.isArray(db.crmFollowUps)) {
      const before = db.crmFollowUps.length;
      db.crmFollowUps = db.crmFollowUps.filter((row) => String(row.id) !== ref);
      removed = db.crmFollowUps.length < before;
    } else if (sourceStore === 'crmTasks' && Array.isArray(db.crmTasks)) {
      const before = db.crmTasks.length;
      db.crmTasks = db.crmTasks.filter((row) => String(row.id) !== ref);
      removed = db.crmTasks.length < before;
    } else if (sourceStore === 'followUps' && Array.isArray(db.followUps)) {
      const before = db.followUps.length;
      db.followUps = db.followUps.filter((row) => String(row.id) !== ref);
      removed = db.followUps.length < before;
    }
    return db;
  });
  return removed;
}

/**
 * Projeção Activity Stream: confirma que Activity remota mapeia de volta ao shape legado.
 * Não cria store extra — validação in-memory da projection.
 */
export function projectCrmActivityStreamAfterHydrate(
  activity: CrmActivity,
  sourceStore: CrmActivitySource,
): Record<string, unknown> {
  if (sourceStore === 'crmLeadEvents') {
    const legacy = mapActivityToLeadEventLegacy(activity);
    return { source: sourceStore, projectedId: legacy.id, leadId: legacy.leadId, type: legacy.type };
  }
  if (sourceStore === 'crmFollowUps') {
    const legacy = mapActivityToCrmLegacyFollowUpLegacy(activity);
    return {
      source: sourceStore,
      projectedId: legacy.id,
      leadId: legacy.leadId,
      status: legacy.doneAt ? 'done' : 'pending',
    };
  }
  if (sourceStore === 'crmTasks') {
    const legacy = mapActivityToCrmTaskLegacy(activity);
    return { source: sourceStore, projectedId: legacy.id, title: legacy.title, status: legacy.status };
  }
  const legacy = mapActivityToStrategicFollowUpLegacy(activity);
  return {
    source: sourceStore,
    projectedId: legacy.id,
    dueDate: legacy.dueDate,
    status: legacy.status,
  };
}
