/**
 * Adapter de leitura CRM — Phase 6.2 read cutover.
 * Ponte entre crmService / crmPipelineStageService e crmRepository.
 * Retorna null quando flags off — callers legados permanecem inalterados.
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getCrmRepositoryForRead,
  scheduleCrmCacheRehydrate,
  scheduleCrmShadowCompare,
  shouldUseCrmRepositoryRead,
} from './crmRepositoryBridge.js';

function scheduleReadSideEffects(tenantId) {
  scheduleHydrateIfNeeded(tenantId);
  scheduleCrmShadowCompare(tenantId);
}

function scheduleHydrateIfNeeded(tenantId) {
  if (!shouldUseCrmRepositoryRead()) return;
  scheduleCrmCacheRehydrate(tenantId);
}

/**
 * Lista síncrona legada — READ_PRIMARY via repository.
 * @param {import('../repositories/crm/crmTypes.ts').CrmListFilters} [filters]
 */
export function readListLeads(filters = {}) {
  scheduleReadSideEffects(filters.tenantId);
  if (!shouldUseCrmRepositoryRead()) return null;
  return getCrmRepositoryForRead().listLeadsLegacySync(filters);
}

/**
 * Detalhe síncrono legado — READ_PRIMARY via repository.
 * @param {string} leadId
 * @param {string} [tenantId]
 */
export function readGetLead(leadId, tenantId = '') {
  scheduleReadSideEffects(tenantId);
  if (!shouldUseCrmRepositoryRead()) return null;
  return getCrmRepositoryForRead().getLeadLegacySync(leadId);
}

/**
 * Estágios do pipeline — READ_PRIMARY via repository.
 * @param {string} [tenantId]
 * @param {{ includeInactive?: boolean }} [options]
 */
export function readListPipelineStages(tenantId = '', options = {}) {
  scheduleReadSideEffects(tenantId);
  if (!shouldUseCrmRepositoryRead()) return null;
  return getCrmRepositoryForRead().listPipelineStagesLegacySync(tenantId, options);
}

/**
 * Fase do pipeline — READ_PRIMARY via repository.
 * @param {string} tenantId
 * @param {string} ref
 */
export function readGetPipelineStage(tenantId, ref) {
  scheduleReadSideEffects(tenantId);
  if (!shouldUseCrmRepositoryRead()) return null;
  return getCrmRepositoryForRead().getPipelineStageLegacySync(tenantId, ref);
}

/**
 * Kanban cards — READ_PRIMARY via repository.
 * @param {import('../repositories/crm/crmTypes.ts').CrmListFilters} [filters]
 */
export function readListKanbanCards(filters = {}) {
  scheduleReadSideEffects(filters.tenantId);
  if (!shouldUseCrmRepositoryRead()) return null;
  return getCrmRepositoryForRead().listKanbanCardsLegacySync(filters);
}

/**
 * Kanban card — READ_PRIMARY via repository.
 * @param {string} cardId
 * @param {string} [tenantId]
 */
export function readGetKanbanCard(cardId, tenantId = '') {
  scheduleReadSideEffects(tenantId);
  if (!shouldUseCrmRepositoryRead()) return null;
  return getCrmRepositoryForRead().getKanbanCardLegacySync(cardId);
}

/**
 * Eventos de timeline — ainda IDB-only (fora Wave A; Wave B foundation em crmWaveBAdapter).
 * @param {string} leadId
 */
export function readListLeadEvents(leadId) {
  if (!shouldUseCrmRepositoryRead()) return null;
  return getCrmRepositoryForRead().listLeadEventsLegacySync(leadId);
}

/**
 * Wave B — follow-ups legado / tasks / strategic.
 * Sempre null nesta phase (sem wiring em services).
 * @see crmWaveBAdapter.js
 */
export function readListCrmLegacyFollowUps(_filters = {}) {
  return null;
}

export function readListCrmTasks(_filters = {}) {
  return null;
}

export function readListStrategicFollowUps(_filters = {}) {
  return null;
}

/**
 * Hidratação awaitable — testes e bootstrap explícito.
 * @param {string} tenantId
 */
export async function readHydrateCrmCache(tenantId) {
  if (!shouldUseCrmRepositoryRead()) return { hydrated: 0, skipped: true };
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return { hydrated: 0, skipped: true };
  const hydrated = await getCrmRepositoryForRead().syncCacheFromRemote(normalized);
  return { hydrated, skipped: false };
}

/** Apenas testes — expõe compare shadow. */
export async function __compareCrmIdbVsRemoteForTest(tenantId) {
  return getCrmRepositoryForRead().compareIdbVsRemote(tenantId);
}

/** Apenas testes — expõe shadow discard. */
export async function __shadowReadCrmForTest(tenantId) {
  return getCrmRepositoryForRead().shadowReadDiscard(tenantId);
}
