import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppointmentsWriteValidationError,
  assertNoTenantIdInBody,
  cancelAppointmentForTenant,
  createAppointmentCancelHandler,
  createAppointmentCreateHandler,
  createAppointmentUpdateHandler,
  upsertAppointmentForTenant,
  updateAppointmentForTenant,
} from '../../server/lib/appointmentsApiWrite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';

const SAMPLE_ROW = {
  id: '11111111-2222-3333-4444-555555555555',
  tenant_id: TENANT_A,
  legacy_id: 'appt-write-1',
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
  insurance: '',
  is_return: false,
  cancel_reason: null,
  check_in_at: null,
  finished_at: null,
  created_at: '2026-06-29T12:00:00.000Z',
  updated_at: '2026-06-29T12:00:00.000Z',
  deleted_at: null,
};

function buildMockSupabase({ existing = null, insertRow = SAMPLE_ROW, updateRow = SAMPLE_ROW } = {}) {
  const state = { lastOp: null };
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    is() { return chain; },
    or() { return chain; },
    maybeSingle: async () => ({ data: existing, error: null }),
    single: async () => {
      if (state.lastOp === 'insert') return { data: insertRow, error: null };
      if (state.lastOp === 'update') return { data: updateRow, error: null };
      return { data: updateRow, error: null };
    },
    insert() {
      state.lastOp = 'insert';
      return chain;
    },
    update() {
      state.lastOp = 'update';
      return chain;
    },
  };
  return {
    from(table) {
      expect(table).toBe('appointments');
      return chain;
    },
    _state: state,
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

describe('appointmentsApiWrite — validação', () => {
  it('rejeita tenant_id no body', () => {
    expect(() => assertNoTenantIdInBody({ tenant_id: TENANT_A }))
      .toThrow(AppointmentsWriteValidationError);
  });

  it('upsert exige legacy_id', async () => {
    const supabase = buildMockSupabase();
    await expect(upsertAppointmentForTenant(supabase, TENANT_A, { date: '2026-07-09' }))
      .rejects.toThrow(/legacy_id/);
  });
});

describe('appointmentsApiWrite — operações', () => {
  it('upsert cria quando não existe', async () => {
    const supabase = buildMockSupabase({ existing: null });
    const row = await upsertAppointmentForTenant(supabase, TENANT_A, {
      legacy_id: 'appt-write-1',
      date: '2026-07-09',
      start_time: '09:00',
      end_time: '09:30',
      patient_id: 'pat-001',
      professional_id: 'col-001',
      room_id: 'room-001',
    });
    expect(row.legacy_id).toBe('appt-write-1');
    expect(supabase._state.lastOp).toBe('insert');
  });

  it('upsert atualiza quando legacy_id já existe', async () => {
    const supabase = buildMockSupabase({ existing: SAMPLE_ROW });
    const row = await upsertAppointmentForTenant(supabase, TENANT_A, {
      legacy_id: 'appt-write-1',
      date: '2026-07-09',
      start_time: '09:00',
      end_time: '09:30',
      status: 'confirmado',
    });
    expect(row.legacy_id).toBe('appt-write-1');
    expect(supabase._state.lastOp).toBe('update');
  });

  it('update retorna 404 sem registro', async () => {
    const supabase = buildMockSupabase({ existing: null });
    await expect(updateAppointmentForTenant(supabase, TENANT_A, 'missing', { status: 'confirmado' }))
      .rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('cancel marca status cancelado', async () => {
    const supabase = buildMockSupabase({
      existing: SAMPLE_ROW,
      updateRow: { ...SAMPLE_ROW, status: 'cancelado', cancel_reason: 'teste' },
    });
    const row = await cancelAppointmentForTenant(supabase, TENANT_A, 'appt-write-1', 'teste');
    expect(row.status).toBe('cancelado');
  });
});

describe('appointmentsApiWrite — handlers', () => {
  it('POST retorna envelope V3', async () => {
    const handler = createAppointmentCreateHandler({
      supabase: buildMockSupabase({ existing: null }),
    });
    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-1' },
      tenantContext: { tenantId: TENANT_A },
      body: {
        legacy_id: 'appt-write-1',
        date: '2026-07-09',
        start_time: '09:00',
        end_time: '09:30',
      },
    }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.meta.tenant_id).toBe(TENANT_A);
  });

  it('PUT 400 com tenant_id no body', async () => {
    const handler = createAppointmentUpdateHandler({
      supabase: buildMockSupabase({ existing: SAMPLE_ROW }),
    });
    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-1' },
      tenantContext: { tenantId: TENANT_A },
      params: { id: 'appt-write-1' },
      body: { tenant_id: TENANT_A, status: 'confirmado' },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TENANT_BODY_FORBIDDEN');
  });

  it('PATCH cancel retorna ok', async () => {
    const handler = createAppointmentCancelHandler({
      supabase: buildMockSupabase({
        existing: SAMPLE_ROW,
        updateRow: { ...SAMPLE_ROW, status: 'cancelado' },
      }),
    });
    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-1' },
      tenantContext: { tenantId: TENANT_A },
      params: { id: 'appt-write-1' },
      body: { reason: 'desistiu' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('appointmentsApiWrite — structural', () => {
  it('registra rotas write no index.js', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/index.js'), 'utf8');
    expect(content).toMatch(/app\.post\(\s*['"]\/internal\/app\/appointments['"]/);
    expect(content).toMatch(/app\.put\(\s*['"]\/internal\/app\/appointments\/:id['"]/);
    expect(content).toMatch(/app\.patch\(\s*['"]\/internal\/app\/appointments\/:id\/cancel['"]/);
    expect(content).toContain('createAppointmentCreateHandler');
  });

  it('não referencia IndexedDB', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/lib/appointmentsApiWrite.js'), 'utf8');
    expect(content).not.toMatch(/indexeddb|withDb|loadDb/i);
  });
});
