import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvisioningDependencies } from '../../server/lib/provisioning/provisioningBundle.js';
import { PROVISIONING_EXTERNAL_DEP_KEYS } from '../../server/lib/provisioning/provisioningDeps.js';
import { createAssertEmailAvailableForTenantInvite } from '../../server/lib/provisioning/emailAvailabilityPolicy.js';
import { createResolveAuthUserForInvite } from '../../server/lib/provisioning/inviteResolver.js';
import {
  createProvisionCollaboratorAccess,
  createSendPasswordResetFlow,
} from '../../server/lib/provisioning/provisioningOrchestrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_PATH = path.join(REPO_ROOT, 'server/index.js');

const IDENTITY_SERVICE_DEPS = [
  'provisionCollaboratorAccess',
  'clearStaleTenantUserAuthReference',
  'findAuthUserByEmail',
  'getValidAuthUserId',
  'revokeAuthUserSessions',
  'normalizeEmail',
  'normalizeRoleValue',
  'maskEmail',
  'isInviteEmailDelivered',
  'formatCollaboratorProvisionResponse',
  'sendPasswordResetFlow',
  'setCollaboratorAccessState',
];

const PROVISIONING_REMOVED_FROM_INDEX = [
  'async function provisionCollaboratorAccess',
  'async function sendPasswordResetFlow',
  'async function resolveAuthUserForInvite',
  'async function assertEmailAvailableForTenantInvite',
];

function readIndex() {
  return fs.readFileSync(INDEX_PATH, 'utf8');
}

function baseExternalDeps() {
  return {
    supabase: { from: vi.fn() },
    getTenantAdminActorOrThrow: vi.fn(),
    normalizeText: (v) => String(v ?? '').trim(),
    normalizeEmail: (v) => String(v ?? '').trim().toLowerCase(),
    normalizeRoleValue: (v) => v || 'atendimento',
    normalizeInvitationStatus: (v) => v || 'none',
    maskEmail: (v) => v,
    appendAccessAuditToAuthUser: vi.fn(),
    logAccessEmailAudit: vi.fn(),
    getPasswordResetRedirectTo: () => 'https://app.test/reset',
  };
}

describe('apiCoreWave3fMigration — index bootstrap desacoplado', () => {
  it('index importa createProvisioningDependencies', () => {
    expect(readIndex()).toContain("from './lib/provisioning/provisioningBundle.js'");
    expect(readIndex()).toContain('createProvisioningDependencies');
  });

  it('index instancia provisioning = createProvisioningDependencies(...)', () => {
    const content = readIndex();
    expect(content).toMatch(/const provisioning = createProvisioningDependencies\s*\(/);
    expect(content).toMatch(/provisionCollaboratorAccess,\s*\n\s*sendPasswordResetFlow,/);
  });

  it.each(PROVISIONING_REMOVED_FROM_INDEX)('index não define %s inline', (sig) => {
    expect(readIndex()).not.toMatch(new RegExp(`${sig}\\s*\\(`));
  });

  it('identityService recebe mesmas dependências de contrato', () => {
    const content = readIndex();
    const block = content.slice(content.indexOf('identityService = createIdentityService'));
    for (const dep of IDENTITY_SERVICE_DEPS) {
      expect(block, `dep ${dep}`).toContain(dep);
    }
  });

  it('identityService late-binding preservado', () => {
    const content = readIndex();
    expect(content).toMatch(/let identityService/);
    const letPos = content.indexOf('let identityService');
    const assignPos = content.indexOf('identityService = createIdentityService');
    expect(assignPos).toBeGreaterThan(letPos);
  });

  it('rotas /internal/app sem handler async inline', () => {
    const content = readIndex();
    expect(content).not.toMatch(/\/internal\/app\/[^'"]+['"][\\s\\S]{0,80}async \\(req, res\\)/);
  });
});

describe('provisioningDeps — validação de bootstrap', () => {
  it('PROVISIONING_EXTERNAL_DEP_KEYS lista deps mínimas', () => {
    expect(PROVISIONING_EXTERNAL_DEP_KEYS).toContain('supabase');
    expect(PROVISIONING_EXTERNAL_DEP_KEYS).not.toContain('upsertTenantUserAccess');
    expect(PROVISIONING_EXTERNAL_DEP_KEYS.length).toBeGreaterThan(5);
  });

  it('createProvisioningDependencies falha se dep externa ausente', () => {
    const partial = { ...baseExternalDeps() };
    delete partial.supabase;
    expect(() => createProvisioningDependencies(partial)).toThrow(/supabase/);
  });
});

describe('provisioningBundle — dependency injection', () => {
  it('retorna orquestradores e leaves compartilhados', () => {
    const bundle = createProvisioningDependencies(baseExternalDeps());
    expect(bundle.provisionCollaboratorAccess).toBeTypeOf('function');
    expect(bundle.sendPasswordResetFlow).toBeTypeOf('function');
    expect(bundle.assertEmailAvailableForTenantInvite).toBeTypeOf('function');
    expect(bundle.resolveAuthUserForInvite).toBeTypeOf('function');
    expect(bundle.sendCollaboratorInvite).toBeTypeOf('function');
    expect(bundle.upsertInvitationRecord).toBeTypeOf('function');
    expect(bundle.formatCollaboratorProvisionResponse).toBeTypeOf('function');
  });
});

describe('emailAvailabilityPolicy — contrato preservado', () => {
  it('permite e-mail inativo sem duplicata', async () => {
    const fn = createAssertEmailAvailableForTenantInvite({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: 'tu-1', status: 'inactive', has_system_access: false },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      },
      normalizeInvitationStatus: (v) => v || 'none',
      getValidAuthUserId: async () => 'auth-1',
      assertCanAssignEmailToCollaborator: async () => {},
    });
    await expect(fn('tenant-a', 'a@test.com')).resolves.toBeUndefined();
  });

  it('lança EMAIL_ALREADY_HAS_ACCESS para ativo', async () => {
    const fn = createAssertEmailAvailableForTenantInvite({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'tu-1',
                    user_id: 'auth-1',
                    status: 'active',
                    has_system_access: true,
                    invitation_status: 'none',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      },
      normalizeInvitationStatus: (v) => v || 'none',
      getValidAuthUserId: async () => 'auth-1',
      assertCanAssignEmailToCollaborator: async () => {},
    });
    await expect(fn('tenant-a', 'a@test.com')).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_HAS_ACCESS',
    });
  });
});

describe('inviteResolver — contrato preservado', () => {
  it('retorna authUser existente sem sendInvite', async () => {
    const lookupAuthUserByEmail = vi.fn(async () => ({ id: 'auth-1' }));
    const fn = createResolveAuthUserForInvite({
      supabase: {},
      lookupAuthUserByEmail,
      requireAuthUserId: vi.fn(),
      createAuthUserForCollaboratorInvite: vi.fn(),
    });
    const result = await fn({
      normalizedEmail: 'a@test.com',
      sendInvite: false,
      tenantId: 't1',
      role: 'atendimento',
      collaboratorId: 'c1',
      collaboratorFullName: 'Nome',
    });
    expect(result.authUser).toEqual({ id: 'auth-1' });
    expect(result.authUserExisted).toBe(true);
  });
});

describe('provisioningOrchestrator — contrato mínimo', () => {
  it('provisionCollaboratorAccess valida e-mail obrigatório', async () => {
    const fn = createProvisionCollaboratorAccess({
      supabase: {},
      getTenantAdminActorOrThrow: async () => ({ tenant_id: 't1' }),
      normalizeText: (v) => String(v ?? '').trim(),
      normalizeEmail: () => '',
      normalizeRoleValue: () => 'atendimento',
      maskEmail: (v) => v,
      resolveCollaboratorIdForTenantEmailAccess: async () => null,
      clearStaleTenantUserAuthReference: async () => false,
      assertEmailAvailableForTenantInvite: async () => {},
      findAuthUserByEmail: async () => null,
      resolveAuthUserForInvite: async () => ({ authUser: { id: 'a1' }, inviteDelivery: null, authUserExisted: false }),
      assertAuthUserIdForTenantWrite: (id) => id,
      upsertTenantUserAccess: async () => ({ id: 'tu-1' }),
      isInviteEmailDelivered: () => false,
      upsertInvitationRecord: async () => ({}),
      tenantUserSelectBase: 'id',
      isMissingInvitationStatusColumnError: () => false,
      logAccessEmailAudit: () => {},
      appendAccessAuditToAuthUser: async () => {},
    });
    await expect(fn({
      actorAuthUserId: 'admin',
      tenantId: 't1',
      email: '',
      profileRole: 'atendimento',
    })).rejects.toThrow('E-mail é obrigatório para criar acesso.');
  });

  it('sendPasswordResetFlow exige collaboratorId se tenant_user ausente', async () => {
    const fn = createSendPasswordResetFlow({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      },
      normalizeEmail: (v) => v,
      normalizeRoleValue: (v) => v,
      normalizeInvitationStatus: (v) => v,
      provisionCollaboratorAccess: vi.fn(),
      formatCollaboratorProvisionResponse: vi.fn(),
      clearStaleTenantUserAuthReference: vi.fn(),
      getValidAuthUserId: vi.fn(),
      findAuthUserByEmail: vi.fn(),
      createAuthUserForCollaboratorInvite: vi.fn(),
      assertAuthUserIdForTenantWrite: (id) => id,
      sendCollaboratorInvite: vi.fn(),
      isInviteEmailDelivered: () => false,
      getPasswordResetRedirectTo: () => 'https://x',
    });
    await expect(fn({
      actorAuthUserId: 'admin',
      tenantId: 't1',
      email: 'a@test.com',
      collaboratorId: '',
    })).rejects.toThrow('Salve o acesso do colaborador antes de redefinir a senha.');
  });
});
