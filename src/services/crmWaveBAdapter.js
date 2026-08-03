/**
 * Adapter Wave B CRM — Phase 6.6 Activity Stream Read Cutover.
 *
 * Flags OFF → sempre null → services usam IndexedDB legado (zero alteração funcional).
 * CRM_ACTIVITY_READ_PRIMARY → retorna shapes legados via Activity Stream (IDB).
 * CRM_ACTIVITY_SHADOW → paralelismo descartado (DEV logs).
 * CRM_ACTIVITY_COMPARE → compara mapper (nunca altera resposta).
 */
import { normalizeTenantId } from './tenantIsolation.js';
import { getCrmTenantIdFromDbSync } from '../repositories/crm/crmIndexedDbRepository.ts';
import {
  createCrmActivityRepository,
} from '../repositories/crm/crmActivityRepository.ts';
import {
  getCrmActivityFlags,
  isCrmActivityReadPrimaryEnabled,
  shouldCompareCrmActivity,
  shouldRunCrmActivityShadowRead,
} from '../repositories/crm/crmActivityFlags.ts';
import {
  mapActivityToCrmLegacyFollowUpLegacy,
  mapActivityToCrmTaskLegacy,
  mapActivityToLeadEventLegacy,
  mapActivityToStrategicFollowUpLegacy,
} from '../repositories/crm/crmActivityMapper.ts';
import { scheduleRepositoryMicrotask } from '../repositories/shared/repositoryV3SyncHelpers.ts';

/** @type {import('../repositories/crm/crmActivityFlags.ts').CrmActivityFlagsInput | null} */
let flagsInputOverride = null;

/** @type {(() => import('../repositories/crm/crmActivityRepository.ts').CrmActivityRepository) | null} */
let activityRepositoryFactoryOverride = null;

export function __setCrmActivityFlagsForTest(input) {
  flagsInputOverride = input;
}

export function __setCrmActivityRepositoryFactoryForTest(factory) {
  activityRepositoryFactoryOverride = factory;
}

function activityFlagsInput() {
  return flagsInputOverride ?? {};
}

function getActivityRepository() {
  const factory = activityRepositoryFactoryOverride ?? createCrmActivityRepository;
  return factory({ flagsInput: activityFlagsInput() });
}

function resolveTenantId(hint = '') {
  return normalizeTenantId(hint) || normalizeTenantId(getCrmTenantIdFromDbSync()) || '';
}

export function shouldUseCrmActivityReadPrimary() {
  return isCrmActivityReadPrimaryEnabled(activityFlagsInput());
}

export function shouldRunCrmActivityShadowFromAdapter() {
  return shouldRunCrmActivityShadowRead(activityFlagsInput());
}

export function shouldCompareCrmActivityFromAdapter() {
  return shouldCompareCrmActivity(activityFlagsInput());
}

export function getCrmActivityFlagsForAdapter() {
  return getCrmActivityFlags(activityFlagsInput());
}

function scheduleActivityShadowCompare(tenantId, filters = {}) {
  const runShadow = shouldRunCrmActivityShadowFromAdapter();
  const runCompare = shouldCompareCrmActivityFromAdapter();
  if (!runShadow && !runCompare) return;
  const normalized = resolveTenantId(tenantId);
  if (!normalized) return;
  scheduleRepositoryMicrotask(() => {
    try {
      const repo = getActivityRepository();
      if (runShadow) repo.shadowReadDiscard(normalized, filters);
      if (runCompare) repo.compareActivityStream(normalized, filters);
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[CRM_ACTIVITY_SHADOW] skipped:', err instanceof Error ? err.message : err);
      }
    }
  });
}

/**
 * Timeline — Primary Read via Activity Stream.
 * @returns {null|Array} null = caller usa legado
 */
export function readListLeadEventsWaveB(leadId, tenantId = '') {
  scheduleActivityShadowCompare(tenantId, { leadId });
  if (!shouldUseCrmActivityReadPrimary()) return null;
  const tid = resolveTenantId(tenantId);
  if (!tid) return null;
  const activities = getActivityRepository().listLeadEventActivities({
    tenantId: tid,
    leadId: String(leadId || '').trim() || undefined,
  });
  return activities.map(mapActivityToLeadEventLegacy);
}

export function readGetLeadEventWaveB(eventId, tenantId = '') {
  if (!shouldUseCrmActivityReadPrimary()) return null;
  const tid = resolveTenantId(tenantId);
  if (!tid) return null;
  const activity = getActivityRepository().getLeadEventActivity(eventId, tid);
  return activity ? mapActivityToLeadEventLegacy(activity) : null;
}

/**
 * CRM FollowUps legado (`crmFollowUps`).
 */
export function readListCrmLegacyFollowUpsWaveB(filters = {}) {
  const tenantId = resolveTenantId(filters.tenantId);
  scheduleActivityShadowCompare(tenantId, filters);
  if (!shouldUseCrmActivityReadPrimary()) return null;
  if (!tenantId) return null;
  const activities = getActivityRepository().listCrmLegacyFollowUpActivities({
    ...filters,
    tenantId,
  });
  return activities.map(mapActivityToCrmLegacyFollowUpLegacy);
}

export function readGetCrmLegacyFollowUpWaveB(ref, tenantId = '') {
  if (!shouldUseCrmActivityReadPrimary()) return null;
  const tid = resolveTenantId(tenantId);
  if (!tid) return null;
  const activity = getActivityRepository().getCrmLegacyFollowUpActivity(ref, tid);
  return activity ? mapActivityToCrmLegacyFollowUpLegacy(activity) : null;
}

/**
 * CRM Tasks (`crmTasks`).
 */
export function readListCrmTasksWaveB(filters = {}) {
  const tenantId = resolveTenantId(filters.tenantId);
  scheduleActivityShadowCompare(tenantId, filters);
  if (!shouldUseCrmActivityReadPrimary()) return null;
  if (!tenantId) return null;
  const activities = getActivityRepository().listCrmTaskActivities({
    ...filters,
    tenantId,
  });
  return activities.map(mapActivityToCrmTaskLegacy);
}

export function readGetCrmTaskWaveB(ref, tenantId = '') {
  if (!shouldUseCrmActivityReadPrimary()) return null;
  const tid = resolveTenantId(tenantId);
  if (!tid) return null;
  const activity = getActivityRepository().getCrmTaskActivity(ref, tid);
  return activity ? mapActivityToCrmTaskLegacy(activity) : null;
}

/**
 * Strategic FollowUps (`followUps`).
 */
export function readListStrategicFollowUpsWaveB(filters = {}) {
  const tenantId = resolveTenantId(filters.tenantId);
  scheduleActivityShadowCompare(tenantId, filters);
  if (!shouldUseCrmActivityReadPrimary()) return null;
  if (!tenantId) return null;
  const activities = getActivityRepository().listStrategicFollowUpActivities({
    ...filters,
    tenantId,
  });
  return activities.map(mapActivityToStrategicFollowUpLegacy);
}

export function readGetStrategicFollowUpWaveB(ref, tenantId = '') {
  if (!shouldUseCrmActivityReadPrimary()) return null;
  const tid = resolveTenantId(tenantId);
  if (!tid) return null;
  const activity = getActivityRepository().getStrategicFollowUpActivity(ref, tid);
  return activity ? mapActivityToStrategicFollowUpLegacy(activity) : null;
}

/**
 * Activity Stream unificado (DTO interno) — não exposto a pages nesta phase.
 */
export function readListActivitiesWaveB(filters = {}) {
  scheduleActivityShadowCompare(filters.tenantId, filters);
  if (!shouldUseCrmActivityReadPrimary()) return null;
  const tenantId = resolveTenantId(filters.tenantId);
  if (!tenantId) return null;
  return getActivityRepository().listActivities({ ...filters, tenantId });
}

/** Test helpers */
export async function __listLeadEventsCoreForTest(tenantId, filters = {}) {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return [];
  return getActivityRepository().listLeadEventActivities({ ...filters, tenantId: normalized });
}

export async function __listCrmLegacyFollowUpsCoreForTest(tenantId, filters = {}) {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return [];
  return getActivityRepository().listCrmLegacyFollowUpActivities({ ...filters, tenantId: normalized });
}

export async function __listCrmTasksCoreForTest(tenantId, filters = {}) {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return [];
  return getActivityRepository().listCrmTaskActivities({ ...filters, tenantId: normalized });
}

export async function __listStrategicFollowUpsCoreForTest(tenantId, filters = {}) {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return [];
  return getActivityRepository().listStrategicFollowUpActivities({ ...filters, tenantId: normalized });
}

export async function __listActivitiesForTest(tenantId, filters = {}) {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return [];
  return getActivityRepository().listActivities({ ...filters, tenantId: normalized });
}

export async function __shadowCrmActivityForTest(tenantId, filters = {}) {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  getActivityRepository().shadowReadDiscard(normalized, filters);
}

export async function __compareCrmActivityForTest(tenantId, filters = {}) {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return null;
  return getActivityRepository().compareActivityStream(normalized, filters);
}

/** Inventário estático — documentação de duplicidade Wave B. */
export const CRM_WAVE_B_DOMAIN_INVENTORY = Object.freeze({
  leadEvents: {
    store: 'crmLeadEvents',
    service: 'crmService',
    methods: ['listLeadEvents', 'getLeadEvents', 'addLeadEvent', 'logLeadEvent'],
  },
  crmLegacyFollowUps: {
    store: 'crmFollowUps',
    service: 'crmService',
    methods: ['listFollowUps', 'getCrmFollowUp', 'createFollowUp'],
  },
  crmTasks: {
    store: 'crmTasks',
    service: 'crmTaskService',
    methods: ['listTasks', 'getTask', 'createTask', 'completeTask', 'updateTask', 'cancelTask', 'deleteTask'],
  },
  strategicFollowUps: {
    store: 'followUps',
    service: 'followUpService',
    methods: ['listFollowUps', 'getStrategicFollowUp', 'createFollowUp', 'completeFollowUp'],
  },
  activityStream: {
    dto: 'CrmActivity',
    repository: 'crmActivityRepository',
    unification: 'Repository Layer only — stores remain intact',
  },
  duplicationNote:
    'crmFollowUps, crmTasks e followUps são stores distintas com overlap conceitual; unificação apenas via Activity Stream DTO.',
});
