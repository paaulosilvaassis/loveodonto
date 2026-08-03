import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isInviteEmailDelivered } from '../../server/lib/inviteDeliveryUtils.js';
import { isAuthUserAlreadyRegisteredError } from '../../server/lib/authUserRegisteredUtils.js';
import { createRevokeAuthUserSessions } from '../../server/lib/revokeAuthUserSessions.js';
import { createSendCollaboratorInvite } from '../../server/lib/sendCollaboratorInvite.js';
import { createUpsertInvitationRecord } from '../../server/lib/upsertInvitationRecord.js';
import { createFormatCollaboratorProvisionResponse } from '../../server/lib/formatCollaboratorProvisionResponse.js';
import { createCreateAuthUserForCollaboratorInvite } from '../../server/lib/createAuthUserForCollaboratorInvite.js';
import { createCollaboratorProvisionAccessHandler } from '../../server/lib/collaboratorProvisionAccessApi.js';
import { createUsersCreateHandler } from '../../server/lib/usersCreateApi.js';
import { createCollaboratorsAccessBundleHandler } from '../../server/lib/collaboratorsAccessBundleApi.js';
import { createUsersPasswordResetHandler } from '../../server/lib/usersPasswordResetApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INDEX_PATH = path.join(REPO_ROOT, 'server/index.js');

const WAVE3E_INDEX_IMPORTS = [
  'inviteDeliveryUtils.js',
  'authUserRegisteredUtils.js',
  'revokeAuthUserSessions.js',
  'provisioning/provisioningBundle.js',
];

const WAVE3E_WIRING = [
  'revokeAuthUserSessions = createRevokeAuthUserSessions',
  'const provisioning = createProvisioningDependencies',
  'sendCollaboratorInvite,',
  'formatCollaboratorProvisionResponse,',
];

const IDENTITY_INLINE_REMOVED = [
  'async function sendCollaboratorInvite',
  'async function upsertInvitationRecord',
  'async function revokeAuthUserSessions',
  'function formatCollaboratorProvisionResponse',
  'function isInviteEmailDelivered',
  'function isAuthUserAlreadyRegisteredError',
  'async function createAuthUserForCollaboratorInvite',
];

const APP_ROUTES_NO_INLINE = [
  '/internal/app/collaborators/provision',
  '/internal/app/users/create',
  '/internal/app/collaborators/access-bundle',
  '/internal/app/users/password-reset',
  '/internal/app/contracts/generated',
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

describe('apiCoreWave3eMigration — index wiring identity helpers', () => {
  it.each(WAVE3E_INDEX_IMPORTS.map((f) => [f]))('index.js importa de lib/%s', (file) => {
    expect(readIndex()).toContain(`./lib/${file}`);
  });

  it.each(WAVE3E_WIRING)('index.js instancia %s', (wiring) => {
    expect(readIndex()).toContain(wiring);
  });

  it.each(IDENTITY_INLINE_REMOVED)('index.js não define %s inline', (signature) => {
    expect(readIndex()).not.toMatch(new RegExp(`${signature}\\s*\\(`));
  });

  it('identityService late-binding permanece (let + atribuição createIdentityService)', () => {
    const content = readIndex();
    expect(content).toMatch(/let identityService/);
    expect(content).toMatch(/identityService = createIdentityService\(/);
    const letPos = content.indexOf('let identityService');
    const assignPos = content.indexOf('identityService = createIdentityService');
    expect(assignPos).toBeGreaterThan(letPos);
  });

  it.each(APP_ROUTES_NO_INLINE)('rota %s sem handler async inline', (routePath) => {
    const content = readIndex();
    const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(content).not.toMatch(new RegExp(`${escaped}['"][\\s\\S]{0,80}async \\(req, res\\)`));
  });
});

describe('inviteDeliveryUtils — contrato preservado', () => {
  it('supabase_auth e backend_resend contam como entregue', () => {
    expect(isInviteEmailDelivered({ emailDelivery: 'supabase_auth' })).toBe(true);
    expect(isInviteEmailDelivered({ emailDelivery: 'backend_resend' })).toBe(true);
    expect(isInviteEmailDelivered({ emailDelivery: 'setup_link' })).toBe(false);
  });
});

describe('authUserRegisteredUtils — contrato preservado', () => {
  it('detecta already registered', () => {
    expect(isAuthUserAlreadyRegisteredError({ message: 'User already registered' })).toBe(true);
    expect(isAuthUserAlreadyRegisteredError({ code: 'email_exists' })).toBe(true);
    expect(isAuthUserAlreadyRegisteredError({ message: 'network error' })).toBe(false);
  });
});

describe('revokeAuthUserSessions — contrato preservado', () => {
  it('retorna false quando authUserId vazio', async () => {
    const fn = createRevokeAuthUserSessions({ supabase: {} });
    expect(await fn('')).toBe(false);
  });

  it('chama signOut global e retorna true', async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const fn = createRevokeAuthUserSessions({
      supabase: { auth: { admin: { signOut } } },
    });
    expect(await fn('user-1')).toBe(true);
    expect(signOut).toHaveBeenCalledWith('user-1', 'global');
  });
});

describe('formatCollaboratorProvisionResponse — contrato preservado', () => {
  it('envelope ok com emailSent', () => {
    const format = createFormatCollaboratorProvisionResponse({
      isInviteEmailDelivered: () => true,
      normalizeInvitationStatus: (v) => v || 'none',
    });
    const payload = format({
      tenantUser: { id: 'tu-1', user_id: 'auth-1', invitation_status: 'pending' },
      invitation: { status: 'sent' },
      inviteDelivery: { emailDelivery: 'supabase_auth' },
      repairedBrokenLink: false,
    });
    expect(payload.ok).toBe(true);
    expect(payload.emailSent).toBe(true);
    expect(payload.inviteStatus).toBe('sent');
    expect(payload.message).toContain('Convite enviado por e-mail');
  });
});

describe('createAuthUserForCollaboratorInvite — contrato preservado', () => {
  it('fallback findAuthUserByEmail quando already registered', async () => {
    const findAuthUserByEmail = vi.fn(async () => ({ id: 'existing-1' }));
    const createUser = vi.fn(async () => ({
      error: { message: 'User already registered', status: 422 },
    }));
    const fn = createCreateAuthUserForCollaboratorInvite({
      supabase: { auth: { admin: { createUser } } },
      isAuthUserAlreadyRegisteredError: () => true,
      findAuthUserByEmail,
    });
    const user = await fn({
      normalizedEmail: 'a@test.com',
      tenantId: 't1',
      role: 'atendimento',
      collaboratorId: 'c1',
      collaboratorFullName: 'Nome',
    });
    expect(user).toEqual({ id: 'existing-1' });
    expect(findAuthUserByEmail).toHaveBeenCalledWith('a@test.com');
  });
});

describe('apiCoreWave3eMigration — contratos HTTP handlers inalterados', () => {
  it('collaborators/provision — 400 email ausente antes de identityService', async () => {
    const handler = createCollaboratorProvisionAccessHandler({
      identityService: {
        provisionIdentity: async () => {
          throw new Error('identity não deveria ser chamado');
        },
      },
      normalizeEmail: (v) => v,
      normalizeRoleValue: (v) => v,
      maskEmail: (v) => v,
      logCollabInviteProdAudit: () => {},
      formatProvisionErrorResponse: (_e, fb) => ({ ok: false, error: fb }),
      resolveClientIp: () => '127.0.0.1',
    });
    const res = mockRes();
    await handler({
      appAuthUser: { id: 'admin-1' },
      body: { create_system_access: true, collaborator_id: 'c1', profile_role: 'atendimento' },
      path: '/internal/app/collaborators/provision',
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('E-mail inválido ou ausente');
  });

  it('users/create — 400 validação via createTenantUserFromApp', async () => {
    const handler = createUsersCreateHandler({
      createTenantUserFromApp: async () => {
        throw new Error('email é obrigatório.');
      },
      normalizeEmail: () => '',
      normalizeDatabaseError: (_e, fb) => _e?.message || fb,
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'u1' }, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('email é obrigatório.');
  });

  it('access-bundle — 400 target_user_id obrigatório', async () => {
    const handler = createCollaboratorsAccessBundleHandler({
      supabase: {},
      identityService: null,
      getTenantAdminActorOrThrow: async () => ({ tenant_id: 't1' }),
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
    expect(res.body.error).toBe('target_user_id é obrigatório.');
  });

  it('password-reset — 400 email obrigatório', async () => {
    const handler = createUsersPasswordResetHandler({
      identityService: {},
      getTenantAdminActorOrThrow: async () => ({ tenant_id: 't1' }),
      normalizeEmail: () => '',
      resolveClientIp: () => '127.0.0.1',
      logCollaboratorAccessAudit: () => {},
      appendAccessAuditToAuthUser: async () => {},
    });
    const res = mockRes();
    await handler({ appAuthUser: { id: 'u1' }, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('E-mail é obrigatório para redefinir a senha.');
  });
});
