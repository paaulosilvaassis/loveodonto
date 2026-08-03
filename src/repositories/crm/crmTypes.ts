/**
 * @module repositories/crm/crmTypes
 * @description Tipos da Repository Layer CRM/Kanban V3 — Phase 6.1 + Wave B foundation (6.5).
 */

export type PipelineStageType = 'normal' | 'conversion' | 'lost';

export type CrmEventType =
  | 'status_change'
  | 'contact'
  | 'message_sent'
  | 'budget_created'
  | 'budget_presented'
  | 'budget_approved'
  | 'budget_rejected'
  | 'budget_em_analise_followup'
  | 'appointment_scheduled'
  | 'appointment_done'
  | 'converted_to_patient'
  | 'tag_added'
  | 'follow_up_created'
  | 'meta_lead_received'
  | 'meta_lead_updated'
  | 'task_created'
  | 'task_done';

/** Lead normalizado (futuro Supabase SSOT). */
export interface LeadCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  name: string;
  phone: string;
  source: string;
  interest: string;
  bestContactTime: string;
  notes: string;
  assignedToUserId: string | null;
  stageKey: string;
  patientId: string | null;
  estimatedValue: number | null;
  priority: string;
  tags: string[];
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

/** Shape legado IndexedDB (`crmLeads[]`). */
export interface LeadLegacyRow {
  id: string;
  tenant_id?: string | null;
  name?: string;
  phone?: string;
  source?: string;
  interest?: string;
  bestContactTime?: string;
  notes?: string;
  assignedToUserId?: string | null;
  stageKey?: string;
  patientId?: string | null;
  estimatedValue?: number | null;
  priority?: string;
  tags?: string[];
  lastContactAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  [key: string]: unknown;
}

export interface PipelineStageCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  key: string;
  label: string;
  order: number;
  color: string;
  isActive: boolean;
  stageType: PipelineStageType;
}

export interface PipelineStageLegacyRow {
  id: string;
  tenant_id?: string | null;
  key: string;
  label: string;
  order?: number;
  color?: string;
  isActive?: boolean;
  stageType?: string;
  [key: string]: unknown;
}

export interface LeadEventCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  leadId: string;
  type: CrmEventType | string;
  userId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface LeadEventLegacyRow {
  id: string;
  leadId: string;
  type: string;
  userId?: string | null;
  data?: Record<string, unknown>;
  createdAt: string;
  tenant_id?: string | null;
  [key: string]: unknown;
}

/** Follow-up legado CRM (`crmFollowUps[]`) — só leadId. */
export type CrmLegacyFollowUpStatus = 'pending' | 'done';

export interface CrmLegacyFollowUpCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  leadId: string;
  dueAt: string;
  type: string;
  notes: string;
  doneAt: string | null;
  createdAt: string;
  createdByUserId: string | null;
  status: CrmLegacyFollowUpStatus;
}

export interface CrmLegacyFollowUpLegacyRow {
  id: string;
  leadId: string;
  dueAt?: string;
  type?: string;
  notes?: string;
  doneAt?: string | null;
  createdAt?: string;
  createdByUserId?: string | null;
  tenant_id?: string | null;
  [key: string]: unknown;
}

/** Tarefa comercial CRM (`crmTasks[]`). */
export type CrmTaskStatus = 'pending' | 'done' | 'canceled';
export type CrmTaskPriority = 'low' | 'medium' | 'high';

export interface CrmTaskCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  clinicId: string;
  leadId: string | null;
  patientId: string | null;
  budgetId: string | null;
  appointmentId: string | null;
  title: string;
  description: string;
  type: string;
  channel: string;
  dueAt: string;
  priority: CrmTaskPriority | string;
  status: CrmTaskStatus | string;
  assignedTo: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
}

export interface CrmTaskLegacyRow {
  id: string;
  clinicId?: string;
  tenant_id?: string | null;
  leadId?: string | null;
  patientId?: string | null;
  budgetId?: string | null;
  appointmentId?: string | null;
  title?: string;
  description?: string;
  type?: string;
  channel?: string;
  dueAt?: string;
  priority?: string;
  status?: string;
  assignedTo?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  doneAt?: string | null;
  [key: string]: unknown;
}

/**
 * Follow-up estratégico Gestão Comercial (`followUps[]`).
 * Domínio paralelo a crmFollowUps/crmTasks — não unificar na Wave B.
 */
export type StrategicFollowUpStatus = 'pending' | 'completed' | 'cancelled';

export interface StrategicFollowUpCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  clinicId: string;
  patientId: string | null;
  leadId: string | null;
  budgetId: string | null;
  originType: string;
  type: string;
  description: string;
  dueDate: string;
  priority: CrmTaskPriority | string;
  status: StrategicFollowUpStatus | string;
  assignedTo: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface StrategicFollowUpLegacyRow {
  id: string;
  clinicId?: string;
  tenant_id?: string | null;
  patientId?: string | null;
  leadId?: string | null;
  budgetId?: string | null;
  originType?: string;
  type?: string;
  description?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  assignedTo?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  [key: string]: unknown;
}

export interface CrmListFilters {
  tenantId?: string;
  stageKey?: string;
  assignedToUserId?: string;
  source?: string;
  tagId?: string;
  search?: string;
  includeInactive?: boolean;
}

/** Filtros Wave B — timeline / follow-ups / tasks. */
export interface CrmWaveBListFilters {
  tenantId?: string;
  leadId?: string;
  patientId?: string;
  clinicId?: string;
  status?: string;
  pending?: boolean;
  type?: string;
}

/** Card Kanban = projeção de Lead no pipeline comercial. */
export interface KanbanCardCore extends LeadCore {
  cardId: string;
  ownerId: string | null;
  status: string;
}

export interface KanbanCardLegacyRow extends LeadLegacyRow {
  cardId?: string;
  ownerId?: string | null;
  status?: string;
}

export type CrmReadSource =
  | 'admin-api'
  | 'indexeddb'
  | 'indexeddb-offline'
  | 'cache';

export interface CrmLeadListResult {
  items: LeadCore[];
  total: number;
  source: CrmReadSource;
}

export interface CrmLeadGetResult {
  core: LeadCore | null;
  source: CrmReadSource;
}

export interface ICrmIndexedDbReader {
  listLeadsLegacySync(filters?: CrmListFilters): LeadLegacyRow[];
  getLeadLegacySync(leadId: string): LeadLegacyRow | null;
  listPipelineStagesLegacySync(tenantId?: string, options?: { includeInactive?: boolean }): PipelineStageLegacyRow[];
  getPipelineStageLegacySync(tenantId: string, ref: string): PipelineStageLegacyRow | null;
  listLeadEventsLegacySync(leadId: string, filters?: CrmWaveBListFilters): LeadEventLegacyRow[];
  listKanbanCardsLegacySync(filters?: CrmListFilters): KanbanCardLegacyRow[];
  getKanbanCardLegacySync(cardId: string): KanbanCardLegacyRow | null;
  /** Wave B foundation — crmFollowUps */
  listCrmLegacyFollowUpsLegacySync(filters?: CrmWaveBListFilters): CrmLegacyFollowUpLegacyRow[];
  getCrmLegacyFollowUpLegacySync(ref: string): CrmLegacyFollowUpLegacyRow | null;
  /** Wave B foundation — crmTasks */
  listCrmTasksLegacySync(filters?: CrmWaveBListFilters): CrmTaskLegacyRow[];
  getCrmTaskLegacySync(ref: string): CrmTaskLegacyRow | null;
  /** Wave B foundation — followUps (estratégico) */
  listStrategicFollowUpsLegacySync(filters?: CrmWaveBListFilters): StrategicFollowUpLegacyRow[];
  getStrategicFollowUpLegacySync(ref: string): StrategicFollowUpLegacyRow | null;
}

export interface ICrmAdminApiReader {
  listLeads(tenantId: string, filters?: CrmListFilters): Promise<LeadCore[]>;
  getLead(tenantId: string, ref: string): Promise<LeadCore | null>;
  listPipelineStages(tenantId: string, options?: { includeInactive?: boolean }): Promise<PipelineStageCore[]>;
  getPipelineStage(tenantId: string, ref: string): Promise<PipelineStageCore | null>;
  listKanbanCards(tenantId: string, filters?: CrmListFilters): Promise<KanbanCardCore[]>;
  getKanbanCard(tenantId: string, ref: string): Promise<KanbanCardCore | null>;
  /** Wave B — preparados; stubs retornam [] / null até Phase 6.6 */
  listLeadEvents(tenantId: string, filters?: CrmWaveBListFilters): Promise<LeadEventCore[]>;
  listCrmLegacyFollowUps(tenantId: string, filters?: CrmWaveBListFilters): Promise<CrmLegacyFollowUpCore[]>;
  listCrmTasks(tenantId: string, filters?: CrmWaveBListFilters): Promise<CrmTaskCore[]>;
  listStrategicFollowUps(tenantId: string, filters?: CrmWaveBListFilters): Promise<StrategicFollowUpCore[]>;
}

export class CrmLeadNotFoundError extends Error {
  readonly code = 'CRM_LEAD_NOT_FOUND';

  constructor(ref: string) {
    super(`Lead não encontrado: ${ref}.`);
    this.name = 'CrmLeadNotFoundError';
  }
}

export type CrmDomain =
  | 'lead'
  | 'pipeline-stage'
  | 'lead-event'
  | 'crm-legacy-followup'
  | 'crm-task'
  | 'strategic-followup';

export type CrmWriteMeta = import('../shared/repositoryV3Idempotency.js').RepositoryWriteMeta;

export interface LeadCreateCoreDto {
  legacyId: string;
  name: string;
  phone: string;
  source: string;
  interest: string;
  bestContactTime: string;
  notes: string;
  assignedToUserId: string | null;
  stageKey: string;
  estimatedValue: number | null;
  priority: string;
  tags: string[];
  createdByUserId: string | null;
}

export interface LeadUpdateCoreDto {
  name?: string;
  phone?: string;
  source?: string;
  interest?: string;
  bestContactTime?: string;
  notes?: string;
  assignedToUserId?: string | null;
  stageKey?: string;
  patientId?: string | null;
  estimatedValue?: number | null;
  priority?: string;
  tags?: string[];
  lastContactAt?: string | null;
  updatedByUserId?: string | null;
}

export interface LeadMoveStageCoreDto {
  stageKey: string;
  lossReason?: string | null;
  lastContactAt?: string | null;
  updatedByUserId?: string | null;
}

export interface PipelineStageCreateCoreDto {
  legacyId: string;
  key: string;
  label: string;
  order: number;
  color: string;
  isActive: boolean;
  stageType: PipelineStageType;
}

export interface PipelineStageUpdateCoreDto {
  key?: string;
  label?: string;
  order?: number;
  color?: string;
  isActive?: boolean;
  stageType?: PipelineStageType;
}

export interface ICrmAdminApiWriter {
  createLead(tenantId: string, dto: LeadCreateCoreDto, meta?: CrmWriteMeta): Promise<LeadCore>;
  updateLead(tenantId: string, ref: string, dto: LeadUpdateCoreDto, meta?: CrmWriteMeta): Promise<LeadCore>;
  moveLeadStage(tenantId: string, ref: string, dto: LeadMoveStageCoreDto, meta?: CrmWriteMeta): Promise<LeadCore>;
  createPipelineStage(tenantId: string, dto: PipelineStageCreateCoreDto, meta?: CrmWriteMeta): Promise<PipelineStageCore>;
  updatePipelineStage(tenantId: string, ref: string, dto: PipelineStageUpdateCoreDto, meta?: CrmWriteMeta): Promise<PipelineStageCore>;
  deletePipelineStage(tenantId: string, ref: string, meta?: CrmWriteMeta): Promise<boolean>;
}

export interface ICrmAdminApiClient extends ICrmAdminApiReader, ICrmAdminApiWriter {}

export class CrmRepositoryRemoteWriteDisabledError extends Error {
  readonly code = 'CRM_REMOTE_WRITE_DISABLED';

  constructor() {
    super('Escrita remota desabilitada (CRM_WRITE/CRM_DUAL_WRITE=false).');
    this.name = 'CrmRepositoryRemoteWriteDisabledError';
  }
}

export interface ICrmCache {
  getLead(tenantId: string, ref: string): LeadCore | null;
  setLead(tenantId: string, core: LeadCore): void;
  deleteLead(tenantId: string, ref: string): void;
  /** Wave B — cache preparado; não usado até Read Cutover */
  getLeadEvent?(tenantId: string, ref: string): LeadEventCore | null;
  setLeadEvent?(tenantId: string, core: LeadEventCore): void;
  getCrmTask?(tenantId: string, ref: string): CrmTaskCore | null;
  setCrmTask?(tenantId: string, core: CrmTaskCore): void;
  getCrmLegacyFollowUp?(tenantId: string, ref: string): CrmLegacyFollowUpCore | null;
  setCrmLegacyFollowUp?(tenantId: string, core: CrmLegacyFollowUpCore): void;
  getStrategicFollowUp?(tenantId: string, ref: string): StrategicFollowUpCore | null;
  setStrategicFollowUp?(tenantId: string, core: StrategicFollowUpCore): void;
  clearTenant(tenantId: string): void;
  invalidateTenant(tenantId: string, reason?: string): void;
}

export interface ICrmRepository {
  listLeadsLegacySync(filters?: CrmListFilters): LeadLegacyRow[];
  getLeadLegacySync(leadId: string): LeadLegacyRow | null;
  listPipelineStagesLegacySync(tenantId?: string, options?: { includeInactive?: boolean }): PipelineStageLegacyRow[];
  getPipelineStageLegacySync(tenantId: string, ref: string): PipelineStageLegacyRow | null;
  listKanbanCardsLegacySync(filters?: CrmListFilters): KanbanCardLegacyRow[];
  getKanbanCardLegacySync(cardId: string): KanbanCardLegacyRow | null;
  listLeadEventsLegacySync(leadId: string, filters?: CrmWaveBListFilters): LeadEventLegacyRow[];
  listCrmLegacyFollowUpsLegacySync(filters?: CrmWaveBListFilters): CrmLegacyFollowUpLegacyRow[];
  getCrmLegacyFollowUpLegacySync(ref: string): CrmLegacyFollowUpLegacyRow | null;
  listCrmTasksLegacySync(filters?: CrmWaveBListFilters): CrmTaskLegacyRow[];
  getCrmTaskLegacySync(ref: string): CrmTaskLegacyRow | null;
  listStrategicFollowUpsLegacySync(filters?: CrmWaveBListFilters): StrategicFollowUpLegacyRow[];
  getStrategicFollowUpLegacySync(ref: string): StrategicFollowUpLegacyRow | null;
  listLeadsCore(tenantId: string, filters?: CrmListFilters): Promise<CrmLeadListResult>;
  getLeadCore(tenantId: string, ref: string): Promise<CrmLeadGetResult>;
  listPipelineStagesCore(tenantId: string, options?: { includeInactive?: boolean }): Promise<PipelineStageCore[]>;
  getPipelineStageCore(tenantId: string, ref: string): Promise<PipelineStageCore | null>;
  listKanbanCardsCore(tenantId: string, filters?: CrmListFilters): Promise<KanbanCardCore[]>;
  getKanbanCardCore(tenantId: string, ref: string): Promise<KanbanCardCore | null>;
  /** Wave B Core async — preparados; sempre IDB até Phase 6.6 */
  listLeadEventsCore(tenantId: string, filters?: CrmWaveBListFilters): Promise<LeadEventCore[]>;
  listCrmLegacyFollowUpsCore(tenantId: string, filters?: CrmWaveBListFilters): Promise<CrmLegacyFollowUpCore[]>;
  listCrmTasksCore(tenantId: string, filters?: CrmWaveBListFilters): Promise<CrmTaskCore[]>;
  listStrategicFollowUpsCore(tenantId: string, filters?: CrmWaveBListFilters): Promise<StrategicFollowUpCore[]>;
  syncCacheFromRemote(tenantId: string): Promise<number>;
  compareIdbVsRemote(tenantId: string): Promise<Record<string, unknown> | null>;
  shadowReadDiscard(tenantId: string): Promise<void>;
  createLeadCore(tenantId: string, dto: LeadCreateCoreDto, meta?: CrmWriteMeta): Promise<LeadCore>;
  updateLeadCore(tenantId: string, ref: string, dto: LeadUpdateCoreDto, meta?: CrmWriteMeta): Promise<LeadCore>;
  moveLeadStageCore(tenantId: string, ref: string, dto: LeadMoveStageCoreDto, meta?: CrmWriteMeta): Promise<LeadCore>;
  createPipelineStageCore(tenantId: string, dto: PipelineStageCreateCoreDto, meta?: CrmWriteMeta): Promise<PipelineStageCore>;
  updatePipelineStageCore(tenantId: string, ref: string, dto: PipelineStageUpdateCoreDto, meta?: CrmWriteMeta): Promise<PipelineStageCore>;
  deletePipelineStageCore(tenantId: string, ref: string, meta?: CrmWriteMeta): Promise<void>;
}

export class CrmRepositoryRemoteReadDisabledError extends Error {
  readonly code = 'CRM_REMOTE_READ_DISABLED';

  constructor() {
    super('Leitura remota desabilitada (CRM_READ/CRM_READ_PRIMARY=false).');
    this.name = 'CrmRepositoryRemoteReadDisabledError';
  }
}
