import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_ORDER_BY,
  CollaboratorsListForbiddenError,
  CollaboratorsListQueryError,
  PRODUCTION_PROJECT_REF,
  assertNoTenantIdQueryParam,
  createCollaboratorsListHandler,
  fetchCollaboratorsListPage,
  mapCollaboratorListRow,
  parseCollaboratorsListQuery,
  resolveAuthenticatedTenantForCollaboratorsList,
} from '../../server/lib/collaboratorsApiList.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const TENANT_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const SAMPLE_ROW = {
  id: '11111111-2222-3333-4444-555555555555',
  tenant_id: TENANT_A,
  legacy_id: 'col-test-1',
  email: 'juliana+staging@implanprime.test',
  apelido: 'Dra. Juliana',
  nome_completo: 'Juliana',
  rh_categoria: 'Corpo Clínico',
  cargo: 'Implantodontista',
  tipo_vinculo: 'PJ',
  setor: 'Clínico',
  status: 'ativo',
  agenda_enabled: true,
  foto_url: null,
  created_at: '2026-06-29T12:00:00.000Z',
  updated_at: '2026-06-29T12:00:00.000Z',
  deleted_at: null,
};

function buildMockSupabase(rows = [SAMPLE_ROW], { count = rows.length, error = null } = {}) {
  const state = {
    tenantId: null,
    filters: {},
    orderCalls: [],
    rangeCall: null,
    deletedNull: false,
  };

  const chain = {
    select(_cols, _opts) { return chain; },
    eq(field, value) {
      if (field === 'tenant_id') state.tenantId = value;
      if (field === 'status') state.filters.status = value;
      if (field === 'rh_categoria') state.filters.rh_categoria = value;
      if (field === 'agenda_enabled') state.filters.agenda_enabled = value;
      return chain;
    },
    ilike(field, value) {
      state.filters[field] = value;
      return chain;
    },
    or(expr) {
      state.filters.or = expr;
      return chain;
    },
    is(field, value) {
      if (field === 'deleted_at' && value === null) state.deletedNull = true;
      return chain;
    },
    order(field, opts) {
      state.orderCalls.push({ field, ascending: opts?.ascending });
      return chain;
    },
    range(from, to) {
      state.rangeCall = { from, to };
      return Promise.resolve({
        data: error ? null : rows,
        error,
        count,
      });
    },
    getState: () => state,
  };

  return {
    from(table) {
      expect(table).toBe('collaborators');
      return chain;
    },
    _chain: chain,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('collaboratorsApiList — query parsing', () => {
  it('rejeita tenant_id na query', () => {
    expect(() => parseCollaboratorsListQuery({ tenant_id: TENANT_A }))
      .toThrow(CollaboratorsListQueryError);
    expect(() => assertNoTenantIdQueryParam({ tenant_id: TENANT_A }))
      .toThrow(/tenant_id não é aceito/);
  });

  it('rejeita orderBy fora da allowlist', () => {
    expect(() => parseCollaboratorsListQuery({ orderBy: 'password' }))
      .toThrow(CollaboratorsListQueryError);
  });

  it('aceita orderBy da allowlist', () => {
    for (const field of ALLOWED_ORDER_BY) {
      const parsed = parseCollaboratorsListQuery({ orderBy: field });
      expect(parsed.order.field).toBe(field);
    }
  });

  it('filtra status válido', () => {
    const parsed = parseCollaboratorsListQuery({ status: 'ativo' });
    expect(parsed.filters.status).toBe('ativo');
  });

  it('rejeita status inválido', () => {
    expect(() => parseCollaboratorsListQuery({ status: 'deleted' }))
      .toThrow(CollaboratorsListQueryError);
  });

  it('pagina corretamente', () => {
    const parsed = parseCollaboratorsListQuery({ page: '2', pageSize: '10' });
    expect(parsed.pagination).toEqual({ page: 2, pageSize: 10 });
  });

  it('limita pageSize ao máximo seguro', () => {
    const parsed = parseCollaboratorsListQuery({ pageSize: '9999' });
    expect(parsed.pagination.pageSize).toBe(500);
  });
});

describe('collaboratorsApiList — mapper', () => {
  it('não retorna deleted_at', () => {
    const mapped = mapCollaboratorListRow(SAMPLE_ROW);
    expect(mapped).not.toHaveProperty('deleted_at');
    expect(mapped.id).toBe(SAMPLE_ROW.id);
  });

  it('rejeita row com deleted_at', () => {
    expect(() => mapCollaboratorListRow({ ...SAMPLE_ROW, deleted_at: '2026-01-01T00:00:00Z' }))
      .toThrow(CollaboratorsListForbiddenError);
  });
});

describe('collaboratorsApiList — fetchCollaboratorsListPage', () => {
  it('consulta apenas o tenant informado e deleted_at IS NULL', async () => {
    const supabase = buildMockSupabase();
    await fetchCollaboratorsListPage(supabase, TENANT_A, parseCollaboratorsListQuery({}));
    const state = supabase._chain.getState();
    expect(state.tenantId).toBe(TENANT_A);
    expect(state.deletedNull).toBe(true);
  });

  it('aplica filtro status e search', async () => {
    const supabase = buildMockSupabase();
    await fetchCollaboratorsListPage(
      supabase,
      TENANT_A,
      parseCollaboratorsListQuery({ status: 'ativo', search: 'Juliana' }),
    );
    const state = supabase._chain.getState();
    expect(state.filters.status).toBe('ativo');
    expect(state.filters.or).toContain('Juliana');
  });

  it('aplica paginação range', async () => {
    const supabase = buildMockSupabase();
    await fetchCollaboratorsListPage(
      supabase,
      TENANT_A,
      parseCollaboratorsListQuery({ page: '2', pageSize: '25' }),
    );
    expect(supabase._chain.getState().rangeCall).toEqual({ from: 25, to: 49 });
  });

  it('ordena pela allowlist', async () => {
    const supabase = buildMockSupabase();
    await fetchCollaboratorsListPage(
      supabase,
      TENANT_A,
      parseCollaboratorsListQuery({ orderBy: 'updated_at', orderDir: 'desc' }),
    );
    const orders = supabase._chain.getState().orderCalls;
    expect(orders[0]).toEqual({ field: 'updated_at', ascending: false });
  });

  it('não retorna colaboradores de outro tenant', async () => {
    const supabase = buildMockSupabase([{ ...SAMPLE_ROW, tenant_id: TENANT_B }]);
    await expect(
      fetchCollaboratorsListPage(supabase, TENANT_A, parseCollaboratorsListQuery({})),
    ).rejects.toThrow(/outro tenant/);
  });
});

describe('collaboratorsApiList — resolveAuthenticatedTenantForCollaboratorsList', () => {
  it('retorna 403 sem tenant ativo', async () => {
    await expect(
      resolveAuthenticatedTenantForCollaboratorsList({
        authUserId: 'user-1',
        resolveActiveTenantUser: async () => null,
        isActiveTenantUserRow: () => false,
      }),
    ).rejects.toMatchObject({ code: 'TENANT_MEMBERSHIP_REQUIRED' });
  });

  it('resolve tenant pelo membership ativo', async () => {
    const result = await resolveAuthenticatedTenantForCollaboratorsList({
      authUserId: 'user-1',
      resolveActiveTenantUser: async () => ({ tenant_id: TENANT_A, status: 'active', is_active: true }),
      isActiveTenantUserRow: () => true,
    });
    expect(result.tenantId).toBe(TENANT_A);
  });
});

describe('collaboratorsApiList — HTTP handler', () => {
  const resolveActiveTenantUser = vi.fn();
  const isActiveTenantUserRow = vi.fn(() => true);
  let supabase;
  let handler;

  beforeEach(() => {
    resolveActiveTenantUser.mockReset();
    isActiveTenantUserRow.mockReturnValue(true);
    supabase = buildMockSupabase([SAMPLE_ROW], { count: 1 });
    handler = createCollaboratorsListHandler({
      supabase,
      resolveActiveTenantUser,
      isActiveTenantUserRow,
    });
  });

  it('retorna 401 sem auth', async () => {
    const res = mockRes();
    await handler({ query: {}, appAuthUser: null }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('retorna 403 sem tenant ativo', async () => {
    resolveActiveTenantUser.mockResolvedValue(null);
    const res = mockRes();
    await handler({
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });

  it('retorna lista com envelope ok/data/meta', async () => {
    resolveActiveTenantUser.mockResolvedValue({
      tenant_id: TENANT_A,
      status: 'active',
      is_active: true,
    });
    const res = mockRes();
    await handler({
      query: { status: 'ativo' },
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({
      tenant_id: TENANT_A,
      page: 1,
      pageSize: 50,
      total: 1,
    });
  });

  it('usa req.tenantContext quando middleware já resolveu tenant', async () => {
    const res = mockRes();
    await handler({
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
      tenantContext: { tenantId: TENANT_A },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.meta.tenant_id).toBe(TENANT_A);
    expect(resolveActiveTenantUser).not.toHaveBeenCalled();
  });

  it('rejeita tenant_id via query com 400', async () => {
    const res = mockRes();
    await handler({
      query: { tenant_id: TENANT_A },
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TENANT_QUERY_FORBIDDEN');
  });

  it('rejeita orderBy inválido com 400', async () => {
    resolveActiveTenantUser.mockResolvedValue({
      tenant_id: TENANT_A,
      status: 'active',
      is_active: true,
    });
    const res = mockRes();
    await handler({
      query: { orderBy: 'secret_column' },
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_ORDER_BY');
  });
});

describe('collaboratorsApiList — segurança operacional', () => {
  it('não importa IndexedDB no módulo da API', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsApiList.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toMatch(/from\s+['"].*(?:\/db\/|indexeddb)/i);
    expect(content).not.toMatch(/\b(withDb|loadDb)\s*\(/);
  });

  it('não referencia produção como alvo operacional', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsApiList.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain(PRODUCTION_PROJECT_REF);
    expect(content).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
  });

  it('registra rota GET /internal/app/collaborators no index.js com core auth/tenant', () => {
    const indexPath = path.join(REPO_ROOT, 'server/index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toMatch(/app\.get\(\s*['"]\/internal\/app\/collaborators['"]/);
    expect(content).toContain('createCollaboratorsListHandler');
    expect(content).toContain('requireAppUserCollaboratorsList');
    expect(content).toContain('requireTenantMembershipCollaboratorsList');
  });

  it('piloto importa core tenant sem IndexedDB', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsApiList.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/\.\.\/core\/tenant\/resolveTenantContext/);
    expect(content).not.toMatch(/indexeddb|withDb|loadDb/i);
  });
});
