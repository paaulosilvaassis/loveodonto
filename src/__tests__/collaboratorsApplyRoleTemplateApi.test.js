import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CollaboratorApplyTemplateAuthError,
  CollaboratorApplyTemplateConflictError,
  PRODUCTION_PROJECT_REF,
  applyRoleTemplateToLinkedUser,
  assertNoTenantIdInBody,
  buildRoleTemplateAppMetadata,
  createCollaboratorApplyRoleTemplateHandler,
  detectRequiresOverwrite,
  filterTemplateIdsAgainstCatalog,
  parseApplyRoleTemplateBody,
} from '../../server/lib/collaboratorsApplyRoleTemplateApi.js';
import { CollaboratorPermissionsNotFoundError } from '../../server/lib/collaboratorsPermissionsApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const TENANT_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const JULIANA_ID = 'a1000002-0002-4002-8002-000000000002';
const RENATA_ID = 'a1000003-0003-4003-8003-000000000003';
const MELISSA_ID = 'a1000004-0004-4004-8004-000000000004';
const PAULO_ID = 'a1000001-0001-4001-8001-000000000001';

const CATALOG_IDS = Array.from({ length: 184 }, (_, i) => `perm-${String(i + 1).padStart(3, '0')}`);
const GERENTE_DEFAULTS = CATALOG_IDS.slice(0, 28);
const ATENDIMENTO_DEFAULTS = CATALOG_IDS.slice(0, 12);
const ALIEN_PERM = 'perm-not-in-catalog';

const COLLABORATORS = [
  {
    id: JULIANA_ID,
    tenant_id: TENANT_A,
    legacy_id: 'col-juliana-staging',
    email: 'juliana+staging@implanprime.test',
    apelido: 'Dra. Juliana',
    nome_completo: 'Juliana',
    status: 'ativo',
    deleted_at: null,
  },
  {
    id: RENATA_ID,
    tenant_id: TENANT_A,
    legacy_id: 'col-renata-staging',
    email: 'renata+staging@implanprime.test',
    apelido: 'Renata',
    nome_completo: 'Renata',
    status: 'ativo',
    deleted_at: null,
  },
  {
    id: MELISSA_ID,
    tenant_id: TENANT_A,
    legacy_id: 'col-melissa-staging',
    email: 'melissa+staging@implanprime.test',
    apelido: 'Melissa',
    nome_completo: 'Melissa',
    status: 'ativo',
    deleted_at: null,
  },
];

const TENANT_USERS = [
  {
    id: 'tu-juliana',
    tenant_id: TENANT_A,
    user_id: 'auth-juliana',
    email: 'juliana+staging@implanprime.test',
    role: 'atendimento',
    role_slug: 'atendimento',
    status: 'active',
    is_active: true,
    has_system_access: true,
    collaborator_id: 'col-juliana-staging',
    collaborator_uuid: JULIANA_ID,
    has_custom_permissions: false,
  },
  {
    id: 'tu-melissa',
    tenant_id: TENANT_A,
    user_id: 'auth-melissa',
    email: 'melissa+staging@implanprime.test',
    role: 'atendimento',
    role_slug: 'atendimento',
    status: 'inactive',
    is_active: false,
    has_system_access: false,
    collaborator_id: 'col-melissa-staging',
    collaborator_uuid: MELISSA_ID,
    has_custom_permissions: true,
  },
];

function buildApplyMockSupabase({
  collaborators = COLLABORATORS,
  tenantUsers = TENANT_USERS,
  catalogIds = CATALOG_IDS,
  roleDefaultsBySlug = {
    gerente: GERENTE_DEFAULTS,
    atendimento: ATENDIMENTO_DEFAULTS,
  },
  authUpdateShouldFail = false,
  tenantUserUpdateShouldFail = false,
  rollbackShouldFail = false,
  includeAlienDefault = false,
} = {}) {
  const writes = {
    collaborators: [],
    tenantUsers: [],
    auth: [],
  };
  let authUpdateCalls = 0;
  let tenantUserUpdateCalls = 0;

  function collaboratorsChain(filters = {}) {
    const chain = {
      select() { return chain; },
      eq(field, value) {
        filters[field] = value;
        return chain;
      },
      is(field, value) {
        filters[`${field}__is`] = value;
        return chain;
      },
      update(payload) {
        writes.collaborators.push(payload);
        return chain;
      },
      maybeSingle() {
        const rows = collaborators.filter((row) => {
          if (filters.tenant_id && row.tenant_id !== filters.tenant_id) return false;
          if (filters.id && row.id !== filters.id) return false;
          if (filters.legacy_id && row.legacy_id !== filters.legacy_id) return false;
          if (filters['deleted_at__is'] === null && row.deleted_at) return false;
          return true;
        });
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
    };
    return chain;
  }

  const supabase = {
    writes,
    from(table) {
      if (table === 'collaborators') return collaboratorsChain();
      if (table === 'tenant_users') {
        const filterRows = (filters) => tenantUsers.filter((row) => {
          if (filters.tenant_id && row.tenant_id !== filters.tenant_id) return false;
          if (filters.collaborator_uuid && row.collaborator_uuid !== filters.collaborator_uuid) return false;
          if (filters.collaborator_id && row.collaborator_id !== filters.collaborator_id) return false;
          return true;
        });

        const buildEqChain = (filters = {}) => ({
          eq(field, value) {
            filters[field] = value;
            return buildEqChain(filters);
          },
          maybeSingle() {
            const rows = filterRows(filters);
            return Promise.resolve({ data: rows[0] || null, error: null });
          },
          then(resolve, reject) {
            const rows = filterRows(filters);
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          },
        });

        return {
          select() {
            return buildEqChain();
          },
          update(payload) {
            tenantUserUpdateCalls += 1;
            writes.tenantUsers.push({ call: tenantUserUpdateCalls, payload: { ...payload } });
            if (tenantUserUpdateShouldFail && tenantUserUpdateCalls === 1) {
              return {
                eq() {
                  return {
                    eq: async () => ({ error: { message: 'tenant_users update failed' } }),
                  };
                },
              };
            }
            if (rollbackShouldFail && tenantUserUpdateCalls > 1) {
              return {
                eq() {
                  return {
                    eq: async () => ({ error: { message: 'rollback failed' } }),
                  };
                },
              };
            }
            return {
              eq() {
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          },
        };
      }
      if (table === 'permission_catalog') {
        return {
          select() {
            return {
              order() {
                return Promise.resolve({ data: catalogIds.map((id) => ({ id })), error: null });
              },
            };
          },
        };
      }
      if (table === 'role_permission_defaults') {
        return {
          select() {
            return {
              eq(_field, roleSlug) {
                let ids = roleDefaultsBySlug[roleSlug] || [];
                if (includeAlienDefault && roleSlug === 'gerente') {
                  ids = [...ids, ALIEN_PERM];
                }
                return Promise.resolve({
                  data: ids.map((permission_id) => ({ permission_id })),
                  error: null,
                });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        updateUserById: vi.fn(async (userId, payload) => {
          authUpdateCalls += 1;
          writes.auth.push({ userId, payload });
          if (authUpdateShouldFail) {
            throw new Error('auth update failed');
          }
          return { data: { user: { id: userId } }, error: null };
        }),
      },
    },
  };

  return supabase;
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

describe('collaboratorsApplyRoleTemplateApi — parser', () => {
  it('rejeita tenant_id no body', () => {
    expect(() => parseApplyRoleTemplateBody({ tenant_id: TENANT_A, role_slug: 'gerente' }))
      .toThrow(/tenant_id não é aceito/);
    expect(() => assertNoTenantIdInBody({ tenant_id: TENANT_A }))
      .toThrow(/tenant_id não é aceito/);
  });

  it('rejeita role_slug ausente', () => {
    expect(() => parseApplyRoleTemplateBody({}))
      .toThrow(/role_slug é obrigatório/);
  });

  it('aceita payload válido', () => {
    const parsed = parseApplyRoleTemplateBody({ role_slug: 'Gerente', confirmOverwrite: true });
    expect(parsed.roleSlug).toBe('gerente');
    expect(parsed.confirmOverwrite).toBe(true);
  });
});

describe('collaboratorsApplyRoleTemplateApi — template math', () => {
  it('não aplica permissão fora do catálogo', () => {
    const { validTemplateIds, appliedCount } = filterTemplateIdsAgainstCatalog(
      CATALOG_IDS,
      [...GERENTE_DEFAULTS, ALIEN_PERM],
    );
    expect(validTemplateIds).not.toContain(ALIEN_PERM);
    expect(appliedCount).toBe(GERENTE_DEFAULTS.length);
  });

  it('detecta requiresOverwrite com custom permissions', () => {
    expect(detectRequiresOverwrite(
      { has_custom_permissions: false },
      { has_custom_permissions: true, custom_permissions: { 'perm-001': true } },
    )).toBe(true);
  });

  it('buildRoleTemplateAppMetadata limpa custom', () => {
    const meta = buildRoleTemplateAppMetadata(
      { has_custom_permissions: true, custom_permissions: { 'perm-001': true }, role: 'atendimento' },
      TENANT_A,
      'gerente',
    );
    expect(meta.has_custom_permissions).toBe(false);
    expect(meta.custom_permissions).toBeUndefined();
    expect(meta.role_template).toBe('gerente');
  });
});

describe('collaboratorsApplyRoleTemplateApi — applyRoleTemplateToLinkedUser', () => {
  const getAuthUserMeta = vi.fn();
  const appendAccessAuditToAuthUser = vi.fn();

  beforeEach(() => {
    getAuthUserMeta.mockReset();
    appendAccessAuditToAuthUser.mockReset();
    getAuthUserMeta.mockImplementation(async (userId) => {
      const tu = TENANT_USERS.find((row) => row.user_id === userId);
      if (!tu) return null;
      if (tu.has_custom_permissions) {
        return {
          app_metadata: {
            has_custom_permissions: true,
            custom_permissions: Object.fromEntries(CATALOG_IDS.map((id) => [id, true])),
          },
        };
      }
      return { app_metadata: { role: tu.role_slug } };
    });
  });

  it('409 ACCESS_NOT_LINKED sem tenant_user', async () => {
    const supabase = buildApplyMockSupabase();
    await expect(
      applyRoleTemplateToLinkedUser({
        supabase,
        tenantId: TENANT_A,
        collaborator: COLLABORATORS[1],
        tenantUser: null,
        roleSlug: 'gerente',
        confirmOverwrite: false,
        getAuthUserMeta,
      }),
    ).rejects.toMatchObject({ code: 'ACCESS_NOT_LINKED' });
  });

  it('409 OVERWRITE_CONFIRMATION_REQUIRED sem confirmOverwrite', async () => {
    const supabase = buildApplyMockSupabase();
    await expect(
      applyRoleTemplateToLinkedUser({
        supabase,
        tenantId: TENANT_A,
        collaborator: COLLABORATORS.find((c) => c.id === MELISSA_ID),
        tenantUser: TENANT_USERS.find((tu) => tu.id === 'tu-melissa'),
        roleSlug: 'gerente',
        confirmOverwrite: false,
        getAuthUserMeta,
      }),
    ).rejects.toMatchObject({ code: 'OVERWRITE_CONFIRMATION_REQUIRED' });
  });

  it('aplica template com confirmOverwrite para Melissa inativa', async () => {
    const supabase = buildApplyMockSupabase();
    const result = await applyRoleTemplateToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS.find((c) => c.id === MELISSA_ID),
      tenantUser: TENANT_USERS.find((tu) => tu.id === 'tu-melissa'),
      roleSlug: 'gerente',
      confirmOverwrite: true,
      getAuthUserMeta,
      appendAccessAuditToAuthUser,
      actorUserId: 'auth-admin',
    });
    expect(result.role_slug).toBe('gerente');
    expect(result.has_custom_permissions).toBe(false);
    expect(result.applied_permissions_count).toBe(GERENTE_DEFAULTS.length);
    expect(appendAccessAuditToAuthUser).toHaveBeenCalled();
  });

  it('404 ROLE_TEMPLATE_NOT_FOUND para role inexistente', async () => {
    const supabase = buildApplyMockSupabase({ roleDefaultsBySlug: {} });
    await expect(
      applyRoleTemplateToLinkedUser({
        supabase,
        tenantId: TENANT_A,
        collaborator: COLLABORATORS[0],
        tenantUser: TENANT_USERS[0],
        roleSlug: 'inexistente',
        confirmOverwrite: false,
        getAuthUserMeta,
      }),
    ).rejects.toMatchObject({ code: 'ROLE_TEMPLATE_NOT_FOUND' });
  });

  it('atualiza tenant_users e app_metadata', async () => {
    const supabase = buildApplyMockSupabase();
    await applyRoleTemplateToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      roleSlug: 'gerente',
      confirmOverwrite: false,
      getAuthUserMeta,
      appendAccessAuditToAuthUser,
    });
    expect(supabase.writes.tenantUsers.length).toBeGreaterThan(0);
    expect(supabase.writes.tenantUsers[0].payload.role_slug).toBe('gerente');
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalled();
    const authPayload = supabase.writes.auth[0].payload.app_metadata;
    expect(authPayload.has_custom_permissions).toBe(false);
    expect(authPayload.role_template).toBe('gerente');
  });

  it('rollback se auth update falhar', async () => {
    const supabase = buildApplyMockSupabase({ authUpdateShouldFail: true });
    await expect(
      applyRoleTemplateToLinkedUser({
        supabase,
        tenantId: TENANT_A,
        collaborator: COLLABORATORS[0],
        tenantUser: TENANT_USERS[0],
        roleSlug: 'gerente',
        confirmOverwrite: false,
        getAuthUserMeta,
      }),
    ).rejects.toBeInstanceOf(CollaboratorApplyTemplateAuthError);
    expect(supabase.writes.tenantUsers.length).toBe(2);
  });

  it('503 se rollback falhar após auth error', async () => {
    const supabase = buildApplyMockSupabase({ authUpdateShouldFail: true, rollbackShouldFail: true });
    await expect(
      applyRoleTemplateToLinkedUser({
        supabase,
        tenantId: TENANT_A,
        collaborator: COLLABORATORS[0],
        tenantUser: TENANT_USERS[0],
        roleSlug: 'gerente',
        confirmOverwrite: false,
        getAuthUserMeta,
      }),
    ).rejects.toMatchObject({ code: 'ROLLBACK_FAILED' });
  });

  it('não altera collaborators', async () => {
    const supabase = buildApplyMockSupabase();
    await applyRoleTemplateToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      roleSlug: 'gerente',
      confirmOverwrite: false,
      getAuthUserMeta,
    });
    expect(supabase.writes.collaborators).toHaveLength(0);
  });

  it('não altera collaborator_uuid ou collaborator_id no update', async () => {
    const supabase = buildApplyMockSupabase();
    await applyRoleTemplateToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      roleSlug: 'gerente',
      confirmOverwrite: false,
      getAuthUserMeta,
    });
    const tuPayload = supabase.writes.tenantUsers[0].payload;
    expect(tuPayload).not.toHaveProperty('collaborator_uuid');
    expect(tuPayload).not.toHaveProperty('collaborator_id');
    expect(tuPayload).not.toHaveProperty('tenant_id');
  });
});

describe('collaboratorsApplyRoleTemplateApi — HTTP handler', () => {
  const getTenantAdminActorOrThrow = vi.fn();
  const getAuthUserMeta = vi.fn();
  const appendAccessAuditToAuthUser = vi.fn();
  const logCollaboratorAccessAudit = vi.fn();
  let supabase;
  let handler;

  beforeEach(() => {
    getTenantAdminActorOrThrow.mockReset();
    getAuthUserMeta.mockReset();
    appendAccessAuditToAuthUser.mockReset();
    logCollaboratorAccessAudit.mockReset();
    supabase = buildApplyMockSupabase();
    getTenantAdminActorOrThrow.mockResolvedValue({
      tenant_id: TENANT_A,
      role: 'master',
    });
    getAuthUserMeta.mockImplementation(async (userId) => {
      const tu = TENANT_USERS.find((row) => row.user_id === userId);
      if (!tu) return null;
      if (tu.has_custom_permissions) {
        return {
          app_metadata: {
            has_custom_permissions: true,
            custom_permissions: Object.fromEntries(CATALOG_IDS.map((id) => [id, true])),
          },
        };
      }
      return { app_metadata: { role: tu.role_slug } };
    });
    handler = createCollaboratorApplyRoleTemplateHandler({
      supabase,
      getTenantAdminActorOrThrow,
      getAuthUserMeta,
      appendAccessAuditToAuthUser,
      logCollaboratorAccessAudit,
    });
  });

  it('401 sem auth', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      body: { role_slug: 'gerente' },
      appAuthUser: null,
    }, res);
    expect(res.statusCode).toBe(401);
  });

  it('403 sem admin', async () => {
    getTenantAdminActorOrThrow.mockRejectedValue(
      new Error('Apenas administradores da clínica podem executar esta ação.'),
    );
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      body: { role_slug: 'gerente' },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it('404 collaborator inexistente no tenant', async () => {
    supabase = buildApplyMockSupabase({
      collaborators: [{ ...COLLABORATORS[0], tenant_id: TENANT_B }],
    });
    handler = createCollaboratorApplyRoleTemplateHandler({
      supabase,
      getTenantAdminActorOrThrow,
      getAuthUserMeta,
      appendAccessAuditToAuthUser,
      logCollaboratorAccessAudit,
    });
    const res = mockRes();
    await handler({
      params: { id: PAULO_ID },
      query: {},
      body: { role_slug: 'gerente' },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('COLLABORATOR_NOT_FOUND');
  });

  it('409 ACCESS_NOT_LINKED para Renata sem tenant_user', async () => {
    const res = mockRes();
    await handler({
      params: { id: RENATA_ID },
      query: {},
      body: { role_slug: 'gerente' },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ACCESS_NOT_LINKED');
  });

  it('409 OVERWRITE_CONFIRMATION_REQUIRED para Melissa', async () => {
    const res = mockRes();
    await handler({
      params: { id: MELISSA_ID },
      query: {},
      body: { role_slug: 'gerente' },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('OVERWRITE_CONFIRMATION_REQUIRED');
  });

  it('200 envelope correto com confirmOverwrite', async () => {
    const res = mockRes();
    await handler({
      params: { id: MELISSA_ID },
      query: {},
      body: { role_slug: 'gerente', confirmOverwrite: true },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({
      collaborator_id: MELISSA_ID,
      tenant_user_id: 'tu-melissa',
      role_slug: 'gerente',
      has_custom_permissions: false,
      source: 'role_permission_defaults',
    });
    expect(res.body.meta.audit_event).toBe('COLLABORATOR_ROLE_TEMPLATE_APPLIED');
    expect(res.body.meta.changed_by).toBe('auth-admin');
    expect(logCollaboratorAccessAudit).toHaveBeenCalled();
  });

  it('400 role inválido', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      body: { role_slug: '' },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_ROLE_SLUG');
  });

  it('404 role sem defaults', async () => {
    supabase = buildApplyMockSupabase({ roleDefaultsBySlug: {} });
    handler = createCollaboratorApplyRoleTemplateHandler({
      supabase,
      getTenantAdminActorOrThrow,
      getAuthUserMeta,
      appendAccessAuditToAuthUser,
      logCollaboratorAccessAudit,
    });
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      body: { role_slug: 'gerente' },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('ROLE_TEMPLATE_NOT_FOUND');
  });

  it('500 se tenant_users update falhar', async () => {
    supabase = buildApplyMockSupabase({ tenantUserUpdateShouldFail: true });
    handler = createCollaboratorApplyRoleTemplateHandler({
      supabase,
      getTenantAdminActorOrThrow,
      getAuthUserMeta,
      appendAccessAuditToAuthUser,
      logCollaboratorAccessAudit,
    });
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      body: { role_slug: 'gerente' },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(500);
  });
});

describe('collaboratorsApplyRoleTemplateApi — segurança operacional', () => {
  it('não usa IndexedDB', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsApplyRoleTemplateApi.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toMatch(/from\s+['"].*(?:\/db\/|indexeddb)/i);
    expect(content).not.toMatch(/\b(withDb|loadDb|indexedDB)\s*\(/i);
  });

  it('produção intocada', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsApplyRoleTemplateApi.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain(PRODUCTION_PROJECT_REF);
    expect(content).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
  });

  it('registra rota POST apply-role-template com core auth/tenant', () => {
    const indexPath = path.join(REPO_ROOT, 'server/index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toMatch(/app\.post\(\s*['"]\/internal\/app\/collaborators\/:id\/apply-role-template['"]/);
    expect(content).toContain('createCollaboratorApplyRoleTemplateHandler');
    expect(content).toContain('requireAppUserCollaboratorsPermissions');
    expect(content).toContain('requireTenantAdminCollaboratorsPermissions');
  });

  it('não escreve em collaborators table', async () => {
    const supabase = buildApplyMockSupabase();
    const getAuthUserMeta = async () => ({ app_metadata: { role: 'atendimento' } });
    await applyRoleTemplateToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      roleSlug: 'gerente',
      confirmOverwrite: false,
      getAuthUserMeta,
    });
    expect(supabase.writes.collaborators).toHaveLength(0);
  });
});

describe('collaboratorsApplyRoleTemplateApi — custom com confirmOverwrite', () => {
  it('limpa has_custom_permissions após apply', async () => {
    const supabase = buildApplyMockSupabase();
    const getAuthUserMeta = async () => ({
      app_metadata: {
        has_custom_permissions: true,
        custom_permissions: { 'perm-001': true },
        permission_overrides: { 'perm-002': false },
      },
    });
    const result = await applyRoleTemplateToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS.find((c) => c.id === MELISSA_ID),
      tenantUser: TENANT_USERS.find((tu) => tu.id === 'tu-melissa'),
      roleSlug: 'gerente',
      confirmOverwrite: true,
      getAuthUserMeta,
    });
    expect(result.has_custom_permissions).toBe(false);
    const authMeta = supabase.writes.auth[0].payload.app_metadata;
    expect(authMeta.has_custom_permissions).toBe(false);
    expect(authMeta.custom_permissions).toBeUndefined();
  });
});

describe('collaboratorsApplyRoleTemplateApi — filtra alien permission', () => {
  it('applied count ignora perm fora do catálogo', async () => {
    const supabase = buildApplyMockSupabase({ includeAlienDefault: true });
    const getAuthUserMeta = async () => ({ app_metadata: {} });
    const result = await applyRoleTemplateToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      roleSlug: 'gerente',
      confirmOverwrite: false,
      getAuthUserMeta,
    });
    expect(result.applied_permissions_count).toBe(GERENTE_DEFAULTS.length);
  });
});

describe('collaboratorsApplyRoleTemplateApi — conflict error type', () => {
  it('409 custom error expõe code', () => {
    const err = new CollaboratorApplyTemplateConflictError('msg', 'ACCESS_NOT_LINKED');
    expect(err.code).toBe('ACCESS_NOT_LINKED');
  });
});

describe('collaboratorsApplyRoleTemplateApi — 404 collaborator fora do tenant via resolver', () => {
  it('resolveCollaboratorInTenant lança not found', async () => {
    const { resolveCollaboratorInTenant } = await import('../../server/lib/collaboratorsPermissionsApi.js');
    const supabase = buildApplyMockSupabase({
      collaborators: [{ ...COLLABORATORS[0], tenant_id: TENANT_B }],
    });
    await expect(
      resolveCollaboratorInTenant(supabase, TENANT_A, JULIANA_ID),
    ).rejects.toBeInstanceOf(CollaboratorPermissionsNotFoundError);
  });
});
