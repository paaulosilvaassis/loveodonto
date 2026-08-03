import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CollaboratorPutPermissionsAuthError,
  CollaboratorPutPermissionsValidationError,
  PRODUCTION_PROJECT_REF,
  buildManualOverrideAppMetadata,
  createCollaboratorPutPermissionsHandler,
  materializeCustomPermissionsMap,
  parsePutPermissionsBody,
  putCollaboratorPermissionsToLinkedUser,
  validatePermissionsAgainstCatalog,
} from '../../server/lib/collaboratorsPutPermissionsApi.js';
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
const ATENDIMENTO_DEFAULTS = CATALOG_IDS.slice(0, 12);

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

function buildPutMockSupabase({
  collaborators = COLLABORATORS,
  tenantUsers = TENANT_USERS,
  catalogIds = CATALOG_IDS,
  roleDefaultsBySlug = { atendimento: ATENDIMENTO_DEFAULTS },
  authUpdateShouldFail = false,
  tenantUserUpdateShouldFail = false,
  rollbackShouldFail = false,
} = {}) {
  const writes = { collaborators: [], tenantUsers: [], auth: [] };
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

  return {
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
            return Promise.resolve({ data: filterRows(filters)[0] || null, error: null });
          },
          then(resolve, reject) {
            return Promise.resolve({ data: filterRows(filters), error: null }).then(resolve, reject);
          },
        });
        return {
          select: () => buildEqChain(),
          update(payload) {
            tenantUserUpdateCalls += 1;
            writes.tenantUsers.push({ call: tenantUserUpdateCalls, payload: { ...payload } });
            if (tenantUserUpdateShouldFail && tenantUserUpdateCalls === 1) {
              return {
                eq: () => ({
                  eq: async () => ({ error: { message: 'tenant_users update failed' } }),
                }),
              };
            }
            if (rollbackShouldFail && tenantUserUpdateCalls > 1) {
              return {
                eq: () => ({
                  eq: async () => ({ error: { message: 'rollback failed' } }),
                }),
              };
            }
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      }
      if (table === 'permission_catalog') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: catalogIds.map((id) => ({ id })), error: null }),
          }),
        };
      }
      if (table === 'role_permission_defaults') {
        return {
          select: () => ({
            eq: (_f, roleSlug) => Promise.resolve({
              data: (roleDefaultsBySlug[roleSlug] || []).map((permission_id) => ({ permission_id })),
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        updateUserById: vi.fn(async (userId, payload) => {
          writes.auth.push({ userId, payload });
          if (authUpdateShouldFail) throw new Error('auth update failed');
          return { data: { user: { id: userId } }, error: null };
        }),
      },
    },
  };
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

describe('collaboratorsPutPermissionsApi — parser', () => {
  it('rejeita tenant_id no body', () => {
    expect(() => parsePutPermissionsBody({
      tenant_id: TENANT_A,
      permissions: { 'perm-001': true },
    })).toThrow(/tenant_id não é aceito/);
  });

  it('rejeita payload inválido', () => {
    expect(() => parsePutPermissionsBody({})).toThrow(CollaboratorPutPermissionsValidationError);
    expect(() => parsePutPermissionsBody({ permissions: [] })).toThrow(/permissions é obrigatório/);
  });

  it('aceita payload válido', () => {
    const parsed = parsePutPermissionsBody({
      permissions: { 'perm-dashboard-view': true },
      reason: 'Ajuste manual',
    });
    expect(parsed.permissions['perm-dashboard-view']).toBe(true);
    expect(parsed.reason).toBe('Ajuste manual');
  });
});

describe('collaboratorsPutPermissionsApi — materialize', () => {
  it('subset parcial herda defaults do role', () => {
    const { effectiveMap, effectiveAllowedCount } = materializeCustomPermissionsMap(
      CATALOG_IDS.slice(0, 5),
      ['perm-001', 'perm-002'],
      { 'perm-001': false },
    );
    expect(effectiveMap['perm-001']).toBe(false);
    expect(effectiveMap['perm-002']).toBe(true);
    expect(effectiveMap['perm-003']).toBe(false);
    expect(effectiveAllowedCount).toBe(1);
  });

  it('validação rejeita permissão inválida', () => {
    expect(() => validatePermissionsAgainstCatalog(['perm-fake'], CATALOG_IDS))
      .toThrow(CollaboratorPutPermissionsValidationError);
    try {
      validatePermissionsAgainstCatalog(['perm-fake'], CATALOG_IDS);
    } catch (err) {
      expect(err.code).toBe('INVALID_PERMISSION');
      expect(err.details.invalid_keys).toContain('perm-fake');
    }
  });

  it('buildManualOverrideAppMetadata define role_template null', () => {
    const meta = buildManualOverrideAppMetadata({}, TENANT_A, 'atendimento', { 'perm-001': true }, {});
    expect(meta.role_template).toBe(null);
    expect(meta.has_custom_permissions).toBe(true);
    expect(meta.role_slug).toBe('atendimento');
  });
});

describe('collaboratorsPutPermissionsApi — putCollaboratorPermissionsToLinkedUser', () => {
  const getAuthUserMeta = vi.fn(async () => ({ app_metadata: { role: 'atendimento' } }));
  const appendAccessAuditToAuthUser = vi.fn();

  beforeEach(() => {
    getAuthUserMeta.mockClear();
    appendAccessAuditToAuthUser.mockClear();
    getAuthUserMeta.mockResolvedValue({ app_metadata: { role: 'atendimento' } });
  });

  it('409 ACCESS_NOT_LINKED sem tenant_user', async () => {
    const supabase = buildPutMockSupabase();
    await expect(putCollaboratorPermissionsToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[1],
      tenantUser: null,
      payloadPermissions: { 'perm-001': true },
      getAuthUserMeta,
    })).rejects.toMatchObject({ code: 'ACCESS_NOT_LINKED' });
  });

  it('preserva role_slug e marca has_custom_permissions', async () => {
    const supabase = buildPutMockSupabase();
    const result = await putCollaboratorPermissionsToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      payloadPermissions: { 'perm-001': true },
      getAuthUserMeta,
      appendAccessAuditToAuthUser,
      actorUserId: 'auth-admin',
    });
    expect(result.role_slug).toBe('atendimento');
    expect(result.has_custom_permissions).toBe(true);
    expect(supabase.writes.tenantUsers[0].payload.has_custom_permissions).toBe(true);
    expect(supabase.writes.tenantUsers[0].payload).not.toHaveProperty('role_slug');
    expect(supabase.writes.tenantUsers[0].payload).not.toHaveProperty('role');
    const authMeta = supabase.writes.auth[0].payload.app_metadata;
    expect(authMeta.role_template).toBe(null);
    expect(Object.keys(authMeta.custom_permissions)).toHaveLength(184);
    expect(appendAccessAuditToAuthUser).toHaveBeenCalled();
  });

  it('Melissa inativa — 184/184 permitido', async () => {
    const supabase = buildPutMockSupabase();
    const fullMap = Object.fromEntries(CATALOG_IDS.map((id) => [id, true]));
    const result = await putCollaboratorPermissionsToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS.find((c) => c.id === MELISSA_ID),
      tenantUser: TENANT_USERS.find((tu) => tu.id === 'tu-melissa'),
      payloadPermissions: fullMap,
      getAuthUserMeta,
    });
    expect(result.effective_allowed_count).toBe(184);
    expect(result.custom_permissions_count).toBe(184);
  });

  it('rollback se Auth falhar', async () => {
    const supabase = buildPutMockSupabase({ authUpdateShouldFail: true });
    await expect(putCollaboratorPermissionsToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      payloadPermissions: { 'perm-001': true },
      getAuthUserMeta,
    })).rejects.toBeInstanceOf(CollaboratorPutPermissionsAuthError);
    expect(supabase.writes.tenantUsers.length).toBe(2);
  });

  it('503 ROLLBACK_FAILED', async () => {
    const supabase = buildPutMockSupabase({ authUpdateShouldFail: true, rollbackShouldFail: true });
    await expect(putCollaboratorPermissionsToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      payloadPermissions: { 'perm-001': true },
      getAuthUserMeta,
    })).rejects.toMatchObject({ code: 'ROLLBACK_FAILED' });
  });

  it('não altera collaborators', async () => {
    const supabase = buildPutMockSupabase();
    await putCollaboratorPermissionsToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      payloadPermissions: { 'perm-001': true },
      getAuthUserMeta,
    });
    expect(supabase.writes.collaborators).toHaveLength(0);
  });

  it('não altera collaborator_uuid ou collaborator_id', async () => {
    const supabase = buildPutMockSupabase();
    await putCollaboratorPermissionsToLinkedUser({
      supabase,
      tenantId: TENANT_A,
      collaborator: COLLABORATORS[0],
      tenantUser: TENANT_USERS[0],
      payloadPermissions: { 'perm-001': true },
      getAuthUserMeta,
    });
    const payload = supabase.writes.tenantUsers[0].payload;
    expect(payload).not.toHaveProperty('collaborator_uuid');
    expect(payload).not.toHaveProperty('collaborator_id');
    expect(payload).not.toHaveProperty('tenant_id');
  });
});

describe('collaboratorsPutPermissionsApi — HTTP handler', () => {
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
    supabase = buildPutMockSupabase();
    getTenantAdminActorOrThrow.mockResolvedValue({ tenant_id: TENANT_A, role: 'master' });
    getAuthUserMeta.mockResolvedValue({ app_metadata: { role: 'atendimento' } });
    handler = createCollaboratorPutPermissionsHandler({
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
      body: { permissions: { 'perm-001': true } },
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
      body: { permissions: { 'perm-001': true } },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it('404 collaborator inexistente', async () => {
    supabase = buildPutMockSupabase({
      collaborators: [{ ...COLLABORATORS[0], tenant_id: TENANT_B }],
    });
    handler = createCollaboratorPutPermissionsHandler({
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
      body: { permissions: { 'perm-001': true } },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(404);
  });

  it('409 sem tenant_user (Renata)', async () => {
    const res = mockRes();
    await handler({
      params: { id: RENATA_ID },
      query: {},
      body: { permissions: { 'perm-001': true } },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ACCESS_NOT_LINKED');
  });

  it('400 tenant_id proibido na query', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: { tenant_id: TENANT_A },
      body: { permissions: { 'perm-001': true } },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TENANT_QUERY_FORBIDDEN');
  });

  it('400 INVALID_PERMISSION', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      body: { permissions: { 'perm-invalid-key': true } },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_PERMISSION');
    expect(res.body.details.invalid_keys).toContain('perm-invalid-key');
  });

  it('400 PAYLOAD_INVALID', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      body: { permissions: {} },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('PAYLOAD_INVALID');
  });

  it('200 envelope correto', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      body: {
        permissions: { 'perm-001': true, 'perm-002': false },
        reason: 'Ajuste manual pela administração',
      },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({
      collaborator_id: JULIANA_ID,
      tenant_user_id: 'tu-juliana',
      role_slug: 'atendimento',
      has_custom_permissions: true,
      custom_permissions_count: 184,
      source: 'manual_override',
    });
    expect(res.body.meta.audit_event).toBe('COLLABORATOR_PERMISSIONS_UPDATED');
    expect(res.body.meta.changed_by).toBe('auth-admin');
    expect(logCollaboratorAccessAudit).toHaveBeenCalled();
  });

  it('500 se tenant_users update falhar', async () => {
    supabase = buildPutMockSupabase({ tenantUserUpdateShouldFail: true });
    handler = createCollaboratorPutPermissionsHandler({
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
      body: { permissions: { 'perm-001': true } },
      appAuthUser: { id: 'auth-admin' },
    }, res);
    expect(res.statusCode).toBe(500);
  });
});

describe('collaboratorsPutPermissionsApi — segurança operacional', () => {
  it('não usa IndexedDB', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsPutPermissionsApi.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toMatch(/from\s+['"].*(?:\/db\/|indexeddb)/i);
    expect(content).not.toMatch(/\b(withDb|loadDb|indexedDB)\s*\(/i);
  });

  it('produção intocada', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsPutPermissionsApi.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain(PRODUCTION_PROJECT_REF);
    expect(content).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
  });

  it('registra rota PUT permissions com core auth/tenant', () => {
    const indexPath = path.join(REPO_ROOT, 'server/index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toMatch(/app\.put\(\s*['"]\/internal\/app\/collaborators\/:id\/permissions['"]/);
    expect(content).toContain('createCollaboratorPutPermissionsHandler');
    expect(content).toContain('requireAppUserCollaboratorsPermissions');
    expect(content).toContain('requireTenantAdminCollaboratorsPermissions');
  });
});

describe('collaboratorsPutPermissionsApi — resolver 404 cross-tenant', () => {
  it('resolveCollaboratorInTenant lança not found', async () => {
    const { resolveCollaboratorInTenant } = await import('../../server/lib/collaboratorsPermissionsApi.js');
    const supabase = buildPutMockSupabase({
      collaborators: [{ ...COLLABORATORS[0], tenant_id: TENANT_B }],
    });
    await expect(
      resolveCollaboratorInTenant(supabase, TENANT_A, JULIANA_ID),
    ).rejects.toBeInstanceOf(CollaboratorPermissionsNotFoundError);
  });
});
