/**
 * Phase 5.12 — GET /internal/app/financial/* (read-only).
 * Supabase financial_* tables são SSOT quando disponíveis.
 */

import { resolveMembershipTenantContext } from '../core/tenant/resolveTenantContext.js';
import { TenantCoreForbiddenError } from '../core/tenant/errors.js';

export const FORBIDDEN_TENANT_IDS = new Set(['tenant-1', 'tenant_1']);
export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

export const RECEIVABLES_LIST_SELECT = [
  'id', 'tenant_id', 'legacy_id', 'patient_id', 'origin_type', 'origin_id',
  'description', 'issue_date', 'due_date', 'original_amount', 'discount_amount',
  'interest_amount', 'fine_amount', 'net_amount', 'paid_amount', 'status',
  'payment_method_expected', 'contract_id', 'budget_id', 'financing_id',
  'financing_installment_id', 'created_at', 'updated_at',
].join(', ');

export const PAYABLES_LIST_SELECT = [
  'id', 'tenant_id', 'legacy_id', 'supplier_id', 'category_id', 'description',
  'due_date', 'amount', 'paid_amount', 'status', 'expense_type',
  'recurrence_frequency', 'created_at', 'updated_at',
].join(', ');

export const FINANCINGS_LIST_SELECT = [
  'id', 'tenant_id', 'legacy_id', 'patient_id', 'contract_id', 'budget_id',
  'status', 'approval_status', 'total_amount', 'entry_amount',
  'installments_count', 'partner_id', 'created_at', 'updated_at',
].join(', ');

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 500;

export class FinancialListQueryError extends Error {
  constructor(message, code = 'INVALID_QUERY') {
    super(message);
    this.name = 'FinancialListQueryError';
    this.code = code;
  }
}

export class FinancialListForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN') {
    super(message);
    this.name = 'FinancialListForbiddenError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function assertNoTenantIdQueryParam(query = {}) {
  const tenantFromQuery = normalizeText(query?.tenant_id ?? query?.tenantId);
  if (tenantFromQuery) {
    throw new FinancialListQueryError(
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

export function parseFinancialListQuery(query = {}) {
  assertNoTenantIdQueryParam(query);
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const from = normalizeText(query.from ?? query.startDate ?? query.dueDateFrom);
  const to = normalizeText(query.to ?? query.endDate ?? query.dueDateTo);
  const status = normalizeText(query.status);
  const patientId = normalizeText(query.patient_id ?? query.patientId);
  const id = normalizeText(query.id);

  if (from && !isIsoDate(from)) throw new FinancialListQueryError('from inválido (YYYY-MM-DD).');
  if (to && !isIsoDate(to)) throw new FinancialListQueryError('to inválido (YYYY-MM-DD).');

  return {
    filters: {
      from: from || undefined,
      to: to || undefined,
      status: status || undefined,
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

function isMissingTableError(error, tableHint) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const hint = String(tableHint || '').toLowerCase();
  return (
    code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('relation')
    || (hint && message.includes(hint))
  );
}

function mapReceivableRow(row) {
  const tenantId = normalizeText(row?.tenant_id);
  if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
    throw new FinancialListForbiddenError('tenant_id proibido.', 'TENANT_FORBIDDEN');
  }
  const legacyId = normalizeText(row?.legacy_id) || normalizeText(row?.id);
  if (!legacyId) throw new FinancialListForbiddenError('legacy_id ausente.', 'LEGACY_ID_MISSING');
  return { ...row, legacy_id: legacyId, tenant_id: tenantId };
}

function mapPayableRow(row) {
  const tenantId = normalizeText(row?.tenant_id);
  if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
    throw new FinancialListForbiddenError('tenant_id proibido.', 'TENANT_FORBIDDEN');
  }
  const legacyId = normalizeText(row?.legacy_id) || normalizeText(row?.id);
  if (!legacyId) throw new FinancialListForbiddenError('legacy_id ausente.', 'LEGACY_ID_MISSING');
  return { ...row, legacy_id: legacyId, tenant_id: tenantId };
}

function mapFinancingRow(row) {
  const tenantId = normalizeText(row?.tenant_id);
  if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
    throw new FinancialListForbiddenError('tenant_id proibido.', 'TENANT_FORBIDDEN');
  }
  const legacyId = normalizeText(row?.legacy_id) || normalizeText(row?.id);
  if (!legacyId) throw new FinancialListForbiddenError('legacy_id ausente.', 'LEGACY_ID_MISSING');
  return { ...row, legacy_id: legacyId, tenant_id: tenantId };
}

async function fetchListPage(supabase, table, select, mapRow, tableHint, tenantId, options) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId || FORBIDDEN_TENANT_IDS.has(normalizedTenantId.toLowerCase())) {
    throw new FinancialListForbiddenError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }

  const { filters, pagination } = options;
  const { from, to } = paginationRange(pagination);

  let query = supabase
    .from(table)
    .select(select, { count: 'exact' })
    .eq('tenant_id', normalizedTenantId);

  if (filters.from) query = query.gte('due_date', filters.from);
  if (filters.to) query = query.lte('due_date', filters.to);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.patientId) query = query.eq('patient_id', filters.patientId);
  if (filters.id) {
    const needle = filters.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
    query = isUuid
      ? query.or(`id.eq.${needle},legacy_id.eq.${needle}`)
      : query.or(`legacy_id.eq.${needle},id.eq.${needle}`);
  }

  query = query.order('due_date', { ascending: true }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    if (isMissingTableError(error, tableHint)) {
      return { rows: [], total: 0, tableMissing: true };
    }
    throw error;
  }

  const rows = (data || []).map((row) => mapRow(row));
  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
    tableMissing: false,
  };
}

export async function fetchReceivablesListPage(supabase, tenantId, options) {
  return fetchListPage(
    supabase,
    'financial_accounts_receivable',
    RECEIVABLES_LIST_SELECT,
    mapReceivableRow,
    'financial_accounts_receivable',
    tenantId,
    options,
  );
}

export async function fetchPayablesListPage(supabase, tenantId, options) {
  return fetchListPage(
    supabase,
    'financial_payables',
    PAYABLES_LIST_SELECT,
    mapPayableRow,
    'financial_payables',
    tenantId,
    options,
  );
}

export async function fetchFinancingsListPage(supabase, tenantId, options) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId || FORBIDDEN_TENANT_IDS.has(normalizedTenantId.toLowerCase())) {
    throw new FinancialListForbiddenError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }

  const { filters, pagination } = options;
  const { from, to } = paginationRange(pagination);

  let query = supabase
    .from('financial_financings')
    .select(FINANCINGS_LIST_SELECT, { count: 'exact' })
    .eq('tenant_id', normalizedTenantId);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.patientId) query = query.eq('patient_id', filters.patientId);
  if (filters.id) {
    const needle = filters.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
    query = isUuid
      ? query.or(`id.eq.${needle},legacy_id.eq.${needle}`)
      : query.or(`legacy_id.eq.${needle},id.eq.${needle}`);
  }

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    if (isMissingTableError(error, 'financial_financings')) {
      return { rows: [], total: 0, tableMissing: true };
    }
    throw error;
  }

  const rows = (data || []).map((row) => mapFinancingRow(row));
  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
    tableMissing: false,
  };
}

export async function resolveAuthenticatedTenantForFinancialList({
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
      throw new FinancialListForbiddenError(err.message, err.code);
    }
    throw err;
  }
}

function createListHandler(deps, fetchPage, logTag) {
  const { supabase, resolveActiveTenantUser, isActiveTenantUserRow } = deps;

  return async function financialListHandler(req, res) {
    const started = Date.now();
    let logPayload = {
      user_id: req.appAuthUser?.id || null,
      tenant_id: null,
      count: 0,
      durationMs: 0,
      tableMissing: false,
    };

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      const parsed = parseFinancialListQuery(req.query || {});

      const tenantId = req.tenantContext?.tenantId
        ?? (await resolveAuthenticatedTenantForFinancialList({
          authUserId: req.appAuthUser.id,
          emailHint: req.appAuthUser.email || '',
          resolveActiveTenantUser,
          isActiveTenantUserRow,
        })).tenantId;
      logPayload.tenant_id = tenantId;

      const { rows, total, tableMissing } = await fetchPage(supabase, tenantId, parsed);
      logPayload.count = rows.length;
      logPayload.durationMs = Date.now() - started;
      logPayload.tableMissing = Boolean(tableMissing);

      console.log(logTag, logPayload);

      if (tableMissing) {
        return res.status(503).json({
          ok: false,
          error: 'Tabela financeira ausente no Supabase.',
          code: 'FINANCIAL_TABLE_MISSING',
          data: [],
          meta: { tenant_id: tenantId, table_missing: true },
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
      console.log(logTag, { ...logPayload, error: err?.code || err?.message });

      if (err instanceof FinancialListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof FinancialListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }

      return res.status(500).json({ ok: false, error: 'Erro interno ao listar dados financeiros.' });
    }
  };
}

export function createReceivablesListHandler(deps) {
  return createListHandler(deps, fetchReceivablesListPage, '[FINANCIAL_API_RECEIVABLES_LIST]');
}

export function createPayablesListHandler(deps) {
  return createListHandler(deps, fetchPayablesListPage, '[FINANCIAL_API_PAYABLES_LIST]');
}

export function createFinancingsListHandler(deps) {
  return createListHandler(deps, fetchFinancingsListPage, '[FINANCIAL_API_FINANCINGS_LIST]');
}

export { mapReceivableRow, mapPayableRow, mapFinancingRow };
