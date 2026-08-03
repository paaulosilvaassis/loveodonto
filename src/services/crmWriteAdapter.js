/**

 * Adapter de escrita CRM — Phase 6.3 dual-write shadow + Phase 6.4 primary write/hydrate.

 * IDB legado permanece authority imediata; remote SSOT quando WRITE_PRIMARY=true (hydrate mirror).

 */

import { normalizeTenantId } from './tenantIsolation.js';

import { resolveTenantIdForWrite } from './tenantWriteGuard.js';

import {

  mapLeadLegacyToCreateDto,

  mapLeadLegacyToMoveStageDto,

  mapLeadLegacyToUpdateDto,

  mapPipelineStageLegacyToCreateDto,

  mapPipelineStageLegacyToUpdateDto,

} from '../repositories/crm/crmMapper.ts';

import {

  buildCrmWriteSoakReport,

  recordCrmWriteSoakFallbackLegacy,

} from '../repositories/crm/crmWriteSoak.ts';

import { handleRepositoryWriteFallback } from '../repositories/shared/repositoryV3Fallback.ts';

import {

  getCrmRepositoryForRead,

  scheduleCrmShadowCompare,

  shouldUseCrmRepositoryWrite,

  shouldUseCrmRepositoryWritePrimary,

} from './crmRepositoryBridge.js';



function logCrmWriteAdapterDev(event, payload) {

  if (!import.meta.env?.DEV) return;

  console.debug('[CRM_WRITE_ADAPTER]', event, payload);

}



function resolveTenantId(user, record) {

  return normalizeTenantId(

    record?.tenant_id || record?.tenantId || resolveTenantIdForWrite(user, null),

  );

}



function resolveWriteSource() {

  return shouldUseCrmRepositoryWritePrimary() ? 'primary-write-hydrate' : 'legacy-dual-write';

}



async function runWriteSafe(runner, context) {

  try {

    await runner();

    return { ok: true };

  } catch (err) {

    const message = err instanceof Error ? err.message : String(err || 'crm-write failed');

    if (context.mode === 'primary') {

      recordCrmWriteSoakFallbackLegacy(err);

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

    logCrmWriteAdapterDev(context.event, {

      ...context,

      ok: false,

      error: message,

      rollback: 'indexeddb-preserved',

    });

    return { ok: false, error: message };

  }

}



function scheduleRepositoryWrite(runner, context) {

  const isPrimary = shouldUseCrmRepositoryWritePrimary();

  const isDual = shouldUseCrmRepositoryWrite();

  if (!isPrimary && !isDual) return;

  const mode = isPrimary ? 'primary' : 'dual';

  queueMicrotask(() => {

    void runWriteSafe(runner, { ...context, mode });

  });

}



function scheduleShadowCompare(tenantId) {

  scheduleCrmShadowCompare(tenantId);

}



async function runLeadCreate(user, record, tenantId) {

  const repo = getCrmRepositoryForRead();

  const dto = mapLeadLegacyToCreateDto(record);

  await repo.createLeadCore(tenantId, dto, { writeSource: resolveWriteSource() });

  scheduleShadowCompare(tenantId);

  logCrmWriteAdapterDev('createLead', { tenantId, legacyId: record.id, userId: user?.id, ok: true });

}



async function runLeadUpdate(user, record, tenantId, partial = {}) {

  const repo = getCrmRepositoryForRead();

  const dto = mapLeadLegacyToUpdateDto(record, partial);

  await repo.updateLeadCore(tenantId, record.id, dto, { writeSource: resolveWriteSource() });

  scheduleShadowCompare(tenantId);

  logCrmWriteAdapterDev('updateLead', { tenantId, legacyId: record.id, userId: user?.id, ok: true });

}



async function runLeadMoveStage(user, record, tenantId, newStageKey, options = {}) {

  const repo = getCrmRepositoryForRead();

  const dto = mapLeadLegacyToMoveStageDto(record, newStageKey, options);

  await repo.moveLeadStageCore(tenantId, record.id, dto, { writeSource: resolveWriteSource() });

  scheduleShadowCompare(tenantId);

  logCrmWriteAdapterDev('moveLeadToStage', {

    tenantId,

    legacyId: record.id,

    stageKey: newStageKey,

    userId: user?.id,

    ok: true,

  });

}



async function runPipelineStageCreate(user, record, tenantId) {

  const repo = getCrmRepositoryForRead();

  const dto = mapPipelineStageLegacyToCreateDto(record);

  await repo.createPipelineStageCore(tenantId, dto, { writeSource: resolveWriteSource() });

  scheduleShadowCompare(tenantId);

  logCrmWriteAdapterDev('createPipelineStage', { tenantId, legacyId: record.id, userId: user?.id, ok: true });

}



async function runPipelineStageUpdate(user, record, tenantId, partial = {}) {

  const repo = getCrmRepositoryForRead();

  const dto = mapPipelineStageLegacyToUpdateDto(record, partial);

  await repo.updatePipelineStageCore(tenantId, record.id, dto, { writeSource: resolveWriteSource() });

  scheduleShadowCompare(tenantId);

  logCrmWriteAdapterDev('updatePipelineStage', { tenantId, legacyId: record.id, userId: user?.id, ok: true });

}



async function runPipelineStageDelete(user, stageId, tenantId) {

  const repo = getCrmRepositoryForRead();

  await repo.deletePipelineStageCore(tenantId, stageId, { writeSource: resolveWriteSource() });

  scheduleShadowCompare(tenantId);

  logCrmWriteAdapterDev('deletePipelineStage', { tenantId, legacyId: stageId, userId: user?.id, ok: true });

}



export function scheduleCrmDualWriteCreateLead(user, record) {

  const tenantId = resolveTenantId(user, record);

  if (!tenantId) return;

  scheduleRepositoryWrite(

    () => runLeadCreate(user, record, tenantId),

    { domain: 'lead', tenantId, legacyId: record.id, event: 'createLead' },

  );

}



export function scheduleCrmDualWriteUpdateLead(user, record, partial = {}) {

  const tenantId = resolveTenantId(user, record);

  if (!tenantId) return;

  scheduleRepositoryWrite(

    () => runLeadUpdate(user, record, tenantId, partial),

    { domain: 'lead', tenantId, legacyId: record.id, event: 'updateLead' },

  );

}



export function scheduleCrmDualWriteMoveLeadToStage(user, record, newStageKey, options = {}) {

  const tenantId = resolveTenantId(user, record);

  if (!tenantId) return;

  scheduleRepositoryWrite(

    () => runLeadMoveStage(user, record, tenantId, newStageKey, options),

    { domain: 'lead', tenantId, legacyId: record.id, event: 'moveLeadToStage' },

  );

}



export function scheduleCrmDualWriteCreatePipelineStage(user, record) {

  const tenantId = resolveTenantId(user, record);

  if (!tenantId) return;

  scheduleRepositoryWrite(

    () => runPipelineStageCreate(user, record, tenantId),

    { domain: 'pipeline-stage', tenantId, legacyId: record.id, event: 'createPipelineStage' },

  );

}



export function scheduleCrmDualWriteUpdatePipelineStage(user, record, partial = {}) {

  const tenantId = resolveTenantId(user, record);

  if (!tenantId) return;

  scheduleRepositoryWrite(

    () => runPipelineStageUpdate(user, record, tenantId, partial),

    { domain: 'pipeline-stage', tenantId, legacyId: record.id, event: 'updatePipelineStage' },

  );

}



export function scheduleCrmDualWriteDeletePipelineStage(user, stageId, tenantIdHint = '') {

  const tenantId = normalizeTenantId(tenantIdHint || resolveTenantIdForWrite(user, null));

  if (!tenantId) return;

  scheduleRepositoryWrite(

    () => runPipelineStageDelete(user, stageId, tenantId),

    { domain: 'pipeline-stage', tenantId, legacyId: stageId, event: 'deletePipelineStage' },

  );

}



export async function __runCrmSoakConsistencyReportForTest(tenantId) {

  const normalized = normalizeTenantId(tenantId);

  if (!normalized) return null;

  const compare = await getCrmRepositoryForRead().compareIdbVsRemote(normalized);

  return buildCrmWriteSoakReport(normalized, compare);

}



function resolveWriteTestContext(user, record) {

  const isPrimary = shouldUseCrmRepositoryWritePrimary();

  const isDual = shouldUseCrmRepositoryWrite();

  if (!isPrimary && !isDual) return { skipped: true };

  const tenantId = resolveTenantId(user, record);

  if (!tenantId) return { skipped: true };

  return {

    skipped: false,

    tenantId,

    mode: isPrimary ? 'primary' : 'dual',

  };

}



/** Test helpers — execução awaitable */

export async function __runCrmDualWriteCreateLeadForTest(user, record) {

  const ctx = resolveWriteTestContext(user, record);

  if (ctx.skipped) return { ok: false, skipped: true };

  return runWriteSafe(() => runLeadCreate(user, record, ctx.tenantId), {

    domain: 'lead', tenantId: ctx.tenantId, legacyId: record.id, event: 'createLead', mode: ctx.mode,

  });

}



export async function __runCrmDualWriteUpdateLeadForTest(user, record, partial = {}) {

  const ctx = resolveWriteTestContext(user, record);

  if (ctx.skipped) return { ok: false, skipped: true };

  return runWriteSafe(() => runLeadUpdate(user, record, ctx.tenantId, partial), {

    domain: 'lead', tenantId: ctx.tenantId, legacyId: record.id, event: 'updateLead', mode: ctx.mode,

  });

}



export async function __runCrmDualWriteMoveLeadToStageForTest(user, record, newStageKey, options = {}) {

  const ctx = resolveWriteTestContext(user, record);

  if (ctx.skipped) return { ok: false, skipped: true };

  return runWriteSafe(() => runLeadMoveStage(user, record, ctx.tenantId, newStageKey, options), {

    domain: 'lead', tenantId: ctx.tenantId, legacyId: record.id, event: 'moveLeadToStage', mode: ctx.mode,

  });

}



export async function __runCrmDualWriteCreatePipelineStageForTest(user, record) {

  const ctx = resolveWriteTestContext(user, record);

  if (ctx.skipped) return { ok: false, skipped: true };

  return runWriteSafe(() => runPipelineStageCreate(user, record, ctx.tenantId), {

    domain: 'pipeline-stage', tenantId: ctx.tenantId, legacyId: record.id, event: 'createPipelineStage', mode: ctx.mode,

  });

}



export async function __runCrmDualWriteUpdatePipelineStageForTest(user, record, partial = {}) {

  const ctx = resolveWriteTestContext(user, record);

  if (ctx.skipped) return { ok: false, skipped: true };

  return runWriteSafe(() => runPipelineStageUpdate(user, record, ctx.tenantId, partial), {

    domain: 'pipeline-stage', tenantId: ctx.tenantId, legacyId: record.id, event: 'updatePipelineStage', mode: ctx.mode,

  });

}



export async function __runCrmDualWriteDeletePipelineStageForTest(user, stageId, tenantId) {

  const isPrimary = shouldUseCrmRepositoryWritePrimary();

  const isDual = shouldUseCrmRepositoryWrite();

  if (!isPrimary && !isDual) return { ok: false, skipped: true };

  const normalized = normalizeTenantId(tenantId);

  if (!normalized) return { ok: false, skipped: true };

  return runWriteSafe(() => runPipelineStageDelete(user, stageId, normalized), {

    domain: 'pipeline-stage',

    tenantId: normalized,

    legacyId: stageId,

    event: 'deletePipelineStage',

    mode: isPrimary ? 'primary' : 'dual',

  });

}



export async function __runCrmPrimaryWriteCreateLeadForTest(user, record) {

  return __runCrmDualWriteCreateLeadForTest(user, record);

}



export async function __runCrmPrimaryWriteUpdateLeadForTest(user, record, partial = {}) {

  return __runCrmDualWriteUpdateLeadForTest(user, record, partial);

}



export async function __runCrmPrimaryWriteMoveLeadToStageForTest(user, record, newStageKey, options = {}) {

  return __runCrmDualWriteMoveLeadToStageForTest(user, record, newStageKey, options);

}



export async function __runCrmPrimaryWriteCreatePipelineStageForTest(user, record) {

  return __runCrmDualWriteCreatePipelineStageForTest(user, record);

}



export async function __runCrmPrimaryWriteUpdatePipelineStageForTest(user, record, partial = {}) {

  return __runCrmDualWriteUpdatePipelineStageForTest(user, record, partial);

}



export async function __runCrmPrimaryWriteDeletePipelineStageForTest(user, stageId, tenantId) {

  return __runCrmDualWriteDeletePipelineStageForTest(user, stageId, tenantId);

}



export { buildCrmWriteSoakReport };


