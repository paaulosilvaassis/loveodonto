import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppointmentsListForbiddenError,
  AppointmentsListQueryError,
  PRODUCTION_PROJECT_REF,
  assertNoTenantIdQueryParam,
  createAppointmentsListHandler,
  fetchAppointmentsListPage,
  mapAppointmentListRow,
  parseAppointmentsListQuery,
  resolveAuthenticatedTenantForAppointmentsList,
} from '../../server/lib/appointmentsApiList.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';

const SAMPLE_ROW = {
  id: '11111111-2222-3333-4444-555555555555',
  tenant_id: TENANT_A,
  legacy_id: 'appt-test-1',
  patient_id: 'pat-001',
  lead_id: null,
  professional_id: 'col-001',
  room_id: 'room-001',
  date: '2026-07-09',
  start_time: '09:00',
  end_time: '09:30',
  duration_minutes: 30,
  slot_capacity: 1,
  status: 'agendado',
  procedure_name: 'Consulta',
  channel: 'telefone',
  notes: '',
  check_in_at: null,
  finished_at: null,
  created_at: '2026-06-29T12:00:00.000Z',
  updated_at: '2026-06-29T12:00:00.000Z',
  deleted_at: null,
};

function buildMockSupabase(rows = [SAMPLE_ROW], { count = rows.length, error = null } = {}) {
  const state = {
    tenantId: null,
    filters: {},
    rangeCall: null,
    deletedNull: false,
    orders: [],
  };

  const chain = {
    select() { return chain; },
    eq(field, value) {
      if (field === 'tenant_id') state.tenantId = value;
      if (field === 'professional_id') state.filters.professionalId = value;
      if (field === 'room_id') state.filters.roomId = value;
      if (field === 'status') state.filters.status = value;
      if (field === 'patient_id') state.filters.patientId = value;
      return chain;
    },
    gte(field, value) {
      if (field === 'date') state.filters.from = value;
      return chain;
    },
    lte(field, value) {
      if (field === 'date') state.filters.to = value;
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
      state.orders.push({ field, ascending: opts?.ascending });
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
      expect(table).toBe('appointments');
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

describe('appointmentsApiList — query parsing', () => {
  it('rejeita tenant_id na query', () => {
    expect(() => parseAppointmentsListQuery({ tenant_id: TENANT_A }))
      .toThrow(AppointmentsListQueryError);
    expect(() => assertNoTenantIdQueryParam({ tenant_id: TENANT_A }))
      .toThrow(/tenant_id não é aceito/);
  });

  it('aceita filtros from/to/professional/room/status/patient', () => {
    const parsed = parseAppointmentsListQuery({
      from: '2026-07-01',
      to: '2026-07-31',
      professional_id: 'col-001',
      room_id: 'room-001',
      status: 'confirmado',
      patient_id: 'pat-001',
    });
    expect(parsed.filters).toMatchObject({
      from: '2026-07-01',
      to: '2026-07-31',
      professionalId: 'col-001',
      roomId: 'room-001',
      status: 'confirmado',
      patientId: 'pat-001',
    });
  });

  it('date expande from/to', () => {
    const parsed = parseAppointmentsListQuery({ date: '2026-07-09' });
    expect(parsed.filters.from).toBe('2026-07-09');
    expect(parsed.filters.to).toBe('2026-07-09');
  });

  it('rejeita range inválido', () => {
    expect(() => parseAppointmentsListQuery({ from: '2026-07-10', to: '2026-07-01' }))
      .toThrow(AppointmentsListQueryError);
  });
});

describe('appointmentsApiList — mapper', () => {
  it('mapeia row remoto para envelope V3', () => {
    const mapped = mapAppointmentListRow(SAMPLE_ROW);
    expect(mapped.legacy_id).toBe('appt-test-1');
    expect(mapped.tenant_id).toBe(TENANT_A);
    expect(mapped).not.toHaveProperty('deleted_at');
  });

  it('rejeita row com deleted_at', () => {
    expect(() => mapAppointmentListRow({ ...SAMPLE_ROW, deleted_at: '2026-01-01T00:00:00Z' }))
      .toThrow(AppointmentsListForbiddenError);
  });
});

describe('appointmentsApiList — fetchAppointmentsListPage', () => {
  it('consulta apenas tenant informado e deleted_at IS NULL', async () => {
    const supabase = buildMockSupabase();
    await fetchAppointmentsListPage(supabase, TENANT_A, parseAppointmentsListQuery({}));
    const state = supabase._chain.getState();
    expect(state.tenantId).toBe(TENANT_A);
    expect(state.deletedNull).toBe(true);
  });

  it('aplica filtros de data e profissional', async () => {
    const supabase = buildMockSupabase();
    await fetchAppointmentsListPage(
      supabase,
      TENANT_A,
      parseAppointmentsListQuery({
        from: '2026-07-01',
        to: '2026-07-31',
        professional_id: 'col-001',
        status: 'agendado',
      }),
    );
    const state = supabase._chain.getState();
    expect(state.filters.from).toBe('2026-07-01');
    expect(state.filters.to).toBe('2026-07-31');
    expect(state.filters.professionalId).toBe('col-001');
    expect(state.filters.status).toBe('agendado');
  });

  it('retorna vazio quando tabela appointments não existe', async () => {
    const supabase = buildMockSupabase([], {
      error: { code: '42P01', message: 'relation "appointments" does not exist' },
    });
    const result = await fetchAppointmentsListPage(
      supabase,
      TENANT_A,
      parseAppointmentsListQuery({}),
    );
    expect(result.rows).toEqual([]);
    expect(result.tableMissing).toBe(true);
  });
});

describe('appointmentsApiList — handler', () => {
  const resolveActiveTenantUser = vi.fn();
  const isActiveTenantUserRow = vi.fn(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna envelope V3 com tenant do contexto', async () => {
    const handler = createAppointmentsListHandler({
      supabase: buildMockSupabase(),
      resolveActiveTenantUser,
      isActiveTenantUserRow,
    });
    const req = {
      appAuthUser: { id: 'auth-1', email: 'user@test.com' },
      tenantContext: { tenantId: TENANT_A },
      query: { from: '2026-07-01', to: '2026-07-31' },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.meta.tenant_id).toBe(TENANT_A);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('401 sem token app', async () => {
    const handler = createAppointmentsListHandler({
      supabase: buildMockSupabase(),
      resolveActiveTenantUser,
      isActiveTenantUserRow,
    });
    const res = mockRes();
    await handler({ query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('400 para tenant_id na query', async () => {
    const handler = createAppointmentsListHandler({
      supabase: buildMockSupabase(),
      resolveActiveTenantUser,
      isActiveTenantUserRow,
    });
    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-1' },
      tenantContext: { tenantId: TENANT_A },
      query: { tenant_id: TENANT_A },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TENANT_QUERY_FORBIDDEN');
  });
});

describe('appointmentsApiList — structural', () => {
  it('não referencia produção como alvo operacional', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/appointmentsApiList.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain(PRODUCTION_PROJECT_REF);
    expect(content).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
  });

  it('registra rota GET /internal/app/appointments no index.js com core auth/tenant', () => {
    const indexPath = path.join(REPO_ROOT, 'server/index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toMatch(/app\.get\(\s*['"]\/internal\/app\/appointments['"]/);
    expect(content).toContain('createAppointmentsListHandler');
    expect(content).toContain('requireAppUserCollaboratorsList');
    expect(content).toContain('requireTenantMembershipCollaboratorsList');
  });

  it('piloto importa core tenant sem IndexedDB', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/appointmentsApiList.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/\.\.\/core\/tenant\/resolveTenantContext/);
    expect(content).not.toMatch(/indexeddb|withDb|loadDb/i);
  });
});
