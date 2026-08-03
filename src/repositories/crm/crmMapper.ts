/**
 * @module repositories/crm/crmMapper
 * @description Mapeamento Admin API / Supabase ↔ core ↔ legado IDB — CRM V3.
 */

import {
  isUuid,
  normalizeOptionalString,
  normalizeTenantId,
  pickServerField,
  resolveLegacyId,
  resolveUuid,
} from '../shared/repositoryV3MapperHelpers.js';
import type {
  CrmEventType,
  CrmLegacyFollowUpCore,
  CrmLegacyFollowUpLegacyRow,
  CrmTaskCore,
  CrmTaskLegacyRow,
  KanbanCardCore,
  KanbanCardLegacyRow,
  LeadCore,
  LeadEventCore,
  LeadEventLegacyRow,
  LeadLegacyRow,
  PipelineStageCore,
  PipelineStageLegacyRow,
  PipelineStageType,
  StrategicFollowUpCore,
  StrategicFollowUpLegacyRow,
} from './crmTypes.js';

const VALID_STAGE_TYPES = new Set<PipelineStageType>(['normal', 'conversion', 'lost']);

function normalizeStageType(value: unknown): PipelineStageType {
  const raw = String(value || 'normal').trim().toLowerCase();
  if (VALID_STAGE_TYPES.has(raw as PipelineStageType)) return raw as PipelineStageType;
  return 'normal';
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => String(tag || '').trim()).filter(Boolean);
}

function normalizeEstimatedValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

export function mapServerRowToLeadCore(
  row: Record<string, unknown> | null | undefined,
): LeadCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = resolveLegacyId(row);
  if (!tenantId || !legacyId) return null;

  return {
    tenantId,
    legacyId,
    uuid: resolveUuid(row, legacyId),
    name: String(pickServerField(row, 'name', 'name', '')).trim(),
    phone: String(pickServerField(row, 'phone', 'phone', '')).replace(/\D/g, ''),
    source: String(pickServerField(row, 'source', 'source', 'manual')).trim(),
    interest: String(pickServerField(row, 'interest', 'interest', '')).trim(),
    bestContactTime: String(pickServerField(row, 'best_contact_time', 'bestContactTime', '')).trim(),
    notes: String(pickServerField(row, 'notes', 'notes', '')).trim(),
    assignedToUserId: normalizeOptionalString(
      pickServerField(row, 'assigned_to_user_id', 'assignedToUserId', null),
    ),
    stageKey: String(pickServerField(row, 'stage_key', 'stageKey', 'novo_lead')).trim(),
    patientId: normalizeOptionalString(pickServerField(row, 'patient_id', 'patientId', null)),
    estimatedValue: normalizeEstimatedValue(
      pickServerField(row, 'estimated_value', 'estimatedValue', null),
    ),
    priority: String(pickServerField(row, 'priority', 'priority', '')).trim(),
    tags: normalizeTags(pickServerField(row, 'tags', 'tags', [])),
    lastContactAt: normalizeOptionalString(
      pickServerField(row, 'last_contact_at', 'lastContactAt', null),
    ),
    createdAt: String(pickServerField(row, 'created_at', 'createdAt', '')).trim(),
    updatedAt: String(pickServerField(row, 'updated_at', 'updatedAt', '')).trim(),
    createdByUserId: normalizeOptionalString(
      pickServerField(row, 'created_by_user_id', 'createdByUserId', null),
    ),
    updatedByUserId: normalizeOptionalString(
      pickServerField(row, 'updated_by_user_id', 'updatedByUserId', null),
    ),
  };
}

export function mapLegacyRowToLeadCore(row: LeadLegacyRow | null): LeadCore | null {
  if (!row?.id) return null;
  const tenantId = normalizeTenantId(row.tenant_id);
  if (!tenantId) return null;

  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    name: String(row.name || '').trim(),
    phone: String(row.phone || '').replace(/\D/g, ''),
    source: String(row.source || 'manual').trim(),
    interest: String(row.interest || '').trim(),
    bestContactTime: String(row.bestContactTime || '').trim(),
    notes: String(row.notes || '').trim(),
    assignedToUserId: normalizeOptionalString(row.assignedToUserId),
    stageKey: String(row.stageKey || 'novo_lead').trim(),
    patientId: normalizeOptionalString(row.patientId),
    estimatedValue: normalizeEstimatedValue(row.estimatedValue),
    priority: String(row.priority || '').trim(),
    tags: normalizeTags(row.tags),
    lastContactAt: normalizeOptionalString(row.lastContactAt),
    createdAt: String(row.createdAt || '').trim(),
    updatedAt: String(row.updatedAt || '').trim(),
    createdByUserId: normalizeOptionalString(row.createdByUserId),
    updatedByUserId: normalizeOptionalString(row.updatedByUserId),
  };
}

export function mapCoreToLeadLegacyRow(core: LeadCore): LeadLegacyRow {
  return {
    id: core.legacyId,
    tenant_id: core.tenantId,
    name: core.name,
    phone: core.phone,
    source: core.source,
    interest: core.interest,
    bestContactTime: core.bestContactTime,
    notes: core.notes,
    assignedToUserId: core.assignedToUserId,
    stageKey: core.stageKey,
    patientId: core.patientId,
    estimatedValue: core.estimatedValue,
    priority: core.priority,
    tags: [...core.tags],
    lastContactAt: core.lastContactAt,
    createdAt: core.createdAt,
    updatedAt: core.updatedAt,
    createdByUserId: core.createdByUserId,
    updatedByUserId: core.updatedByUserId,
  };
}

export function mapServerRowToPipelineStageCore(
  row: Record<string, unknown> | null | undefined,
): PipelineStageCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = resolveLegacyId(row);
  const key = String(row.key ?? '').trim();
  if (!tenantId || !legacyId || !key) return null;

  return {
    tenantId,
    legacyId,
    uuid: resolveUuid(row, legacyId),
    key,
    label: String(row.label ?? key).trim(),
    order: Number(row.order ?? 0) || 0,
    color: String(row.color ?? '#94a3b8').trim(),
    isActive: row.is_active ?? row.isActive ?? true,
    stageType: normalizeStageType(row.stage_type ?? row.stageType),
  };
}

export function mapLegacyRowToPipelineStageCore(
  row: PipelineStageLegacyRow | null,
): PipelineStageCore | null {
  if (!row?.id || !row.key) return null;
  const tenantId = normalizeTenantId(row.tenant_id);
  if (!tenantId) return null;

  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    key: String(row.key).trim(),
    label: String(row.label || row.key).trim(),
    order: Number(row.order ?? 0) || 0,
    color: String(row.color || '#94a3b8').trim(),
    isActive: row.isActive !== false,
    stageType: normalizeStageType(row.stageType),
  };
}

export function mapLegacyRowToLeadEventCore(
  row: LeadEventLegacyRow | null,
  tenantIdHint = '',
): LeadEventCore | null {
  if (!row?.id || !row.leadId) return null;
  const tenantId = normalizeTenantId(row.tenant_id) || normalizeTenantId(tenantIdHint);
  if (!tenantId) return null;

  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    leadId: String(row.leadId).trim(),
    type: String(row.type || '') as CrmEventType,
    userId: normalizeOptionalString(row.userId),
    data: row.data && typeof row.data === 'object' ? { ...row.data } : {},
    createdAt: String(row.createdAt || '').trim(),
  };
}

export function mapServerRowToLeadEventCore(
  row: Record<string, unknown> | null | undefined,
): LeadEventCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = resolveLegacyId(row);
  const leadId = String(pickServerField(row, 'lead_id', 'leadId', '') || '').trim();
  if (!tenantId || !legacyId || !leadId) return null;
  const dataRaw = pickServerField(row, 'data', 'payload', {});
  return {
    tenantId,
    legacyId,
    uuid: resolveUuid(row, legacyId),
    leadId,
    type: String(pickServerField(row, 'type', 'event_type', '') || '') as CrmEventType,
    userId: normalizeOptionalString(pickServerField(row, 'user_id', 'userId', null)),
    data: dataRaw && typeof dataRaw === 'object' ? { ...(dataRaw as Record<string, unknown>) } : {},
    createdAt: String(pickServerField(row, 'created_at', 'createdAt', '') || '').trim(),
  };
}

export function mapCoreToLeadEventLegacyRow(core: LeadEventCore): LeadEventLegacyRow {
  return {
    id: core.legacyId,
    leadId: core.leadId,
    type: core.type,
    userId: core.userId,
    data: { ...core.data },
    createdAt: core.createdAt,
    tenant_id: core.tenantId,
  };
}

export function mapLegacyRowToCrmLegacyFollowUpCore(
  row: CrmLegacyFollowUpLegacyRow | null,
  tenantIdHint = '',
): CrmLegacyFollowUpCore | null {
  if (!row?.id || !row.leadId) return null;
  const tenantId = normalizeTenantId(row.tenant_id) || normalizeTenantId(tenantIdHint);
  if (!tenantId) return null;
  const doneAt = row.doneAt ? String(row.doneAt) : null;
  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    leadId: String(row.leadId).trim(),
    dueAt: String(row.dueAt || '').trim(),
    type: String(row.type || 'retorno').trim(),
    notes: String(row.notes || '').trim(),
    doneAt,
    createdAt: String(row.createdAt || '').trim(),
    createdByUserId: normalizeOptionalString(row.createdByUserId),
    status: doneAt ? 'done' : 'pending',
  };
}

export function mapServerRowToCrmLegacyFollowUpCore(
  row: Record<string, unknown> | null | undefined,
): CrmLegacyFollowUpCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = resolveLegacyId(row);
  const leadId = String(pickServerField(row, 'lead_id', 'leadId', '') || '').trim();
  if (!tenantId || !legacyId || !leadId) return null;
  const doneAtRaw = pickServerField(row, 'done_at', 'doneAt', null);
  const doneAt = doneAtRaw ? String(doneAtRaw) : null;
  return {
    tenantId,
    legacyId,
    uuid: resolveUuid(row, legacyId),
    leadId,
    dueAt: String(pickServerField(row, 'due_at', 'dueAt', '') || '').trim(),
    type: String(pickServerField(row, 'type', 'type', 'retorno') || 'retorno').trim(),
    notes: String(pickServerField(row, 'notes', 'notes', '') || '').trim(),
    doneAt,
    createdAt: String(pickServerField(row, 'created_at', 'createdAt', '') || '').trim(),
    createdByUserId: normalizeOptionalString(
      pickServerField(row, 'created_by_user_id', 'createdByUserId', null),
    ),
    status: doneAt ? 'done' : 'pending',
  };
}

export function mapCoreToCrmLegacyFollowUpLegacyRow(core: CrmLegacyFollowUpCore): CrmLegacyFollowUpLegacyRow {
  return {
    id: core.legacyId,
    leadId: core.leadId,
    dueAt: core.dueAt,
    type: core.type,
    notes: core.notes,
    doneAt: core.doneAt,
    createdAt: core.createdAt,
    createdByUserId: core.createdByUserId,
    tenant_id: core.tenantId,
  };
}

export function mapLegacyRowToCrmTaskCore(
  row: CrmTaskLegacyRow | null,
  tenantIdHint = '',
): CrmTaskCore | null {
  if (!row?.id) return null;
  const tenantId = normalizeTenantId(row.tenant_id) || normalizeTenantId(tenantIdHint);
  if (!tenantId) return null;
  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    clinicId: String(row.clinicId || '').trim(),
    leadId: normalizeOptionalString(row.leadId),
    patientId: normalizeOptionalString(row.patientId),
    budgetId: normalizeOptionalString(row.budgetId),
    appointmentId: normalizeOptionalString(row.appointmentId),
    title: String(row.title || '').trim(),
    description: String(row.description || '').trim(),
    type: String(row.type || 'custom').trim(),
    channel: String(row.channel || '').trim(),
    dueAt: String(row.dueAt || '').trim(),
    priority: String(row.priority || 'medium').trim(),
    status: String(row.status || 'pending').trim(),
    assignedTo: normalizeOptionalString(row.assignedTo),
    createdBy: normalizeOptionalString(row.createdBy),
    createdAt: String(row.createdAt || '').trim(),
    updatedAt: String(row.updatedAt || row.createdAt || '').trim(),
    doneAt: row.doneAt ? String(row.doneAt) : null,
  };
}

export function mapServerRowToCrmTaskCore(
  row: Record<string, unknown> | null | undefined,
): CrmTaskCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = resolveLegacyId(row);
  if (!tenantId || !legacyId) return null;
  const doneAtRaw = pickServerField(row, 'done_at', 'doneAt', null);
  return {
    tenantId,
    legacyId,
    uuid: resolveUuid(row, legacyId),
    clinicId: String(pickServerField(row, 'clinic_id', 'clinicId', '') || '').trim(),
    leadId: normalizeOptionalString(pickServerField(row, 'lead_id', 'leadId', null)),
    patientId: normalizeOptionalString(pickServerField(row, 'patient_id', 'patientId', null)),
    budgetId: normalizeOptionalString(pickServerField(row, 'budget_id', 'budgetId', null)),
    appointmentId: normalizeOptionalString(pickServerField(row, 'appointment_id', 'appointmentId', null)),
    title: String(pickServerField(row, 'title', 'title', '') || '').trim(),
    description: String(pickServerField(row, 'description', 'description', '') || '').trim(),
    type: String(pickServerField(row, 'type', 'type', 'custom') || 'custom').trim(),
    channel: String(pickServerField(row, 'channel', 'channel', '') || '').trim(),
    dueAt: String(pickServerField(row, 'due_at', 'dueAt', '') || '').trim(),
    priority: String(pickServerField(row, 'priority', 'priority', 'medium') || 'medium').trim(),
    status: String(pickServerField(row, 'status', 'status', 'pending') || 'pending').trim(),
    assignedTo: normalizeOptionalString(pickServerField(row, 'assigned_to', 'assignedTo', null)),
    createdBy: normalizeOptionalString(pickServerField(row, 'created_by', 'createdBy', null)),
    createdAt: String(pickServerField(row, 'created_at', 'createdAt', '') || '').trim(),
    updatedAt: String(pickServerField(row, 'updated_at', 'updatedAt', '') || '').trim(),
    doneAt: doneAtRaw ? String(doneAtRaw) : null,
  };
}

export function mapCoreToCrmTaskLegacyRow(core: CrmTaskCore): CrmTaskLegacyRow {
  return {
    id: core.legacyId,
    clinicId: core.clinicId,
    tenant_id: core.tenantId,
    leadId: core.leadId,
    patientId: core.patientId,
    budgetId: core.budgetId,
    appointmentId: core.appointmentId,
    title: core.title,
    description: core.description,
    type: core.type,
    channel: core.channel,
    dueAt: core.dueAt,
    priority: core.priority,
    status: core.status,
    assignedTo: core.assignedTo,
    createdBy: core.createdBy,
    createdAt: core.createdAt,
    updatedAt: core.updatedAt,
    doneAt: core.doneAt,
  };
}

export function mapLegacyRowToStrategicFollowUpCore(
  row: StrategicFollowUpLegacyRow | null,
  tenantIdHint = '',
): StrategicFollowUpCore | null {
  if (!row?.id) return null;
  const tenantId = normalizeTenantId(row.tenant_id) || normalizeTenantId(tenantIdHint);
  if (!tenantId) return null;
  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    clinicId: String(row.clinicId || '').trim(),
    patientId: normalizeOptionalString(row.patientId),
    leadId: normalizeOptionalString(row.leadId),
    budgetId: normalizeOptionalString(row.budgetId),
    originType: String(row.originType || 'manual').trim(),
    type: String(row.type || 'retorno').trim(),
    description: String(row.description || '').trim(),
    dueDate: String(row.dueDate || '').trim(),
    priority: String(row.priority || 'medium').trim(),
    status: String(row.status || 'pending').trim(),
    assignedTo: normalizeOptionalString(row.assignedTo),
    createdAt: String(row.createdAt || '').trim(),
    completedAt: row.completedAt ? String(row.completedAt) : null,
  };
}

export function mapServerRowToStrategicFollowUpCore(
  row: Record<string, unknown> | null | undefined,
): StrategicFollowUpCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = resolveLegacyId(row);
  if (!tenantId || !legacyId) return null;
  const completedRaw = pickServerField(row, 'completed_at', 'completedAt', null);
  return {
    tenantId,
    legacyId,
    uuid: resolveUuid(row, legacyId),
    clinicId: String(pickServerField(row, 'clinic_id', 'clinicId', '') || '').trim(),
    patientId: normalizeOptionalString(pickServerField(row, 'patient_id', 'patientId', null)),
    leadId: normalizeOptionalString(pickServerField(row, 'lead_id', 'leadId', null)),
    budgetId: normalizeOptionalString(pickServerField(row, 'budget_id', 'budgetId', null)),
    originType: String(pickServerField(row, 'origin_type', 'originType', 'manual') || 'manual').trim(),
    type: String(pickServerField(row, 'type', 'type', 'retorno') || 'retorno').trim(),
    description: String(pickServerField(row, 'description', 'description', '') || '').trim(),
    dueDate: String(pickServerField(row, 'due_date', 'dueDate', '') || '').trim(),
    priority: String(pickServerField(row, 'priority', 'priority', 'medium') || 'medium').trim(),
    status: String(pickServerField(row, 'status', 'status', 'pending') || 'pending').trim(),
    assignedTo: normalizeOptionalString(pickServerField(row, 'assigned_to', 'assignedTo', null)),
    createdAt: String(pickServerField(row, 'created_at', 'createdAt', '') || '').trim(),
    completedAt: completedRaw ? String(completedRaw) : null,
  };
}

export function mapCoreToStrategicFollowUpLegacyRow(core: StrategicFollowUpCore): StrategicFollowUpLegacyRow {
  return {
    id: core.legacyId,
    clinicId: core.clinicId,
    tenant_id: core.tenantId,
    patientId: core.patientId,
    leadId: core.leadId,
    budgetId: core.budgetId,
    originType: core.originType,
    type: core.type,
    description: core.description,
    dueDate: core.dueDate,
    priority: core.priority,
    status: core.status,
    assignedTo: core.assignedTo,
    createdAt: core.createdAt,
    completedAt: core.completedAt,
  };
}

export function mapLeadCoreToKanbanCard(core: LeadCore): KanbanCardCore {
  return {
    ...core,
    cardId: core.legacyId,
    ownerId: core.assignedToUserId,
    status: core.stageKey,
  };
}

export function mapLegacyRowToKanbanCard(row: LeadLegacyRow | null): KanbanCardCore | null {
  const core = mapLegacyRowToLeadCore(row);
  return core ? mapLeadCoreToKanbanCard(core) : null;
}

export function mapKanbanCardCoreToLegacyRow(card: KanbanCardCore): KanbanCardLegacyRow {
  return {
    ...mapCoreToLeadLegacyRow(card),
    cardId: card.cardId,
    ownerId: card.ownerId,
    status: card.status,
  };
}

export function mapCoreToPipelineStageLegacyRow(core: PipelineStageCore): PipelineStageLegacyRow {
  return {
    id: core.legacyId,
    tenant_id: core.tenantId,
    key: core.key,
    label: core.label,
    order: core.order,
    color: core.color,
    isActive: core.isActive,
    stageType: core.stageType,
  };
}

export function mapLeadLegacyToCreateDto(row: LeadLegacyRow): import('./crmTypes.js').LeadCreateCoreDto {
  return {
    legacyId: String(row.id).trim(),
    name: String(row.name || '').trim(),
    phone: String(row.phone || '').replace(/\D/g, ''),
    source: String(row.source || 'manual').trim(),
    interest: String(row.interest || '').trim(),
    bestContactTime: String(row.bestContactTime || '').trim(),
    notes: String(row.notes || '').trim(),
    assignedToUserId: normalizeOptionalString(row.assignedToUserId),
    stageKey: String(row.stageKey || 'novo_lead').trim(),
    estimatedValue: normalizeEstimatedValue(row.estimatedValue),
    priority: String(row.priority || '').trim(),
    tags: normalizeTags(row.tags),
    createdByUserId: normalizeOptionalString(row.createdByUserId),
  };
}

export function mapLeadLegacyToUpdateDto(
  row: LeadLegacyRow,
  partial: Record<string, unknown> = {},
): import('./crmTypes.js').LeadUpdateCoreDto {
  const merged = { ...row, ...partial };
  return {
    name: String(merged.name || '').trim(),
    phone: String(merged.phone || '').replace(/\D/g, ''),
    source: String(merged.source || 'manual').trim(),
    interest: String(merged.interest || '').trim(),
    bestContactTime: String(merged.bestContactTime || '').trim(),
    notes: String(merged.notes || '').trim(),
    assignedToUserId: normalizeOptionalString(merged.assignedToUserId),
    stageKey: String(merged.stageKey || 'novo_lead').trim(),
    patientId: normalizeOptionalString(merged.patientId),
    estimatedValue: normalizeEstimatedValue(merged.estimatedValue),
    priority: String(merged.priority || '').trim(),
    tags: normalizeTags(merged.tags),
    lastContactAt: normalizeOptionalString(merged.lastContactAt),
    updatedByUserId: normalizeOptionalString(merged.updatedByUserId),
  };
}

export function mapLeadLegacyToMoveStageDto(
  row: LeadLegacyRow,
  newStageKey: string,
  options: { lossReason?: string | null } = {},
): import('./crmTypes.js').LeadMoveStageCoreDto {
  return {
    stageKey: String(newStageKey || '').trim(),
    lossReason: options.lossReason != null ? String(options.lossReason).trim() || null : undefined,
    lastContactAt: normalizeOptionalString(row.lastContactAt),
    updatedByUserId: normalizeOptionalString(row.updatedByUserId),
  };
}

export function mapPipelineStageLegacyToCreateDto(
  row: PipelineStageLegacyRow,
): import('./crmTypes.js').PipelineStageCreateCoreDto {
  return {
    legacyId: String(row.id).trim(),
    key: String(row.key).trim(),
    label: String(row.label || row.key).trim(),
    order: Number(row.order ?? 0) || 0,
    color: String(row.color || '#94a3b8').trim(),
    isActive: row.isActive !== false,
    stageType: normalizeStageType(row.stageType),
  };
}

export function mapPipelineStageLegacyToUpdateDto(
  row: PipelineStageLegacyRow,
  partial: Record<string, unknown> = {},
): import('./crmTypes.js').PipelineStageUpdateCoreDto {
  const merged = { ...row, ...partial };
  return {
    key: String(merged.key || '').trim(),
    label: String(merged.label || merged.key || '').trim(),
    order: Number(merged.order ?? 0) || 0,
    color: String(merged.color || '#94a3b8').trim(),
    isActive: merged.isActive !== false,
    stageType: normalizeStageType(merged.stageType),
  };
}

export function mapLeadCreateDtoToServerBody(
  dto: import('./crmTypes.js').LeadCreateCoreDto,
  meta?: import('./crmTypes.js').CrmWriteMeta,
): Record<string, unknown> {
  return {
    legacy_id: dto.legacyId,
    name: dto.name,
    phone: dto.phone,
    source: dto.source,
    interest: dto.interest,
    best_contact_time: dto.bestContactTime,
    notes: dto.notes,
    assigned_to_user_id: dto.assignedToUserId,
    stage_key: dto.stageKey,
    estimated_value: dto.estimatedValue,
    priority: dto.priority,
    tags: dto.tags,
    created_by_user_id: dto.createdByUserId,
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  };
}

export function mapLeadUpdateDtoToServerBody(
  dto: import('./crmTypes.js').LeadUpdateCoreDto,
  meta?: import('./crmTypes.js').CrmWriteMeta,
): Record<string, unknown> {
  return {
    name: dto.name,
    phone: dto.phone,
    source: dto.source,
    interest: dto.interest,
    best_contact_time: dto.bestContactTime,
    notes: dto.notes,
    assigned_to_user_id: dto.assignedToUserId,
    stage_key: dto.stageKey,
    patient_id: dto.patientId,
    estimated_value: dto.estimatedValue,
    priority: dto.priority,
    tags: dto.tags,
    last_contact_at: dto.lastContactAt,
    updated_by_user_id: dto.updatedByUserId,
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  };
}

export function mapLeadMoveStageDtoToServerBody(
  dto: import('./crmTypes.js').LeadMoveStageCoreDto,
  meta?: import('./crmTypes.js').CrmWriteMeta,
): Record<string, unknown> {
  return {
    stage_key: dto.stageKey,
    last_contact_at: dto.lastContactAt,
    updated_by_user_id: dto.updatedByUserId,
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  };
}

export function mapPipelineStageCreateDtoToServerBody(
  dto: import('./crmTypes.js').PipelineStageCreateCoreDto,
  meta?: import('./crmTypes.js').CrmWriteMeta,
): Record<string, unknown> {
  return {
    legacy_id: dto.legacyId,
    key: dto.key,
    label: dto.label,
    order: dto.order,
    color: dto.color,
    is_active: dto.isActive,
    stage_type: dto.stageType,
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  };
}

export function mapPipelineStageUpdateDtoToServerBody(
  dto: import('./crmTypes.js').PipelineStageUpdateCoreDto,
  meta?: import('./crmTypes.js').CrmWriteMeta,
): Record<string, unknown> {
  return {
    key: dto.key,
    label: dto.label,
    order: dto.order,
    color: dto.color,
    is_active: dto.isActive,
    stage_type: dto.stageType,
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  };
}
