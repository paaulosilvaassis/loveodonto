import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CollaboratorPermissionsNotFoundError,
  CollaboratorsListQueryError,
  PRODUCTION_PROJECT_REF,
  assertNoTenantIdQueryParam,
  buildAccessBlock,
  countAllowedPermissions,
  createCollaboratorPermissionsHandler,
  effectiveMapFromSparseOverrides,
  extractPermissionFieldsFromAppMetadata,
  pickLinkedTenantUser,
  resolveCollaboratorInTenant,
  resolveLinkedTenantUser,
  resolvePermissionStateFromSources,
  resolveAdminTenantForPermissions,
} from '../../server/lib/collaboratorsPermissionsApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const TENANT_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const PAULO_ID = 'a1000001-0001-4001-8001-000000000001';
const JULIANA_ID = 'a1000002-0002-4002-8002-000000000002';
const RENATA_ID = 'a1000003-0003-4003-8003-000000000003';
const MELISSA_ID = 'a1000004-0004-4004-8004-000000000004';

const CATALOG_IDS = Array.from({ length: 184 }, (_, i) => `perm-${String(i + 1).padStart(3, '0')}`);

const COLLABORATORS = [
  {
    id: PAULO_ID,
    tenant_id: TENANT_A,
    legacy_id: 'col-paulo-staging',
    email: 'paulo+staging@implanprime.test',
    apelido: 'Dr. Paulo',
    nome_completo: 'Paulo',
    status: 'ativo',
    deleted_at: null,
  },
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
    id: 'tu-paulo',
    tenant_id: TENANT_A,
    user_id: 'auth-paulo',
    email: 'paulo+staging@implanprime.test',
    role: 'master',
    role_slug: 'master',
    status: 'active',
    is_active: true,
    has_system_access: true,
    collaborator_id: 'col-paulo-staging',
    collaborator_uuid: PAULO_ID,
    has_custom_permissions: false,
    invitation_status: 'accepted',
  },
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
    invitation_status: 'accepted',
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
    invitation_status: 'accepted',
  },
];

const ROLE_DEFAULTS_ATENDIMENTO = CATALOG_IDS.slice(0, 12);

function buildPermissionsMockSupabase({
  collaborators = COLLABORATORS,
  tenantUsers = TENANT_USERS,
  catalogIds = CATALOG_IDS,
  roleDefaults = ROLE_DEFAULTS_ATENDIMENTO,
} = {}) {
  const writes = [];

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
      if (table === 'collaborators') {
        return collaboratorsChain();
      }
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
        };
      }
      if (table === 'permission_catalog') {
        return {
          select() {
            return {
              order() {
                return Promise.resolve({
                  data: catalogIds.map((id) => ({ id })),
                  error: null,
                });
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
                const ids = roleSlug === 'master'
                  ? catalogIds
                  : roleDefaults;
                return Promise.resolve({
                  data: ids.map((permission_id) => ({ permission_id })),
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === 'tenant_user_permissions') {
        writes.push({ table, op: 'access' });
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        getUserById: vi.fn(async (userId) => {
          const tu = tenantUsers.find((row) => row.user_id === userId);
          if (!tu) return { data: null, error: null };
          const customMap = tu.has_custom_permissions
            ? Object.fromEntries(catalogIds.map((id) => [id, true]))
            : null;
          return {
            data: {
              user: {
                id: userId,
                app_metadata: tu.has_custom_permissions
                  ? { has_custom_permissions: true, custom_permissions: customMap }
                  : {},
              },
            },
            error: null,
          };
        }),
        updateUserById: vi.fn(async () => {
          writes.push({ table: 'auth.admin', op: 'updateUserById' });
          return { data: null, error: null };
        }),
      },
    },
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

describe('collaboratorsPermissionsApi — permission math', () => {
  it('extrai custom permissions do app_metadata', () => {
    const meta = extractPermissionFieldsFromAppMetadata({
      has_custom_permissions: true,
      custom_permissions: { 'perm-001': true, 'perm-002': false },
    });
    expect(meta.has_custom_permissions).toBe(true);
    expect(meta.custom_permissions['perm-001']).toBe(true);
  });

  it('calcula effective_permissions a partir de sparse overrides', () => {
    const roleSet = new Set(['perm-001', 'perm-002']);
    const effective = effectiveMapFromSparseOverrides(
      { 'perm-002': false, 'perm-003': true },
      roleSet,
      ['perm-001', 'perm-002', 'perm-003'],
    );
    expect(effective).toEqual({
      'perm-001': true,
      'perm-002': false,
      'perm-003': true,
    });
    expect(countAllowedPermissions(effective)).toBe(2);
  });

  it('resolvePermissionStateFromSources aplica custom full map', () => {
    const custom = Object.fromEntries(CATALOG_IDS.map((id) => [id, true]));
    const state = resolvePermissionStateFromSources({
      tenantUser: { role: 'atendimento' },
      appMetadata: { has_custom_permissions: true, custom_permissions: custom },
      catalogIds: CATALOG_IDS,
      roleDefaultIds: ROLE_DEFAULTS_ATENDIMENTO,
    });
    expect(state.has_custom_permissions).toBe(true);
    expect(countAllowedPermissions(state.effective_permissions)).toBe(184);
  });
});

describe('collaboratorsPermissionsApi — resolver', () => {
  it('resolve por UUID', async () => {
    const supabase = buildPermissionsMockSupabase();
    const result = await resolveCollaboratorInTenant(supabase, TENANT_A, JULIANA_ID);
    expect(result.resolved_by).toBe('uuid');
    expect(result.collaborator.id).toBe(JULIANA_ID);
  });

  it('resolve por legacy_id', async () => {
    const supabase = buildPermissionsMockSupabase();
    const result = await resolveCollaboratorInTenant(supabase, TENANT_A, 'col-renata-staging');
    expect(result.resolved_by).toBe('legacy_id');
    expect(result.collaborator.id).toBe(RENATA_ID);
  });

  it('resolve por tenant_users.collaborator_uuid', async () => {
    let idLookupAttempts = 0;
    const supabase = buildPermissionsMockSupabase();
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = (table) => {
      if (table !== 'collaborators') return originalFrom(table);
      const chain = originalFrom(table);
      const originalEq = chain.eq.bind(chain);
      chain.eq = (field, value) => {
        if (field === 'id') {
          idLookupAttempts += 1;
          if (idLookupAttempts === 1) {
            const skipChain = {
              select() { return skipChain; },
              eq() { return skipChain; },
              is() { return skipChain; },
              maybeSingle: async () => ({ data: null, error: null }),
            };
            return skipChain;
          }
        }
        return originalEq(field, value);
      };
      return chain;
    };

    const result = await resolveCollaboratorInTenant(supabase, TENANT_A, JULIANA_ID);
    expect(result.resolved_by).toBe('tenant_user_uuid');
    expect(result.collaborator.id).toBe(JULIANA_ID);
  });

  it('resolve por tenant_users.collaborator_id text', async () => {
    const supabase = buildPermissionsMockSupabase();
    const result = await resolveCollaboratorInTenant(supabase, TENANT_A, 'col-melissa-staging');
    expect(['legacy_id', 'tenant_user_text']).toContain(result.resolved_by);
    expect(result.collaborator.id).toBe(MELISSA_ID);
  });

  it('404 collaborator fora do tenant', async () => {
    const supabase = buildPermissionsMockSupabase({
      collaborators: [{ ...COLLABORATORS[0], tenant_id: TENANT_B }],
    });
    await expect(
      resolveCollaboratorInTenant(supabase, TENANT_A, PAULO_ID),
    ).rejects.toBeInstanceOf(CollaboratorPermissionsNotFoundError);
  });

  it('retorna access.linked=false sem tenant_user', () => {
    const collaborator = COLLABORATORS.find((c) => c.id === RENATA_ID);
    const access = buildAccessBlock(collaborator, null);
    expect(access.linked).toBe(false);
    expect(access.system_status).toBe('none');
  });

  it('retorna inactive para Melissa', () => {
    const collaborator = COLLABORATORS.find((c) => c.id === MELISSA_ID);
    const tenantUser = TENANT_USERS.find((tu) => tu.id === 'tu-melissa');
    const access = buildAccessBlock(collaborator, tenantUser);
    expect(access.linked).toBe(true);
    expect(access.system_status).toBe('inactive');
    expect(access.rh_status).toBe('ativo');
  });

  it('pickLinkedTenantUser prioriza collaborator_uuid', () => {
    const collaborator = COLLABORATORS.find((c) => c.id === JULIANA_ID);
    const picked = pickLinkedTenantUser(TENANT_USERS, collaborator);
    expect(picked.id).toBe('tu-juliana');
  });
});

describe('collaboratorsPermissionsApi — admin tenant', () => {
  it('403 sem tenant / membership', async () => {
    await expect(
      resolveAdminTenantForPermissions({
        authUserId: 'auth-x',
        getTenantAdminActorOrThrow: async () => {
          throw new Error('Usuário sem tenant_users ativo.');
        },
      }),
    ).rejects.toMatchObject({ code: 'TENANT_MEMBERSHIP_REQUIRED' });
  });

  it('403 não-admin', async () => {
    await expect(
      resolveAdminTenantForPermissions({
        authUserId: 'auth-x',
        getTenantAdminActorOrThrow: async () => {
          throw new Error('Apenas administradores da clínica podem executar esta ação.');
        },
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
  });
});

describe('collaboratorsPermissionsApi — HTTP handler', () => {
  const getTenantAdminActorOrThrow = vi.fn();
  const getAuthUserMeta = vi.fn();
  const isTenantAdminRole = (role) => ['owner', 'admin', 'master'].includes(String(role || '').toLowerCase());
  let supabase;
  let handler;

  beforeEach(() => {
    getTenantAdminActorOrThrow.mockReset();
    getAuthUserMeta.mockReset();
    supabase = buildPermissionsMockSupabase();
    getTenantAdminActorOrThrow.mockResolvedValue({
      tenant_id: TENANT_A,
      role: 'master',
      status: 'active',
      is_active: true,
    });
    getAuthUserMeta.mockImplementation(async (userId) => {
      const tu = TENANT_USERS.find((row) => row.user_id === userId);
      if (!tu?.has_custom_permissions) {
        return { app_metadata: {} };
      }
      const customMap = Object.fromEntries(CATALOG_IDS.map((id) => [id, true]));
      return {
        app_metadata: {
          has_custom_permissions: true,
          custom_permissions: customMap,
        },
      };
    });
    handler = createCollaboratorPermissionsHandler({
      supabase,
      getTenantAdminActorOrThrow,
      getAuthUserMeta,
      isTenantAdminRole,
    });
  });

  it('401 sem auth', async () => {
    const res = mockRes();
    await handler({ params: { id: JULIANA_ID }, query: {}, appAuthUser: null }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('403 sem tenant', async () => {
    getTenantAdminActorOrThrow.mockRejectedValue(new Error('Usuário sem tenant_users ativo.'));
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });

  it('403 não-admin', async () => {
    getTenantAdminActorOrThrow.mockRejectedValue(
      new Error('Apenas administradores da clínica podem executar esta ação.'),
    );
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it('400 se query tenant_id enviada', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: { tenant_id: TENANT_A },
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('TENANT_QUERY_FORBIDDEN');
    expect(() => assertNoTenantIdQueryParam({ tenant_id: TENANT_A }))
      .toThrow(CollaboratorsListQueryError);
  });

  it('404 collaborator fora do tenant', async () => {
    supabase = buildPermissionsMockSupabase({
      collaborators: [{ ...COLLABORATORS[0], tenant_id: TENANT_B }],
    });
    handler = createCollaboratorPermissionsHandler({
      supabase,
      getTenantAdminActorOrThrow,
      getAuthUserMeta,
      isTenantAdminRole,
    });
    const res = mockRes();
    await handler({
      params: { id: PAULO_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('COLLABORATOR_NOT_FOUND');
  });

  it('retorna access.linked=false sem user (Renata)', async () => {
    const res = mockRes();
    await handler({
      params: { id: RENATA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.access.linked).toBe(false);
    expect(res.body.data.permissions.effective_allowed_count).toBe(0);
    expect(res.body.data.sources.tenant_user_permissions).toBe('not_migrated');
  });

  it('carrega permission_catalog count 184', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.permissions.catalog_count).toBe(184);
    expect(res.body.data.sources.permission_catalog).toBe('supabase');
  });

  it('carrega role_permission_defaults', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.body.data.permissions.role_defaults).toHaveLength(ROLE_DEFAULTS_ATENDIMENTO.length);
    expect(res.body.data.sources.role_permission_defaults).toBe('supabase');
  });

  it('aplica custom permissions do app_metadata (Melissa)', async () => {
    const res = mockRes();
    await handler({
      params: { id: MELISSA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.access.system_status).toBe('inactive');
    expect(res.body.data.permissions.has_custom_permissions).toBe(true);
    expect(res.body.data.permissions.effective_allowed_count).toBe(184);
    expect(res.body.data.sources.custom_permissions).toBe('app_metadata');
  });

  it('effective_permissions calculado corretamente para Juliana', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.permissions.role_template).toBe('atendimento');
    expect(res.body.data.permissions.effective_allowed_count).toBe(ROLE_DEFAULTS_ATENDIMENTO.length);
    for (const permId of ROLE_DEFAULTS_ATENDIMENTO) {
      expect(res.body.data.permissions.effective_permissions[permId]).toBe(true);
    }
    expect(res.body.data.permissions.effective_permissions['perm-050']).toBe(false);
  });

  it('envelope meta inclui resolved_by', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(res.body.meta).toMatchObject({
      tenant_id: TENANT_A,
      collaborator_ref: JULIANA_ID,
      resolved_by: 'uuid',
      read_only: true,
    });
  });

  it('usa req.tenantContext quando middleware já resolveu tenant admin', async () => {
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
      tenantContext: { tenantId: TENANT_A, mode: 'admin' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.meta.tenant_id).toBe(TENANT_A);
    expect(getTenantAdminActorOrThrow).not.toHaveBeenCalled();
  });
});

describe('collaboratorsPermissionsApi — segurança operacional', () => {
  it('não importa IndexedDB no módulo da API', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsPermissionsApi.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toMatch(/from\s+['"].*(?:\/db\/|indexeddb)/i);
    expect(content).not.toMatch(/\b(withDb|loadDb|indexedDB)\s*\(/i);
  });

  it('não escreve Supabase (read-only)', async () => {
    const supabase = buildPermissionsMockSupabase();
    const handler = createCollaboratorPermissionsHandler({
      supabase,
      getTenantAdminActorOrThrow: async () => ({ tenant_id: TENANT_A, role: 'master' }),
      getAuthUserMeta: async () => ({ app_metadata: {} }),
      isTenantAdminRole: () => true,
    });
    const res = mockRes();
    await handler({
      params: { id: JULIANA_ID },
      query: {},
      appAuthUser: { id: 'auth-1', email: 'a@b.com' },
    }, res);
    expect(supabase.writes).toHaveLength(0);
    expect(supabase.auth.admin.updateUserById).not.toHaveBeenCalled();
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsPermissionsApi.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
  });

  it('produção não tocada', () => {
    const filePath = path.join(REPO_ROOT, 'server/lib/collaboratorsPermissionsApi.js');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain(PRODUCTION_PROJECT_REF);
    expect(content).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
  });

  it('registra rota GET /internal/app/collaborators/:id/permissions com core auth/tenant', () => {
    const indexPath = path.join(REPO_ROOT, 'server/index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toMatch(/app\.get\(\s*['"]\/internal\/app\/collaborators\/:id\/permissions['"]/);
    expect(content).toContain('createCollaboratorPermissionsHandler');
    expect(content).toContain('requireAppUserCollaboratorsPermissions');
    expect(content).toContain('requireTenantAdminCollaboratorsPermissions');
  });
});

describe('collaboratorsPermissionsApi — resolveLinkedTenantUser', () => {
  it('vincula tenant_user por email quando único', async () => {
    const supabase = buildPermissionsMockSupabase({
      tenantUsers: [{
        id: 'tu-renata-email',
        tenant_id: TENANT_A,
        user_id: 'auth-renata',
        email: 'renata+staging@implanprime.test',
        role: 'atendimento',
        status: 'active',
        is_active: true,
        has_system_access: true,
        collaborator_id: null,
        collaborator_uuid: null,
      }],
    });
    const collaborator = COLLABORATORS.find((c) => c.id === RENATA_ID);
    const linked = await resolveLinkedTenantUser(supabase, TENANT_A, collaborator);
    expect(linked?.id).toBe('tu-renata-email');
  });
});
