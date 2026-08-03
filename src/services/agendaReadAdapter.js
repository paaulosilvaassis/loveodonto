/**
 * Adapter de leitura Agenda — Phase 5.7 foundation.
 * Ponte futura entre appointmentService e agendaRepository.
 * Retorna null quando flags off — callers legados permanecem inalterados.
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getAgendaRepositoryForRead,
  scheduleAgendaCacheRehydrate,
  shouldUseAgendaRepositoryRead,
} from './agendaRepositoryBridge.js';

function scheduleHydrateIfNeeded(tenantId) {
  if (!shouldUseAgendaRepositoryRead()) return;
  scheduleAgendaCacheRehydrate(tenantId);
}

/**
 * Lista síncrona legada — READ_PRIMARY via repository (futuro Phase 5.8).
 * Retorna null quando flags off.
 * @param {import('../repositories/agenda/agendaTypes.ts').AgendaListFilters} [filters]
 */
export function readListAppointments(filters = {}) {
  scheduleHydrateIfNeeded(filters.tenantId);
  if (!shouldUseAgendaRepositoryRead()) return null;
  return getAgendaRepositoryForRead().listLegacySync(filters);
}

/**
 * Detalhe síncrono legado — READ_PRIMARY via repository (futuro).
 * @param {string} appointmentId
 * @param {string} [tenantId]
 */
export function readGetAppointment(appointmentId, tenantId = '') {
  scheduleHydrateIfNeeded(tenantId);
  if (!shouldUseAgendaRepositoryRead()) return null;
  return getAgendaRepositoryForRead().getLegacySync(appointmentId);
}

/**
 * Agendamentos por data — READ_PRIMARY via repository (filtro date).
 * @param {string} date
 * @param {string} [tenantId]
 */
export function readFetchAppointmentsByDate(date, tenantId = '') {
  const normalizedTenant = normalizeTenantId(tenantId) || undefined;
  scheduleHydrateIfNeeded(normalizedTenant);
  if (!shouldUseAgendaRepositoryRead()) return null;
  return getAgendaRepositoryForRead().listLegacySync({
    date: String(date || '').trim(),
    tenantId: normalizedTenant,
  });
}

/**
 * Bloqueios síncronos — READ_PRIMARY ainda lê IDB (sem SSOT remoto de blocks).
 * @param {{ date?: string }} [filters]
 */
export function readListAppointmentBlocks(filters = {}) {
  if (!shouldUseAgendaRepositoryRead()) return null;
  return getAgendaRepositoryForRead().listBlocksLegacySync(filters);
}

/**
 * Hidratação awaitable — testes e bootstrap explícito (não ativo na 5.7).
 * @param {string} tenantId
 */
export async function readHydrateAgendaCache(tenantId) {
  if (!shouldUseAgendaRepositoryRead()) return { hydrated: 0, skipped: true };
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return { hydrated: 0, skipped: true };
  const hydrated = await getAgendaRepositoryForRead().syncCacheFromRemote(normalized);
  return { hydrated, skipped: false };
}

/** Apenas testes — expõe compare shadow. */
export async function __compareAgendaIdbVsRemoteForTest(tenantId) {
  return getAgendaRepositoryForRead().compareIdbVsRemote(tenantId);
}
