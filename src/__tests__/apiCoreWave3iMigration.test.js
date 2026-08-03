import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlatformDependencies } from '../../server/lib/platform/platformBundle.js';
import { PLATFORM_EXTERNAL_DEP_KEYS } from '../../server/lib/platform/platformDeps.js';
import { buildModuleMap } from '../../server/lib/platform/moduleMap.js';
import { createBuildFeatureFlags } from '../../server/lib/platform/featureFlags.js';
import { createFormatProvisionErrorResponse } from '../../server/lib/platform/provisionErrorFormatter.js';
import { createInsertAuditLog } from '../../server/lib/platform/consoleAudit.js';
import { createConsoleAccess } from '../../server/lib/platform/consoleAccess.js';
import { createOnboardingPublicHandlers } from '../../server/lib/platform/onboardingPublicApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_PATH = path.join(REPO_ROOT, 'server/index.js');

const WAVE3I_REMOVED_FROM_INDEX = [
  'function buildModuleMap',
  'function buildFeatureFlags',
  'async function createAuthUserAndTenantLink',
  'function formatProvisionErrorResponse',
  'async function insertAuditLog',
  'async function getConsoleActorFromBearerToken',
  'async function requireConsoleAccess',
];

const PLATFORM_INLINE_ROUTES = [
  "app.get('/internal/platform/console-profile', async",
  "app.post('/internal/platform/provision-user', requireConsoleAccess, async",
  "app.post('/internal/platform/dev/reset-console-admin', async",
  "app.post('/internal/platform/tenants/provision', requireConsoleAccess, async",
  "app.get('/public/platform/onboarding/terms', async",
  "app.post('/public/platform/onboarding/accept-terms', async",
];

const IDENTITY_SERVICE_DEPS = [
  'provisionCollaboratorAccess',
  'clearStaleTenantUserAuthReference',
  'findAuthUserByEmail',
  'getValidAuthUserId',
];

function readIndex() {
  return fs.readFileSync(INDEX_PATH, 'utf8');
}

function basePlatformDeps() {
  return {
    supabase: {
      auth: { admin: {}, getUser: vi.fn() },
      from: vi.fn(() => ({ insert: vi.fn(async () => ({ error: null })) })),
    },
    normalizeText: (v) => String(v ?? '').trim(),
    normalizeEmail: (v) => String(v ?? '').trim().toLowerCase(),
    normalizeDatabaseError: (_e, fb) => fb,
    explainJwtVerifyFailure: () => '',
    normalizeStatus: (v) => v,
    normalizePlanCode: (v) => v,
    assertAuthUserIdForTenantWrite: (id) => id,
    identityLog: vi.fn(),
    isIdentityProvisionError: () => false,
    planConfig: { start: { modules: [], limits: {}, priceCents: 0, label: 'Start' } },
    platformApiKey: 'key',
    ensureConsoleAdminCredentials: vi.fn(),
    nodeEnv: 'test',
  };
}

describe('apiCoreWave3iMigration — index sem platform inline', () => {
  it.each(WAVE3I_REMOVED_FROM_INDEX)('index não define %s', (sig) => {
    expect(readIndex()).not.toMatch(new RegExp(`${sig}\\s*\\(`));
  });

  it.each(PLATFORM_INLINE_ROUTES)('index não registra rota platform inline %s', (snippet) => {
    expect(readIndex()).not.toContain(snippet);
  });

  it('index instancia platform = createPlatformDependencies(...)', () => {
    const content = readIndex();
    expect(content).toContain("from './lib/platform/platformBundle.js'");
    expect(content).toMatch(/const platform = createPlatformDependencies\s*\(/);
    expect(content).toContain('mountPlatformRoutes(app)');
  });

  it('index mantém três bundles: membership, provisioning, platform', () => {
    const content = readIndex();
    expect(content).toMatch(/const membership = createMembershipDependencies/);
    expect(content).toMatch(/const provisioning = createProvisioningDependencies/);
    expect(content).toMatch(/const platform = createPlatformDependencies/);
  });

  it('identityService permanece compatível', () => {
    const block = readIndex().slice(readIndex().indexOf('identityService = createIdentityService'));
    for (const dep of IDENTITY_SERVICE_DEPS) {
      expect(block, `dep ${dep}`).toContain(dep);
    }
  });
});

describe('platformDeps — bootstrap', () => {
  it('PLATFORM_EXTERNAL_DEP_KEYS mínimas', () => {
    expect(PLATFORM_EXTERNAL_DEP_KEYS).toContain('supabase');
    expect(PLATFORM_EXTERNAL_DEP_KEYS).toContain('ensureConsoleAdminCredentials');
  });

  it('createPlatformDependencies falha sem planConfig', () => {
    const partial = { ...basePlatformDeps() };
    delete partial.planConfig;
    expect(() => createPlatformDependencies(partial)).toThrow(/planConfig/);
  });
});

describe('moduleMap — contrato', () => {
  it('mapeia module_key para boolean', () => {
    expect(buildModuleMap([{ module_key: 'crm', enabled: true }])).toEqual({ CRM: true });
    expect(buildModuleMap([{ module_key: 'crm', enabled: false }])).toEqual({ CRM: false });
  });
});

describe('featureFlags — contrato', () => {
  it('merge global + tenant flags', () => {
    const fn = createBuildFeatureFlags({ normalizeText: (v) => v });
    expect(fn(
      [{ flag_key: 'a', enabled: true }],
      [{ flag_key: 'b', enabled: false }],
    )).toEqual({ a: true, b: false });
  });
});

describe('provisionErrorFormatter — contrato', () => {
  it('mapeia stale auth para mensagem amigável', () => {
    const fn = createFormatProvisionErrorResponse({
      normalizeDatabaseError: () => 'sem conta no auth',
      isIdentityProvisionError: () => false,
    });
    const result = fn(new Error('x'));
    expect(result.message).toContain('tentará corrigir o vínculo');
    expect(result.ok).toBe(false);
  });
});

describe('consoleAudit — insertAuditLog', () => {
  it('insere em audit_logs', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const fn = createInsertAuditLog({
      supabase: { from: () => ({ insert }) },
    });
    await fn({
      actor: { id: 'a1', role: 'super_admin', email: 'a@test.com' },
      action: 'tenant.provision.completed',
      targetType: 'tenant',
      targetId: 't1',
      tenantId: 't1',
    });
    expect(insert).toHaveBeenCalled();
  });
});

describe('consoleAccess — actor e middleware', () => {
  it('requireConsoleAccess aceita x-platform-key sem Bearer', async () => {
    const { requireConsoleAccess } = createConsoleAccess({
      supabase: {},
      explainJwtVerifyFailure: () => '',
      platformApiKey: 'secret-key',
    });
    const req = { headers: { 'x-platform-key': 'secret-key' } };
    const res = { status: vi.fn(() => res), json: vi.fn() };
    const next = vi.fn();
    await requireConsoleAccess(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.platformActor.role).toBe('system');
  });

  it('requireConsoleAccess prioriza Bearer sobre x-platform-key', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        id: '2c649ba5-d91f-46d2-bda9-245e5f4a1674',
        email: 'admin@loveodonto.com',
        full_name: 'Admin Love Odonto',
        role_slug: 'super_admin',
        is_active: true,
      },
      error: null,
    }));
    const { requireConsoleAccess } = createConsoleAccess({
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: '2c649ba5-d91f-46d2-bda9-245e5f4a1674', email: 'admin@loveodonto.com' } },
            error: null,
          })),
        },
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle })),
            })),
          })),
        })),
      },
      explainJwtVerifyFailure: () => '',
      platformApiKey: 'secret-key',
    });
    const req = {
      headers: {
        authorization: 'Bearer user-jwt',
        'x-platform-key': 'secret-key',
      },
    };
    const res = { status: vi.fn(() => res), json: vi.fn() };
    const next = vi.fn();
    await requireConsoleAccess(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.platformActor.role).toBe('super_admin');
    expect(req.platformActor.email).toBe('admin@loveodonto.com');
  });
});

describe('onboardingPublicApi — contrato', () => {
  it('terms exige token', async () => {
    const { handleOnboardingTerms } = createOnboardingPublicHandlers({
      supabase: {},
      findLegalProfileByToken: vi.fn(),
      buildTermsPreview: vi.fn(),
      acceptTermsByToken: vi.fn(),
    });
    const res = { status: vi.fn(() => res), json: vi.fn() };
    await handleOnboardingTerms({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('platformBundle — exports', () => {
  it('expõe builders e mountPlatformRoutes', () => {
    const bundle = createPlatformDependencies(basePlatformDeps());
    expect(bundle.buildModuleMap).toBeTypeOf('function');
    expect(bundle.buildFeatureFlags).toBeTypeOf('function');
    expect(bundle.formatProvisionErrorResponse).toBeTypeOf('function');
    expect(bundle.mountPlatformRoutes).toBeTypeOf('function');
    expect(bundle.requireConsoleAccess).toBeTypeOf('function');
  });
});
