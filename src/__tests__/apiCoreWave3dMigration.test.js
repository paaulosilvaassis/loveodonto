import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGeneratedContractRow,
  createContractsGeneratedHandler,
  mapGeneratedContractsTableError,
} from '../../server/lib/contractsGeneratedApi.js';
import { createCreateTenantUserFromApp } from '../../server/lib/createTenantUserFromApp.js';
import { createResolveTenantUserForCollaboratorAccess } from '../../server/lib/resolveTenantUserForCollaboratorAccess.js';
import { createSetCollaboratorAccessState } from '../../server/lib/setCollaboratorAccessState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_PATH = path.join(REPO_ROOT, 'server/index.js');

const WAVE3D_HANDLERS = [
  'createContractsGeneratedHandler',
  'createCreateTenantUserFromApp',
  'createResolveTenantUserForCollaboratorAccess',
  'createSetCollaboratorAccessState',
];

const WAVE3D_DOMAIN_WIRING = [
  'resolveTenantUserForCollaboratorAccess = createResolveTenantUserForCollaboratorAccess',
  'createTenantUserFromApp = createCreateTenantUserFromApp',
  'setCollaboratorAccessState = createSetCollaboratorAccessState',
  'handleContractsGenerated = createContractsGeneratedHandler',
];

function readIndex() {
  return fs.readFileSync(INDEX_PATH, 'utf8');
}

function mockRes() {
  return {
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
}

describe('apiCoreWave3dMigration — index wiring', () => {
  it.each(WAVE3D_HANDLERS)('index.js importa %s', (factory) => {
    expect(readIndex()).toContain(factory);
  });

  it.each(WAVE3D_DOMAIN_WIRING)('index.js instancia %s', (wiring) => {
    expect(readIndex()).toContain(wiring);
  });

  it('POST /internal/app/contracts/generated usa handler externo', () => {
    const content = readIndex();
    expect(content).toMatch(/app\.post\(\s*['"]\/internal\/app\/contracts\/generated['"]/);
    expect(content).toContain('handleContractsGenerated');
  });

  it('contracts/generated não usa async (req, res) inline', () => {
    const content = readIndex();
    expect(content).not.toMatch(
      /\/internal\/app\/contracts\/generated['"][\\s\\S]{0,80}async \\(req, res\\)/,
    );
  });

  it('index.js não define createTenantUserFromApp inline', () => {
    const content = readIndex();
    expect(content).not.toMatch(/async function createTenantUserFromApp\s*\(/);
  });

  it('index.js não define resolveTenantUserForCollaboratorAccess inline', () => {
    const content = readIndex();
    expect(content).not.toMatch(/async function resolveTenantUserForCollaboratorAccess\s*\(/);
  });

  it('index.js não define setCollaboratorAccessState inline', () => {
    const content = readIndex();
    expect(content).not.toMatch(/async function setCollaboratorAccessState\s*\(/);
  });

  it('tenantUserFieldUtils consumido pela camada provisioning (não duplicado no index)', () => {
    const indexContent = readIndex();
    const tenantWrite = fs.readFileSync(
      path.join(REPO_ROOT, 'server/lib/provisioning/tenantUserWrite.js'),
      'utf8',
    );
    expect(indexContent).not.toMatch(/from '\.\/lib\/tenantUserFieldUtils\.js'/);
    expect(tenantWrite).toMatch(/from '\.\.\/tenantUserFieldUtils\.js'/);
    expect(indexContent).not.toMatch(/const TENANT_USER_SELECT_BASE =/);
    expect(indexContent).not.toMatch(/function omitHasSystemAccess\s*\(/);
  });
});

describe('contractsGeneratedApi — buildGeneratedContractRow', () => {
  it('400 quando record.id ausente', () => {
    const built = buildGeneratedContractRow({
      record: {},
      tenantId: 'tenant-a',
      authUserId: 'auth-1',
    });
    expect(built).toEqual({ error: 'record.id é obrigatório.', status: 400 });
  });

  it('mapeia campos camelCase → snake_case', () => {
    const built = buildGeneratedContractRow({
      record: {
        id: 'contract-1',
        patientId: 'p1',
        quoteId: 'q1',
        quoteSource: 'budget',
        templateId: 'tpl-1',
        templateVersion: 2,
        contractNumber: 'C-001',
        finalContent: 'texto',
        renderedHtml: '<p>html</p>',
        pdfUrl: 'https://example.com/a.pdf',
        status: 'signed',
        generatedAt: '2026-01-01T00:00:00.000Z',
        canceledAt: null,
        signedAt: '2026-01-02T00:00:00.000Z',
        metadata: { k: 'v' },
      },
      tenantId: 'tenant-a',
      authUserId: 'auth-1',
    });

    expect(built.row).toMatchObject({
      id: 'contract-1',
      tenant_id: 'tenant-a',
      patient_id: 'p1',
      quote_id: 'q1',
      quote_source: 'budget',
      template_id: 'tpl-1',
      template_version: 2,
      contract_number: 'C-001',
      final_content: 'texto',
      rendered_html: '<p>html</p>',
      pdf_url: 'https://example.com/a.pdf',
      status: 'signed',
      generated_by: 'auth-1',
      generated_at: '2026-01-01T00:00:00.000Z',
      signed_at: '2026-01-02T00:00:00.000Z',
      metadata: { k: 'v' },
    });
  });
});

describe('contractsGeneratedApi — mapGeneratedContractsTableError', () => {
  it('501 quando tabela generated_contracts ausente', () => {
    const mapped = mapGeneratedContractsTableError(
      { message: 'relation "generated_contracts" does not exist' },
      (_e, fb) => fb || _e?.message || '',
    );
    expect(mapped?.status).toBe(501);
    expect(mapped?.body?.error).toContain('generated_contracts ausente');
    expect(mapped?.body?.error).toContain('006_app_contracts.sql');
  });

  it('retorna null para outros erros', () => {
    const mapped = mapGeneratedContractsTableError(
      { message: 'duplicate key value' },
      (_e, fb) => fb || _e?.message || '',
    );
    expect(mapped).toBeNull();
  });
});

describe('contractsGeneratedApi — contrato HTTP preservado', () => {
  it('404 tenant ausente (antes de validar record.id)', async () => {
    const supabase = {
      from: (table) => {
        expect(table).toBe('tenant_users');
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };
      },
    };

    const handler = createContractsGeneratedHandler({
      supabase,
      normalizeDatabaseError: (_e, fb) => fb,
    });

    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-1' }, body: { record: {} } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Tenant não encontrado para o usuário autenticado.' });
  });

  it('400 record.id obrigatório após tenant resolvido', async () => {
    const supabase = {
      from: (table) => {
        if (table === 'tenant_users') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { tenant_id: 'tenant-a' }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`tabela inesperada: ${table}`);
      },
    };

    const handler = createContractsGeneratedHandler({
      supabase,
      normalizeDatabaseError: (_e, fb) => fb,
    });

    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-1' }, body: { record: { patientId: 'p1' } } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'record.id é obrigatório.' });
  });

  it('200 ok com id no sucesso', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: (table) => {
        if (table === 'tenant_users') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { tenant_id: 'tenant-a' }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'generated_contracts') {
          return { upsert };
        }
        throw new Error(`tabela inesperada: ${table}`);
      },
    };

    const handler = createContractsGeneratedHandler({
      supabase,
      normalizeDatabaseError: (_e, fb) => fb,
    });

    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-1' },
      body: { record: { id: 'contract-99', finalContent: 'x' } },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 'contract-99' });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('501 quando upsert falha por tabela ausente', async () => {
    const supabase = {
      from: (table) => {
        if (table === 'tenant_users') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { tenant_id: 'tenant-a' }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'generated_contracts') {
          return {
            upsert: async () => ({
              error: { message: 'relation "generated_contracts" does not exist' },
            }),
          };
        }
        throw new Error(`tabela inesperada: ${table}`);
      },
    };

    const handler = createContractsGeneratedHandler({
      supabase,
      normalizeDatabaseError: (e) => String(e?.message || e),
    });

    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-1' },
      body: { record: { id: 'c-1' } },
    }, res);

    expect(res.statusCode).toBe(501);
    expect(res.body.error).toContain('generated_contracts ausente');
  });

  it('400 catch geral com normalizeDatabaseError', async () => {
    const handler = createContractsGeneratedHandler({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    throw new Error('db down');
                  },
                }),
              }),
            }),
          }),
        }),
      },
      normalizeDatabaseError: (_e, fb) => _e?.message || fb,
    });

    const res = mockRes();
    await handler({ appAuthUser: { id: 'auth-1' }, body: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'db down' });
  });
});

describe('apiCoreWave3dMigration — domínio extraído exporta factories', () => {
  it('createCreateTenantUserFromApp retorna função', () => {
    const fn = createCreateTenantUserFromApp({
      supabase: {},
      getTenantAdminActorOrThrow: async () => ({}),
      normalizeEmail: (v) => v,
      normalizeRoleValue: (v) => v,
      lookupAuthUserByEmail: async () => null,
      requireAuthUserId: async () => ({ id: 'u1' }),
      isAuthUserAlreadyRegisteredError: () => false,
      assertAuthUserIdForTenantWrite: (id) => id,
      upsertTenantUserAccess: async () => ({}),
      sendCollaboratorInvite: async () => ({}),
      isInviteEmailDelivered: () => false,
      upsertInvitationRecord: async () => ({}),
    });
    expect(fn).toBeTypeOf('function');
  });

  it('createResolveTenantUserForCollaboratorAccess retorna função', () => {
    const fn = createResolveTenantUserForCollaboratorAccess({
      supabase: {},
      getTenantAdminActorOrThrow: async () => ({ tenant_id: 't1' }),
      normalizeEmail: (v) => v,
      isMissingCollaboratorIdColumnError: () => false,
      linkCollaboratorToTenantUser: async () => ({}),
    });
    expect(fn).toBeTypeOf('function');
  });

  it('createSetCollaboratorAccessState retorna função', () => {
    const fn = createSetCollaboratorAccessState({
      supabase: {},
      resolveTenantUserForCollaboratorAccess: async () => null,
      revokeAuthUserSessions: async () => {},
      isMissingHasSystemAccessColumnError: () => false,
    });
    expect(fn).toBeTypeOf('function');
  });
});
