/**
 * @module repositories/crm/crmIndexedDbRepository
 * @description Leitura legado IndexedDB — CRM/Kanban Wave A + Wave B foundation (Phase 6.5).
 */

import { loadDb } from '../../db/index.js';
import { normalizeTenantId } from '../../services/tenantIsolation.js';
import type {
  CrmLegacyFollowUpLegacyRow,
  CrmListFilters,
  CrmTaskLegacyRow,
  CrmWaveBListFilters,
  ICrmIndexedDbReader,
  KanbanCardLegacyRow,
  LeadEventLegacyRow,
  LeadLegacyRow,
  PipelineStageLegacyRow,
  StrategicFollowUpLegacyRow,
} from './crmTypes.js';
import { mapLegacyRowToKanbanCard } from './crmMapper.js';

function matchesLeadFilters(row: LeadLegacyRow, filters: CrmListFilters = {}): boolean {
  const tenantId = normalizeTenantId(filters.tenantId);
  if (tenantId) {
    const rowTenant = normalizeTenantId(row.tenant_id);
    if (rowTenant && rowTenant !== tenantId) return false;
  }
  if (filters.stageKey && row.stageKey !== filters.stageKey) return false;
  if (filters.assignedToUserId && row.assignedToUserId !== filters.assignedToUserId) return false;
  if (filters.source && row.source !== filters.source) return false;
  if (filters.tagId) {
    const db = loadDb();
    const leadIdsWithTag = new Set(
      (db.leadTags || [])
        .filter((lt) => lt.tagId === filters.tagId)
        .map((lt) => lt.leadId),
    );
    if (!leadIdsWithTag.has(String(row.id))) return false;
  }
  if (filters.search) {
    const q = String(filters.search).trim().toLowerCase();
    const haystack = [
      row.name,
      row.phone,
      row.interest,
      row.id,
    ].map((v) => String(v || '').toLowerCase()).join(' ');
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function toKanbanLegacyRow(row: LeadLegacyRow): KanbanCardLegacyRow {
  const card = mapLegacyRowToKanbanCard(row);
  if (!card) return { ...row };
  return {
    ...row,
    cardId: card.cardId,
    ownerId: card.ownerId,
    status: card.status,
  };
}

function resolvePipelineStages(tenantId = '', options: { includeInactive?: boolean } = {}) {
  const db = loadDb();
  const normalized = normalizeTenantId(tenantId);
  let stages = (db.crmPipelineStages || []) as PipelineStageLegacyRow[];
  if (normalized) {
    const owned = stages.filter((stage) => normalizeTenantId(stage.tenant_id) === normalized);
    stages = owned.length ? owned : stages.filter((stage) => !normalizeTenantId(stage.tenant_id));
  }
  if (!options.includeInactive) {
    stages = stages.filter((stage) => stage.isActive !== false);
  }
  return [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function resolveTenantHint(filters: CrmWaveBListFilters = {}): string {
  return normalizeTenantId(filters.tenantId)
    || normalizeTenantId(loadDb().clinicProfile?.tenant_id)
    || '';
}

export const crmIndexedDbRepository: ICrmIndexedDbReader = {
  listLeadsLegacySync(filters = {}): LeadLegacyRow[] {
    const db = loadDb();
    return (db.crmLeads || [])
      .filter((row) => matchesLeadFilters(row as LeadLegacyRow, filters))
      .map((row) => ({ ...row })) as LeadLegacyRow[];
  },

  getLeadLegacySync(leadId: string): LeadLegacyRow | null {
    const id = String(leadId || '').trim();
    if (!id) return null;
    const db = loadDb();
    const row = (db.crmLeads || []).find((item) => String(item.id) === id);
    return row ? { ...row } as LeadLegacyRow : null;
  },

  listPipelineStagesLegacySync(tenantId = '', options = {}): PipelineStageLegacyRow[] {
    return resolvePipelineStages(tenantId, options).map((stage) => ({ ...stage }));
  },

  getPipelineStageLegacySync(tenantId: string, ref: string): PipelineStageLegacyRow | null {
    const needle = String(ref || '').trim();
    if (!needle) return null;
    const stages = resolvePipelineStages(tenantId, { includeInactive: true });
    return stages.find((stage) =>
      String(stage.id) === needle
      || String(stage.key) === needle) ?? null;
  },

  listLeadEventsLegacySync(leadId: string, filters: CrmWaveBListFilters = {}): LeadEventLegacyRow[] {
    const id = String(leadId || filters.leadId || '').trim();
    const db = loadDb();
    let rows = (db.crmLeadEvents || []) as LeadEventLegacyRow[];
    if (id) rows = rows.filter((event) => event.leadId === id);
    const tenantId = normalizeTenantId(filters.tenantId);
    if (tenantId) {
      rows = rows.filter((event) => {
        const rowTenant = normalizeTenantId(event.tenant_id);
        return !rowTenant || rowTenant === tenantId;
      });
    }
    if (filters.type) {
      rows = rows.filter((event) => event.type === filters.type);
    }
    return rows
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((event) => ({ ...event }));
  },

  listKanbanCardsLegacySync(filters = {}): KanbanCardLegacyRow[] {
    const db = loadDb();
    return (db.crmLeads || [])
      .filter((row) => matchesLeadFilters(row as LeadLegacyRow, filters))
      .map((row) => toKanbanLegacyRow({ ...row } as LeadLegacyRow));
  },

  getKanbanCardLegacySync(cardId: string): KanbanCardLegacyRow | null {
    const id = String(cardId || '').trim();
    if (!id) return null;
    const db = loadDb();
    const row = (db.crmLeads || []).find((item) => String(item.id) === id);
    return row ? toKanbanLegacyRow({ ...row } as LeadLegacyRow) : null;
  },

  listCrmLegacyFollowUpsLegacySync(filters: CrmWaveBListFilters = {}): CrmLegacyFollowUpLegacyRow[] {
    const db = loadDb();
    const tenantHint = resolveTenantHint(filters);
    let list = [...(db.crmFollowUps || [])] as CrmLegacyFollowUpLegacyRow[];
    if (filters.leadId) list = list.filter((f) => f.leadId === filters.leadId);
    if (filters.pending === true) list = list.filter((f) => !f.doneAt);
    if (filters.type) list = list.filter((f) => f.type === filters.type);
    if (tenantHint) {
      list = list.filter((f) => {
        const rowTenant = normalizeTenantId(f.tenant_id);
        return !rowTenant || rowTenant === tenantHint;
      });
    }
    return list
      .sort((a, b) => new Date(String(a.dueAt || 0)).getTime() - new Date(String(b.dueAt || 0)).getTime())
      .map((row) => ({ ...row, tenant_id: row.tenant_id || tenantHint || null }));
  },

  getCrmLegacyFollowUpLegacySync(ref: string): CrmLegacyFollowUpLegacyRow | null {
    const id = String(ref || '').trim();
    if (!id) return null;
    const db = loadDb();
    const row = (db.crmFollowUps || []).find((item) => String(item.id) === id);
    if (!row) return null;
    const tenantHint = normalizeTenantId(loadDb().clinicProfile?.tenant_id) || '';
    return { ...row, tenant_id: row.tenant_id || tenantHint || null } as CrmLegacyFollowUpLegacyRow;
  },

  listCrmTasksLegacySync(filters: CrmWaveBListFilters = {}): CrmTaskLegacyRow[] {
    const db = loadDb();
    const tenantHint = resolveTenantHint(filters);
    let list = [...(db.crmTasks || [])] as CrmTaskLegacyRow[];
    if (filters.clinicId) list = list.filter((t) => t.clinicId === filters.clinicId);
    if (filters.leadId) list = list.filter((t) => t.leadId === filters.leadId);
    if (filters.patientId) list = list.filter((t) => t.patientId === filters.patientId);
    if (filters.status) list = list.filter((t) => t.status === filters.status);
    if (filters.pending === true) list = list.filter((t) => t.status === 'pending');
    if (filters.type) list = list.filter((t) => t.type === filters.type);
    if (tenantHint) {
      list = list.filter((t) => {
        const rowTenant = normalizeTenantId(t.tenant_id);
        return !rowTenant || rowTenant === tenantHint;
      });
    }
    return list
      .sort((a, b) => new Date(String(a.dueAt || 0)).getTime() - new Date(String(b.dueAt || 0)).getTime())
      .map((row) => ({ ...row, tenant_id: row.tenant_id || tenantHint || null }));
  },

  getCrmTaskLegacySync(ref: string): CrmTaskLegacyRow | null {
    const id = String(ref || '').trim();
    if (!id) return null;
    const db = loadDb();
    const row = (db.crmTasks || []).find((item) => String(item.id) === id);
    if (!row) return null;
    const tenantHint = normalizeTenantId(row.tenant_id)
      || normalizeTenantId(loadDb().clinicProfile?.tenant_id)
      || '';
    return { ...row, tenant_id: row.tenant_id || tenantHint || null } as CrmTaskLegacyRow;
  },

  listStrategicFollowUpsLegacySync(filters: CrmWaveBListFilters = {}): StrategicFollowUpLegacyRow[] {
    const db = loadDb();
    const tenantHint = resolveTenantHint(filters);
    let list = [...(db.followUps || [])] as StrategicFollowUpLegacyRow[];
    if (filters.clinicId) list = list.filter((f) => f.clinicId === filters.clinicId);
    if (filters.leadId) list = list.filter((f) => f.leadId === filters.leadId);
    if (filters.patientId) list = list.filter((f) => f.patientId === filters.patientId);
    if (filters.status) list = list.filter((f) => f.status === filters.status);
    if (filters.pending === true) list = list.filter((f) => f.status === 'pending');
    if (filters.type) list = list.filter((f) => f.type === filters.type);
    return list
      .sort((a, b) => new Date(String(a.dueDate || 0)).getTime() - new Date(String(b.dueDate || 0)).getTime())
      .map((row) => ({ ...row, tenant_id: row.tenant_id || tenantHint || null }));
  },

  getStrategicFollowUpLegacySync(ref: string): StrategicFollowUpLegacyRow | null {
    const id = String(ref || '').trim();
    if (!id) return null;
    const db = loadDb();
    const row = (db.followUps || []).find((item) => String(item.id) === id);
    if (!row) return null;
    const tenantHint = normalizeTenantId(loadDb().clinicProfile?.tenant_id) || '';
    return { ...row, tenant_id: row.tenant_id || tenantHint || null } as StrategicFollowUpLegacyRow;
  },
};

export function getCrmTenantIdFromDbSync(): string | null {
  const db = loadDb();
  const fromLead = normalizeTenantId(db.crmLeads?.[0]?.tenant_id);
  if (fromLead) return fromLead;
  return normalizeTenantId(db.clinicProfile?.tenant_id) || null;
}
