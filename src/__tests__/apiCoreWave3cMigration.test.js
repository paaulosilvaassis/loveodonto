import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_ADMIN_FORBIDDEN_MESSAGE } from '../../server/lib/tenantAdminActor.js';
import { createCollaboratorsAccessBundleHandler } from '../../server/lib/collaboratorsAccessBundleApi.js';
import { createUsersCreateHandler } from '../../server/lib/usersCreateApi.js';
import { createUsersPatchAccessHandler } from '../../server/lib/usersPatchAccessApi.js';
import { createUsersDeleteHandler } from '../../server/lib/usersDeleteApi.js';
import { createCollaboratorAccessToggleHandler } from '../../server/lib/collaboratorAccessToggleApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_PATH = path.join(REPO_ROOT, 'server/index.js');

const WAVE3C_HANDLERS = [
  'createCollaboratorsAccessBundleHandler',
  'createUsersCreateHandler',
  'createUsersPatchAccessHandler',
  'createUsersDeleteHandler',
  'createCollaboratorAccessToggleHandler',
];

const WAVE3C_ROUTES = [
  { method: 'app.post', path: '/internal/app/collaborators/access-bundle', handler: 'handleCollaboratorsAccessBundle' },
  { method: 'app.post', path: '/internal/app/users/create', handler: 'handleUsersCreate' },
  { method: 'app.patch', path: '/internal/app/users/:tenantUserId/access', handler: 'handleUsersPatchAccess' },
  { method: 'app.delete', path: '/internal/app/users/:tenantUserId', handler: 'handleUsersDelete' },
  { method: 'app.patch', path: '/internal/app/collaborators/:collaboratorId/access', handler: 'handleCollaboratorAccessToggle' },
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

describe('apiCoreWave3cMigration — index wiring', () => {
  it.each(WAVE3C_HANDLERS)('index.js importa %s', (factory) => {
    expect(readIndex()).toContain(factory);
  });

  it.each(WAVE3C_ROUTES)('$method $path usa handler externo', ({ method, path: routePath, handler }) => {
    const content = readIndex();
    const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(content).toMatch(new RegExp(`${method}\\(\\s*['"]${escaped}['"]`));
    expect(content).toContain(handler);
  });

  it('rotas Wave 3C não usam async (req, res) inline', () => {
    const content = readIndex();
    for (const { path: routePath } of WAVE3C_ROUTES) {
      const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(content).not.toMatch(new RegExp(`${escaped}['"][\\s\\S]{0,80}async \\(req, res\\)`));
    }
  });
});

describe('collaboratorsAccessBundleApi — contrato preservado', () => {
  it('400 target_user_id obrigatório antes de admin', async () => {
    const handler = createCollaboratorsAccessBundleHandler({
      supabase: {},
      identityService: null,
      getTenantAdminActorOrThrow: async () => {
        throw new Error('admin não deveria ser chamado');
      },
      getValidAuthUserId: async () => null,
      clearStaleTenantUserAuthReference: async () => {},
      resolveAuthUserIdForTenantLink: async () => null,
      assertAuthUserIdForTenantWrite: (id) => id,
      normalizeEmail: (v) => v,
      normalizeRoleValue: (v, fb) => v || fb,
      normalizeDatabaseError: (_e, fb) => fb,
      resolveClientIp: () => '127.0.0.1',
    });

    const res = mockRes();
    await handler({ appAuthUser: { id: 'u1' }, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'target_user_id é obrigatório.' });
  });

  it('404 tenant_user ausente', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };

    const handler = createCollaboratorsAccessBundleHandler({
      supabase,
      identityService: null,
      getTenantAdminActorOrThrow: async () => ({ tenant_id: 'tenant-a' }),
      getValidAuthUserId: async () => null,
      clearStaleTenantUserAuthReference: async () => {},
      resolveAuthUserIdForTenantLink: async () => null,
      assertAuthUserIdForTenantWrite: (id) => id,
      normalizeEmail: (v) => v,
      normalizeRoleValue: (v, fb) => v || fb,
      normalizeDatabaseError: (_e, fb) => fb,
      resolveClientIp: () => '127.0.0.1',
    });

    const res = mockRes();
    await handler({
      appAuthUser: { id: 'admin-1' },
      body: { target_user_id: 'auth-1', tenant_id: 'tenant-a' },
    }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain('Usuário não encontrado em tenant_users');
  });

  it('200 sucesso mínimo', async () => {
    const tuRow = {
      id: 'tu-1',
      user_id: 'auth-1',
      tenant_id: 'tenant-a',
      full_name: 'Juliana',
      email: 'juliana@test.com',
      collaborator_id: 'col-1',
    };

    const supabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: tuRow, error: null }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      }),
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: { id: 'auth-1', email: 'juliana@test.com', app_metadata: {} } },
            error: null,
          }),
          updateUserById: async () => ({ error: null }),
        },
      },
    };

    const handler = createCollaboratorsAccessBundleHandler({
      supabase,
      identityService: null,
      getTenantAdminActorOrThrow: async () => ({ tenant_id: 'tenant-a' }),
      getValidAuthUserId: async () => 'auth-1',
      clearStaleTenantUserAuthReference: async () => {},
      resolveAuthUserIdForTenantLink: async () => 'auth-1',
      assertAuthUserIdForTenantWrite: (id) => id,
      normalizeEmail: (v) => String(v || '').trim().toLowerCase(),
      normalizeRoleValue: (v, fb) => v || fb,
      normalizeDatabaseError: (_e, fb) => fb,
      resolveClientIp: () => '127.0.0.1',
    });

    const res = mockRes();
    await handler({
      appAuthUser: { id: 'admin-1', email: 'admin@test.com' },
      body: { target_user_id: 'auth-1', tenant_id: 'tenant-a', role: 'atendimento' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      tenant_user_id: 'tu-1',
      target_user_id: 'auth-1',
    });
  });
});

describe('usersCreateApi — contrato preservado', () => {
  it('201 sucesso', async () => {
    const handler = createUsersCreateHandler({
      createTenantUserFromApp: async () => ({
        tenantUser: { id: 'tu-1' },
        invitation: null,
        authUserId: 'auth-1',
      }),
      normalizeEmail: (v) => v,
      normalizeDatabaseError: (_e, fb) => fb,
    });

    const res = mockRes();
    await handler({
      appAuthUser: { id: 'admin-1' },
      body: {
        tenant_id: 'tenant-a',
        full_name: 'Novo',
        email: 'novo@test.com',
        password: '12345678',
        profile_role: 'atendimento',
      },
    }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.auth_user_id).toBe('auth-1');
  });

  it('409 e-mail duplicado', async () => {
    const handler = createUsersCreateHandler({
      createTenantUserFromApp: async () => {
        throw new Error('Este e-mail já possui acesso nesta clínica.');
      },
      normalizeEmail: (v) => v,
      normalizeDatabaseError: (_e, fb) => _e?.message || fb,
    });

    const res = mockRes();
    await handler({ appAuthUser: { id: 'admin-1' }, body: { email: 'dup@test.com' } }, res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Este e-mail já possui acesso.' });
  });

  it('400 validação', async () => {
    const handler = createUsersCreateHandler({
      createTenantUserFromApp: async () => {
        throw new Error('password deve ter pelo menos 8 caracteres.');
      },
      normalizeEmail: (v) => v,
      normalizeDatabaseError: (_e, fb) => _e?.message || fb,
    });

    const res = mockRes();
    await handler({ appAuthUser: { id: 'admin-1' }, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('password');
  });
});

describe('usersPatchAccessApi — contrato preservado', () => {
  it('400 tenantUserId obrigatório antes de admin', async () => {
    const handler = createUsersPatchAccessHandler({
      supabase: {},
      getTenantAdminActorOrThrow: async () => {
        throw new Error('admin não deveria ser chamado');
      },
      revokeAuthUserSessions: async () => {},
      isMissingHasSystemAccessColumnError: () => false,
      normalizeDatabaseError: (_e, fb) => fb,
    });

    const res = mockRes();
    await handler({ appAuthUser: { id: 'admin-1' }, params: {}, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('tenantUserId é obrigatório.');
  });

  it('400 erro admin legado', async () => {
    const handler = createUsersPatchAccessHandler({
      supabase: {
        from: () => ({
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { id: 'tu-1' }, error: null }),
                }),
              }),
            }),
          }),
        }),
      },
      getTenantAdminActorOrThrow: async () => {
        throw new Error(LEGACY_ADMIN_FORBIDDEN_MESSAGE);
      },
      revokeAuthUserSessions: async () => {},
      isMissingHasSystemAccessColumnError: () => false,
      normalizeDatabaseError: (_e, fb) => _e?.message || fb,
    });

    const res = mockRes();
    await handler({
      appAuthUser: { id: 'u1' },
      params: { tenantUserId: 'tu-1' },
      body: { has_system_access: false },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(LEGACY_ADMIN_FORBIDDEN_MESSAGE);
  });
});

describe('usersDeleteApi — contrato preservado', () => {
  it('400 auto-remoção bloqueada', async () => {
    const handler = createUsersDeleteHandler({
      supabase: {},
      getTenantAdminActorOrThrow: async () => ({ id: 'tu-self', tenant_id: 'tenant-a' }),
      normalizeEmail: (v) => v,
      normalizeDatabaseError: (_e, fb) => fb,
    });

    const res = mockRes();
    await handler({
      appAuthUser: { id: 'auth-self' },
      params: { tenantUserId: 'tu-self' },
      body: { tenant_id: 'tenant-a' },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('não pode remover seu próprio vínculo');
  });
});

describe('collaboratorAccessToggleApi — contrato preservado', () => {
  it('400 collaboratorId obrigatório antes de admin', async () => {
    const handler = createCollaboratorAccessToggleHandler({
      supabase: {},
      identityService: {},
      getTenantAdminActorOrThrow: async () => {
        throw new Error('admin não deveria ser chamado');
      },
      resolveTenantUserForCollaboratorAccess: async () => null,
      linkCollaboratorToTenantUser: async () => ({}),
      revokeAuthUserSessions: async () => {},
      isMissingHasSystemAccessColumnError: () => false,
      isMissingIdentitiesTableError: () => false,
      normalizeEmail: (v) => v,
      normalizeRoleValue: (v, fb) => v || fb,
      normalizeDatabaseError: (_e, fb) => fb,
      resolveClientIp: () => '127.0.0.1',
      logCollaboratorAccessAudit: () => {},
      appendAccessAuditToAuthUser: async () => {},
    });

    const res = mockRes();
    await handler({ appAuthUser: { id: 'admin-1' }, params: {}, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('collaboratorId é obrigatório.');
  });
});
