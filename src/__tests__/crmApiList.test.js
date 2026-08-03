/**
 * Phase 6.2 — CRM Admin API list (server).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CrmListForbiddenError,
  CrmListQueryError,
  assertNoTenantIdQueryParam,
  createCrmKanbanCardsListHandler,
  createCrmLeadGetHandler,
  createCrmLeadsListHandler,
  createCrmPipelineStageGetHandler,
  createCrmPipelineStagesListHandler,
  fetchCrmLeadsListPage,
  fetchCrmPipelineStagesListPage,
  mapCrmLeadListRow,
  mapCrmPipelineStageListRow,
  parseCrmLeadsListQuery,
  parseCrmPipelineStagesListQuery,
} from '../../server/lib/crmApiList.js';

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';

const SAMPLE_LEAD = {
  id: '11111111-2222-3333-4444-555555555555',
  tenant_id: TENANT_A,
  legacy_id: 'crm-lead-test-1',
  name: 'Lead Teste',
  phone: '11999998888',
  source: 'manual',
  interest: 'implante',
  best_contact_time: '',
  notes: '',
  assigned_to_user_id: null,
  stage_key: 'novo_lead',
  patient_id: null,
  estimated_value: null,
  priority: '',
  tags: ['Quente'],
  last_contact_at: null,
  created_at: '2026-07-09T12:00:00.000Z',
  updated_at: '2026-07-09T12:00:00.000Z',
  created_by_user_id: null,
  updated_by_user_id: null,
};

const SAMPLE_STAGE = {
  id: '22222222-3333-4444-5555-666666666666',
  tenant_id: TENANT_A,
  legacy_id: 'crm-stage-test-1',
  key: 'novo_lead',
  label: 'Novo Lead',
  order: 1,
  color: '#94a3b8',
  is_active: true,
  stage_type: 'normal',
  created_at: '2026-07-09T12:00:00.000Z',
  updated_at: '2026-07-09T12:00:00.000Z',
};

function buildMockSupabase(table, rows = [SAMPLE_LEAD], { count = rows.length, error = null } = {}) {
  const resolveResult = () => Promise.resolve({ data: error ? null : rows, error, count });
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    is() { return chain; },
    ilike() { return chain; },
    or() { return chain; },
    order() {
      if (table === 'crm_pipeline_stages') return resolveResult();
      return chain;
    },
    range() {
      return resolveResult();
    },
  };
  return {
    from(name) {
      expect(name).toBe(table);
      return chain;
    },
  };
}

describe('crmApiList — query parsing', () => {
  it('rejeita tenant_id na query string', () => {
    expect(() => assertNoTenantIdQueryParam({ tenant_id: TENANT_A }))
      .toThrow(/tenant_id não é aceito/);
  });

  it('parseCrmLeadsListQuery aceita filtros de stage e search', () => {
    const parsed = parseCrmLeadsListQuery({ stage_key: 'novo_lead', search: 'Maria' });
    expect(parsed.filters.stageKey).toBe('novo_lead');
    expect(parsed.filters.search).toBe('Maria');
  });

  it('parseCrmPipelineStagesListQuery aceita includeInactive', () => {
    const parsed = parseCrmPipelineStagesListQuery({ include_inactive: 'true' });
    expect(parsed.filters.includeInactive).toBe(true);
  });

  it('mapCrmLeadListRow exige legacy_id', () => {
    const mapped = mapCrmLeadListRow(SAMPLE_LEAD);
    expect(mapped.legacy_id).toBe('crm-lead-test-1');
    expect(mapped.tenant_id).toBe(TENANT_A);
    expect(mapped.stage_key).toBe('novo_lead');
  });

  it('mapCrmPipelineStageListRow exige key', () => {
    const mapped = mapCrmPipelineStageListRow(SAMPLE_STAGE);
    expect(mapped.key).toBe('novo_lead');
    expect(mapped.legacy_id).toBe('crm-stage-test-1');
  });

  it('mapCrmLeadListRow rejeita tenant proibido', () => {
    expect(() => mapCrmLeadListRow({ ...SAMPLE_LEAD, tenant_id: 'tenant-1' }))
      .toThrow(CrmListForbiddenError);
  });
});

describe('crmApiList — fetchCrmLeadsListPage', () => {
  it('retorna rows quando Supabase responde', async () => {
    const supabase = buildMockSupabase('crm_leads');
    const result = await fetchCrmLeadsListPage(supabase, TENANT_A, parseCrmLeadsListQuery({}));
    expect(result.rows).toHaveLength(1);
    expect(result.tableMissing).toBe(false);
  });

  it('retorna tableMissing quando tabela ausente', async () => {
    const supabase = buildMockSupabase('crm_leads', [], {
      error: { code: '42P01', message: 'relation crm_leads does not exist' },
    });
    const result = await fetchCrmLeadsListPage(supabase, TENANT_A, parseCrmLeadsListQuery({}));
    expect(result.tableMissing).toBe(true);
    expect(result.rows).toHaveLength(0);
  });
});

describe('crmApiList — fetchCrmPipelineStagesListPage', () => {
  it('retorna stages quando Supabase responde', async () => {
    const supabase = buildMockSupabase('crm_pipeline_stages', [SAMPLE_STAGE]);
    const result = await fetchCrmPipelineStagesListPage(
      supabase,
      TENANT_A,
      parseCrmPipelineStagesListQuery({}),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.tableMissing).toBe(false);
  });

  it('retorna tableMissing quando tabela ausente', async () => {
    const supabase = buildMockSupabase('crm_pipeline_stages', [], {
      error: { code: 'PGRST205', message: 'crm_pipeline_stages not found' },
    });
    const result = await fetchCrmPipelineStagesListPage(
      supabase,
      TENANT_A,
      parseCrmPipelineStagesListQuery({}),
    );
    expect(result.tableMissing).toBe(true);
  });
});

describe('crmApiList — HTTP handlers', () => {
  it('createCrmLeadsListHandler retorna 503 quando tabela ausente', async () => {
    const supabase = buildMockSupabase('crm_leads', [], {
      error: { code: 'PGRST205', message: 'crm_leads not found' },
    });
    const handler = createCrmLeadsListHandler({
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
    expect(res.body?.code).toBe('CRM_TABLE_MISSING');
  });

  it('createCrmLeadGetHandler retorna 404 quando lead ausente', async () => {
    const supabase = buildMockSupabase('crm_leads', []);
    const handler = createCrmLeadGetHandler({
      supabase,
      resolveActiveTenantUser: vi.fn(),
      isActiveTenantUserRow: vi.fn(),
    });

    const req = {
      appAuthUser: { id: 'user-1', email: 'a@test.com' },
      tenantContext: { tenantId: TENANT_A },
      params: { id: 'missing-lead' },
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };

    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body?.code).toBe('CRM_LEAD_NOT_FOUND');
  });

  it('createCrmPipelineStageGetHandler retorna 404 quando fase ausente', async () => {
    const supabase = buildMockSupabase('crm_pipeline_stages', []);
    const handler = createCrmPipelineStageGetHandler({
      supabase,
      resolveActiveTenantUser: vi.fn(),
      isActiveTenantUserRow: vi.fn(),
    });

    const req = {
      appAuthUser: { id: 'user-1', email: 'a@test.com' },
      tenantContext: { tenantId: TENANT_A },
      params: { id: 'missing-stage' },
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };

    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body?.code).toBe('CRM_PIPELINE_STAGE_NOT_FOUND');
  });

  it('handlers Kanban reutilizam leads', () => {
    expect(typeof createCrmKanbanCardsListHandler).toBe('function');
    expect(typeof createCrmPipelineStagesListHandler).toBe('function');
  });

  it('rejeita query inválida com 400', async () => {
    const handler = createCrmLeadsListHandler({
      supabase: buildMockSupabase('crm_leads'),
      resolveActiveTenantUser: vi.fn(),
      isActiveTenantUserRow: vi.fn(),
    });

    const req = {
      appAuthUser: { id: 'user-1', email: 'a@test.com' },
      tenantContext: { tenantId: TENANT_A },
      query: { tenant_id: TENANT_A },
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };

    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe('TENANT_QUERY_FORBIDDEN');
  });
});
