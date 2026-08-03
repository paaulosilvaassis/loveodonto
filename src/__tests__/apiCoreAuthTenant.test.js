import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseBearerToken,
  resolveAuthUser,
  resolveAuthUserMeta,
} from '../../server/core/auth/resolveAuthUser.js';
import { createRequireAppUser } from '../../server/core/auth/requireAppUser.js';
import {
  FORBIDDEN_TENANT_IDS,
  PRODUCTION_PROJECT_REF,
  resolveAdminTenantContext,
  resolveMembershipTenantContext,
} from '../../server/core/tenant/resolveTenantContext.js';
import { TenantCoreForbiddenError } from '../../server/core/tenant/errors.js';
import { createRequireTenantMembership } from '../../server/core/tenant/requireTenantMembership.js';
import { createRequireTenantAdmin } from '../../server/core/tenant/requireTenantAdmin.js';
import { rejectTenantIdQuery } from '../../server/core/api/validation.js';
import { ApiError } from '../../server/core/api/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const AUTH_USER_ID = 'auth-user-1111-2222-3333-444444444444';

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

function activeTenantUser(overrides = {}) {
  return {
    tenant_id: TENANT_A,
    status: 'active',
    is_active: true,
    role: 'atendimento',
    ...overrides,
  };
}

describe('apiCoreAuthTenant — resolveAuthUser', () => {
  it('resolve token válido', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: AUTH_USER_ID, email: 'a@b.com' } },
          error: null,
        }),
      },
    };

    const result = await resolveAuthUser(supabase, 'valid-token');
    expect(result.ok).toBe(true);
    expect(result.user.id).toBe(AUTH_USER_ID);
    expect(result.accessToken).toBe('valid-token');
  });

  it('rejeita token ausente', async () => {
    const supabase = { auth: { getUser: vi.fn() } };
    const result = await resolveAuthUser(supabase, '');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.body.error).toMatch(/ausente/);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it('rejeita token inválido', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'invalid jwt' },
        }),
      },
    };
    const explainJwtVerifyFailure = vi.fn(() => 'JWT expirado.');
    const result = await resolveAuthUser(supabase, 'bad-token', { explainJwtVerifyFailure });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.body.error).toBe('JWT expirado.');
  });

  it('parseBearerToken extrai Bearer', () => {
    expect(parseBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(parseBearerToken('')).toBe('');
    expect(parseBearerToken('Basic xyz')).toBe('');
  });

  it('resolveAuthUserMeta retorna metadados ou null', async () => {
    const supabase = {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { last_sign_in_at: '2026-01-01', created_at: '2025-01-01', user_metadata: {}, app_metadata: {} } },
            error: null,
          }),
        },
      },
    };
    const meta = await resolveAuthUserMeta(supabase, AUTH_USER_ID);
    expect(meta).toMatchObject({ last_sign_in_at: '2026-01-01' });

    const empty = await resolveAuthUserMeta(supabase, '');
    expect(empty).toBeNull();
  });
});

describe('apiCoreAuthTenant — requireAppUser', () => {
  let supabase;
  let requireAppUser;

  beforeEach(() => {
    supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: AUTH_USER_ID, email: 'a@b.com' } },
          error: null,
        }),
      },
    };
    requireAppUser = createRequireAppUser({
      supabase,
      explainJwtVerifyFailure: () => '',
      normalizeDatabaseError: (_e, fb) => fb,
      isSupabaseNetworkError: () => false,
    });
  });

  it('popula req.appAuthUser e chama next', async () => {
    const req = { headers: { authorization: 'Bearer valid' } };
    const res = mockRes();
    const next = mockNext();
    await requireAppUser(req, res, next);
    expect(req.appAuthUser.id).toBe(AUTH_USER_ID);
    expect(next).toHaveBeenCalled();
  });

  it('401 padronizado sem token', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = mockNext();
    await requireAppUser(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token do app ausente.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('401 padronizado token inválido', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } });
    const req = { headers: { authorization: 'Bearer bad' } };
    const res = mockRes();
    const next = mockNext();
    await requireAppUser(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBeTruthy();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('apiCoreAuthTenant — resolveTenantContext membership', () => {
  const resolveActiveTenantUser = vi.fn();
  const isActiveTenantUserRow = vi.fn(() => true);

  beforeEach(() => {
    resolveActiveTenantUser.mockReset();
    isActiveTenantUserRow.mockReturnValue(true);
  });

  it('resolve membership ativa', async () => {
    resolveActiveTenantUser.mockResolvedValue(activeTenantUser());
    const ctx = await resolveMembershipTenantContext({
      authUserId: AUTH_USER_ID,
      resolveActiveTenantUser,
      isActiveTenantUserRow,
    });
    expect(ctx.tenantId).toBe(TENANT_A);
    expect(ctx.mode).toBe('membership');
    expect(ctx.role).toBe('atendimento');
  });

  it('membership ausente → TENANT_MEMBERSHIP_REQUIRED', async () => {
    resolveActiveTenantUser.mockResolvedValue(null);
    await expect(
      resolveMembershipTenantContext({
        authUserId: AUTH_USER_ID,
        resolveActiveTenantUser,
        isActiveTenantUserRow,
      }),
    ).rejects.toMatchObject({ code: 'TENANT_MEMBERSHIP_REQUIRED' });
  });

  it('membership inativa → TENANT_MEMBERSHIP_REQUIRED', async () => {
    resolveActiveTenantUser.mockResolvedValue(activeTenantUser({ status: 'inactive' }));
    isActiveTenantUserRow.mockReturnValue(false);
    await expect(
      resolveMembershipTenantContext({
        authUserId: AUTH_USER_ID,
        resolveActiveTenantUser,
        isActiveTenantUserRow,
      }),
    ).rejects.toMatchObject({ code: 'TENANT_MEMBERSHIP_REQUIRED' });
  });

  it('TENANT_AMBIGUOUS propagado', async () => {
    resolveActiveTenantUser.mockRejectedValue(Object.assign(new Error('multi'), { code: 'TENANT_AMBIGUOUS' }));
    await expect(
      resolveMembershipTenantContext({
        authUserId: AUTH_USER_ID,
        resolveActiveTenantUser,
        isActiveTenantUserRow,
      }),
    ).rejects.toMatchObject({ code: 'TENANT_AMBIGUOUS' });
  });

  it('tenant_id proibido rejeitado', async () => {
    resolveActiveTenantUser.mockResolvedValue(activeTenantUser({ tenant_id: 'tenant-1' }));
    await expect(
      resolveMembershipTenantContext({
        authUserId: AUTH_USER_ID,
        resolveActiveTenantUser,
        isActiveTenantUserRow,
      }),
    ).rejects.toMatchObject({ code: 'TENANT_FORBIDDEN' });
  });
});

describe('apiCoreAuthTenant — resolveTenantContext admin', () => {
  const resolveActiveTenantUser = vi.fn();

  beforeEach(() => {
    resolveActiveTenantUser.mockReset();
  });

  it('role master/admin/owner permitido', async () => {
    for (const role of ['owner', 'admin', 'master']) {
      resolveActiveTenantUser.mockResolvedValue(activeTenantUser({ role }));
      const ctx = await resolveAdminTenantContext({
        authUserId: AUTH_USER_ID,
        resolveActiveTenantUser,
      });
      expect(ctx.role).toBe(role);
      expect(ctx.mode).toBe('admin');
    }
  });

  it('role comum rejeitado com ADMIN_REQUIRED', async () => {
    resolveActiveTenantUser.mockResolvedValue(activeTenantUser({ role: 'atendimento' }));
    await expect(
      resolveAdminTenantContext({
        authUserId: AUTH_USER_ID,
        resolveActiveTenantUser,
      }),
    ).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
  });
});

describe('apiCoreAuthTenant — middleware tenant', () => {
  const resolveActiveTenantUser = vi.fn();
  const isActiveTenantUserRow = vi.fn(() => true);

  beforeEach(() => {
    resolveActiveTenantUser.mockReset();
    isActiveTenantUserRow.mockReturnValue(true);
  });

  it('requireTenantMembership popula req.tenantContext', async () => {
    resolveActiveTenantUser.mockResolvedValue(activeTenantUser());
    const middleware = createRequireTenantMembership({ resolveActiveTenantUser, isActiveTenantUserRow });
    const req = { appAuthUser: { id: AUTH_USER_ID, email: 'a@b.com' } };
    const res = mockRes();
    const next = mockNext();
    await middleware(req, res, next);
    expect(req.tenantContext.tenantId).toBe(TENANT_A);
    expect(next).toHaveBeenCalled();
  });

  it('requireTenantMembership 403 sem membership', async () => {
    resolveActiveTenantUser.mockResolvedValue(null);
    const middleware = createRequireTenantMembership({ resolveActiveTenantUser, isActiveTenantUserRow });
    const req = { appAuthUser: { id: AUTH_USER_ID, email: 'a@b.com' } };
    const res = mockRes();
    const next = mockNext();
    await middleware(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, code: 'TENANT_MEMBERSHIP_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  it('requireTenantAdmin 403 para role comum', async () => {
    resolveActiveTenantUser.mockResolvedValue(activeTenantUser({ role: 'recepcao' }));
    const middleware = createRequireTenantAdmin({ resolveActiveTenantUser });
    const req = { appAuthUser: { id: AUTH_USER_ID } };
    const res = mockRes();
    const next = mockNext();
    await middleware(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });
});

describe('apiCoreAuthTenant — tenant_id query rejeitado', () => {
  it('rejectTenantIdQuery lança ApiError TENANT_QUERY_FORBIDDEN', () => {
    expect(() => rejectTenantIdQuery({ tenant_id: TENANT_A }))
      .toThrow(expect.objectContaining({ code: 'TENANT_QUERY_FORBIDDEN' }));
  });
});

describe('apiCoreAuthTenant — produção bloqueada', () => {
  it('PRODUCTION_PROJECT_REF documentado nos módulos core', () => {
    expect(PRODUCTION_PROJECT_REF).toBe('uoepkwhqztmsjnzirpev');
    const authPath = path.join(REPO_ROOT, 'server/core/auth/resolveAuthUser.js');
    const tenantPath = path.join(REPO_ROOT, 'server/core/tenant/resolveTenantContext.js');
    const authContent = fs.readFileSync(authPath, 'utf8');
    const tenantContent = fs.readFileSync(tenantPath, 'utf8');
    expect(tenantContent).toContain(PRODUCTION_PROJECT_REF);
    expect(authContent).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
    expect(tenantContent).not.toMatch(new RegExp(`supabase\\.co.*${PRODUCTION_PROJECT_REF}`));
  });

  it('FORBIDDEN_TENANT_IDS inclui placeholders legados', () => {
    expect(FORBIDDEN_TENANT_IDS.has('tenant-1')).toBe(true);
    expect(FORBIDDEN_TENANT_IDS.has('tenant_1')).toBe(true);
  });

  it('core auth/tenant não importa IndexedDB', () => {
    const dirs = [
      path.join(REPO_ROOT, 'server/core/auth'),
      path.join(REPO_ROOT, 'server/core/tenant'),
    ];
    for (const dir of dirs) {
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        expect(content, file).not.toMatch(/indexeddb|withDb|loadDb/i);
      }
    }
  });
});

describe('apiCoreAuthTenant — TenantCoreForbiddenError', () => {
  it('expõe status 403 e code', () => {
    const err = new TenantCoreForbiddenError('Negado.', 'ADMIN_REQUIRED');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.code).toBe('ADMIN_REQUIRED');
  });

  it('ApiError distinto para validação query', () => {
    try {
      rejectTenantIdQuery({ tenant_id: 'x' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(400);
    }
  });
});
