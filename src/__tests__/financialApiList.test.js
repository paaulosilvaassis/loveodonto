/**
 * Phase 5.12 — Financial Admin API list (server).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FinancialListForbiddenError,
  FinancialListQueryError,
  assertNoTenantIdQueryParam,
  createFinancingsListHandler,
  createPayablesListHandler,
  createReceivablesListHandler,
  fetchReceivablesListPage,
  mapReceivableRow,
  parseFinancialListQuery,
} from '../../server/lib/financialApiList.js';

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';

const SAMPLE_RECEIVABLE = {
  id: '11111111-2222-3333-4444-555555555555',
  tenant_id: TENANT_A,
  legacy_id: 'ar-test-1',
  patient_id: 'pat-001',
  origin_type: 'manual_entry',
  description: 'Consulta',
  issue_date: '2026-07-01',
  due_date: '2026-07-15',
  original_amount: 500,
  discount_amount: 0,
  interest_amount: 0,
  fine_amount: 0,
  net_amount: 500,
  paid_amount: 0,
  status: 'open',
  payment_method_expected: 'pix',
};

function buildMockSupabase(rows = [SAMPLE_RECEIVABLE], { count = rows.length, error = null } = {}) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    gte() { return chain; },
    lte() { return chain; },
    or() { return chain; },
    order() { return chain; },
    range() {
      return Promise.resolve({ data: error ? null : rows, error, count });
    },
  };
  return {
    from(table) {
      expect(table).toBe('financial_accounts_receivable');
      return chain;
    },
  };
}

describe('financialApiList — query parsing', () => {
  it('rejeita tenant_id na query string', () => {
    expect(() => assertNoTenantIdQueryParam({ tenant_id: TENANT_A }))
      .toThrow(/tenant_id não é aceito/);
  });

  it('parseFinancialListQuery aceita filtros de data', () => {
    const parsed = parseFinancialListQuery({ from: '2026-07-01', to: '2026-07-31', status: 'open' });
    expect(parsed.filters.from).toBe('2026-07-01');
    expect(parsed.filters.to).toBe('2026-07-31');
    expect(parsed.filters.status).toBe('open');
  });

  it('mapReceivableRow exige legacy_id', () => {
    const mapped = mapReceivableRow(SAMPLE_RECEIVABLE);
    expect(mapped.legacy_id).toBe('ar-test-1');
    expect(mapped.tenant_id).toBe(TENANT_A);
  });
});

describe('financialApiList — fetchReceivablesListPage', () => {
  it('retorna rows quando Supabase responde', async () => {
    const supabase = buildMockSupabase();
    const result = await fetchReceivablesListPage(supabase, TENANT_A, parseFinancialListQuery({}));
    expect(result.rows).toHaveLength(1);
    expect(result.tableMissing).toBe(false);
  });

  it('retorna tableMissing quando tabela ausente', async () => {
    const supabase = buildMockSupabase([], {
      error: { code: '42P01', message: 'relation financial_accounts_receivable does not exist' },
    });
    const result = await fetchReceivablesListPage(supabase, TENANT_A, parseFinancialListQuery({}));
    expect(result.tableMissing).toBe(true);
    expect(result.rows).toHaveLength(0);
  });
});

describe('financialApiList — HTTP handler', () => {
  it('createReceivablesListHandler retorna 503 quando tabela ausente', async () => {
    const supabase = buildMockSupabase([], {
      error: { code: 'PGRST205', message: 'financial_accounts_receivable not found' },
    });
    const handler = createReceivablesListHandler({
      supabase,
      resolveActiveTenantUser: vi.fn(),
      isActiveTenantUserRow: vi.fn(),
    });

    const req = {
      appAuthUser: { id: 'user-1', email: 'a@test.com' },
      tenantContext: { tenantId: TENANT_A },
      query: {},
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };

    await handler(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body?.code).toBe('FINANCIAL_TABLE_MISSING');
  });

  it('createPayablesListHandler e createFinancingsListHandler são funções', () => {
    expect(typeof createPayablesListHandler).toBe('function');
    expect(typeof createFinancingsListHandler).toBe('function');
  });
});
