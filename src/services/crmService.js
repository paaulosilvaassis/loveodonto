import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import { logAction } from './logService.js';
import { enrichLeadWithTags } from './crmTagService.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';
import { getCrmTenantIdFromDbSync } from '../repositories/crm/crmIndexedDbRepository.ts';
import {
  readGetKanbanCard,
  readGetLead,
  readListKanbanCards,
  readListLeads,
  readListPipelineStages,
} from './crmReadAdapter.js';
import {
  scheduleCrmDualWriteCreateLead,
  scheduleCrmDualWriteMoveLeadToStage,
  scheduleCrmDualWriteUpdateLead,
} from './crmWriteAdapter.js';
import {
  scheduleLeadCreatedDomainEvent,
  scheduleLeadMovedDomainEvent,
  scheduleLeadUpdatedDomainEvent,
} from './crmLeadDomainEventPublisher.js';
import {
  scheduleCrmTimelineEventCreatedDomainEvent,
} from './crmActivityDomainEventPublisher.js';
import {
  scheduleFollowUpCreatedDomainEvent,
  scheduleFollowUpMutationDomainEvent,
} from './crmFollowUpDomainEventPublisher.js';
import {
  readGetCrmLegacyFollowUpWaveB,
  readGetLeadEventWaveB,
  readListCrmLegacyFollowUpsWaveB,
  readListLeadEventsWaveB,
} from './crmWaveBAdapter.js';
import {
  scheduleActivityDualWriteCreateCrmFollowUp,
  scheduleActivityDualWriteCreateLeadEvent,
  scheduleActivityDualWriteUpdateCrmFollowUp,
  scheduleActivityDualWriteUpdateLeadEvent,
} from './crmActivityWriteAdapter.js';

// ─── Fontes de Lead (configuráveis) ─────────────────────────────────────────
export const LEAD_SOURCE = {
  WHATSAPP: 'whatsapp',
  INSTAGRAM: 'instagram',
  SITE: 'site',
  GOOGLE_ADS: 'google_ads',
  INDICACAO: 'indicacao',
  TELEFONE: 'telefone',
  WALK_IN: 'walk_in',
  MANUAL: 'manual',
  META: 'meta',
};

export const LEAD_SOURCE_LABELS = {
  [LEAD_SOURCE.WHATSAPP]: 'WhatsApp',
  [LEAD_SOURCE.INSTAGRAM]: 'Instagram',
  [LEAD_SOURCE.SITE]: 'Site',
  [LEAD_SOURCE.GOOGLE_ADS]: 'Google Ads',
  [LEAD_SOURCE.INDICACAO]: 'Indicação',
  [LEAD_SOURCE.TELEFONE]: 'Telefone',
  [LEAD_SOURCE.WALK_IN]: 'Walk-in (chegou na clínica)',
  [LEAD_SOURCE.MANUAL]: 'Manual',
  [LEAD_SOURCE.META]: 'Meta (Facebook/Instagram Lead Ads)',
};

// Interesse principal (ex.: Implante, Prótese, Estética, Ortodontia)
export const LEAD_INTEREST_LABELS = {
  implante: 'Implante',
  protese: 'Prótese',
  estetica: 'Estética',
  ortodontia: 'Ortodontia',
  endodontia: 'Endodontia',
  periodontia: 'Periodontia',
  cirurgia: 'Cirurgia',
  geral: 'Clínica Geral',
  outros: 'Outros',
};

// Tipos de evento na linha do tempo
export const CRM_EVENT_TYPE = {
  STATUS_CHANGE: 'status_change',
  CONTACT: 'contact',
  MESSAGE_SENT: 'message_sent',
  BUDGET_CREATED: 'budget_created',
  BUDGET_PRESENTED: 'budget_presented',
  BUDGET_APPROVED: 'budget_approved',
  BUDGET_REJECTED: 'budget_rejected',
  APPOINTMENT_SCHEDULED: 'appointment_scheduled',
  APPOINTMENT_DONE: 'appointment_done',
  CONVERTED_TO_PATIENT: 'converted_to_patient',
  TAG_ADDED: 'tag_added',
  FOLLOW_UP_CREATED: 'follow_up_created',
  META_LEAD_RECEIVED: 'meta_lead_received',
  META_LEAD_UPDATED: 'meta_lead_updated',
  TASK_CREATED: 'task_created',
  TASK_DONE: 'task_done',
  /** Orçamento em análise → follow-up criado */
  BUDGET_EM_ANALISE_FOLLOWUP: 'budget_em_analise_followup',
};

const resolveCrmTenantHint = () => getCrmTenantIdFromDbSync() || '';

const applyLeadListPostProcess = (list) => {
  const sorted = [...list].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt),
  );
  return sorted.map((l) => enrichLeadWithTags(l));
};

// ─── CRUD Leads ────────────────────────────────────────────────────────────

const parseEstimatedValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

/** Fases visíveis para o tenant do lead (inclui legadas sem tenant_id). */
const stagesForLeadTenant = (db, tenantId) =>
  (db.crmPipelineStages || []).filter((s) => s.tenant_id === tenantId || s.tenant_id == null);

const isLostStageForLead = (db, lead, stageKey) => {
  const stage = stagesForLeadTenant(db, lead.tenant_id).find((s) => s.key === stageKey);
  return stage ? stage.stageType === 'lost' : stageKey === 'perdido';
};

/**
 * Cria um novo lead. Lead NÃO vira paciente automaticamente.
 */
export const createLead = (user, data) => {
  const tenantId = resolveTenantIdForWrite(user, data?.tenant_id || data?.tenantId);
  const lead = withDb((db) => {
    if (!db.crmLeads) db.crmLeads = [];
    const now = new Date().toISOString();
    const id = createId('crmlead');
    const stageKey = data.stageKey || 'novo_lead';
    const record = {
      id,
      name: data.name?.trim() || '',
      phone: (data.phone || '').replace(/\D/g, ''),
      source: data.source || LEAD_SOURCE.MANUAL,
      interest: data.interest || '',
      bestContactTime: data.bestContactTime || '',
      notes: data.notes || '',
      assignedToUserId: data.assignedToUserId || user?.id || null,
      stageKey,
      patientId: null,
      estimatedValue: parseEstimatedValue(data.estimatedValue),
      priority: data.priority || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      lastContactAt: null,
      createdAt: now,
      updatedAt: now,
      createdByUserId: user?.id || null,
      tenant_id: tenantId,
    };
    db.crmLeads.push(record);
    logLeadEvent(db, id, CRM_EVENT_TYPE.STATUS_CHANGE, user?.id, {
      fromStage: null,
      toStage: stageKey,
      description: 'Lead criado',
    });
    logAction('crm:lead_created', { leadId: id, source: record.source, userId: user?.id });
    return record;
  });
  scheduleCrmDualWriteCreateLead(user, lead);
  // Domain Event Wave A — após IDB ok; fora do dual/primary adapter (sem duplicidade).
  scheduleLeadCreatedDomainEvent(user, lead);
  return lead;
};

/**
 * Lista leads com filtro opcional por stageKey, assignedToUserId, source, tagId.
 * Retorna leads enriquecidos com tagList (tags categorizadas).
 */
export const listLeads = (filters = {}) => {
  const tenantHint = filters.tenantId || resolveCrmTenantHint();
  const fromRepo = readListLeads({ ...filters, tenantId: tenantHint || undefined });
  if (fromRepo !== null) return applyLeadListPostProcess(fromRepo);

  const db = loadDb();
  let list = [...(db.crmLeads || [])];
  if (filters.stageKey) list = list.filter((l) => l.stageKey === filters.stageKey);
  if (filters.assignedToUserId) list = list.filter((l) => l.assignedToUserId === filters.assignedToUserId);
  if (filters.source) list = list.filter((l) => l.source === filters.source);
  if (filters.tagId) {
    const leadIdsWithTag = new Set(
      (db.leadTags || []).filter((lt) => lt.tagId === filters.tagId).map((lt) => lt.leadId)
    );
    list = list.filter((l) => leadIdsWithTag.has(l.id));
  }
  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    list = list.filter(
      (l) =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.interest || '').toLowerCase().includes(q)
    );
  }
  list.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  return list.map((l) => enrichLeadWithTags(l));
};

/**
 * Obtém um lead por id (enriquecido com tagList).
 */
export const getLeadById = (leadId) => {
  const tenantHint = resolveCrmTenantHint();
  const fromRepo = readGetLead(leadId, tenantHint);
  if (fromRepo !== null) return fromRepo ? enrichLeadWithTags(fromRepo) : null;

  const db = loadDb();
  const lead = (db.crmLeads || []).find((l) => l.id === leadId) || null;
  return lead ? enrichLeadWithTags(lead) : null;
};

/**
 * Atualiza um lead. Se stageKey mudar, gera evento e log.
 */
export const updateLead = (user, leadId, data) => {
  const updated = withDb((db) => {
    const index = (db.crmLeads || []).findIndex((l) => l.id === leadId);
    if (index < 0) throw new Error('Lead não encontrado');
    const prev = db.crmLeads[index];
    const now = new Date().toISOString();
    if (data.stageKey && data.stageKey !== prev.stageKey) {
      logLeadEvent(db, leadId, CRM_EVENT_TYPE.STATUS_CHANGE, user?.id, {
        fromStage: prev.stageKey,
        toStage: data.stageKey,
      });
    }
    db.crmLeads[index] = {
      ...prev,
      ...data,
      updatedAt: now,
      updatedByUserId: user?.id || null,
    };
    logAction('crm:lead_updated', { leadId, userId: user?.id });
    return db.crmLeads[index];
  });
  scheduleCrmDualWriteUpdateLead(user, updated, data);
  // Domain Event Wave A — LEAD_UPDATED (stage via updateLead não emite LEAD_MOVED).
  scheduleLeadUpdatedDomainEvent(user, updated, data);
  return updated;
};

/**
 * Converte lead em paciente (vincula patientId e gera evento).
 */
export const convertLeadToPatient = (user, leadId, patientId) => {
  return withDb((db) => {
    const index = (db.crmLeads || []).findIndex((l) => l.id === leadId);
    if (index < 0) throw new Error('Lead não encontrado');
    const now = new Date().toISOString();
    const lead = db.crmLeads[index];
    const conversionStage = stagesForLeadTenant(db, lead.tenant_id).find(
      (s) => s.stageType === 'conversion' && s.isActive !== false
    );
    const previousStageKey = lead.stageKey;
    const nextStageKey = conversionStage?.key || 'aprovado';
    if (nextStageKey !== previousStageKey) {
      logLeadEvent(db, leadId, CRM_EVENT_TYPE.STATUS_CHANGE, user?.id, {
        fromStage: previousStageKey,
        toStage: nextStageKey,
      });
    }
    db.crmLeads[index] = {
      ...lead,
      patientId,
      stageKey: nextStageKey,
      updatedAt: now,
      updatedByUserId: user?.id || null,
    };
    logLeadEvent(db, leadId, CRM_EVENT_TYPE.CONVERTED_TO_PATIENT, user?.id, { patientId });
    logAction('crm:lead_converted', { leadId, patientId, userId: user?.id });
    return db.crmLeads[index];
  });
};

// ─── Meta Lead Ads (webhook / integração) ────────────────────────────────────

const META_FIELD_NAMES = {
  full_name: 'name',
  first_name: 'firstName',
  last_name: 'lastName',
  phone_number: 'phone',
  email: 'email',
  cell_phone: 'phone',
  telefone: 'phone',
  celular: 'phone',
};

/**
 * Normaliza field_data do Meta (array { name, values }) para nome, phone, email e lista de campos.
 */
function normalizeMetaPayload(payload) {
  const field_data = Array.isArray(payload.field_data) ? payload.field_data : [];
  const rawFields = field_data.map((f) => ({
    question: f.name || f.question || '',
    value: Array.isArray(f.values) ? f.values[0] : (f.value ?? ''),
  }));
  let name = '';
  let phone = '';
  let email = '';
  for (const f of rawFields) {
    const q = (f.question || '').toLowerCase().replace(/\s+/g, '_');
    const v = (f.value || '').trim();
    const key = META_FIELD_NAMES[q] || q;
    if (key === 'name' || key === 'full_name') name = name || v;
    else if (key === 'firstName' && !name) name = v;
    else if (key === 'lastName') name = (name ? `${name} ` : '') + v;
    else if (key === 'phone') phone = phone || v;
    else if (key === 'email') email = email || v;
  }
  if (!name) name = rawFields.find((f) => /nome|name|nome_completo/i.test(f.question))?.value || '';
  if (!phone) phone = rawFields.find((f) => /telefone|phone|celular|fone/i.test(f.question))?.value || '';
  if (!email) email = rawFields.find((f) => /email|e-mail/i.test(f.question))?.value || '';
  return {
    name: name.trim(),
    phone: (phone || '').replace(/\D/g, ''),
    email: (email || '').trim(),
    form_name: payload.form_name || payload.form_id || '',
    ad_name: payload.ad_name || payload.ad_id || '',
    campaign_name: payload.campaign_name || payload.campaign_id || '',
    created_time: payload.created_time || new Date().toISOString(),
    field_values: rawFields,
  };
}

function findLeadByPhone(db, phone) {
  if (!phone || !db.crmLeads) return null;
  const normalized = String(phone).replace(/\D/g, '');
  if (!normalized) return null;
  return db.crmLeads.find((l) => (l.phone || '').replace(/\D/g, '') === normalized) || null;
}

/**
 * Cria ou atualiza lead a partir de payload do Meta Lead Ads e registra evento na timeline.
 * Payload esperado: { field_data: [{ name, values }], form_name?, ad_name?, campaign_name?, form_id?, ad_id?, campaign_id?, created_time? }.
 * Retorna { lead, created: true|false }.
 */
export const createOrUpdateLeadFromMeta = (payload) => {
  return withDb((db) => {
    if (!db.crmLeads) db.crmLeads = [];
    const norm = normalizeMetaPayload(payload);
    const existing = findLeadByPhone(db, norm.phone);
    const now = new Date().toISOString();
    const eventPayload = {
      source: 'meta',
      form_name: norm.form_name,
      ad_name: norm.ad_name,
      campaign_name: norm.campaign_name,
      created_time: norm.created_time,
      name: norm.name,
      phone: norm.phone,
      email: norm.email,
      field_values: norm.field_values,
    };

    if (existing) {
      const index = db.crmLeads.findIndex((l) => l.id === existing.id);
      db.crmLeads[index] = {
        ...existing,
        name: norm.name || existing.name,
        lastContactAt: now,
        updatedAt: now,
        updatedByUserId: null,
      };
      logLeadEvent(db, existing.id, CRM_EVENT_TYPE.META_LEAD_UPDATED, null, eventPayload);
      logAction('crm:meta_lead_updated', { leadId: existing.id });
      return { lead: db.crmLeads[index], created: false };
    }

    const id = createId('crmlead');
    const tenantId = resolveTenantIdForWrite(
      null,
      payload?.tenant_id || payload?.tenantId || norm?.tenant_id || norm?.tenantId
    );
    const lead = {
      id,
      name: norm.name || '',
      phone: norm.phone || '',
      source: LEAD_SOURCE.META,
      interest: '',
      notes: '',
      assignedToUserId: null,
      stageKey: 'novo_lead',
      patientId: null,
      tags: [],
      lastContactAt: now,
      createdAt: now,
      updatedAt: now,
      createdByUserId: null,
      tenant_id: tenantId,
    };
    db.crmLeads.push(lead);
    logLeadEvent(db, id, CRM_EVENT_TYPE.STATUS_CHANGE, null, {
      fromStage: null,
      toStage: 'novo_lead',
      description: 'Lead criado',
    });
    logLeadEvent(db, id, CRM_EVENT_TYPE.META_LEAD_RECEIVED, null, eventPayload);
    logAction('crm:meta_lead_created', { leadId: id });
    return { lead, created: true };
  });
};

// ─── Pipeline (colunas Kanban) ──────────────────────────────────────────────

/** Estágios padrão do pipeline (fallback quando DB não tem colunas, evita tela branca). */
const DEFAULT_PIPELINE_STAGES = [
  { id: 'crm-stage-1', key: 'novo_lead', label: 'Novo Lead', order: 1, color: '#94a3b8' },
  { id: 'crm-stage-2', key: 'contato_realizado', label: 'Contato Realizado', order: 2, color: '#60a5fa' },
  { id: 'crm-stage-3', key: 'avaliacao_agendada', label: 'Avaliação Agendada', order: 3, color: '#a78bfa' },
  { id: 'crm-stage-4', key: 'avaliacao_realizada', label: 'Avaliação Realizada', order: 4, color: '#c084fc' },
  { id: 'crm-stage-5', key: 'orcamento_apresentado', label: 'Orçamento Apresentado', order: 5, color: '#f59e0b' },
  { id: 'crm-stage-6', key: 'em_negociacao', label: 'Em Negociação', order: 6, color: '#fbbf24' },
  { id: 'crm-stage-7', key: 'aprovado', label: 'Aprovado', order: 7, color: '#34d399' },
  { id: 'crm-stage-8', key: 'em_tratamento', label: 'Em Tratamento', order: 8, color: '#22c55e' },
  { id: 'crm-stage-9', key: 'finalizado', label: 'Finalizado', order: 9, color: '#10b981' },
  { id: 'crm-stage-10', key: 'perdido', label: 'Perdido', order: 10, color: '#ef4444' },
];

/**
 * Retorna as colunas do pipeline (editáveis; default na migration 16).
 * Se o DB tiver crmPipelineStages vazio, retorna DEFAULT_PIPELINE_STAGES para evitar tela branca.
 */
export const getPipelineStages = () => {
  const tenantHint = resolveCrmTenantHint();
  const fromRepo = readListPipelineStages(tenantHint, { includeInactive: true });
  if (fromRepo !== null) {
    return [...fromRepo].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  const db = loadDb();
  const stages = db.crmPipelineStages && db.crmPipelineStages.length > 0
    ? db.crmPipelineStages
    : DEFAULT_PIPELINE_STAGES;
  return [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
};

/**
 * Lista cards do Kanban comercial (projeção de leads por stageKey).
 * Wave A — alias de listLeads com shape Kanban.
 */
export const listKanbanCards = (filters = {}) => {
  const tenantHint = filters.tenantId || resolveCrmTenantHint();
  const fromRepo = readListKanbanCards({ ...filters, tenantId: tenantHint || undefined });
  if (fromRepo !== null) return applyLeadListPostProcess(fromRepo);
  return listLeads(filters);
};

/**
 * Obtém card Kanban por id (lead id).
 */
export const getKanbanCard = (cardId) => {
  const tenantHint = resolveCrmTenantHint();
  const fromRepo = readGetKanbanCard(cardId, tenantHint);
  if (fromRepo !== null) return fromRepo ? enrichLeadWithTags(fromRepo) : null;
  return getLeadById(cardId);
};

/**
 * Atualiza estágio do lead (move card no Kanban) e registra evento.
 * @param {Object} [options] - { lossReason } ao marcar como perdido
 */
export const moveLeadToStage = (user, leadId, newStageKey, options = {}) => {
  let fromStageKey = null;
  const lead = withDb((db) => {
    const found = (db.crmLeads || []).find((l) => l.id === leadId);
    if (!found) throw new Error('Lead não encontrado');
    const tenantStages = stagesForLeadTenant(db, found.tenant_id);
    if (tenantStages.length > 0 && !tenantStages.some((s) => s.key === newStageKey)) {
      throw new Error('Fase do pipeline não encontrada para esta clínica.');
    }
    const fromStage = found.stageKey;
    fromStageKey = fromStage;
    const now = new Date().toISOString();
    found.stageKey = newStageKey;
    if (isLostStageForLead(db, found, newStageKey) && options.lossReason != null) {
      found.lossReason = String(options.lossReason).trim() || null;
    }
    found.lastContactAt = now;
    found.updatedAt = now;
    found.updatedByUserId = user?.id || null;
    logLeadEvent(db, leadId, CRM_EVENT_TYPE.STATUS_CHANGE, user?.id, {
      fromStage,
      toStage: newStageKey,
    });
    logAction('crm:lead_stage_changed', { leadId, fromStage, toStage: newStageKey, userId: user?.id });
    return found;
  });
  scheduleCrmDualWriteMoveLeadToStage(user, lead, newStageKey, options);
  // Domain Event Wave A — LEAD_MOVED (nome oficial do registry).
  scheduleLeadMovedDomainEvent(user, lead, fromStageKey, newStageKey, {
    lossReason: options.lossReason,
  });
  return lead;
};

// ─── Linha do tempo (eventos) ────────────────────────────────────────────────

function logLeadEvent(db, leadId, type, userId, data = {}) {
  if (!db.crmLeadEvents) db.crmLeadEvents = [];
  db.crmLeadEvents.push({
    id: createId('crmev'),
    leadId,
    type,
    userId: userId || null,
    data: { ...data },
    createdAt: new Date().toISOString(),
  });
}

/**
 * Registra evento na linha do tempo do lead (ex.: mensagem enviada, contato).
 * Alias Phase 6.7: createLeadEvent.
 */
export const addLeadEvent = (user, leadId, type, data = {}) => {
  const event = withDb((db) => {
    const lead = (db.crmLeads || []).find((l) => l.id === leadId);
    if (!lead) throw new Error('Lead não encontrado');
    logLeadEvent(db, leadId, type, user?.id, data);
    lead.lastContactAt = new Date().toISOString();
    lead.updatedAt = lead.lastContactAt;
    const created = db.crmLeadEvents[db.crmLeadEvents.length - 1];
    if (lead.tenant_id && created && !created.tenant_id) {
      created.tenant_id = lead.tenant_id;
    }
    return created;
  });
  scheduleActivityDualWriteCreateLeadEvent(user, event);
  scheduleCrmTimelineEventCreatedDomainEvent(user, event);
  return event;
};

/** Alias explícito Phase 6.7 — createLeadEvent. */
export const createLeadEvent = addLeadEvent;

/**
 * Atualiza evento de timeline (payload/data). Dual-write shadow quando flags ON.
 */
export const updateLeadEvent = (user, eventId, data = {}) => {
  const updated = withDb((db) => {
    const idx = (db.crmLeadEvents || []).findIndex((e) => e.id === eventId);
    if (idx < 0) throw new Error('Evento não encontrado');
    const prev = db.crmLeadEvents[idx];
    db.crmLeadEvents[idx] = {
      ...prev,
      data: { ...(prev.data || {}), ...(data.data || data) },
      type: data.type !== undefined ? data.type : prev.type,
    };
    return db.crmLeadEvents[idx];
  });
  scheduleActivityDualWriteUpdateLeadEvent(user, updated);
  return updated;
};

/**
 * Lista eventos do lead (linha do tempo), mais recentes primeiro.
 */
export const listLeadEvents = (leadId) => {
  const tenantHint = resolveCrmTenantHint();
  const fromRepo = readListLeadEventsWaveB(leadId, tenantHint);
  if (fromRepo !== null) return fromRepo;

  const db = loadDb();
  const events = (db.crmLeadEvents || []).filter((e) => e.leadId === leadId);
  events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return events;
};

/**
 * Alias / detalhe — lista eventos do lead (mesmo contrato de listLeadEvents).
 * Phase 6.6: Primary Read via Activity Stream quando flags ON.
 */
export const getLeadEvents = (leadId) => listLeadEvents(leadId);

/**
 * Obtém um evento de timeline por id.
 */
export const getLeadEvent = (eventId) => {
  const tenantHint = resolveCrmTenantHint();
  const fromRepo = readGetLeadEventWaveB(eventId, tenantHint);
  if (fromRepo !== null) return fromRepo;

  const db = loadDb();
  return (db.crmLeadEvents || []).find((e) => e.id === eventId) || null;
};

/**
 * Lista registros LeadMessageLog do lead (WhatsApp/comunicação).
 */
export const listMessageLogs = (leadId) => {
  const db = loadDb();
  const logs = (db.crmMessageLogs || []).filter((m) => m.leadId === leadId);
  return [...logs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// ─── WhatsApp ───────────────────────────────────────────────────────────────

/**
 * Gera link para abrir conversa no WhatsApp (web ou app).
 * @param {string} phone - Número com DDD, apenas dígitos (ex.: 5511999999999)
 * @param {string} [message] - Mensagem pré-preenchida (opcional)
 */
export const buildWhatsAppLink = (phone, message = '') => {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits.length) return '';
  const base = `https://wa.me/${digits}`;
  if (message && message.trim()) {
    return `${base}?text=${encodeURIComponent(message.trim())}`;
  }
  return base;
};

/**
 * Estrutura LeadMessageLog: { leadId, channel, templateId?, messagePreview, createdAt, createdBy }
 * Persiste em crmMessageLogs e gera entrada na timeline (crmLeadEvents type message_sent).
 */
export const logMessage = (user, leadId, { channel = 'whatsapp', templateId = null, messagePreview = '' }) => {
  return withDb((db) => {
    const lead = (db.crmLeads || []).find((l) => l.id === leadId);
    if (!lead) throw new Error('Lead não encontrado');
    const now = new Date().toISOString();
    const createdBy = user?.id || null;
    if (!db.crmMessageLogs) db.crmMessageLogs = [];
    const logEntry = {
      id: createId('crmmsg'),
      leadId,
      channel,
      templateId,
      messagePreview: String(messagePreview).slice(0, 500),
      createdAt: now,
      createdBy,
    };
    db.crmMessageLogs.push(logEntry);
    logLeadEvent(db, leadId, CRM_EVENT_TYPE.MESSAGE_SENT, createdBy, {
      channel,
      templateId,
      messagePreview: logEntry.messagePreview,
    });
    lead.lastContactAt = now;
    lead.updatedAt = now;
    return logEntry;
  });
};

/**
 * Registra envio de mensagem WhatsApp no CRM (histórico do lead).
 * Mantido por compatibilidade; usa logMessage() com estrutura LeadMessageLog.
 */
export const logWhatsAppSent = (user, leadId, messageContent, templateId = null) => {
  return logMessage(user, leadId, {
    channel: 'whatsapp',
    templateId: templateId || null,
    messagePreview: typeof messageContent === 'string' ? messageContent.slice(0, 500) : String(messageContent || ''),
  });
};

// ─── Follow-ups ─────────────────────────────────────────────────────────────

/**
 * Cria lembrete de follow-up para um lead.
 * Alias Phase 6.7: createCrmFollowUp.
 */
export const createFollowUp = (user, leadId, data) => {
  const followUp = withDb((db) => {
    if (!db.crmFollowUps) db.crmFollowUps = [];
    const id = createId('crmfu');
    const now = new Date().toISOString();
    const lead = (db.crmLeads || []).find((l) => l.id === leadId);
    const followUpRecord = {
      id,
      leadId,
      dueAt: data.dueAt,
      type: data.type || 'retorno',
      notes: data.notes || '',
      doneAt: null,
      createdAt: now,
      createdByUserId: user?.id || null,
      tenant_id: lead?.tenant_id || resolveCrmTenantHint() || null,
    };
    db.crmFollowUps.push(followUpRecord);
    logLeadEvent(db, leadId, CRM_EVENT_TYPE.FOLLOW_UP_CREATED, user?.id, { followUpId: id, dueAt: data.dueAt });
    return followUpRecord;
  });
  scheduleActivityDualWriteCreateCrmFollowUp(user, followUp);
  scheduleFollowUpCreatedDomainEvent(user, followUp, 'crmFollowUps');
  return followUp;
};

/** Alias explícito Phase 6.7. */
export const createCrmFollowUp = createFollowUp;

/**
 * Atualiza follow-up legado CRM (`crmFollowUps`).
 */
export const updateCrmFollowUp = (user, followUpId, data = {}) => {
  let previous = null;
  const updated = withDb((db) => {
    const idx = (db.crmFollowUps || []).findIndex((f) => f.id === followUpId);
    if (idx < 0) throw new Error('Follow-up não encontrado');
    previous = { ...db.crmFollowUps[idx] };
    const prev = db.crmFollowUps[idx];
    db.crmFollowUps[idx] = {
      ...prev,
      ...data,
      id: prev.id,
      leadId: prev.leadId,
    };
    return db.crmFollowUps[idx];
  });
  scheduleActivityDualWriteUpdateCrmFollowUp(user, updated);
  scheduleFollowUpMutationDomainEvent(user, updated, previous, data, 'crmFollowUps');
  return updated;
};

/**
 * Lista follow-ups (por lead ou pendentes).
 */
export const listFollowUps = (filters = {}) => {
  const tenantHint = filters.tenantId || resolveCrmTenantHint();
  const fromRepo = readListCrmLegacyFollowUpsWaveB({ ...filters, tenantId: tenantHint || undefined });
  if (fromRepo !== null) return fromRepo;

  const db = loadDb();
  let list = [...(db.crmFollowUps || [])];
  if (filters.leadId) list = list.filter((f) => f.leadId === filters.leadId);
  if (filters.pending === true) list = list.filter((f) => !f.doneAt);
  list.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  return list;
};

/**
 * Obtém follow-up legado CRM por id (`crmFollowUps`).
 */
export const getCrmFollowUp = (followUpId) => {
  const tenantHint = resolveCrmTenantHint();
  const fromRepo = readGetCrmLegacyFollowUpWaveB(followUpId, tenantHint);
  if (fromRepo !== null) return fromRepo;

  const db = loadDb();
  return (db.crmFollowUps || []).find((f) => f.id === followUpId) || null;
};

/**
 * Lista vínculos orçamento–lead (BudgetLink).
 */
export const listBudgetLinks = (leadId) => {
  const db = loadDb();
  return (db.crmBudgetLinks || []).filter((b) => b.leadId === leadId);
};

// ─── Automações ─────────────────────────────────────────────────────────────

/**
 * Lista regras de automação do CRM.
 */
export const listAutomations = () => {
  const db = loadDb();
  return [...(db.crmAutomations || [])];
};

/**
 * Cria regra de automação (AutomationRule: gatilho/condição/ação).
 */
export const createAutomation = (user, data) => {
  return withDb((db) => {
    if (!db.crmAutomations) db.crmAutomations = [];
    const now = new Date().toISOString();
    const rule = {
      id: createId('crmauto'),
      name: data.name || 'Nova regra',
      trigger: data.trigger || { type: 'stage_change', stageKey: '' },
      condition: data.condition || null,
      action: data.action || { type: 'send_message', templateId: null },
      active: data.active !== false,
      createdAt: now,
      updatedAt: now,
    };
    db.crmAutomations.push(rule);
    return rule;
  });
};

// ─── Relatórios (contratos getKPIs / getFunnelMetrics) ───────────────────────

/**
 * KPIs do CRM para dashboard/relatórios.
 */
export const getKPIs = () => {
  const db = loadDb();
  const leads = db.crmLeads || [];
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const leadsThisMonth = leads.filter((l) => l.createdAt >= startOfMonth);
  const bySource = leads.reduce((acc, l) => {
    acc[l.source || 'manual'] = (acc[l.source || 'manual'] || 0) + 1;
    return acc;
  }, {});
  const converted = leads.filter((l) => l.patientId).length;
  return {
    totalLeads: leads.length,
    leadsThisMonth: leadsThisMonth.length,
    convertedToPatient: converted,
    conversionRate: leads.length ? Math.round((converted / leads.length) * 100) : 0,
    bySource,
  };
};

/**
 * Métricas de funil (leads por estágio) para gráfico.
 */
export const getFunnelMetrics = () => {
  const db = loadDb();
  const leads = db.crmLeads || [];
  const stages = (db.crmPipelineStages || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const byStage = stages.map((s) => ({
    stageKey: s.key,
    label: s.label,
    count: leads.filter((l) => l.stageKey === s.key).length,
  }));
  return { byStage, total: leads.length };
};
