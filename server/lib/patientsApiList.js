/**
 * CLOUD.3 — GET /internal/app/patients (+ get by legacyId).
 * Tenant exclusivamente via Core Tenant — nunca via query string.
 */

import { resolveMembershipTenantContext } from '../core/tenant/resolveTenantContext.js';
import { TenantCoreForbiddenError } from '../core/tenant/errors.js';
import { assertPatientsPermission } from './patientsPermissionGuard.js';

export const FORBIDDEN_TENANT_IDS = new Set(['tenant-1', 'tenant_1']);

export const PATIENTS_LIST_SELECT = [
  'id',
  'tenant_id',
  'legacy_id',
  'guid',
  'full_name',
  'nickname',
  'social_name',
  'sex',
  'birth_date',
  'cpf',
  'photo_url',
  'status',
  'blocked',
  'block_reason',
  'block_at',
  'tags',
  'lead_source',
  'has_financial_responsible',
  'dependent_full_name',
  'has_pending_data',
  'pending_fields',
  'pending_critical_fields',
  'created_at',
  'updated_at',
  'deleted_at',
].join(', ');

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 500;

export class PatientsListQueryError extends Error {
  constructor(message, code = 'INVALID_QUERY') {
    super(message);
    this.name = 'PatientsListQueryError';
    this.code = code;
  }
}

export class PatientsListForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN') {
    super(message);
    this.name = 'PatientsListForbiddenError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function assertNoTenantIdQueryParam(query = {}) {
  const tenantFromQuery = normalizeText(query?.tenant_id ?? query?.tenantId);
  if (tenantFromQuery) {
    throw new PatientsListQueryError(
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

export function parsePatientsListQuery(query = {}) {
  assertNoTenantIdQueryParam(query);

  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSizeRaw = parsePositiveInt(query.pageSize ?? query.page_size, DEFAULT_PAGE_SIZE);
  const pageSize = pageSizeRaw > MAX_PAGE_SIZE ? MAX_PAGE_SIZE : pageSizeRaw;

  const statusRaw = normalizeText(query.status);
  const id = normalizeText(query.id ?? query.ref ?? query.legacy_id ?? query.legacyId);
  const search = normalizeText(query.search);
  const cpf = normalizeText(query.cpf).replace(/\D/g, '');
  const includeBlocked = ['1', 'true', 'yes'].includes(
    String(query.include_blocked ?? query.includeBlocked ?? '').toLowerCase(),
  );

  return {
    filters: {
      status: statusRaw || undefined,
      id: id || undefined,
      search: search || undefined,
      cpf: cpf || undefined,
      includeBlocked,
    },
    pagination: { page, pageSize },
  };
}

export function paginationRange({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}

export function mapPatientListRow(row) {
  const tenantId = normalizeText(row?.tenant_id);
  if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
    throw new PatientsListForbiddenError('tenant_id proibido na linha de paciente.', 'TENANT_FORBIDDEN');
  }
  if (row?.deleted_at) {
    throw new PatientsListForbiddenError('Registro excluído não pode ser retornado.', 'DELETED_ROW');
  }

  const legacyId = normalizeText(row?.legacy_id);
  if (!legacyId) {
    throw new PatientsListForbiddenError('legacy_id ausente na linha de paciente.', 'LEGACY_ID_MISSING');
  }

  return {
    id: row.id,
    tenant_id: tenantId,
    legacy_id: legacyId,
    guid: row.guid ?? null,
    full_name: row.full_name ?? '',
    nickname: row.nickname ?? '',
    social_name: row.social_name ?? '',
    sex: row.sex ?? '',
    birth_date: row.birth_date ?? null,
    cpf: row.cpf ?? null,
    photo_url: row.photo_url ?? null,
    status: row.status ?? 'active',
    blocked: Boolean(row.blocked),
    block_reason: row.block_reason ?? '',
    block_at: row.block_at ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    lead_source: row.lead_source ?? '',
    has_financial_responsible: Boolean(row.has_financial_responsible),
    dependent_full_name: row.dependent_full_name ?? '',
    has_pending_data: Boolean(row.has_pending_data),
    pending_fields: Array.isArray(row.pending_fields) ? row.pending_fields : [],
    pending_critical_fields: Array.isArray(row.pending_critical_fields)
      ? row.pending_critical_fields
      : [],
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    deleted_at: null,
  };
}

export async function resolveAuthenticatedTenantForPatientsList({
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
      throw new PatientsListForbiddenError(err.message, err.code);
    }
    throw err;
  }
}

function isMissingPatientsTableError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('patients')
  );
}

export async function fetchPatientsListPage(supabase, tenantId, options) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId || FORBIDDEN_TENANT_IDS.has(normalizedTenantId.toLowerCase())) {
    throw new PatientsListForbiddenError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }

  const { filters, pagination } = options;
  const { from, to } = paginationRange(pagination);

  let query = supabase
    .from('patients')
    .select(PATIENTS_LIST_SELECT, { count: 'exact' })
    .eq('tenant_id', normalizedTenantId)
    .is('deleted_at', null);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.cpf) query = query.eq('cpf', filters.cpf);
  if (!filters.includeBlocked) query = query.eq('blocked', false);
  if (filters.search) {
    const term = filters.search.replace(/%/g, '');
    query = query.or(
      `full_name.ilike.%${term}%,nickname.ilike.%${term}%,social_name.ilike.%${term}%,cpf.ilike.%${term}%`,
    );
  }
  if (filters.id) {
    const needle = filters.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
    query = isUuid
      ? query.or(`id.eq.${needle},legacy_id.eq.${needle}`)
      : query.or(`legacy_id.eq.${needle},id.eq.${needle}`);
  }

  query = query
    .order('full_name', { ascending: true })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    if (isMissingPatientsTableError(error)) {
      return { rows: [], total: 0, tableMissing: true };
    }
    throw error;
  }

  const rows = (data || []).map((row) => mapPatientListRow(row));
  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
    tableMissing: false,
  };
}

export async function fetchPatientByLegacyId(supabase, tenantId, legacyId) {
  const normalizedTenantId = normalizeText(tenantId);
  const needle = normalizeText(legacyId);
  if (!normalizedTenantId || FORBIDDEN_TENANT_IDS.has(normalizedTenantId.toLowerCase())) {
    throw new PatientsListForbiddenError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }
  if (!needle) return null;

  const { data, error } = await supabase
    .from('patients')
    .select(PATIENTS_LIST_SELECT)
    .eq('tenant_id', normalizedTenantId)
    .eq('legacy_id', needle)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    if (isMissingPatientsTableError(error)) return null;
    throw error;
  }
  if (!data) return null;
  return mapPatientListRow(data);
}

export function createPatientsListHandler(deps) {
  const {
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  } = deps;

  return async function patientsListHandler(req, res) {
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

      const parsed = parsePatientsListQuery(req.query || {});
      logPayload.filters = parsed.filters;

      const tenantId = req.tenantContext?.tenantId
        ?? (await resolveAuthenticatedTenantForPatientsList({
          authUserId: req.appAuthUser.id,
          emailHint: req.appAuthUser.email || '',
          resolveActiveTenantUser,
          isActiveTenantUserRow,
        })).tenantId;
      logPayload.tenant_id = tenantId;

      await assertPatientsPermission(supabase, {
        tenantId,
        userId: req.appAuthUser.id,
        permission: 'patients:read',
      });

      const { rows, total, tableMissing } = await fetchPatientsListPage(
        supabase,
        tenantId,
        parsed,
      );
      logPayload.count = rows.length;
      logPayload.durationMs = Date.now() - started;
      logPayload.tableMissing = Boolean(tableMissing);

      console.log('[PATIENTS_API_LIST]', logPayload);

      return res.status(200).json({
        ok: true,
        data: rows,
        meta: {
          tenant_id: tenantId,
          page: parsed.pagination.page,
          pageSize: parsed.pagination.pageSize,
          total,
          table_missing: Boolean(tableMissing),
        },
      });
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      console.log('[PATIENTS_API_LIST]', { ...logPayload, error: err?.code || err?.message });

      if (err instanceof PatientsListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof PatientsListForbiddenError || err?.code === 'PATIENTS_PERMISSION_DENIED') {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }

      console.error('[PATIENTS_API_LIST]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha ao listar pacientes.',
      });
    }
  };
}

export function createPatientGetHandler(deps) {
  const { supabase } = deps;

  return async function patientGetHandler(req, res) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }
      assertNoTenantIdQueryParam(req.query || {});
      const tenantId = req.tenantContext?.tenantId || null;
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'Contexto de tenant ausente.' });
      }
      const legacyId = normalizeText(req.params?.legacyId);
      if (!legacyId) {
        return res.status(400).json({ ok: false, error: 'legacyId ausente.' });
      }

      await assertPatientsPermission(supabase, {
        tenantId,
        userId: req.appAuthUser.id,
        permission: 'patients:read',
      });

      const row = await fetchPatientByLegacyId(supabase, tenantId, legacyId);
      if (!row) {
        return res.status(404).json({ ok: false, error: 'Paciente não encontrado.', code: 'PATIENT_NOT_FOUND' });
      }
      return res.status(200).json({ ok: true, data: row, meta: { tenant_id: tenantId } });
    } catch (err) {
      if (err instanceof PatientsListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof PatientsListForbiddenError || err?.code === 'PATIENTS_PERMISSION_DENIED') {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }
      console.error('[PATIENTS_API_GET]', err);
      return res.status(500).json({ ok: false, error: 'Falha ao obter paciente.' });
    }
  };
}
