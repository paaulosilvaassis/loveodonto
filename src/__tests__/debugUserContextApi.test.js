import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_PROJECT_REF,
  buildSanitizedDebugUserContextData,
  createAssertNonProductionDebug,
  createDebugUserContextHandler,
  isDebugUserContextAllowed,
  isProductionSupabaseUrl,
  parseDebugUserContextQuery,
} from '../../server/lib/debugUserContextApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const ACTOR_ID = 'aaaaaaaa-bbbb-cccc-dddd-111111111111';
const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNKNOWN_TARGET = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const TENANT_USER_ROW = {
  id: 'tu-1',
  tenant_id: TENANT_A,
  user_id: ACTOR_ID,
  collaborator_id: 'col-legacy-1',
  collaborator_uuid: '11111111-2222-3333-4444-555555555555',
  full_name: 'Admin Teste',
  email: 'admin+staging@implanprime.test',
  role: 'master',
  role_slug: 'master',
  is_active: true,
  status: 'active',
  has_system_access: true,
};

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

function mockNext() {
  return vi.fn();
}

function buildMockSupabase({
  tenantUser = TENANT_USER_ROW,
  targetUser = null,
} = {}) {
  const state = { tenantSelect: null };

  return {
    from(table) {
      if (table === 'tenants') {
        return {
          select(cols) {
            state.tenantSelect = cols;
            return {
              eq(_f, _v) {
                return {
                  maybeSingle: async () => ({
                    data: { id: TENANT_A, trade_name: 'Implan Prime', name: 'Implan Prime' },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table === 'tenant_users') {
        return {
          select(_cols) {
            return {
              eq(_f1, _v1) {
                return {
                  eq(_f2, userId) {
                    return {
                      maybeSingle: async () => {
                        if (userId === UNKNOWN_TARGET) {
                          return { data: null, error: null };
                        }
                        if (userId === TARGET_ID) {
                          return { data: targetUser, error: null };
                        }
                        return { data: tenantUser, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    getState: () => state,
  };
}

describe('debugUserContextApi — ambiente', () => {
  it('bloqueia NODE_ENV production', () => {
    expect(isDebugUserContextAllowed({
      nodeEnv: 'production',
      supabaseUrl: 'https://staging.example.supabase.co',
    })).toBe(false);
  });

  it('bloqueia SUPABASE_URL de produção', () => {
    expect(isProductionSupabaseUrl(`https://${PRODUCTION_PROJECT_REF}.supabase.co`)).toBe(true);
    expect(isDebugUserContextAllowed({
      nodeEnv: 'development',
      supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    })).toBe(false);
  });

  it('permite dev/staging', () => {
    expect(isDebugUserContextAllowed({
      nodeEnv: 'development',
      supabaseUrl: 'https://tckdjyunwmdpqmewrwvt.supabase.co',
    })).toBe(true);
  });

  it('middleware retorna 403 DEBUG_DISABLED_IN_PRODUCTION', () => {
    const middleware = createAssertNonProductionDebug({
      nodeEnv: 'production',
      supabaseUrl: 'https://staging.example.supabase.co',
    });
    const res = mockRes();
    const next = mockNext();
    middleware({}, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('DEBUG_DISABLED_IN_PRODUCTION');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('debugUserContextApi — query parsing', () => {
  it('rejeita tenant_id na query', () => {
    expect(() => parseDebugUserContextQuery({ tenant_id: TENANT_A }))
      .toThrow(/tenant_id não é aceito/);
  });

  it('rejeita target_user_id inválido', () => {
    expect(() => parseDebugUserContextQuery({ target_user_id: 'not-a-uuid' }))
      .toThrow(/target_user_id inválido/);
  });

  it('aceita target_user_id UUID válido', () => {
    const parsed = parseDebugUserContextQuery({ target_user_id: TARGET_ID });
    expect(parsed.targetUserId).toBe(TARGET_ID);
  });
});

describe('debugUserContextApi — payload sanitizado', () => {
  it('expõe apenas campos allowlist', () => {
    const data = buildSanitizedDebugUserContextData({
      authUserId: ACTOR_ID,
      actorEmail: 'admin@test.com',
      tenantId: TENANT_A,
      tenantRow: { trade_name: 'Clínica', name: 'Clínica' },
      clinicProfile: { logo_url: 'https://cdn/logo.webp' },
      tuRow: TENANT_USER_ROW,
      permissionFields: {
        has_custom_permissions: true,
        custom_permissions: { 'perm-001': true, 'perm-002': false },
        permission_overrides: {},
      },
      authMeta: {
        user_metadata: { avatar_url: 'https://avatar.test/a.png' },
        app_metadata: { secret: 'must-not-leak' },
      },
    });

    expect(data.collaborator_uuid).toBe(TENANT_USER_ROW.collaborator_uuid);
    expect(data.permissions_count).toBe(1);
    expect(data).not.toHaveProperty('app_metadata');
    expect(data).not.toHaveProperty('user_metadata');
    expect(data).not.toHaveProperty('custom_permissions');
    expect(data).not.toHaveProperty('permission_overrides');
  });
});

describe('debugUserContextApi — HTTP handler', () => {
  const getTenantAdminActorOrThrow = vi.fn();
  const getAuthUserMeta = vi.fn();
  const resolveClinicProfileForTenant = vi.fn();
  const maskEmail = vi.fn((email) => `masked:${email}`);
  let supabase;
  let handler;

  const extractPermissionFieldsFromAppMetadata = (meta) => ({
    has_custom_permissions: meta?.has_custom_permissions === true,
    custom_permissions: meta?.custom_permissions || null,
    permission_overrides: meta?.permission_overrides || {},
  });

  beforeEach(() => {
    getTenantAdminActorOrThrow.mockReset();
    getAuthUserMeta.mockReset();
    resolveClinicProfileForTenant.mockReset();
    maskEmail.mockClear();

    getTenantAdminActorOrThrow.mockResolvedValue({ tenant_id: TENANT_A, role: 'master' });
    getAuthUserMeta.mockResolvedValue({
      user_metadata: { avatar_url: 'https://avatar.test/a.png' },
      app_metadata: {
        has_custom_permissions: false,
        permission_overrides: { 'perm-001': true },
      },
    });
    resolveClinicProfileForTenant.mockResolvedValue({ logo_url: 'https://cdn/logo.webp' });

    supabase = buildMockSupabase();
    handler = createDebugUserContextHandler({
      supabase,
      getTenantAdminActorOrThrow,
      getAuthUserMeta,
      extractPermissionFieldsFromAppMetadata,
      resolveClinicProfileForTenant,
      maskEmail,
      nodeEnv: 'development',
    });
  });

  it('401 sem auth', async () => {
    const res = mockRes();
    await handler({ appAuthUser: null, query: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('403 sem admin', async () => {
    getTenantAdminActorOrThrow.mockRejectedValue(
      new Error('Apenas administradores da clínica podem executar esta ação.'),
    );
    const res = mockRes();
    await handler({ appAuthUser: { id: ACTOR_ID }, query: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it('403 em produção dentro do handler', async () => {
    const prodHandler = createDebugUserContextHandler({
      supabase,
      getTenantAdminActorOrThrow,
      getAuthUserMeta,
      extractPermissionFieldsFromAppMetadata,
      resolveClinicProfileForTenant,
      maskEmail,
      nodeEnv: 'production',
    });
    const res = mockRes();
    await prodHandler({ appAuthUser: { id: ACTOR_ID }, query: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('DEBUG_DISABLED_IN_PRODUCTION');
  });

  it('400 tenant_id query proibido', async () => {
    const res = mockRes();
    await handler({
      appAuthUser: { id: ACTOR_ID },
      query: { tenant_id: TENANT_A },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TENANT_QUERY_FORBIDDEN');
  });

  it('404 target_user_id fora do tenant', async () => {
    const res = mockRes();
    await handler({
      appAuthUser: { id: ACTOR_ID },
      query: { target_user_id: UNKNOWN_TARGET },
    }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('TARGET_USER_NOT_FOUND');
  });

  it('200 envelope V3 com dados mínimos', async () => {
    const res = mockRes();
    await handler({
      appAuthUser: { id: ACTOR_ID, email: 'admin@test.com' },
      query: {},
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user_id).toBe(ACTOR_ID);
    expect(res.body.data.collaborator_uuid).toBe(TENANT_USER_ROW.collaborator_uuid);
    expect(res.body.meta).toMatchObject({
      tenant_id: TENANT_A,
      source: 'debug-user-context',
      read_only: true,
    });
  });

  it('não vaza tokens, metadata bruto ou mapas de permissões', async () => {
    getAuthUserMeta.mockResolvedValue({
      user_metadata: { avatar_url: 'https://avatar.test/a.png', role: 'spoof' },
      app_metadata: {
        has_custom_permissions: true,
        custom_permissions: { 'perm-001': true, 'perm-002': true },
        permission_overrides: { 'perm-003': true },
        access_token: 'secret-token',
        service_role: 'secret-key',
      },
    });
    const res = mockRes();
    await handler({
      appAuthUser: { id: ACTOR_ID, email: 'admin@test.com' },
      query: {},
    }, res);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('secret-key');
    expect(serialized).not.toContain('"app_metadata"');
    expect(serialized).not.toContain('"user_metadata"');
    expect(serialized).not.toMatch(/"custom_permissions"\s*:\s*\{/);
    expect(res.body.data.custom_permissions_keys).toBe(2);
  });

  it('usa req.tenantContext quando middleware já resolveu tenant admin', async () => {
    const res = mockRes();
    await handler({
      appAuthUser: { id: ACTOR_ID, email: 'admin@test.com' },
      query: {},
      tenantContext: { tenantId: TENANT_A, mode: 'admin' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.meta.tenant_id).toBe(TENANT_A);
    expect(getTenantAdminActorOrThrow).not.toHaveBeenCalled();
  });

  it('não usa SELECT * em tenants', async () => {
    const res = mockRes();
    await handler({
      appAuthUser: { id: ACTOR_ID, email: 'admin@test.com' },
      query: {},
    }, res);
    expect(res.statusCode).toBe(200);
    expect(supabase.getState().tenantSelect).toBe('id, trade_name, name');
  });
});

describe('debugUserContextApi — segurança operacional', () => {
  it('zero IndexedDB no módulo', () => {
    const content = fs.readFileSync(
      path.join(REPO_ROOT, 'server/lib/debugUserContextApi.js'),
      'utf8',
    );
    expect(content).not.toMatch(/from\s+['"].*(?:\/db\/|indexeddb)/i);
    expect(content).not.toMatch(/\b(withDb|loadDb)\s*\(/);
  });

  it('produção intocada como alvo operacional', () => {
    const content = fs.readFileSync(
      path.join(REPO_ROOT, 'server/lib/debugUserContextApi.js'),
      'utf8',
    );
    expect(content).toContain(PRODUCTION_PROJECT_REF);
    expect(content).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
  });

  it('rota registrada com core auth/tenant e gate non-prod', () => {
    const content = fs.readFileSync(path.join(REPO_ROOT, 'server/index.js'), 'utf8');
    expect(content).toMatch(/app\.get\(\s*['"]\/internal\/app\/debug-user-context['"]/);
    expect(content).toContain('assertNonProductionDebugUserContext');
    expect(content).toContain('requireAppUserDebugUserContext');
    expect(content).toContain('requireTenantAdminDebugUserContext');
    expect(content).toContain('createDebugUserContextHandler');
  });
});
