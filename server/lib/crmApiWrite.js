/**
 * Phase 6.3 — Escrita CRM via Admin API.
 * POST/PUT/PATCH/DELETE /internal/app/crm/*
 */

import {
  CRM_LEADS_LIST_SELECT,
  CRM_PIPELINE_STAGES_LIST_SELECT,
  FORBIDDEN_TENANT_IDS,
  mapCrmLeadListRow,
  mapCrmPipelineStageListRow,
} from './crmApiList.js';

export class CrmWriteValidationError extends Error {
  constructor(message, code = 'INVALID_BODY') {
    super(message);
    this.name = 'CrmWriteValidationError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function assertNoTenantIdInCrmBody(body = {}) {
  const tenantFromBody = normalizeText(body?.tenant_id ?? body?.tenantId);
  if (tenantFromBody) {
    throw new CrmWriteValidationError(
      'tenant_id não é aceito no body. O tenant é resolvido pelo contexto autenticado.',
      'TENANT_BODY_FORBIDDEN',
    );
  }
}

function isMissingCrmTableError(error, tableHint) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes(tableHint)
  );
}

function assertTenantId(tenantId) {
  const normalized = normalizeText(tenantId);
  if (!normalized || FORBIDDEN_TENANT_IDS.has(normalized.toLowerCase())) {
    throw new CrmWriteValidationError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }
  return normalized;
}

async function findRowByRef(supabase, table, select, tenantId, ref) {
  const needle = normalizeText(ref);
  if (!needle) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
  let query = supabase.from(table).select(select).eq('tenant_id', tenantId).is('deleted_at', null);
  query = isUuid
    ? query.or(`id.eq.${needle},legacy_id.eq.${needle}`)
    : query.or(`legacy_id.eq.${needle},id.eq.${needle}`);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingCrmTableError(error, table)) {
      throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'CRM_TABLE_MISSING' });
    }
    throw error;
  }
  return data;
}

function mapLeadWriteBody(body = {}, tenantId) {
  const legacyId = normalizeText(body.legacy_id ?? body.legacyId ?? body.id);
  if (!legacyId) throw new CrmWriteValidationError('legacy_id é obrigatório.', 'LEGACY_ID_REQUIRED');
  return {
    tenant_id: tenantId,
    legacy_id: legacyId,
    name: body.name ?? '',
    phone: body.phone ?? '',
    source: body.source ?? 'manual',
    interest: body.interest ?? '',
    best_contact_time: body.best_contact_time ?? body.bestContactTime ?? '',
    notes: body.notes ?? '',
    assigned_to_user_id: body.assigned_to_user_id ?? body.assignedToUserId ?? null,
    stage_key: body.stage_key ?? body.stageKey ?? 'novo_lead',
    patient_id: body.patient_id ?? body.patientId ?? null,
    estimated_value: body.estimated_value ?? body.estimatedValue ?? null,
    priority: body.priority ?? '',
    tags: Array.isArray(body.tags) ? body.tags : [],
    last_contact_at: body.last_contact_at ?? body.lastContactAt ?? null,
    created_by_user_id: body.created_by_user_id ?? body.createdByUserId ?? null,
    updated_by_user_id: body.updated_by_user_id ?? body.updatedByUserId ?? null,
    updated_at: new Date().toISOString(),
  };
}

function mapPipelineStageWriteBody(body = {}, tenantId) {
  const legacyId = normalizeText(body.legacy_id ?? body.legacyId ?? body.id);
  const key = normalizeText(body.key);
  if (!legacyId) throw new CrmWriteValidationError('legacy_id é obrigatório.', 'LEGACY_ID_REQUIRED');
  if (!key) throw new CrmWriteValidationError('key é obrigatório.', 'KEY_REQUIRED');
  return {
    tenant_id: tenantId,
    legacy_id: legacyId,
    key,
    label: body.label ?? key,
    order: Number(body.order ?? 0) || 0,
    color: body.color ?? '#94a3b8',
    is_active: body.is_active ?? body.isActive ?? true,
    stage_type: body.stage_type ?? body.stageType ?? 'normal',
    updated_at: new Date().toISOString(),
  };
}

async function upsertCrmRow(supabase, table, select, tableHint, tenantId, body, mapBody) {
  const row = mapBody(body, tenantId);
  const existing = await findRowByRef(supabase, table, select, tenantId, row.legacy_id);
  if (existing?.id) {
    const { data, error } = await supabase
      .from(table)
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)
      .select(select)
      .single();
    if (error) {
      if (isMissingCrmTableError(error, tableHint)) {
        throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'CRM_TABLE_MISSING' });
      }
      throw error;
    }
    return data;
  }

  const { data, error } = await supabase
    .from(table)
    .insert({ ...row, created_at: new Date().toISOString() })
    .select(select)
    .single();
  if (error) {
    if (isMissingCrmTableError(error, tableHint)) {
      throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'CRM_TABLE_MISSING' });
    }
    throw error;
  }
  return data;
}

async function updateCrmRow(supabase, table, select, tableHint, tenantId, ref, body, mapBody) {
  const existing = await findRowByRef(supabase, table, select, tenantId, ref);
  if (!existing) {
    throw new CrmWriteValidationError('Registro CRM não encontrado.', 'CRM_NOT_FOUND');
  }
  const patch = mapBody({ ...body, legacy_id: existing.legacy_id ?? ref }, tenantId);
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq('id', existing.id)
    .eq('tenant_id', tenantId)
    .select(select)
    .single();
  if (error) {
    if (isMissingCrmTableError(error, tableHint)) {
      throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'CRM_TABLE_MISSING' });
    }
    throw error;
  }
  return data;
}

async function deleteCrmRow(supabase, table, select, tableHint, tenantId, ref) {
  const existing = await findRowByRef(supabase, table, select, tenantId, ref);
  if (!existing) {
    throw new CrmWriteValidationError('Registro CRM não encontrado.', 'CRM_NOT_FOUND');
  }
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('tenant_id', tenantId);
  if (error) {
    if (isMissingCrmTableError(error, tableHint)) {
      throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'CRM_TABLE_MISSING' });
    }
    throw error;
  }
  return true;
}

export async function upsertLeadForTenant(supabase, tenantId, body) {
  const tid = assertTenantId(tenantId);
  const data = await upsertCrmRow(
    supabase,
    'crm_leads',
    CRM_LEADS_LIST_SELECT,
    'crm_leads',
    tid,
    body,
    mapLeadWriteBody,
  );
  return mapCrmLeadListRow(data);
}

export async function updateLeadForTenant(supabase, tenantId, ref, body) {
  const tid = assertTenantId(tenantId);
  const data = await updateCrmRow(
    supabase,
    'crm_leads',
    CRM_LEADS_LIST_SELECT,
    'crm_leads',
    tid,
    ref,
    body,
    mapLeadWriteBody,
  );
  return mapCrmLeadListRow(data);
}

export async function moveLeadStageForTenant(supabase, tenantId, ref, body) {
  const tid = assertTenantId(tenantId);
  const patch = {
    stage_key: body.stage_key ?? body.stageKey,
    last_contact_at: body.last_contact_at ?? body.lastContactAt ?? new Date().toISOString(),
    updated_by_user_id: body.updated_by_user_id ?? body.updatedByUserId ?? null,
  };
  const data = await updateCrmRow(
    supabase,
    'crm_leads',
    CRM_LEADS_LIST_SELECT,
    'crm_leads',
    tid,
    ref,
    patch,
    (b, t) => ({ ...mapLeadWriteBody({ ...b, legacy_id: ref }, t), ...patch }),
  );
  return mapCrmLeadListRow(data);
}

export async function upsertPipelineStageForTenant(supabase, tenantId, body) {
  const tid = assertTenantId(tenantId);
  const data = await upsertCrmRow(
    supabase,
    'crm_pipeline_stages',
    CRM_PIPELINE_STAGES_LIST_SELECT,
    'crm_pipeline_stages',
    tid,
    body,
    mapPipelineStageWriteBody,
  );
  return mapCrmPipelineStageListRow(data);
}

export async function updatePipelineStageForTenant(supabase, tenantId, ref, body) {
  const tid = assertTenantId(tenantId);
  const data = await updateCrmRow(
    supabase,
    'crm_pipeline_stages',
    CRM_PIPELINE_STAGES_LIST_SELECT,
    'crm_pipeline_stages',
    tid,
    ref,
    body,
    mapPipelineStageWriteBody,
  );
  return mapCrmPipelineStageListRow(data);
}

export async function deletePipelineStageForTenant(supabase, tenantId, ref) {
  const tid = assertTenantId(tenantId);
  await deleteCrmRow(
    supabase,
    'crm_pipeline_stages',
    CRM_PIPELINE_STAGES_LIST_SELECT,
    'crm_pipeline_stages',
    tid,
    ref,
  );
  return { deleted: true };
}

function resolveTenantId(req) {
  return req.tenantContext?.tenantId || null;
}

function handleCrmWriteError(res, err) {
  if (err?.code === 'CRM_TABLE_MISSING') {
    return res.status(503).json({ ok: false, error: err.message, code: 'CRM_TABLE_MISSING' });
  }
  if (err instanceof CrmWriteValidationError) {
    const status = err.code === 'CRM_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ ok: false, error: err.message, code: err.code });
  }
  return res.status(500).json({ ok: false, error: 'Erro ao processar escrita CRM.' });
}

function createWriteHandler(deps, runner) {
  const { supabase } = deps;
  return async function crmWriteHandler(req, res) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }
      assertNoTenantIdInCrmBody(req.body || {});
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(403).json({ ok: false, error: 'Tenant não resolvido.', code: 'TENANT_MISSING' });
      }
      const data = await runner(supabase, tenantId, req);
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return handleCrmWriteError(res, err);
    }
  };
}

export function createCrmLeadCreateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    upsertLeadForTenant(supabase, tenantId, req.body || {}));
}

export function createCrmLeadUpdateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    updateLeadForTenant(supabase, tenantId, req.params.id, req.body || {}));
}

export function createCrmLeadMoveStageHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    moveLeadStageForTenant(supabase, tenantId, req.params.id, req.body || {}));
}

export function createCrmPipelineStageCreateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    upsertPipelineStageForTenant(supabase, tenantId, req.body || {}));
}

export function createCrmPipelineStageUpdateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    updatePipelineStageForTenant(supabase, tenantId, req.params.id, req.body || {}));
}

export function createCrmPipelineStageDeleteHandler(deps) {
  return createWriteHandler(deps, async (supabase, tenantId, req) =>
    deletePipelineStageForTenant(supabase, tenantId, req.params.id));
}
