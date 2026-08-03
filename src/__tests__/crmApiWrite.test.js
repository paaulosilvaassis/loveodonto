/**
 * Phase 6.3 — CRM Admin API write (server).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CrmWriteValidationError,
  assertNoTenantIdInCrmBody,
  createCrmLeadCreateHandler,
  createCrmPipelineStageDeleteHandler,
  upsertLeadForTenant,
} from '../../server/lib/crmApiWrite.js';

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';

const SAMPLE_LEAD = {
  id: '11111111-2222-3333-4444-555555555555',
  tenant_id: TENANT_A,
  legacy_id: 'crm-lead-write-1',
  name: 'Lead Write',
  phone: '11999998888',
  source: 'manual',
  interest: '',
  best_contact_time: '',
  notes: '',
  assigned_to_user_id: null,
  stage_key: 'novo_lead',
  patient_id: null,
  estimated_value: null,
  priority: '',
  tags: [],
  last_contact_at: null,
  created_at: '2026-07-09T12:00:00.000Z',
  updated_at: '2026-07-09T12:00:00.000Z',
  created_by_user_id: null,
  updated_by_user_id: null,
};

function buildMockSupabase(rows = [], { error = null } = {}) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    is() { return chain; },
    or() { return chain; },
    maybeSingle() {
      return Promise.resolve({ data: rows[0] ?? null, error });
    },
    single() {
      return Promise.resolve({ data: rows[0] ?? null, error });
    },
    insert() { return chain; },
    update() { return chain; },
  };
  return {
    from(table) {
      expect(table).toBe('crm_leads');
      return chain;
    },
  };
}

describe('crmApiWrite — validation', () => {
  it('rejeita tenant_id no body', () => {
    expect(() => assertNoTenantIdInCrmBody({ tenant_id: TENANT_A }))
      .toThrow(/tenant_id não é aceito/);
  });
});

describe('crmApiWrite — upsertLeadForTenant', () => {
  it('retorna 503 quando tabela ausente', async () => {
    const supabase = buildMockSupabase([], {
      error: { code: '42P01', message: 'relation crm_leads does not exist' },
    });
    await expect(upsertLeadForTenant(supabase, TENANT_A, {
      legacy_id: 'crm-lead-write-1',
      name: 'Test',
    })).rejects.toMatchObject({ code: 'CRM_TABLE_MISSING' });
  });
});

describe('crmApiWrite — HTTP handlers', () => {
  it('createCrmLeadCreateHandler retorna 400 sem legacy_id', async () => {
    const handler = createCrmLeadCreateHandler({ supabase: buildMockSupabase() });
    const req = {
      appAuthUser: { id: 'user-1' },
      tenantContext: { tenantId: TENANT_A },
      body: { name: 'Sem legacy' },
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe('LEGACY_ID_REQUIRED');
  });

  it('createCrmPipelineStageDeleteHandler é função', () => {
    expect(typeof createCrmPipelineStageDeleteHandler).toBe('function');
  });

  it('CrmWriteValidationError tem code', () => {
    const err = new CrmWriteValidationError('test', 'TEST_CODE');
    expect(err.code).toBe('TEST_CODE');
  });
});
