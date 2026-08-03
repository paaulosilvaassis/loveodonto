/**
 * Ponte controlada entre crmService (legado IDB) e crmRepository V3.
 * Phase 6.2 read cutover via flags.
 */

import { normalizeTenantId } from './tenantIsolation.js';
import {
  createCrmRepository,
  rehydrateCrmCacheIfPrimary,
} from '../repositories/crm/crmRepository.ts';
import {
  getCrmRepositoryFlags,
  isCrmDualWriteOnlyEnabled,
  isCrmReadPrimaryEnabled,
  isCrmWritePrimaryEnabled,
  shouldCompareCrmIdbVsRemote,
  shouldRunCrmShadowRead,
} from '../repositories/crm/crmRepositoryFlags.ts';
import {
  registerCrmRemoteCreateLead,
  registerCrmRemoteCreatePipelineStage,
  registerCrmRemoteDeletePipelineStage,
  registerCrmRemoteGetKanbanCard,
  registerCrmRemoteGetLead,
  registerCrmRemoteGetPipelineStage,
  registerCrmRemoteListKanbanCards,
  registerCrmRemoteListLeads,
  registerCrmRemoteListPipelineStages,
  registerCrmRemoteMoveLeadStage,
  registerCrmRemoteUpdateLead,
  registerCrmRemoteUpdatePipelineStage,
} from '../repositories/crm/crmAdminApiRepository.ts';
import { scheduleRepositoryMicrotask } from '../repositories/shared/repositoryV3SyncHelpers.ts';
import {
  createLeadRemote,
  createPipelineStageRemote,
  deletePipelineStageRemote,
  fetchCrmKanbanCardRemote,
  fetchCrmKanbanCardsRemote,
  fetchCrmLeadRemote,
  fetchCrmLeadsRemote,
  fetchCrmPipelineStageRemote,
  fetchCrmPipelineStagesRemote,
  moveLeadStageRemote,
  updateLeadRemote,
  updatePipelineStageRemote,
} from './crmAdminApi.js';

/** @type {import('../repositories/crm/crmRepositoryFlags.ts').CrmRepositoryFlagsInput | null} */
let flagsInputOverride = null;

/** @type {(() => import('../repositories/crm/crmTypes.ts').ICrmRepository) | null} */
let repositoryFactoryOverride = null;

let remoteClientsRegistered = false;

function ensureRemoteClientsRegistered() {
  if (remoteClientsRegistered) return;
  remoteClientsRegistered = true;

  registerCrmRemoteListLeads(async (_tenantId, filters) => fetchCrmLeadsRemote(filters));
  registerCrmRemoteGetLead(async (_tenantId, ref) => fetchCrmLeadRemote(ref));
  registerCrmRemoteListPipelineStages(async (_tenantId, options) => fetchCrmPipelineStagesRemote(options));
  registerCrmRemoteGetPipelineStage(async (_tenantId, ref) => fetchCrmPipelineStageRemote(ref));
  registerCrmRemoteListKanbanCards(async (_tenantId, filters) => fetchCrmKanbanCardsRemote(filters));
  registerCrmRemoteGetKanbanCard(async (_tenantId, ref) => fetchCrmKanbanCardRemote(ref));

  registerCrmRemoteCreateLead(async (tenantId, dto, meta) => createLeadRemote(dto, meta));
  registerCrmRemoteUpdateLead(async (tenantId, ref, dto, meta) => updateLeadRemote(ref, dto, meta));
  registerCrmRemoteMoveLeadStage(async (tenantId, ref, dto, meta) => moveLeadStageRemote(ref, dto, meta));
  registerCrmRemoteCreatePipelineStage(async (tenantId, dto, meta) => createPipelineStageRemote(dto, meta));
  registerCrmRemoteUpdatePipelineStage(async (tenantId, ref, dto, meta) => updatePipelineStageRemote(ref, dto, meta));
  registerCrmRemoteDeletePipelineStage(async (tenantId, ref, meta) => deletePipelineStageRemote(ref, meta));
}

export function __setCrmServiceBridgeFlagsForTest(input) {
  flagsInputOverride = input;
}

export function __setCrmRepositoryFactoryForTest(factory) {
  repositoryFactoryOverride = factory;
}

function bridgeFlagsInput() {
  return flagsInputOverride ?? {};
}

function getRepository() {
  ensureRemoteClientsRegistered();
  const factory = repositoryFactoryOverride ?? createCrmRepository;
  return factory({ flagsInput: bridgeFlagsInput() });
}

export function getCrmRepositoryForRead() {
  return getRepository();
}

export function shouldUseCrmRepositoryRead() {
  return isCrmReadPrimaryEnabled(bridgeFlagsInput());
}

export function shouldUseCrmRepositoryWrite() {
  return isCrmDualWriteOnlyEnabled(bridgeFlagsInput());
}

export function shouldUseCrmRepositoryWritePrimary() {
  return isCrmWritePrimaryEnabled(bridgeFlagsInput());
}

export function shouldRunCrmShadowReadFromBridge() {
  return shouldRunCrmShadowRead(bridgeFlagsInput());
}

export function shouldCompareCrmFromBridge() {
  return shouldCompareCrmIdbVsRemote(bridgeFlagsInput());
}

export function scheduleCrmCacheRehydrate(tenantId) {
  if (!shouldUseCrmRepositoryRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  scheduleRepositoryMicrotask(() => rehydrateCrmCacheIfPrimary(normalized));
}

export function scheduleCrmShadowCompare(tenantId) {
  if (!shouldRunCrmShadowReadFromBridge() && !shouldCompareCrmFromBridge()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  scheduleRepositoryMicrotask(async () => {
    try {
      if (shouldRunCrmShadowReadFromBridge()) {
        await getRepository().shadowReadDiscard(normalized);
      }
      if (shouldCompareCrmFromBridge()) {
        await getRepository().compareIdbVsRemote(normalized);
      }
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[CRM_SHADOW] skipped:', err instanceof Error ? err.message : err);
      }
    }
  });
}

export function getCrmRepositoryFlagsForBridge() {
  return getCrmRepositoryFlags(bridgeFlagsInput());
}
