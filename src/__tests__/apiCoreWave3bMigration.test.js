import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getTenantAdminActorOrThrow,
  LEGACY_ADMIN_FORBIDDEN_MESSAGE,
  LEGACY_MEMBERSHIP_MESSAGE,
  readExplicitTenantId,
} from '../../server/lib/tenantAdminActor.js';
import { createRequireLegacyTenantAdmin } from '../../server/core/tenant/legacyTenantMiddleware.js';
import { createTenantContextHandler } from '../../server/lib/tenantContextApi.js';
import { createClinicProfileHandler } from '../../server/lib/clinicProfileApi.js';
import { createUsersListHandler } from '../../server/lib/usersListApi.js';
import { createAppRouteContexts } from '../../server/core/middleware/appRouteContexts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_PATH = path.join(REPO_ROOT, 'server/index.js');

const WAVE3B_EXTRACTED_HANDLERS = [
  'createTenantContextHandler',
  'createClinicProfileHandler',
  'createUsersListHandler',
  'createCollaboratorsAccessAuditHandler',
  'createInvitationsReconcileHandler',
  'createCollaboratorLinkHandler',
  'createCollaboratorProvisionAccessHandler',
  'createInvitationsResendHandler',
  'createUsersPasswordResetHandler',
];

const WAVE3B_ROUTES = [
  { method: 'app.get', path: '/internal/app/tenant-context', handler: 'handleTenantContext' },
  {
    method: 'app.put',
    path: '/internal/app/clinic-profile',
    middleware: ['requireLegacyTenantAdminBody'],
    handler: 'handleClinicProfile',
  },
  { method: 'app.post', path: '/internal/app/collaborators/link', handler: 'handleCollaboratorLink' },
  {
    method: 'app.post',
    path: '/internal/app/collaborators/provision',
    handler: 'handleCollaboratorProvisionAccess',
  },
  { method: 'app.get', path: '/internal/app/users/list', handler: 'handleUsersList' },
  {
    method: 'app.get',
    path: '/internal/app/collaborators/access-audit',
    handler: 'handleCollaboratorsAccessAudit',
  },
  {
    method: 'app.post',
    path: '/internal/app/invitations/reconcile',
    handler: 'handleInvitationsReconcile',
  },
  { method: 'app.post', path: '/internal/app/invitations/resend', handler: 'handleInvitationsResend' },
  { method: 'app.post', path: '/internal/app/users/password-reset', handler: 'handleUsersPasswordReset' },
];

function readIndex() {
  return fs.readFileSync(INDEX_PATH, 'utf8');
}

describe('tenantAdminActor — Core RBAC bridge', () => {
  it('mapeia membership para mensagem legada V2', async () => {
    await expect(
      getTenantAdminActorOrThrow('user-1', '', {
        resolveActiveTenantUser: async () => null,
      }),
    ).rejects.toThrow(LEGACY_MEMBERSHIP_MESSAGE);
  });

  it('mapeia admin para mensagem legada V2', async () => {
    await expect(
      getTenantAdminActorOrThrow('user-1', 'tenant-a', {
        resolveActiveTenantUser: async () => ({
          tenant_id: 'tenant-a',
          role: 'atendimento',
        }),
      }),
    ).rejects.toThrow(LEGACY_ADMIN_FORBIDDEN_MESSAGE);
  });

  it('retorna tenantUser para admin válido', async () => {
    const row = { tenant_id: 'tenant-a', role: 'admin', id: 'tu-1' };
    const result = await getTenantAdminActorOrThrow('user-1', 'tenant-a', {
      resolveActiveTenantUser: async () => row,
    });
    expect(result).toEqual(row);
  });

  it('readExplicitTenantId lê query e body', () => {
    const req = {
      query: { tenant_id: 'from-query' },
      body: { tenant_id: 'from-body' },
    };
    expect(readExplicitTenantId(req, 'query')).toBe('from-query');
    expect(readExplicitTenantId(req, 'body')).toBe('from-body');
    expect(readExplicitTenantId(req, 'both')).toBe('from-query');
  });
});

describe('legacyTenantMiddleware — envelope V2', () => {
  it('retorna 400 { error } em falha admin', async () => {
    const middleware = createRequireLegacyTenantAdmin({
      resolveActiveTenantUser: async () => ({
        tenant_id: 'tenant-a',
        role: 'atendimento',
      }),
      tenantIdSource: 'body',
    });

    const req = { appAuthUser: { id: 'u1' }, body: { tenant_id: 'tenant-a' } };
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
    const next = () => {
      res.body = { next: true };
    };

    await middleware(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: LEGACY_ADMIN_FORBIDDEN_MESSAGE });
  });
});

describe('apiCoreWave3bMigration — handlers extraídos', () => {
  it('index.js não define isTenantAdminRole inline', () => {
    const content = readIndex();
    expect(content).not.toMatch(/function isTenantAdminRole\s*\(/);
    expect(content).toMatch(/from '\.\/core\/rbac\/roles\.js'/);
  });

  it('index.js delega getTenantAdminActorOrThrow ao Core via tenantAdminActor.js', () => {
    const content = readIndex();
    expect(content).toMatch(/resolveTenantAdminActorOrThrow/);
    expect(content).not.toMatch(/if \(!isTenantAdminRole\(actorRole\)\)/);
  });

  it.each(WAVE3B_EXTRACTED_HANDLERS)('index.js importa %s', (factoryName) => {
    expect(readIndex()).toContain(factoryName);
  });

  it.each(WAVE3B_ROUTES)('$method $path usa handler externo', ({ method, path: routePath, handler, middleware = [] }) => {
    const content = readIndex();
    const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(content).toMatch(new RegExp(`${method}\\(\\s*['"]${escaped}['"]`));
    expect(content).toContain(handler);
    for (const mw of middleware) {
      expect(content).toContain(mw);
    }
  });

  it('createAppRouteContexts expõe legacy tenant admin middleware', () => {
    const contexts = createAppRouteContexts({
      supabase: {},
      explainJwtVerifyFailure: () => '',
      normalizeDatabaseError: (_e, fb) => fb,
      isSupabaseNetworkError: () => false,
      resolveActiveTenantUser: async () => null,
      isActiveTenantUserRow: () => false,
      permissionsAdminForbiddenMessage: 'Admin only.',
    });
    expect(contexts.legacy.requireTenantAdminBody).toBeTypeOf('function');
    expect(contexts.legacy.requireTenantAdminQuery).toBeTypeOf('function');
  });
});

describe('usersListApi — contrato TENANT_REQUIRED preservado', () => {
  it('rejeita ausência de tenant_id antes de admin', async () => {
    const handler = createUsersListHandler({
      supabase: {},
      getTenantAdminActorOrThrow: async () => {
        throw new Error('admin não deveria ser chamado');
      },
      normalizeEmail: (v) => v,
      normalizeRoleValue: (v, fb) => v || fb,
      normalizeInvitationStatus: () => 'none',
      getValidAuthUserId: async () => null,
      getAuthUserMeta: async () => null,
      extractPermissionFieldsFromAppMetadata: () => ({}),
      normalizeDatabaseError: (_e, fb) => fb,
    });

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

    await handler({ appAuthUser: { id: 'u1' }, query: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'tenant_id é obrigatório na query string.',
      code: 'TENANT_REQUIRED',
    });
  });
});

describe('tenantContextApi — membership envelope', () => {
  it('retorna 403 TENANT_MEMBERSHIP_REQUIRED sem vínculo', async () => {
    const handler = createTenantContextHandler({
      supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({}) }) }) }) },
      resolveActiveTenantUser: async () => null,
      isActiveTenantUserRow: () => true,
      isOptionalTenantLimitsError: () => false,
      isMissingHasSystemAccessColumnError: () => false,
      resolveClinicProfileForTenant: async () => null,
      enrichTeamRosterWithPermissionFields: async (rows) => rows,
      getAuthUserMeta: async () => null,
      extractPermissionFieldsFromAppMetadata: () => ({}),
      buildModuleMap: () => ({}),
      buildFeatureFlags: () => ({}),
      normalizeStatus: (v) => v,
      normalizeDatabaseError: (_e, fb) => fb,
    });

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

    await handler({ appAuthUser: { id: 'u1', email: 'a@b.com' }, query: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });
});

describe('clinicProfileApi — logo data URL guard', () => {
  it('rejeita logo_url data:', async () => {
    const handler = createClinicProfileHandler({
      supabase: {},
      upsertClinicProfileForTenant: async () => ({}),
      resolveClinicProfileForTenant: async () => ({}),
      normalizeDatabaseError: (_e, fb) => fb,
    });

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

    await handler({
      tenantContext: { tenantId: 'tenant-a' },
      body: { logo_url: 'data:image/png;base64,abc' },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('LOGO_MUST_BE_STORAGE_URL');
  });
});
