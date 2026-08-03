/**
 * @module repositories/crm/crmAdminApiRepository
 * @description Leitura e escrita remota via Admin API — Phase 6.2/6.3.
 */

import type {
  CrmLegacyFollowUpCore,
  CrmListFilters,
  CrmTaskCore,
  CrmWaveBListFilters,
  CrmWriteMeta,
  ICrmAdminApiClient,
  KanbanCardCore,
  LeadCore,
  LeadCreateCoreDto,
  LeadEventCore,
  LeadMoveStageCoreDto,
  LeadUpdateCoreDto,
  PipelineStageCore,
  PipelineStageCreateCoreDto,
  PipelineStageUpdateCoreDto,
  StrategicFollowUpCore,
} from './crmTypes.js';
import { mapLeadCoreToKanbanCard } from './crmMapper.js';

export type CrmRemoteListLeadsFn = (
  tenantId: string,
  filters?: CrmListFilters,
) => Promise<LeadCore[]>;

export type CrmRemoteGetLeadFn = (
  tenantId: string,
  ref: string,
) => Promise<LeadCore | null>;

export type CrmRemoteListPipelineStagesFn = (
  tenantId: string,
  options?: { includeInactive?: boolean },
) => Promise<PipelineStageCore[]>;

export type CrmRemoteGetPipelineStageFn = (
  tenantId: string,
  ref: string,
) => Promise<PipelineStageCore | null>;

export type CrmRemoteListKanbanCardsFn = (
  tenantId: string,
  filters?: CrmListFilters,
) => Promise<KanbanCardCore[]>;

export type CrmRemoteGetKanbanCardFn = (
  tenantId: string,
  ref: string,
) => Promise<KanbanCardCore | null>;

export type CrmRemoteCreateLeadFn = (
  tenantId: string,
  dto: LeadCreateCoreDto,
  meta?: CrmWriteMeta,
) => Promise<LeadCore>;

export type CrmRemoteUpdateLeadFn = (
  tenantId: string,
  ref: string,
  dto: LeadUpdateCoreDto,
  meta?: CrmWriteMeta,
) => Promise<LeadCore>;

export type CrmRemoteMoveLeadStageFn = (
  tenantId: string,
  ref: string,
  dto: LeadMoveStageCoreDto,
  meta?: CrmWriteMeta,
) => Promise<LeadCore>;

export type CrmRemoteCreatePipelineStageFn = (
  tenantId: string,
  dto: PipelineStageCreateCoreDto,
  meta?: CrmWriteMeta,
) => Promise<PipelineStageCore>;

export type CrmRemoteUpdatePipelineStageFn = (
  tenantId: string,
  ref: string,
  dto: PipelineStageUpdateCoreDto,
  meta?: CrmWriteMeta,
) => Promise<PipelineStageCore>;

export type CrmRemoteDeletePipelineStageFn = (
  tenantId: string,
  ref: string,
  meta?: CrmWriteMeta,
) => Promise<boolean>;

/** Wave B — registros preparados; sem HTTP até Phase 6.6 */
export type CrmRemoteListLeadEventsFn = (
  tenantId: string,
  filters?: CrmWaveBListFilters,
) => Promise<LeadEventCore[]>;

export type CrmRemoteListCrmLegacyFollowUpsFn = (
  tenantId: string,
  filters?: CrmWaveBListFilters,
) => Promise<CrmLegacyFollowUpCore[]>;

export type CrmRemoteListCrmTasksFn = (
  tenantId: string,
  filters?: CrmWaveBListFilters,
) => Promise<CrmTaskCore[]>;

export type CrmRemoteListStrategicFollowUpsFn = (
  tenantId: string,
  filters?: CrmWaveBListFilters,
) => Promise<StrategicFollowUpCore[]>;

async function stubWriteRejected(): Promise<never> {
  throw new Error('CRM Admin API write client não registrado.');
}

async function stubWaveBListEmpty<T>(): Promise<T[]> {
  return [];
}

export function createCrmAdminApiRepository(
  listLeadsFn: CrmRemoteListLeadsFn,
  getLeadFn: CrmRemoteGetLeadFn,
  listStagesFn?: CrmRemoteListPipelineStagesFn,
  getStageFn?: CrmRemoteGetPipelineStageFn,
  listKanbanFn?: CrmRemoteListKanbanCardsFn,
  getKanbanFn?: CrmRemoteGetKanbanCardFn,
  writeClients: {
    createLead?: CrmRemoteCreateLeadFn;
    updateLead?: CrmRemoteUpdateLeadFn;
    moveLeadStage?: CrmRemoteMoveLeadStageFn;
    createPipelineStage?: CrmRemoteCreatePipelineStageFn;
    updatePipelineStage?: CrmRemoteUpdatePipelineStageFn;
    deletePipelineStage?: CrmRemoteDeletePipelineStageFn;
  } = {},
  waveBClients: {
    listLeadEvents?: CrmRemoteListLeadEventsFn;
    listCrmLegacyFollowUps?: CrmRemoteListCrmLegacyFollowUpsFn;
    listCrmTasks?: CrmRemoteListCrmTasksFn;
    listStrategicFollowUps?: CrmRemoteListStrategicFollowUpsFn;
  } = {},
): ICrmAdminApiClient {
  return {
    async listLeads(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid) return [];
      return listLeadsFn(tid, filters);
    },
    async getLead(tenantId, ref) {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle) return null;
      return getLeadFn(tid, needle);
    },
    async listPipelineStages(tenantId, options) {
      const tid = String(tenantId || '').trim();
      if (!tid || !listStagesFn) return [];
      return listStagesFn(tid, options);
    },
    async getPipelineStage(tenantId, ref) {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle || !getStageFn) return null;
      return getStageFn(tid, needle);
    },
    async listKanbanCards(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid) return [];
      if (listKanbanFn) return listKanbanFn(tid, filters);
      const leads = await listLeadsFn(tid, filters);
      return leads.map(mapLeadCoreToKanbanCard);
    },
    async getKanbanCard(tenantId, ref) {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle) return null;
      if (getKanbanFn) return getKanbanFn(tid, needle);
      const lead = await getLeadFn(tid, needle);
      return lead ? mapLeadCoreToKanbanCard(lead) : null;
    },
    createLead(tenantId, dto, meta) {
      return (writeClients.createLead ?? stubWriteRejected)(tenantId, dto, meta);
    },
    updateLead(tenantId, ref, dto, meta) {
      return (writeClients.updateLead ?? stubWriteRejected)(tenantId, ref, dto, meta);
    },
    moveLeadStage(tenantId, ref, dto, meta) {
      return (writeClients.moveLeadStage ?? stubWriteRejected)(tenantId, ref, dto, meta);
    },
    createPipelineStage(tenantId, dto, meta) {
      return (writeClients.createPipelineStage ?? stubWriteRejected)(tenantId, dto, meta);
    },
    updatePipelineStage(tenantId, ref, dto, meta) {
      return (writeClients.updatePipelineStage ?? stubWriteRejected)(tenantId, ref, dto, meta);
    },
    deletePipelineStage(tenantId, ref, meta) {
      return (writeClients.deletePipelineStage ?? stubWriteRejected)(tenantId, ref, meta);
    },
    async listLeadEvents(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid) return [];
      return (waveBClients.listLeadEvents ?? stubWaveBListEmpty)(tid, filters);
    },
    async listCrmLegacyFollowUps(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid) return [];
      return (waveBClients.listCrmLegacyFollowUps ?? stubWaveBListEmpty)(tid, filters);
    },
    async listCrmTasks(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid) return [];
      return (waveBClients.listCrmTasks ?? stubWaveBListEmpty)(tid, filters);
    },
    async listStrategicFollowUps(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid) return [];
      return (waveBClients.listStrategicFollowUps ?? stubWaveBListEmpty)(tid, filters);
    },
  };
}

let defaultListLeadsFn: CrmRemoteListLeadsFn | null = null;
let defaultGetLeadFn: CrmRemoteGetLeadFn | null = null;
let defaultListStagesFn: CrmRemoteListPipelineStagesFn | null = null;
let defaultGetStageFn: CrmRemoteGetPipelineStageFn | null = null;
let defaultListKanbanFn: CrmRemoteListKanbanCardsFn | null = null;
let defaultGetKanbanFn: CrmRemoteGetKanbanCardFn | null = null;
let defaultCreateLeadFn: CrmRemoteCreateLeadFn | null = null;
let defaultUpdateLeadFn: CrmRemoteUpdateLeadFn | null = null;
let defaultMoveLeadStageFn: CrmRemoteMoveLeadStageFn | null = null;
let defaultCreatePipelineStageFn: CrmRemoteCreatePipelineStageFn | null = null;
let defaultUpdatePipelineStageFn: CrmRemoteUpdatePipelineStageFn | null = null;
let defaultDeletePipelineStageFn: CrmRemoteDeletePipelineStageFn | null = null;
let defaultListLeadEventsFn: CrmRemoteListLeadEventsFn | null = null;
let defaultListCrmLegacyFollowUpsFn: CrmRemoteListCrmLegacyFollowUpsFn | null = null;
let defaultListCrmTasksFn: CrmRemoteListCrmTasksFn | null = null;
let defaultListStrategicFollowUpsFn: CrmRemoteListStrategicFollowUpsFn | null = null;

export function registerCrmRemoteListLeads(fn: CrmRemoteListLeadsFn): void {
  defaultListLeadsFn = fn;
}

export function registerCrmRemoteGetLead(fn: CrmRemoteGetLeadFn): void {
  defaultGetLeadFn = fn;
}

export function registerCrmRemoteListPipelineStages(fn: CrmRemoteListPipelineStagesFn): void {
  defaultListStagesFn = fn;
}

export function registerCrmRemoteGetPipelineStage(fn: CrmRemoteGetPipelineStageFn): void {
  defaultGetStageFn = fn;
}

export function registerCrmRemoteListKanbanCards(fn: CrmRemoteListKanbanCardsFn): void {
  defaultListKanbanFn = fn;
}

export function registerCrmRemoteGetKanbanCard(fn: CrmRemoteGetKanbanCardFn): void {
  defaultGetKanbanFn = fn;
}

export function registerCrmRemoteCreateLead(fn: CrmRemoteCreateLeadFn): void {
  defaultCreateLeadFn = fn;
}

export function registerCrmRemoteUpdateLead(fn: CrmRemoteUpdateLeadFn): void {
  defaultUpdateLeadFn = fn;
}

export function registerCrmRemoteMoveLeadStage(fn: CrmRemoteMoveLeadStageFn): void {
  defaultMoveLeadStageFn = fn;
}

export function registerCrmRemoteCreatePipelineStage(fn: CrmRemoteCreatePipelineStageFn): void {
  defaultCreatePipelineStageFn = fn;
}

export function registerCrmRemoteUpdatePipelineStage(fn: CrmRemoteUpdatePipelineStageFn): void {
  defaultUpdatePipelineStageFn = fn;
}

export function registerCrmRemoteDeletePipelineStage(fn: CrmRemoteDeletePipelineStageFn): void {
  defaultDeletePipelineStageFn = fn;
}

/** Wave B — register preparado; bridge não chama até Phase 6.6 */
export function registerCrmRemoteListLeadEvents(fn: CrmRemoteListLeadEventsFn): void {
  defaultListLeadEventsFn = fn;
}

export function registerCrmRemoteListCrmLegacyFollowUps(fn: CrmRemoteListCrmLegacyFollowUpsFn): void {
  defaultListCrmLegacyFollowUpsFn = fn;
}

export function registerCrmRemoteListCrmTasks(fn: CrmRemoteListCrmTasksFn): void {
  defaultListCrmTasksFn = fn;
}

export function registerCrmRemoteListStrategicFollowUps(fn: CrmRemoteListStrategicFollowUpsFn): void {
  defaultListStrategicFollowUpsFn = fn;
}

async function stubRemoteList(_tenantId: string): Promise<LeadCore[]> {
  return [];
}

async function stubRemoteGet(_tenantId: string, _ref: string): Promise<LeadCore | null> {
  return null;
}

export function getDefaultCrmAdminApiReader(): ICrmAdminApiClient {
  return createCrmAdminApiRepository(
    defaultListLeadsFn ?? stubRemoteList,
    defaultGetLeadFn ?? stubRemoteGet,
    defaultListStagesFn ?? (async () => []),
    defaultGetStageFn ?? (async () => null),
    defaultListKanbanFn ?? null,
    defaultGetKanbanFn ?? null,
    {
      createLead: defaultCreateLeadFn ?? undefined,
      updateLead: defaultUpdateLeadFn ?? undefined,
      moveLeadStage: defaultMoveLeadStageFn ?? undefined,
      createPipelineStage: defaultCreatePipelineStageFn ?? undefined,
      updatePipelineStage: defaultUpdatePipelineStageFn ?? undefined,
      deletePipelineStage: defaultDeletePipelineStageFn ?? undefined,
    },
    {
      listLeadEvents: defaultListLeadEventsFn ?? undefined,
      listCrmLegacyFollowUps: defaultListCrmLegacyFollowUpsFn ?? undefined,
      listCrmTasks: defaultListCrmTasksFn ?? undefined,
      listStrategicFollowUps: defaultListStrategicFollowUpsFn ?? undefined,
    },
  );
}
