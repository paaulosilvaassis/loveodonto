/**
 * Phase 5.8 — GET /internal/app/appointments (read-only).
 * Supabase public.appointments é a fonte remota quando disponível.
 * Tenant exclusivamente via Core Tenant — nunca via query string.
 */

import { resolveMembershipTenantContext } from '../core/tenant/resolveTenantContext.js';
import { TenantCoreForbiddenError } from '../core/tenant/errors.js';

export const FORBIDDEN_TENANT_IDS = new Set(['tenant-1', 'tenant_1']);
export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

export const APPOINTMENTS_LIST_SELECT = [
  'id',
  'tenant_id',
  'legacy_id',
  'patient_id',
  'lead_id',
  'professional_id',
  'room_id',
  'date',
  'start_time',
  'end_time',
  'duration_minutes',
  'slot_capacity',
  'status',
  'procedure_name',
  'channel',
  'notes',
  'check_in_at',
  'finished_at',
  'created_at',
  'updated_at',
].join(', ');

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 500;

export class AppointmentsListQueryError extends Error {
  constructor(message, code = 'INVALID_QUERY') {
    super(message);
    this.name = 'AppointmentsListQueryError';
    this.code = code;
  }
}

export class AppointmentsListForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN') {
    super(message);
    this.name = 'AppointmentsListForbiddenError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function assertNoTenantIdQueryParam(query = {}) {
  const tenantFromQuery = normalizeText(query?.tenant_id ?? query?.tenantId);
  if (tenantFromQuery) {
    throw new AppointmentsListQueryError(
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

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

export function parseAppointmentsListQuery(query = {}) {
  assertNoTenantIdQueryParam(query);

  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSizeRaw = parsePositiveInt(query.pageSize ?? query.page_size, DEFAULT_PAGE_SIZE);
  const pageSize = pageSizeRaw > MAX_PAGE_SIZE ? MAX_PAGE_SIZE : pageSizeRaw;

  const date = normalizeText(query.date);
  const from = normalizeText(query.from ?? query.dateFrom ?? query.date_from);
  const to = normalizeText(query.to ?? query.dateTo ?? query.date_to);

  if (date && (!isIsoDate(date) || (from && from !== date) || (to && to !== date))) {
    throw new AppointmentsListQueryError('date deve estar no formato YYYY-MM-DD.', 'INVALID_DATE');
  }
  if (from && !isIsoDate(from)) {
    throw new AppointmentsListQueryError('from deve estar no formato YYYY-MM-DD.', 'INVALID_FROM');
  }
  if (to && !isIsoDate(to)) {
    throw new AppointmentsListQueryError('to deve estar no formato YYYY-MM-DD.', 'INVALID_TO');
  }
  if (from && to && from > to) {
    throw new AppointmentsListQueryError('from não pode ser maior que to.', 'INVALID_RANGE');
  }

  const statusRaw = normalizeText(query.status);
  const id = normalizeText(query.id ?? query.ref ?? query.legacy_id ?? query.legacyId);
  const patientId = normalizeText(query.patient_id ?? query.patientId);

  return {
    filters: {
      date: date || undefined,
      from: date || from || undefined,
      to: date || to || undefined,
      professionalId: normalizeText(query.professional_id ?? query.professionalId) || undefined,
      roomId: normalizeText(query.room_id ?? query.roomId) || undefined,
      status: statusRaw || undefined,
      patientId: patientId || undefined,
      id: id || undefined,
    },
    pagination: { page, pageSize },
  };
}

export function paginationRange({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}

export function mapAppointmentListRow(row) {
  const tenantId = normalizeText(row?.tenant_id);
  if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
    throw new AppointmentsListForbiddenError('tenant_id proibido na linha de agendamento.', 'TENANT_FORBIDDEN');
  }
  if (row?.deleted_at) {
    throw new AppointmentsListForbiddenError('Registro excluído não pode ser retornado.', 'DELETED_ROW');
  }

  const legacyId = normalizeText(row?.legacy_id) || normalizeText(row?.id);
  if (!legacyId) {
    throw new AppointmentsListForbiddenError('legacy_id ausente na linha de agendamento.', 'LEGACY_ID_MISSING');
  }

  return {
    id: row.id,
    legacy_id: legacyId,
    tenant_id: tenantId,
    patient_id: row.patient_id ?? null,
    lead_id: row.lead_id ?? null,
    professional_id: row.professional_id ?? null,
    room_id: row.room_id ?? null,
    date: row.date,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    duration_minutes: row.duration_minutes ?? null,
    slot_capacity: row.slot_capacity ?? 1,
    status: row.status ?? 'agendado',
    procedure_name: row.procedure_name ?? '',
    channel: row.channel ?? '',
    notes: row.notes ?? '',
    check_in_at: row.check_in_at ?? null,
    finished_at: row.finished_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export async function resolveAuthenticatedTenantForAppointmentsList({
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
      throw new AppointmentsListForbiddenError(err.message, err.code);
    }
    throw err;
  }
}

function isMissingAppointmentsTableError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('relation')
    || message.includes('appointments')
  );
}

export async function fetchAppointmentsListPage(supabase, tenantId, options) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId || FORBIDDEN_TENANT_IDS.has(normalizedTenantId.toLowerCase())) {
    throw new AppointmentsListForbiddenError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }

  const { filters, pagination } = options;
  const { from, to } = paginationRange(pagination);

  let query = supabase
    .from('appointments')
    .select(APPOINTMENTS_LIST_SELECT, { count: 'exact' })
    .eq('tenant_id', normalizedTenantId)
    .is('deleted_at', null);

  if (filters.from) query = query.gte('date', filters.from);
  if (filters.to) query = query.lte('date', filters.to);
  if (filters.professionalId) query = query.eq('professional_id', filters.professionalId);
  if (filters.roomId) query = query.eq('room_id', filters.roomId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.patientId) query = query.eq('patient_id', filters.patientId);
  if (filters.id) {
    const needle = filters.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
    query = isUuid
      ? query.or(`id.eq.${needle},legacy_id.eq.${needle}`)
      : query.or(`legacy_id.eq.${needle},id.eq.${needle}`);
  }

  query = query
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    if (isMissingAppointmentsTableError(error)) {
      return { rows: [], total: 0, tableMissing: true };
    }
    throw error;
  }

  const rows = (data || []).map((row) => mapAppointmentListRow(row));
  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
    tableMissing: false,
  };
}

export function createAppointmentsListHandler(deps) {
  const {
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  } = deps;

  return async function appointmentsListHandler(req, res) {
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

      const parsed = parseAppointmentsListQuery(req.query || {});
      logPayload.filters = parsed.filters;

      const tenantId = req.tenantContext?.tenantId
        ?? (await resolveAuthenticatedTenantForAppointmentsList({
          authUserId: req.appAuthUser.id,
          emailHint: req.appAuthUser.email || '',
          resolveActiveTenantUser,
          isActiveTenantUserRow,
        })).tenantId;
      logPayload.tenant_id = tenantId;

      const { rows, total, tableMissing } = await fetchAppointmentsListPage(
        supabase,
        tenantId,
        parsed,
      );
      logPayload.count = rows.length;
      logPayload.durationMs = Date.now() - started;
      logPayload.tableMissing = Boolean(tableMissing);

      console.log('[APPOINTMENTS_API_LIST]', logPayload);

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
      console.log('[APPOINTMENTS_API_LIST]', { ...logPayload, error: err?.code || err?.message });

      if (err instanceof AppointmentsListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof AppointmentsListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }

      console.error('[APPOINTMENTS_API_LIST]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha ao listar agendamentos.',
      });
    }
  };
}
