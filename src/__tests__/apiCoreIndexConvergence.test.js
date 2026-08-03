import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppRouteContexts } from '../../server/core/middleware/appRouteContexts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_PATH = path.join(REPO_ROOT, 'server/index.js');
const CONTEXTS_PATH = path.join(REPO_ROOT, 'server/core/middleware/appRouteContexts.js');

const PHASE4_ROUTES = [
  {
    method: 'app.get',
    path: '/internal/app/collaborators',
    middleware: ['requireAppUserCollaboratorsList', 'requireTenantMembershipCollaboratorsList'],
  },
  {
    method: 'app.get',
    path: '/internal/app/collaborators/:id/permissions',
    middleware: ['requireAppUserCollaboratorsPermissions', 'requireTenantAdminCollaboratorsPermissions'],
  },
  {
    method: 'app.post',
    path: '/internal/app/collaborators/:id/apply-role-template',
    middleware: ['requireAppUserCollaboratorsPermissions', 'requireTenantAdminCollaboratorsPermissions'],
  },
  {
    method: 'app.put',
    path: '/internal/app/collaborators/:id/permissions',
    middleware: ['requireAppUserCollaboratorsPermissions', 'requireTenantAdminCollaboratorsPermissions'],
  },
  {
    method: 'app.post',
    path: '/internal/app/assets/logo',
    middleware: ['requireAppUserAssetsWrite', 'requireTenantAdminAssetsWrite'],
  },
  {
    method: 'app.post',
    path: '/internal/app/assets/avatar',
    middleware: ['requireAppUserAssetsWrite', 'requireTenantAdminAssetsWrite'],
  },
  {
    method: 'app.get',
    path: '/internal/app/assets/avatar/:collaboratorId',
    middleware: ['requireAppUserAssetsRead', 'requireTenantMembershipAssetsRead'],
  },
  {
    method: 'app.get',
    path: '/internal/app/debug-user-context',
    middleware: [
      'assertNonProductionDebugUserContext',
      'requireAppUserDebugUserContext',
      'requireTenantAdminDebugUserContext',
    ],
  },
];

const LEGACY_APP_ROUTES_USING_CORE_AUTH = [
  '/internal/app/tenant-context',
  '/internal/app/clinic-profile',
  '/internal/app/collaborators/link',
  '/internal/app/collaborators/provision',
  '/internal/app/collaborators/access-bundle',
  '/internal/app/users/create',
  '/internal/app/invitations/resend',
  '/internal/app/users/password-reset',
  '/internal/app/collaborators/access-audit',
  '/internal/app/invitations/reconcile',
  '/internal/app/users/list',
  '/internal/app/users/:tenantUserId/access',
  '/internal/app/users/:tenantUserId',
  '/internal/app/collaborators/:collaboratorId/access',
  '/internal/app/contracts/generated',
];

function readIndex() {
  return fs.readFileSync(INDEX_PATH, 'utf8');
}

describe('apiCoreIndexConvergence — Wave 3A', () => {
  it('index.js não define requireAppUser inline legado', () => {
    const content = readIndex();
    expect(content).not.toMatch(/async function requireAppUser\s*\(/);
  });

  it('index.js não instancia createRequireAppUser diretamente', () => {
    const content = readIndex();
    expect(content).not.toMatch(/createRequireAppUser\s*\(/);
    expect(content).toMatch(/createAppRouteContexts\s*\(/);
  });

  it('index.js não instancia createRequireTenantMembership/Admin diretamente', () => {
    const content = readIndex();
    expect(content).not.toMatch(/createRequireTenantMembership\s*\(/);
    expect(content).not.toMatch(/createRequireTenantAdmin\s*\(/);
  });

  it('appRouteContexts.js centraliza Core Auth/Tenant', () => {
    const content = fs.readFileSync(CONTEXTS_PATH, 'utf8');
    expect(content).toMatch(/createRequireAppUser/);
    expect(content).toMatch(/createRequireTenantMembership/);
    expect(content).toMatch(/createRequireTenantAdmin/);
    expect(content).toMatch(/createAssertNonProductionDebug/);
    expect(content).toMatch(/export function createAppRouteContexts/);
  });

  it('createAppRouteContexts expõe contextos auth/collaborators/assets/debug/access', () => {
    const contexts = createAppRouteContexts({
      supabase: {},
      explainJwtVerifyFailure: () => '',
      normalizeDatabaseError: (_e, fb) => fb,
      isSupabaseNetworkError: () => false,
      resolveActiveTenantUser: async () => null,
      isActiveTenantUserRow: () => false,
      permissionsAdminForbiddenMessage: 'Admin only.',
    });

    expect(contexts.auth.requireAppUser).toBeTypeOf('function');
    expect(contexts.collaborators.list.requireAppUser).toBe(contexts.auth.requireAppUser);
    expect(contexts.collaborators.permissions.requireAppUser).toBe(contexts.auth.requireAppUser);
    expect(contexts.assets.write.requireAppUser).toBe(contexts.auth.requireAppUser);
    expect(contexts.assets.read.requireAppUser).toBe(contexts.auth.requireAppUser);
    expect(contexts.debug.requireAppUser).toBe(contexts.auth.requireAppUser);
    expect(contexts.access.requireAppUser).toBe(contexts.auth.requireAppUser);
    expect(contexts.collaborators.list.requireTenantMembership).toBeTypeOf('function');
    expect(contexts.collaborators.permissions.requireTenantAdmin).toBeTypeOf('function');
    expect(contexts.assets.read.requireTenantMembership).toBe(
      contexts.collaborators.list.requireTenantMembership,
    );
    expect(contexts.debug.assertNonProductionDebug).toBeTypeOf('function');
  });

  it.each(PHASE4_ROUTES)('Phase 4 $method $path usa middleware Core', ({ method, path: routePath, middleware }) => {
    const content = readIndex();
    const routePattern = new RegExp(
      `${method}\\(\\s*['"]${routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
    );
    expect(content).toMatch(routePattern);
    for (const mw of middleware) {
      expect(content, `middleware ${mw} ausente para ${routePath}`).toContain(mw);
    }
  });

  it.each(LEGACY_APP_ROUTES_USING_CORE_AUTH)('rota legada %s usa requireAppUser Core singleton', (routePath) => {
    const content = readIndex();
    const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(content).toMatch(new RegExp(`['"]${escaped}['"][\\s\\S]{0,120}requireAppUser`));
  });

  it('identityRoutes recebe requireAppUser Core', () => {
    const content = readIndex();
    expect(content).toMatch(/identityRoutes\(\{[\s\S]*requireAppUser/);
    expect(content).toMatch(/const \{ requireAppUser \} = appRouteContexts\.auth/);
  });

  it('getTenantAdminActorOrThrow delega ao Core via tenantAdminActor.js', () => {
    const content = readIndex();
    expect(content).toMatch(/resolveTenantAdminActorOrThrow/);
    expect(content).toMatch(/getTenantAdminActorOrThrow,/);
  });

  it('platform bundle registra rotas /internal/platform via mountPlatformRoutes', () => {
    const content = readIndex();
    expect(content).toMatch(/const platform = createPlatformDependencies/);
    expect(content).toContain('mountPlatformRoutes(app)');
    expect(content).not.toMatch(/async function requireConsoleAccess/);
    const bundle = fs.readFileSync(
      path.join(REPO_ROOT, 'server/lib/platform/registerPlatformRoutes.js'),
      'utf8',
    );
    expect(bundle).toContain('requireConsoleAccess');
  });
});
