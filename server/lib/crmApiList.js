/**
 * Phase 6.2 — GET /internal/app/crm/* (read-only).
 * Supabase crm_leads / crm_pipeline_stages são SSOT quando disponíveis.
 */

import { resolveMembershipTenantContext } from '../core/tenant/resolveTenantContext.js';
import { TenantCoreForbiddenError } from '../core/tenant/errors.js';

export const FORBIDDEN_TENANT_IDS = new Set(['tenant-1', 'tenant_1']);
export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

export const CRM_LEADS_LIST_SELECT = [
  'id', 'tenant_id', 'legacy_id', 'name', 'phone', 'source', 'interest',
  'best_contact_time', 'notes', 'assigned_to_user_id', 'stage_key',
  'patient_id', 'estimated_value', 'priority', 'tags', 'last_contact_at',
  'created_at', 'updated_at', 'created_by_user_id', 'updated_by_user_id',
].join(', ');

export const CRM_PIPELINE_STAGES_LIST_SELECT = [
  'id', 'tenant_id', 'legacy_id', 'key', 'label', 'order', 'color',
  'is_active', 'stage_type', 'created_at', 'updated_at',
].join(', ');

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 500;

export class CrmListQueryError extends Error {
  constructor(message, code = 'INVALID_QUERY') {
    super(message);
    this.name = 'CrmListQueryError';
    this.code = code;
  }
}

export class CrmListForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN') {
    super(message);
    this.name = 'CrmListForbiddenError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function assertNoTenantIdQueryParam(query = {}) {
  const tenantFromQuery = normalizeText(query?.tenant_id ?? query?.tenantId);
  if (tenantFromQuery) {
    throw new CrmListQueryError(
      'tenant_id não é aceito na query string. O tenant é resolvido pelo contexto autenticado.',
      'TENANT_QUERY_FORBIDDEN',
    );
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function parseCrmLeadsListQuery(query = {}) {
  assertNoTenantIdQueryParam(query);
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(query.pageSize ?? query.page_size, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  return {
    filters: {
      stageKey: normalizeText(query.stage_key ?? query.stageKey) || undefined,
      assignedToUserId: normalizeText(query.assigned_to_user_id ?? query.assignedToUserId) || undefined,
      source: normalizeText(query.source) || undefined,
      search: normalizeText(query.search ?? query.q) || undefined,
      id: normalizeText(query.id ?? query.ref ?? query.legacy_id ?? query.legacyId) || undefined,
    },
    pagination: { page, pageSize },
  };
}

export function parseCrmPipelineStagesListQuery(query = {}) {
  assertNoTenantIdQueryParam(query);
  const includeInactive = ['1', 'true', 'yes', 'on'].includes(
    String(query.include_inactive ?? query.includeInactive ?? '').trim().toLowerCase(),
  );
  const id = normalizeText(query.id ?? query.ref ?? query.key ?? query.legacy_id ?? query.legacyId);
  return {
    filters: {
      includeInactive,
      id: id || undefined,
    },
    pagination: { page: 1, pageSize: MAX_PAGE_SIZE },
  };
}

export function paginationRange({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}

export function mapCrmLeadListRow(row) {
  const tenantId = normalizeText(row?.tenant_id);
  if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
    throw new CrmListForbiddenError('tenant_id proibido na linha de lead.', 'TENANT_FORBIDDEN');
  }
  if (row?.deleted_at) {
    throw new CrmListForbiddenError('Registro excluído não pode ser retornado.', 'DELETED_ROW');
  }

  const legacyId = normalizeText(row?.legacy_id) || normalizeText(row?.id);
  if (!legacyId) {
    throw new CrmListForbiddenError('legacy_id ausente na linha de lead.', 'LEGACY_ID_MISSING');
  }

  return {
    id: row.id,
    legacy_id: legacyId,
    tenant_id: tenantId,
    name: row.name ?? '',
    phone: row.phone ?? '',
    source: row.source ?? 'manual',
    interest: row.interest ?? '',
    best_contact_time: row.best_contact_time ?? '',
    notes: row.notes ?? '',
    assigned_to_user_id: row.assigned_to_user_id ?? null,
    stage_key: row.stage_key ?? 'novo_lead',
    patient_id: row.patient_id ?? null,
    estimated_value: row.estimated_value ?? null,
    priority: row.priority ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    last_contact_at: row.last_contact_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    created_by_user_id: row.created_by_user_id ?? null,
    updated_by_user_id: row.updated_by_user_id ?? null,
  };
}

export function mapCrmPipelineStageListRow(row) {
  const tenantId = normalizeText(row?.tenant_id);
  if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
    throw new CrmListForbiddenError('tenant_id proibido na linha de fase.', 'TENANT_FORBIDDEN');
  }
  const legacyId = normalizeText(row?.legacy_id) || normalizeText(row?.id);
  const key = normalizeText(row?.key);
  if (!legacyId || !key) {
    throw new CrmListForbiddenError('legacy_id/key ausente na fase.', 'LEGACY_ID_MISSING');
  }

  return {
    id: row.id,
    legacy_id: legacyId,
    tenant_id: tenantId,
    key,
    label: row.label ?? key,
    order: row.order ?? 0,
    color: row.color ?? '#94a3b8',
    is_active: row.is_active !== false,
    stage_type: row.stage_type ?? 'normal',
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export async function resolveAuthenticatedTenantForCrmList({
  authUserId,
  emailHint = '',
  resolveActiveTenantUser,
  isActiveTenantUserRow,
}) {
  try {
    const ctx = await resolveMembershipTenantContext({
      authUserId,
      emailHint,
      resolveActiveTenantUser,
      isActiveTenantUserRow,
    });
    return { tenantId: ctx.tenantId, tenantUser: ctx.tenantUser };
  } catch (err) {
    if (err instanceof TenantCoreForbiddenError) {
      throw new CrmListForbiddenError(err.message, err.code);
    }
    throw err;
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

export async function fetchCrmLeadsListPage(supabase, tenantId, options) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId || FORBIDDEN_TENANT_IDS.has(normalizedTenantId.toLowerCase())) {
    throw new CrmListForbiddenError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }

  const { filters, pagination } = options;
  const { from, to } = paginationRange(pagination);

  let query = supabase
    .from('crm_leads')
    .select(CRM_LEADS_LIST_SELECT, { count: 'exact' })
    .eq('tenant_id', normalizedTenantId)
    .is('deleted_at', null);

  if (filters.stageKey) query = query.eq('stage_key', filters.stageKey);
  if (filters.assignedToUserId) query = query.eq('assigned_to_user_id', filters.assignedToUserId);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.search) query = query.ilike('name', `%${filters.search}%`);
  if (filters.id) {
    const needle = filters.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
    query = isUuid
      ? query.or(`id.eq.${needle},legacy_id.eq.${needle}`)
      : query.or(`legacy_id.eq.${needle},id.eq.${needle}`);
  }

  query = query
    .order('updated_at', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    if (isMissingCrmTableError(error, 'crm_leads')) {
      return { rows: [], total: 0, tableMissing: true };
    }
    throw error;
  }

  const rows = (data || []).map((row) => mapCrmLeadListRow(row));
  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
    tableMissing: false,
  };
}

export async function fetchCrmPipelineStagesListPage(supabase, tenantId, options) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId || FORBIDDEN_TENANT_IDS.has(normalizedTenantId.toLowerCase())) {
    throw new CrmListForbiddenError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }

  const { filters } = options;

  let query = supabase
    .from('crm_pipeline_stages')
    .select(CRM_PIPELINE_STAGES_LIST_SELECT, { count: 'exact' })
    .eq('tenant_id', normalizedTenantId)
    .is('deleted_at', null);

  if (!filters.includeInactive) query = query.eq('is_active', true);
  if (filters.id) {
    const needle = filters.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
    query = isUuid
      ? query.or(`id.eq.${needle},legacy_id.eq.${needle},key.eq.${needle}`)
      : query.or(`legacy_id.eq.${needle},key.eq.${needle},id.eq.${needle}`);
  }

  query = query.order('order', { ascending: true });

  const { data, error, count } = await query;

  if (error) {
    if (isMissingCrmTableError(error, 'crm_pipeline_stages')) {
      return { rows: [], total: 0, tableMissing: true };
    }
    throw error;
  }

  const rows = (data || []).map((row) => mapCrmPipelineStageListRow(row));
  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
    tableMissing: false,
  };
}

function createCrmListHandler(deps, fetchPage, parseQuery, logTag) {
  const {
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  } = deps;

  return async function crmListHandler(req, res) {
    const started = Date.now();
    let logPayload = {
      user_id: req.appAuthUser?.id || null,
      tenant_id: null,
      count: 0,
      durationMs: 0,
      filters: {},
      tableMissing: false,
    };

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      const parsed = parseQuery(req.query || {});
      logPayload.filters = parsed.filters;

      const tenantId = req.tenantContext?.tenantId
        ?? (await resolveAuthenticatedTenantForCrmList({
          authUserId: req.appAuthUser.id,
          emailHint: req.appAuthUser.email || '',
          resolveActiveTenantUser,
          isActiveTenantUserRow,
        })).tenantId;
      logPayload.tenant_id = tenantId;

      const { rows, total, tableMissing } = await fetchPage(
        supabase,
        tenantId,
        parsed,
      );
      logPayload.count = rows.length;
      logPayload.durationMs = Date.now() - started;
      logPayload.tableMissing = Boolean(tableMissing);

      console.log(`[${logTag}]`, logPayload);

      if (tableMissing) {
        return res.status(503).json({
          ok: false,
          error: 'Tabela CRM remota indisponível.',
          code: 'CRM_TABLE_MISSING',
        });
      }

      return res.status(200).json({
        ok: true,
        data: rows,
        meta: {
          tenant_id: tenantId,
          page: parsed.pagination.page,
          pageSize: parsed.pagination.pageSize,
          total,
          table_missing: false,
        },
      });
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      console.log(`[${logTag}]`, { ...logPayload, error: err?.code || err?.message });

      if (err instanceof CrmListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CrmListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }
      return res.status(500).json({ ok: false, error: 'Erro interno ao listar CRM.' });
    }
  };
}

export function createCrmLeadsListHandler(deps) {
  return createCrmListHandler(
    deps,
    fetchCrmLeadsListPage,
    parseCrmLeadsListQuery,
    'CRM_LEADS_API_LIST',
  );
}

export function createCrmPipelineStagesListHandler(deps) {
  return createCrmListHandler(
    deps,
    fetchCrmPipelineStagesListPage,
    parseCrmPipelineStagesListQuery,
    'CRM_PIPELINE_STAGES_API_LIST',
  );
}

/** Kanban cards são projeção de leads — reutiliza listagem de leads. */
export function createCrmKanbanCardsListHandler(deps) {
  return createCrmLeadsListHandler(deps);
}

export function createCrmLeadGetHandler(deps) {
  const {
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  } = deps;

  return async function crmLeadGetHandler(req, res) {
    const ref = normalizeText(req.params?.id);
    if (!ref) {
      return res.status(400).json({ ok: false, error: 'id ausente.', code: 'INVALID_ID' });
    }

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      const tenantId = req.tenantContext?.tenantId
        ?? (await resolveAuthenticatedTenantForCrmList({
          authUserId: req.appAuthUser.id,
          emailHint: req.appAuthUser.email || '',
          resolveActiveTenantUser,
          isActiveTenantUserRow,
        })).tenantId;

      const { rows, tableMissing } = await fetchCrmLeadsListPage(
        supabase,
        tenantId,
        { filters: { id: ref }, pagination: { page: 1, pageSize: 1 } },
      );

      if (tableMissing) {
        return res.status(503).json({
          ok: false,
          error: 'Tabela CRM remota indisponível.',
          code: 'CRM_TABLE_MISSING',
        });
      }

      const row = rows[0] ?? null;
      if (!row) {
        return res.status(404).json({ ok: false, error: 'Lead não encontrado.', code: 'CRM_LEAD_NOT_FOUND' });
      }

      return res.status(200).json({ ok: true, data: row });
    } catch (err) {
      if (err instanceof CrmListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }
      return res.status(500).json({ ok: false, error: 'Erro interno ao obter lead.' });
    }
  };
}

/** Kanban card GET — alias do lead GET. */
export function createCrmKanbanCardGetHandler(deps) {
  return createCrmLeadGetHandler(deps);
}

export function createCrmPipelineStageGetHandler(deps) {
  const {
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  } = deps;

  return async function crmPipelineStageGetHandler(req, res) {
    const ref = normalizeText(req.params?.id);
    if (!ref) {
      return res.status(400).json({ ok: false, error: 'id ausente.', code: 'INVALID_ID' });
    }

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      const tenantId = req.tenantContext?.tenantId
        ?? (await resolveAuthenticatedTenantForCrmList({
          authUserId: req.appAuthUser.id,
          emailHint: req.appAuthUser.email || '',
          resolveActiveTenantUser,
          isActiveTenantUserRow,
        })).tenantId;

      const { rows, tableMissing } = await fetchCrmPipelineStagesListPage(
        supabase,
        tenantId,
        { filters: { id: ref, includeInactive: true }, pagination: { page: 1, pageSize: 1 } },
      );

      if (tableMissing) {
        return res.status(503).json({
          ok: false,
          error: 'Tabela CRM remota indisponível.',
          code: 'CRM_TABLE_MISSING',
        });
      }

      const row = rows[0] ?? null;
      if (!row) {
        return res.status(404).json({
          ok: false,
          error: 'Fase não encontrada.',
          code: 'CRM_PIPELINE_STAGE_NOT_FOUND',
        });
      }

      return res.status(200).json({ ok: true, data: row });
    } catch (err) {
      if (err instanceof CrmListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }
      return res.status(500).json({ ok: false, error: 'Erro interno ao obter fase.' });
    }
  };
}
