/**
 * Adapter de escrita Activity Stream — Phase 6.7 dual-write + Phase 6.8 Primary Write.
 *
 * Dual: Legacy Write (IDB) → Pipeline → remote shadow → descarta.
 * Primary: Legacy Write (IDB) → Pipeline → remote SSOT → hydrate pontual.
 * Flags OFF = no-op (100% legado). Primary failure → fallbackLegacy (IDB preservado).
 */
import { normalizeTenantId } from './tenantIsolation.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';
import { getCrmTenantIdFromDbSync } from '../repositories/crm/crmIndexedDbRepository.ts';
import {
  mapLeadEventToActivity,
  mapCrmLegacyFollowUpToActivity,
  mapCrmTaskToActivity,
  mapStrategicFollowUpToActivity,
} from '../repositories/crm/crmActivityMapper.ts';
import {
  runCrmActivityWritePipeline,
} from '../repositories/crm/crmActivityWritePipeline.ts';
import {
  getCrmActivityFlags,
  isCrmActivityDualWriteOnlyEnabled,
  isCrmActivityWritePrimaryEnabled,
  shouldCompareCrmActivityWrite,
} from '../repositories/crm/crmActivityFlags.ts';
import {
  buildCrmActivityWriteSoakReport,
  recordCrmActivityWriteSoakFallbackLegacy,
} from '../repositories/crm/crmActivityWriteSoak.ts';
import { handleRepositoryWriteFallback } from '../repositories/shared/repositoryV3Fallback.ts';

/** @type {import('../repositories/crm/crmActivityFlags.ts').CrmActivityFlagsInput | null} */
let flagsInputOverride = null;

/** @type {((activity: any, operation: string, meta: any) => Promise<any>) | null} */
let remoteExecutorOverride = null;

export function __setCrmActivityWriteFlagsForTest(input) {
  flagsInputOverride = input;
}

export function __setCrmActivityWriteRemoteForTest(fn) {
  remoteExecutorOverride = fn;
}

function activityFlagsInput() {
  return flagsInputOverride ?? {};
}

export function shouldUseCrmActivityDualWrite() {
  return isCrmActivityDualWriteOnlyEnabled(activityFlagsInput());
}

export function shouldUseCrmActivityWritePrimary() {
  return isCrmActivityWritePrimaryEnabled(activityFlagsInput());
}

export function getCrmActivityWriteFlagsForAdapter() {
  return getCrmActivityFlags(activityFlagsInput());
}

function resolveTenantId(user, record = {}) {
  return normalizeTenantId(
    record?.tenant_id
    || record?.tenantId
    || resolveTenantIdForWrite(user, null)
    || getCrmTenantIdFromDbSync(),
  );
}

function logDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[CRM_ACTIVITY_WRITE_ADAPTER]', event, payload);
}

async function runWriteSafe(runner, context) {
  try {
    await runner();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'activity-write failed');
    if (context.mode === 'primary') {
      recordCrmActivityWriteSoakFallbackLegacy(err);
    }
    handleRepositoryWriteFallback({
      domain: context.domain,
      tenantId: context.tenantId,
      legacyId: context.legacyId,
      correlationId: context.legacyId,
      writeSource: context.mode === 'primary' ? 'primary-write-hydrate' : 'legacy-dual-write',
      event: context.event,
      error: err,
    });
    logDev(context.event, {
      ...context,
      ok: false,
      error: message,
      rollback: 'indexeddb-preserved',
    });
    return { ok: false, error: message };
  }
}

function scheduleActivityWrite(runner, context) {
  const isPrimary = shouldUseCrmActivityWritePrimary();
  const isDual = shouldUseCrmActivityDualWrite();
  if (!isPrimary && !isDual) return;
  const mode = isPrimary ? 'primary' : 'dual';
  queueMicrotask(() => {
    void runWriteSafe(runner, { ...context, mode });
  });
}

function withTenantOnRow(row, tenantId) {
  if (!row) return row;
  return { ...row, tenant_id: row.tenant_id || tenantId };
}

async function executePipeline(activity, operation) {
  return runCrmActivityWritePipeline(
    {
      activity,
      operation,
      executeRemote: remoteExecutorOverride
        ? (act, op, meta) => remoteExecutorOverride(act, op, meta)
        : undefined,
    },
    activityFlagsInput(),
  );
}

function assertWriteEnabledForTest() {
  return shouldUseCrmActivityDualWrite() || shouldUseCrmActivityWritePrimary();
}

function writeMode() {
  return shouldUseCrmActivityWritePrimary() ? 'primary' : 'dual';
}

/* ─── Timeline ───────────────────────────────────────────────────────────── */

export function scheduleActivityDualWriteCreateLeadEvent(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId || !record?.id) return;
  scheduleActivityWrite(
    async () => {
      const activity = mapLeadEventToActivity(withTenantOnRow(record, tenantId), tenantId);
      if (!activity) return;
      await executePipeline(activity, 'create');
      logDev('createLeadEvent', { tenantId, legacyId: record.id, ok: true });
    },
    { domain: 'lead-event', tenantId, legacyId: record.id, event: 'createLeadEvent' },
  );
}

export function scheduleActivityDualWriteUpdateLeadEvent(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId || !record?.id) return;
  scheduleActivityWrite(
    async () => {
      const activity = mapLeadEventToActivity(withTenantOnRow(record, tenantId), tenantId);
      if (!activity) return;
      await executePipeline(activity, 'update');
      logDev('updateLeadEvent', { tenantId, legacyId: record.id, ok: true });
    },
    { domain: 'lead-event', tenantId, legacyId: record.id, event: 'updateLeadEvent' },
  );
}

/* ─── CRM Tasks ──────────────────────────────────────────────────────────── */

export function scheduleActivityDualWriteCreateTask(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId || !record?.id) return;
  scheduleActivityWrite(
    async () => {
      const activity = mapCrmTaskToActivity(withTenantOnRow(record, tenantId), tenantId);
      if (!activity) return;
      await executePipeline(activity, 'create');
      logDev('createTask', { tenantId, legacyId: record.id, ok: true });
    },
    { domain: 'crm-task', tenantId, legacyId: record.id, event: 'createTask' },
  );
}

export function scheduleActivityDualWriteUpdateTask(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId || !record?.id) return;
  scheduleActivityWrite(
    async () => {
      const activity = mapCrmTaskToActivity(withTenantOnRow(record, tenantId), tenantId);
      if (!activity) return;
      await executePipeline(activity, 'update');
      logDev('updateTask', { tenantId, legacyId: record.id, ok: true });
    },
    { domain: 'crm-task', tenantId, legacyId: record.id, event: 'updateTask' },
  );
}

export function scheduleActivityDualWriteCompleteTask(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId || !record?.id) return;
  scheduleActivityWrite(
    async () => {
      const activity = mapCrmTaskToActivity(withTenantOnRow(record, tenantId), tenantId);
      if (!activity) return;
      await executePipeline(activity, 'complete');
      logDev('completeTask', { tenantId, legacyId: record.id, ok: true });
    },
    { domain: 'crm-task', tenantId, legacyId: record.id, event: 'completeTask' },
  );
}

export function scheduleActivityDualWriteDeleteTask(user, taskId, tenantIdHint = '') {
  const tenantId = normalizeTenantId(tenantIdHint || resolveTenantId(user, {}));
  if (!tenantId || !taskId) return;
  scheduleActivityWrite(
    async () => {
      const activity = {
        id: String(taskId),
        type: 'TASK',
        leadId: null,
        patientId: null,
        ownerId: user?.id || null,
        timestamp: new Date().toISOString(),
        status: 'canceled',
        payload: { deleted: true },
        source: 'crmTasks',
        tenantId,
      };
      await executePipeline(activity, 'delete');
      logDev('deleteTask', { tenantId, legacyId: taskId, ok: true });
    },
    { domain: 'crm-task', tenantId, legacyId: taskId, event: 'deleteTask' },
  );
}

/* ─── CRM FollowUps (legado) ─────────────────────────────────────────────── */

export function scheduleActivityDualWriteCreateCrmFollowUp(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId || !record?.id) return;
  scheduleActivityWrite(
    async () => {
      const activity = mapCrmLegacyFollowUpToActivity(withTenantOnRow(record, tenantId), tenantId);
      if (!activity) return;
      await executePipeline(activity, 'create');
      logDev('createCrmFollowUp', { tenantId, legacyId: record.id, ok: true });
    },
    { domain: 'crm-legacy-followup', tenantId, legacyId: record.id, event: 'createCrmFollowUp' },
  );
}

export function scheduleActivityDualWriteUpdateCrmFollowUp(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId || !record?.id) return;
  scheduleActivityWrite(
    async () => {
      const activity = mapCrmLegacyFollowUpToActivity(withTenantOnRow(record, tenantId), tenantId);
      if (!activity) return;
      await executePipeline(activity, 'update');
      logDev('updateCrmFollowUp', { tenantId, legacyId: record.id, ok: true });
    },
    { domain: 'crm-legacy-followup', tenantId, legacyId: record.id, event: 'updateCrmFollowUp' },
  );
}

/* ─── Strategic FollowUps ────────────────────────────────────────────────── */

export function scheduleActivityDualWriteCreateStrategicFollowUp(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId || !record?.id) return;
  scheduleActivityWrite(
    async () => {
      const activity = mapStrategicFollowUpToActivity(withTenantOnRow(record, tenantId), tenantId);
      if (!activity) return;
      await executePipeline(activity, 'create');
      logDev('createStrategicFollowUp', { tenantId, legacyId: record.id, ok: true });
    },
    { domain: 'strategic-followup', tenantId, legacyId: record.id, event: 'createStrategicFollowUp' },
  );
}

export function scheduleActivityDualWriteUpdateStrategicFollowUp(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId || !record?.id) return;
  scheduleActivityWrite(
    async () => {
      const activity = mapStrategicFollowUpToActivity(withTenantOnRow(record, tenantId), tenantId);
      if (!activity) return;
      await executePipeline(activity, 'update');
      logDev('updateStrategicFollowUp', { tenantId, legacyId: record.id, ok: true });
    },
    { domain: 'strategic-followup', tenantId, legacyId: record.id, event: 'updateStrategicFollowUp' },
  );
}

/* ─── Test helpers (awaitable) ───────────────────────────────────────────── */

export async function __runActivityDualWriteCreateLeadEventForTest(user, record) {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = mapLeadEventToActivity(withTenantOnRow(record, tenantId), tenantId);
    if (!activity) throw new Error('activity map failed');
    await executePipeline(activity, 'create');
  }, { domain: 'lead-event', tenantId, legacyId: record.id, event: 'createLeadEvent', mode: writeMode() });
}

export async function __runActivityDualWriteCreateTaskForTest(user, record) {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = mapCrmTaskToActivity(withTenantOnRow(record, tenantId), tenantId);
    if (!activity) throw new Error('activity map failed');
    await executePipeline(activity, 'create');
  }, { domain: 'crm-task', tenantId, legacyId: record.id, event: 'createTask', mode: writeMode() });
}

export async function __runActivityDualWriteCompleteTaskForTest(user, record) {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = mapCrmTaskToActivity(withTenantOnRow(record, tenantId), tenantId);
    if (!activity) throw new Error('activity map failed');
    await executePipeline(activity, 'complete');
  }, { domain: 'crm-task', tenantId, legacyId: record.id, event: 'completeTask', mode: writeMode() });
}

export async function __runActivityDualWriteDeleteTaskForTest(user, taskId, tenantIdHint = '') {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = normalizeTenantId(tenantIdHint || resolveTenantId(user, {}));
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = {
      id: String(taskId),
      type: 'TASK',
      leadId: null,
      patientId: null,
      ownerId: user?.id || null,
      timestamp: new Date().toISOString(),
      status: 'canceled',
      payload: { deleted: true },
      source: 'crmTasks',
      tenantId,
    };
    await executePipeline(activity, 'delete');
  }, { domain: 'crm-task', tenantId, legacyId: taskId, event: 'deleteTask', mode: writeMode() });
}

export async function __runActivityDualWriteCreateCrmFollowUpForTest(user, record) {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = mapCrmLegacyFollowUpToActivity(withTenantOnRow(record, tenantId), tenantId);
    if (!activity) throw new Error('activity map failed');
    await executePipeline(activity, 'create');
  }, { domain: 'crm-legacy-followup', tenantId, legacyId: record.id, event: 'createCrmFollowUp', mode: writeMode() });
}

export async function __runActivityDualWriteCreateStrategicFollowUpForTest(user, record) {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = mapStrategicFollowUpToActivity(withTenantOnRow(record, tenantId), tenantId);
    if (!activity) throw new Error('activity map failed');
    await executePipeline(activity, 'create');
  }, { domain: 'strategic-followup', tenantId, legacyId: record.id, event: 'createStrategicFollowUp', mode: writeMode() });
}

/** Aliases Primary Write — Phase 6.8 (mesmo path; modes via flags). */
export const __runCrmActivityPrimaryWriteCreateLeadEventForTest =
  __runActivityDualWriteCreateLeadEventForTest;
export const __runCrmActivityPrimaryWriteCreateTaskForTest =
  __runActivityDualWriteCreateTaskForTest;
export const __runCrmActivityPrimaryWriteCompleteTaskForTest =
  __runActivityDualWriteCompleteTaskForTest;
export const __runCrmActivityPrimaryWriteDeleteTaskForTest =
  __runActivityDualWriteDeleteTaskForTest;
export const __runCrmActivityPrimaryWriteCreateCrmFollowUpForTest =
  __runActivityDualWriteCreateCrmFollowUpForTest;
export const __runCrmActivityPrimaryWriteCreateStrategicFollowUpForTest =
  __runActivityDualWriteCreateStrategicFollowUpForTest;

export async function __runCrmActivityWriteUpdateLeadEventForTest(user, record) {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = mapLeadEventToActivity(withTenantOnRow(record, tenantId), tenantId);
    if (!activity) throw new Error('activity map failed');
    await executePipeline(activity, 'update');
  }, { domain: 'lead-event', tenantId, legacyId: record.id, event: 'updateLeadEvent', mode: writeMode() });
}

export async function __runCrmActivityWriteUpdateTaskForTest(user, record) {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = mapCrmTaskToActivity(withTenantOnRow(record, tenantId), tenantId);
    if (!activity) throw new Error('activity map failed');
    await executePipeline(activity, 'update');
  }, { domain: 'crm-task', tenantId, legacyId: record.id, event: 'updateTask', mode: writeMode() });
}

export async function __runCrmActivityWriteUpdateCrmFollowUpForTest(user, record) {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = mapCrmLegacyFollowUpToActivity(withTenantOnRow(record, tenantId), tenantId);
    if (!activity) throw new Error('activity map failed');
    await executePipeline(activity, 'update');
  }, { domain: 'crm-legacy-followup', tenantId, legacyId: record.id, event: 'updateCrmFollowUp', mode: writeMode() });
}

export async function __runCrmActivityWriteUpdateStrategicFollowUpForTest(user, record) {
  if (!assertWriteEnabledForTest()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(async () => {
    const activity = mapStrategicFollowUpToActivity(withTenantOnRow(record, tenantId), tenantId);
    if (!activity) throw new Error('activity map failed');
    await executePipeline(activity, 'update');
  }, { domain: 'strategic-followup', tenantId, legacyId: record.id, event: 'updateStrategicFollowUp', mode: writeMode() });
}

export function __runCrmActivitySoakReportForTest(tenantId, compareReport = null) {
  return buildCrmActivityWriteSoakReport(tenantId, compareReport);
}

export { shouldCompareCrmActivityWrite, buildCrmActivityWriteSoakReport };
