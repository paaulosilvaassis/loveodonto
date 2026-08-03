/**
 * @module repositories/crm/crmActivityMapper
 * @description Mapeamento stores Wave B → Activity Stream (Phase 6.6).
 */

import type {
  CrmLegacyFollowUpLegacyRow,
  CrmTaskLegacyRow,
  LeadEventLegacyRow,
  StrategicFollowUpLegacyRow,
} from './crmTypes.js';
import type {
  CrmActivity,
  CrmActivityCompareResult,
  CrmActivitySource,
  CrmActivityType,
} from './crmActivityTypes.js';
import { CRM_ACTIVITY_COMPARE_FIELDS } from './crmActivityTypes.js';
import { normalizeOptionalString, normalizeTenantId } from '../shared/repositoryV3MapperHelpers.js';

const EVENT_TYPE_TO_ACTIVITY: Record<string, CrmActivityType> = {
  status_change: 'MOVE_STAGE',
  contact: 'CALL',
  message_sent: 'WHATSAPP',
  budget_created: 'NOTE',
  budget_presented: 'NOTE',
  budget_approved: 'NOTE',
  budget_rejected: 'NOTE',
  budget_em_analise_followup: 'FOLLOW_UP',
  appointment_scheduled: 'SYSTEM',
  appointment_done: 'SYSTEM',
  converted_to_patient: 'SYSTEM',
  tag_added: 'NOTE',
  follow_up_created: 'FOLLOW_UP',
  meta_lead_received: 'SYSTEM',
  meta_lead_updated: 'SYSTEM',
  task_created: 'TASK',
  task_done: 'TASK',
};

function resolveTenant(rowTenant: unknown, hint = ''): string {
  return normalizeTenantId(rowTenant) || normalizeTenantId(hint);
}

export function mapLeadEventToActivity(
  row: LeadEventLegacyRow | null,
  tenantIdHint = '',
): CrmActivity | null {
  if (!row?.id) return null;
  const tenantId = resolveTenant(row.tenant_id, tenantIdHint);
  if (!tenantId) return null;
  const eventType = String(row.type || '').trim();
  return {
    id: String(row.id).trim(),
    type: EVENT_TYPE_TO_ACTIVITY[eventType] || 'SYSTEM',
    leadId: normalizeOptionalString(row.leadId),
    patientId: null,
    ownerId: normalizeOptionalString(row.userId),
    timestamp: String(row.createdAt || '').trim(),
    status: 'recorded',
    payload: {
      eventType,
      ...(row.data && typeof row.data === 'object' ? row.data : {}),
    },
    source: 'crmLeadEvents',
    tenantId,
  };
}

export function mapCrmLegacyFollowUpToActivity(
  row: CrmLegacyFollowUpLegacyRow | null,
  tenantIdHint = '',
): CrmActivity | null {
  if (!row?.id) return null;
  const tenantId = resolveTenant(row.tenant_id, tenantIdHint);
  if (!tenantId) return null;
  const doneAt = row.doneAt ? String(row.doneAt) : null;
  return {
    id: String(row.id).trim(),
    type: 'FOLLOW_UP',
    leadId: normalizeOptionalString(row.leadId),
    patientId: null,
    ownerId: normalizeOptionalString(row.createdByUserId),
    timestamp: String(row.dueAt || row.createdAt || '').trim(),
    status: doneAt ? 'done' : 'pending',
    payload: {
      dueAt: row.dueAt || null,
      type: row.type || 'retorno',
      notes: row.notes || '',
      doneAt,
      createdAt: row.createdAt || null,
    },
    source: 'crmFollowUps',
    tenantId,
  };
}

export function mapCrmTaskToActivity(
  row: CrmTaskLegacyRow | null,
  tenantIdHint = '',
): CrmActivity | null {
  if (!row?.id) return null;
  const tenantId = resolveTenant(row.tenant_id, tenantIdHint);
  if (!tenantId) return null;
  return {
    id: String(row.id).trim(),
    type: 'TASK',
    leadId: normalizeOptionalString(row.leadId),
    patientId: normalizeOptionalString(row.patientId),
    ownerId: normalizeOptionalString(row.assignedTo || row.createdBy),
    timestamp: String(row.dueAt || row.createdAt || '').trim(),
    status: String(row.status || 'pending'),
    payload: {
      title: row.title || '',
      description: row.description || '',
      type: row.type || 'custom',
      channel: row.channel || '',
      priority: row.priority || 'medium',
      dueAt: row.dueAt || null,
      clinicId: row.clinicId || null,
      budgetId: row.budgetId || null,
      appointmentId: row.appointmentId || null,
      doneAt: row.doneAt || null,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
    },
    source: 'crmTasks',
    tenantId,
  };
}

export function mapStrategicFollowUpToActivity(
  row: StrategicFollowUpLegacyRow | null,
  tenantIdHint = '',
): CrmActivity | null {
  if (!row?.id) return null;
  const tenantId = resolveTenant(row.tenant_id, tenantIdHint);
  if (!tenantId) return null;
  return {
    id: String(row.id).trim(),
    type: 'FOLLOW_UP',
    leadId: normalizeOptionalString(row.leadId),
    patientId: normalizeOptionalString(row.patientId),
    ownerId: normalizeOptionalString(row.assignedTo),
    timestamp: String(row.dueDate || row.createdAt || '').trim(),
    status: String(row.status || 'pending'),
    payload: {
      dueDate: row.dueDate || null,
      type: row.type || 'retorno',
      description: row.description || '',
      originType: row.originType || 'manual',
      priority: row.priority || 'medium',
      clinicId: row.clinicId || null,
      budgetId: row.budgetId || null,
      completedAt: row.completedAt || null,
      createdAt: row.createdAt || null,
    },
    source: 'followUps',
    tenantId,
  };
}

/** Reconstrói shape legado a partir de Activity (para Primary Read sem mudar consumidores). */
export function mapActivityToLeadEventLegacy(activity: CrmActivity): LeadEventLegacyRow {
  return {
    id: activity.id,
    leadId: activity.leadId || '',
    type: String(activity.payload.eventType || 'contact'),
    userId: activity.ownerId,
    data: { ...activity.payload },
    createdAt: activity.timestamp,
    tenant_id: activity.tenantId,
  };
}

export function mapActivityToCrmLegacyFollowUpLegacy(activity: CrmActivity): CrmLegacyFollowUpLegacyRow {
  return {
    id: activity.id,
    leadId: activity.leadId || '',
    dueAt: String(activity.payload.dueAt || activity.timestamp),
    type: String(activity.payload.type || 'retorno'),
    notes: String(activity.payload.notes || ''),
    doneAt: activity.payload.doneAt ? String(activity.payload.doneAt) : null,
    createdAt: String(activity.payload.createdAt || activity.timestamp),
    createdByUserId: activity.ownerId,
    tenant_id: activity.tenantId,
  };
}

export function mapActivityToCrmTaskLegacy(activity: CrmActivity): CrmTaskLegacyRow {
  return {
    id: activity.id,
    clinicId: String(activity.payload.clinicId || ''),
    tenant_id: activity.tenantId,
    leadId: activity.leadId,
    patientId: activity.patientId,
    budgetId: activity.payload.budgetId ? String(activity.payload.budgetId) : null,
    appointmentId: activity.payload.appointmentId ? String(activity.payload.appointmentId) : null,
    title: String(activity.payload.title || ''),
    description: String(activity.payload.description || ''),
    type: String(activity.payload.type || 'custom'),
    channel: String(activity.payload.channel || ''),
    dueAt: String(activity.payload.dueAt || activity.timestamp),
    priority: String(activity.payload.priority || 'medium'),
    status: String(activity.status || 'pending'),
    assignedTo: activity.ownerId,
    createdBy: activity.ownerId,
    createdAt: String(activity.payload.createdAt || activity.timestamp),
    updatedAt: String(activity.payload.updatedAt || activity.timestamp),
    doneAt: activity.payload.doneAt ? String(activity.payload.doneAt) : null,
  };
}

export function mapActivityToStrategicFollowUpLegacy(activity: CrmActivity): StrategicFollowUpLegacyRow {
  return {
    id: activity.id,
    clinicId: String(activity.payload.clinicId || ''),
    tenant_id: activity.tenantId,
    patientId: activity.patientId,
    leadId: activity.leadId,
    budgetId: activity.payload.budgetId ? String(activity.payload.budgetId) : null,
    originType: String(activity.payload.originType || 'manual'),
    type: String(activity.payload.type || 'retorno'),
    description: String(activity.payload.description || ''),
    dueDate: String(activity.payload.dueDate || activity.timestamp).slice(0, 10),
    priority: String(activity.payload.priority || 'medium'),
    status: String(activity.status || 'pending'),
    assignedTo: activity.ownerId,
    createdAt: String(activity.payload.createdAt || activity.timestamp),
    completedAt: activity.payload.completedAt ? String(activity.payload.completedAt) : null,
  };
}

export function compareCrmActivities(
  left: CrmActivity | null,
  right: CrmActivity | null,
): CrmActivityCompareResult {
  const diffs: CrmActivityCompareResult['diffs'] = [];
  if (!left && !right) return { match: true, diffs: [] };
  if (!left || !right) {
    return {
      match: false,
      diffs: [{ field: 'presence', indexedDb: Boolean(left), activity: Boolean(right) }],
      id: left?.id || right?.id,
      source: (left?.source || right?.source) as CrmActivitySource | undefined,
    };
  }
  for (const field of CRM_ACTIVITY_COMPARE_FIELDS) {
    const a = left[field];
    const b = right[field];
    const leftVal = field === 'payload' ? JSON.stringify(a ?? {}) : String(a ?? '');
    const rightVal = field === 'payload' ? JSON.stringify(b ?? {}) : String(b ?? '');
    if (leftVal !== rightVal) {
      diffs.push({ field, indexedDb: a, activity: b });
    }
  }
  return {
    match: diffs.length === 0,
    diffs,
    id: left.id,
    source: left.source,
  };
}

export function sortActivitiesByTimestampDesc(items: CrmActivity[]): CrmActivity[] {
  return [...items].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
