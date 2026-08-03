/**
 * Phase 5.13 — Financial Admin API write (server).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  FinancialWriteValidationError,
  assertNoTenantIdInFinancialBody,
  createPayableCreateHandler,
  createReceivableCreateHandler,
  upsertReceivableForTenant,
} from '../../server/lib/financialApiWrite.js';

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';

const SAMPLE_RECEIVABLE_BODY = {
  legacy_id: 'recv-test-1',
  patient_id: 'pat-001',
  description: 'Consulta',
  issue_date: '2026-07-01',
  due_date: '2026-07-15',
  original_amount: 500,
  net_amount: 500,
  status: 'open',
};

function buildUpsertMockSupabase(existing = null, { insertError = null, updateError = null } = {}) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    or() { return chain; },
    maybeSingle() {
      return Promise.resolve({ data: existing, error: null });
    },
    single() {
      if (updateError || insertError) {
        return Promise.resolve({ data: null, error: updateError || insertError });
      }
      return Promise.resolve({
        data: {
          id: 'uuid-remote-1',
          tenant_id: TENANT_A,
          legacy_id: SAMPLE_RECEIVABLE_BODY.legacy_id,
          ...SAMPLE_RECEIVABLE_BODY,
        },
        error: null,
      });
    },
    update() { return chain; },
    insert() { return chain; },
  };
  return {
    from(table) {
      expect(table).toBe('financial_accounts_receivable');
      return chain;
    },
  };
}

describe('financialApiWrite — validation', () => {
  it('rejeita tenant_id no body', () => {
    expect(() => assertNoTenantIdInFinancialBody({ tenant_id: TENANT_A }))
      .toThrow(/tenant_id não é aceito/);
  });

  it('upsertReceivableForTenant exige legacy_id', async () => {
    const supabase = buildUpsertMockSupabase();
    await expect(upsertReceivableForTenant(supabase, TENANT_A, {}))
      .rejects.toBeInstanceOf(FinancialWriteValidationError);
  });
});

describe('financialApiWrite — handlers', () => {
  it('createReceivableCreateHandler retorna 503 quando tabela ausente', async () => {
    const supabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: () => Promise.resolve({
                  data: null,
                  error: { code: '42P01', message: 'relation does not exist' },
                }),
              }),
            }),
          }),
        };
      },
    };
    const handler = createReceivableCreateHandler({ supabase });
    const req = {
      appAuthUser: { id: 'user-1' },
      tenantContext: { tenantId: TENANT_A },
      body: SAMPLE_RECEIVABLE_BODY,
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    await handler(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.payload.code).toBe('FINANCIAL_TABLE_MISSING');
  });

  it('createPayableCreateHandler retorna 401 sem auth', async () => {
    const handler = createPayableCreateHandler({ supabase: buildUpsertMockSupabase() });
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    await handler({ body: {}, tenantContext: { tenantId: TENANT_A } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('upsertReceivableForTenant insere quando não existe', async () => {
    const supabase = buildUpsertMockSupabase(null);
    const row = await upsertReceivableForTenant(supabase, TENANT_A, SAMPLE_RECEIVABLE_BODY);
    expect(row.legacy_id).toBe('recv-test-1');
    expect(row.tenant_id).toBe(TENANT_A);
  });
});
