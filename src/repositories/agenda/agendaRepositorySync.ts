/**
 * @module repositories/agenda/agendaRepositorySync
 * @description Helpers de sync/hydrate/compare — Phase 5.7 foundation (não ativados).
 */

import { withDb } from '../../db/index.js';
import type { AppointmentCore, IAgendaCache } from './agendaTypes.js';
import { mapCoreToLegacyRow, mapLegacyRowToCore } from './agendaMapper.js';

export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

export function isRemoteReadUnavailableError(error: unknown): boolean {
  if (isBrowserOffline()) return true;
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('fetch failed')
    || message.includes('network request failed')
    || message.includes('load failed')
    || message.includes('tempo esgotado')
    || message.includes('não foi possível conectar')
    || message.includes('não registrado')
  );
}

/**
 * Hidrata cache em memória + espelho IndexedDB a partir do roster remoto.
 * Não altera workflow/journey — apenas appointments[].
 */
export function hydrateAgendaIdbCache(
  items: AppointmentCore[],
  tenantId: string,
  cache: IAgendaCache,
): number {
  const tid = String(tenantId || '').trim();
  if (!tid || !Array.isArray(items)) return 0;
  let count = 0;
  withDb((db) => {
    if (!Array.isArray(db.appointments)) db.appointments = [];
    for (const core of items) {
      if (core.tenantId !== tid) continue;
      const legacy = mapCoreToLegacyRow(core);
      const idx = db.appointments.findIndex((row) => String(row.id) === legacy.id);
      if (idx >= 0) {
        db.appointments[idx] = { ...db.appointments[idx], ...legacy };
      } else {
        db.appointments.push(legacy);
      }
      cache.set(tid, core);
      count += 1;
    }
    return db;
  });
  return count;
}

export function compareAgendaShapes(
  idbCore: AppointmentCore | null,
  remoteCore: AppointmentCore | null,
): Record<string, unknown> {
  const diffs: Array<{ field: string; indexedDb: unknown; remote: unknown }> = [];
  if (!idbCore && !remoteCore) return { match: true, diffs: [] };
  if (!idbCore || !remoteCore) {
    return {
      match: false,
      diffs: [{ field: 'presence', indexedDb: Boolean(idbCore), remote: Boolean(remoteCore) }],
    };
  }
  const fields: Array<keyof AppointmentCore> = [
    'date', 'startTime', 'endTime', 'status', 'professionalId', 'roomId', 'procedureName',
  ];
  for (const field of fields) {
    if (String(idbCore[field] ?? '') !== String(remoteCore[field] ?? '')) {
      diffs.push({ field, indexedDb: idbCore[field], remote: remoteCore[field] });
    }
  }
  return { match: diffs.length === 0, diffs };
}

export function logAgendaReadDev(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[AGENDA_READ]', event, payload);
}

export function logAgendaShadowDev(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[AGENDA_SHADOW]', event, payload);
}

export function logAgendaWriteDev(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[AGENDA_WRITE]', event, payload);
}

export { mapLegacyRowToCore };
