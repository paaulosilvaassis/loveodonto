/**
 * Phase 4.2 — GET /internal/app/collaborators (read-only).
 * Supabase public.collaborators é a única fonte de dados.
 * Phase 4.10 Wave 1 — tenant resolution delegada a server/core/tenant.
 */

import { resolveMembershipTenantContext } from '../core/tenant/resolveTenantContext.js';
import { TenantCoreForbiddenError } from '../core/tenant/errors.js';

export const FORBIDDEN_TENANT_IDS = new Set(['tenant-1', 'tenant_1']);
export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

export const COLLABORATORS_LIST_SELECT = [
  'id',
  'tenant_id',
  'legacy_id',
  'email',
  'apelido',
  'nome_completo',
  'rh_categoria',
  'cargo',
  'tipo_vinculo',
  'setor',
  'status',
  'agenda_enabled',
  'foto_url',
  'created_at',
  'updated_at',
].join(', ');

export const ALLOWED_ORDER_BY = Object.freeze([
  'nome_completo',
  'email',
  'cargo',
  'updated_at',
]);

export const ALLOWED_STATUS = Object.freeze(['ativo', 'inativo']);

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

export class CollaboratorsListQueryError extends Error {
  constructor(message, code = 'INVALID_QUERY') {
    super(message);
    this.name = 'CollaboratorsListQueryError';
    this.code = code;
  }
}

export class CollaboratorsListForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN') {
    super(message);
    this.name = 'CollaboratorsListForbiddenError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function sanitizeSearchTerm(value) {
  return normalizeText(value).slice(0, 100).replace(/[%(),]/g, '');
}

export function assertNoTenantIdQueryParam(query = {}) {
  const tenantFromQuery = normalizeText(query?.tenant_id);
  if (tenantFromQuery) {
    throw new CollaboratorsListQueryError(
      'tenant_id não é aceito na query string. O tenant é resolvido pelo contexto autenticado.',
      'TENANT_QUERY_FORBIDDEN',
    );
  }
}

export function parseBooleanQuery(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new CollaboratorsListQueryError(
    'agenda_enabled deve ser true ou false.',
    'INVALID_AGENDA_ENABLED',
  );
}

export function parseCollaboratorsListQuery(query = {}) {
  assertNoTenantIdQueryParam(query);

  const statusRaw = normalizeText(query?.status);
  if (statusRaw && !ALLOWED_STATUS.includes(statusRaw)) {
    throw new CollaboratorsListQueryError(
      'status inválido. Use ativo ou inativo.',
      'INVALID_STATUS',
    );
  }

  const orderByRaw = normalizeText(query?.orderBy || query?.order_by) || 'nome_completo';
  if (!ALLOWED_ORDER_BY.includes(orderByRaw)) {
    throw new CollaboratorsListQueryError(
      `orderBy inválido. Valores permitidos: ${ALLOWED_ORDER_BY.join(', ')}.`,
      'INVALID_ORDER_BY',
    );
  }

  const orderDirRaw = normalizeText(query?.orderDir || query?.order_dir || 'asc').toLowerCase();
  if (orderDirRaw !== 'asc' && orderDirRaw !== 'desc') {
    throw new CollaboratorsListQueryError(
      'orderDir inválido. Use asc ou desc.',
      'INVALID_ORDER_DIR',
    );
  }

  const pageRaw = Number.parseInt(String(query?.page ?? DEFAULT_PAGE), 10);
  const pageSizeRaw = Number.parseInt(String(query?.pageSize ?? query?.page_size ?? DEFAULT_PAGE_SIZE), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : DEFAULT_PAGE;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
    ? Math.min(pageSizeRaw, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  return {
    filters: {
      status: statusRaw || undefined,
      search: sanitizeSearchTerm(query?.search),
      cargo: normalizeText(query?.cargo) || undefined,
      rh_categoria: normalizeText(query?.rh_categoria || query?.rhCategoria) || undefined,
      agenda_enabled: parseBooleanQuery(query?.agenda_enabled ?? query?.agendaEnabled),
    },
    pagination: { page, pageSize },
    order: {
      field: orderByRaw,
      ascending: orderDirRaw === 'asc',
    },
  };
}

export function paginationRange({ page, pageSize }) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}

export function mapCollaboratorListRow(row) {
  const tenantId = normalizeText(row?.tenant_id);
  if (!tenantId || FORBIDDEN_TENANT_IDS.has(tenantId.toLowerCase())) {
    throw new CollaboratorsListForbiddenError('tenant_id proibido na linha de colaborador.', 'TENANT_FORBIDDEN');
  }
  if (row?.deleted_at) {
    throw new CollaboratorsListForbiddenError('Registro excluído não pode ser retornado.', 'DELETED_ROW');
  }

  return {
    id: row.id,
    tenant_id: tenantId,
    legacy_id: row.legacy_id ?? null,
    email: row.email ?? null,
    apelido: row.apelido,
    nome_completo: row.nome_completo,
    rh_categoria: row.rh_categoria,
    cargo: row.cargo,
    tipo_vinculo: row.tipo_vinculo,
    setor: row.setor,
    status: row.status,
    agenda_enabled: Boolean(row.agenda_enabled),
    foto_url: row.foto_url ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function resolveAuthenticatedTenantForCollaboratorsList({
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
      throw new CollaboratorsListForbiddenError(err.message, err.code);
    }
    throw err;
  }
}

export async function fetchCollaboratorsListPage(supabase, tenantId, options) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId || FORBIDDEN_TENANT_IDS.has(normalizedTenantId.toLowerCase())) {
    throw new CollaboratorsListForbiddenError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }

  const { filters, pagination, order } = options;
  let query = supabase
    .from('collaborators')
    .select(COLLABORATORS_LIST_SELECT, { count: 'exact' })
    .eq('tenant_id', normalizedTenantId)
    .is('deleted_at', null);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.rh_categoria) {
    query = query.eq('rh_categoria', filters.rh_categoria);
  }
  if (filters.cargo) {
    query = query.ilike('cargo', `%${filters.cargo.replace(/[%]/g, '')}%`);
  }
  if (filters.agenda_enabled !== undefined) {
    query = query.eq('agenda_enabled', filters.agenda_enabled);
  }
  if (filters.search) {
    const term = sanitizeSearchTerm(filters.search);
    if (term) {
      query = query.or(`apelido.ilike.%${term}%,nome_completo.ilike.%${term}%,email.ilike.%${term}%`);
    }
  }

  query = query.order(order.field, { ascending: order.ascending });
  if (order.field !== 'nome_completo') {
    query = query.order('nome_completo', { ascending: true });
  }
  query = query.order('id', { ascending: true });

  const { from, to } = paginationRange(pagination);
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data || []).map((row) => {
    const mapped = mapCollaboratorListRow(row);
    if (mapped.tenant_id !== normalizedTenantId) {
      throw new CollaboratorsListForbiddenError(
        'Colaborador de outro tenant detectado.',
        'TENANT_ISOLATION',
      );
    }
    return mapped;
  });

  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
  };
}

export function createCollaboratorsListHandler(deps) {
  const {
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  } = deps;

  return async function collaboratorsListHandler(req, res) {
    const started = Date.now();
    let logPayload = {
      user_id: req.appAuthUser?.id || null,
      tenant_id: null,
      count: 0,
      durationMs: 0,
      filters: {},
    };

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      const parsed = parseCollaboratorsListQuery(req.query || {});
      logPayload.filters = parsed.filters;

      const tenantId = req.tenantContext?.tenantId
        ?? (await resolveAuthenticatedTenantForCollaboratorsList({
          authUserId: req.appAuthUser.id,
          emailHint: req.appAuthUser.email || '',
          resolveActiveTenantUser,
          isActiveTenantUserRow,
        })).tenantId;
      logPayload.tenant_id = tenantId;

      const { rows, total } = await fetchCollaboratorsListPage(supabase, tenantId, parsed);
      logPayload.count = rows.length;
      logPayload.durationMs = Date.now() - started;

      console.log('[COLLABORATORS_API_LIST]', logPayload);

      return res.status(200).json({
        ok: true,
        data: rows,
        meta: {
          tenant_id: tenantId,
          page: parsed.pagination.page,
          pageSize: parsed.pagination.pageSize,
          total,
        },
      });
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      console.log('[COLLABORATORS_API_LIST]', { ...logPayload, error: err?.code || err?.message });

      if (err instanceof CollaboratorsListQueryError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof CollaboratorsListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code });
      }

      console.error('[COLLABORATORS_API_LIST]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha ao listar colaboradores.',
      });
    }
  };
}
