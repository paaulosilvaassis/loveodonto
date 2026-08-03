/**
 * Adapter de escrita Agenda — Phase 5.9 dual-write controlado.
 * IDB legado permanece autoridade imediata; Admin API/Supabase quando AGENDA_WRITE=true.
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  mapLegacyRowToCreateDto,
  mapLegacyRowToUpdateDto,
} from '../repositories/agenda/agendaMapper.ts';
import {
  getAgendaRepositoryForRead,
  scheduleAgendaCacheRehydrate,
  shouldRunAgendaShadowRead,
  shouldUseAgendaRepositoryWrite,
} from './agendaRepositoryBridge.js';

const CANCELLED_STATUS = 'cancelado';

function logAgendaWriteAdapterDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[AGENDA_WRITE]', event, payload);
}

async function runDualWriteSafe(runner, context) {
  try {
    await runner();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'dual-write failed');
    logAgendaWriteAdapterDev(context.event, {
      ...context,
      ok: false,
      error: message,
      rollback: 'indexeddb-preserved',
    });
    return { ok: false, error: message };
  }
}

function scheduleShadowCompare(tenantId) {
  if (!shouldRunAgendaShadowRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  queueMicrotask(() => {
    void getAgendaRepositoryForRead().compareIdbVsRemote(normalized).catch((err) => {
      if (import.meta.env?.DEV) {
        console.debug('[AGENDA_SHADOW] skipped:', err instanceof Error ? err.message : err);
      }
    });
  });
}

async function runDualWriteCreate(user, appointment, tenantId) {
  const repo = getAgendaRepositoryForRead();
  const dto = mapLegacyRowToCreateDto(appointment);
  await repo.createCore(tenantId, dto);
  scheduleShadowCompare(tenantId);
  logAgendaWriteAdapterDev('create', { tenantId, legacyId: dto.legacyId, userId: user?.id, ok: true });
}

async function runDualWriteUpdate(user, appointment, tenantId, partial = {}) {
  const repo = getAgendaRepositoryForRead();
  const dto = mapLegacyRowToUpdateDto(appointment, partial);
  await repo.updateCore(tenantId, appointment.id, dto);
  scheduleShadowCompare(tenantId);
  logAgendaWriteAdapterDev('update', { tenantId, legacyId: appointment.id, userId: user?.id, ok: true });
}

async function runDualWriteCancel(user, appointment, tenantId, reason = '') {
  const repo = getAgendaRepositoryForRead();
  await repo.cancelCore(tenantId, appointment.id, reason);
  scheduleShadowCompare(tenantId);
  logAgendaWriteAdapterDev('cancel', { tenantId, legacyId: appointment.id, userId: user?.id, ok: true });
}

function resolveTenantId(user, appointment) {
  return normalizeTenantId(appointment?.tenant_id || user?.tenantId);
}

/**
 * Dual-write assíncrono pós-create IDB.
 * @param {object} user
 * @param {object} appointment
 */
export function scheduleAgendaDualWriteCreate(user, appointment) {
  if (!shouldUseAgendaRepositoryWrite()) return;
  const tenantId = resolveTenantId(user, appointment);
  if (!tenantId) return;
  scheduleAgendaCacheRehydrate(tenantId);
  queueMicrotask(() => {
    void runDualWriteSafe(
      () => runDualWriteCreate(user, appointment, tenantId),
      { event: 'create', tenantId, legacyId: appointment?.id, userId: user?.id },
    );
  });
}

/**
 * Dual-write assíncrono pós-update IDB.
 * @param {object} user
 * @param {object} appointment
 * @param {Record<string, unknown>} [partial]
 */
export function scheduleAgendaDualWriteUpdate(user, appointment, partial = {}) {
  if (!shouldUseAgendaRepositoryWrite()) return;
  const tenantId = resolveTenantId(user, appointment);
  if (!tenantId) return;

  const isCancel = String(appointment?.status || '').toLowerCase() === CANCELLED_STATUS;
  queueMicrotask(() => {
    if (isCancel) {
      void runDualWriteSafe(
        () => runDualWriteCancel(user, appointment, tenantId, String(appointment?.cancelReason || '')),
        { event: 'cancel', tenantId, legacyId: appointment?.id, userId: user?.id },
      );
      return;
    }
    void runDualWriteSafe(
      () => runDualWriteUpdate(user, appointment, tenantId, partial),
      { event: 'update', tenantId, legacyId: appointment?.id, userId: user?.id },
    );
  });
}

/** Apenas testes — executa dual-write create awaitable. */
export async function __runAgendaDualWriteCreateForTest(user, appointment) {
  if (!shouldUseAgendaRepositoryWrite()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, appointment);
  if (!tenantId) return { ok: false, skipped: true };
  return runDualWriteSafe(
    () => runDualWriteCreate(user, appointment, tenantId),
    { event: 'create', tenantId, legacyId: appointment?.id, userId: user?.id },
  );
}

/** Apenas testes — executa dual-write update awaitable. */
export async function __runAgendaDualWriteUpdateForTest(user, appointment, partial = {}) {
  if (!shouldUseAgendaRepositoryWrite()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, appointment);
  if (!tenantId) return { ok: false, skipped: true };
  const isCancel = String(appointment?.status || '').toLowerCase() === CANCELLED_STATUS;
  if (isCancel) {
    return runDualWriteSafe(
      () => runDualWriteCancel(user, appointment, tenantId, String(appointment?.cancelReason || '')),
      { event: 'cancel', tenantId, legacyId: appointment?.id, userId: user?.id },
    );
  }
  return runDualWriteSafe(
    () => runDualWriteUpdate(user, appointment, tenantId, partial),
    { event: 'update', tenantId, legacyId: appointment?.id, userId: user?.id },
  );
}

export { mapLegacyRowToCreateDto, mapLegacyRowToUpdateDto };
