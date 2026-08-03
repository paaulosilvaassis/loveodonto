import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertAuthUserIdForTenantWrite,
  IdentityProvisionError,
} from '../../server/identity/identityProvisionErrors.js';
import {
  lookupAuthUserByEmail,
  recoverAuthUserAfterEmailExists,
  requireAuthUserId,
} from '../../server/identity/identityAuthResolver.js';
import { dispatchCollaboratorInvite } from '../../server/collaboratorInviteDispatch.js';

const AUTH_USER = {
  id: 'auth-user-abc',
  email: 'colaborador@clinica.com',
  last_sign_in_at: null,
};

function buildAuthSupabase({
  listUsers = [],
  listUsersSequence = null,
  inviteError = null,
  inviteUser = null,
} = {}) {
  let listCall = 0;
  const resolveListUsers = () => {
    if (Array.isArray(listUsersSequence) && listUsersSequence.length > 0) {
      const idx = Math.min(listCall, listUsersSequence.length - 1);
      listCall += 1;
      return listUsersSequence[idx];
    }
    return listUsers;
  };
  return {
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({ data: { users: resolveListUsers() }, error: null })),
        inviteUserByEmail: vi.fn(async () => ({
          data: { user: inviteUser },
          error: inviteError,
        })),
        generateLink: vi.fn(async () => ({
          data: { properties: { action_link: 'https://example.com/recovery' } },
          error: null,
        })),
      },
    },
  };
}

describe('identityProvisionErrors', () => {
  it('assertAuthUserIdForTenantWrite bloqueia user_id NULL antes do banco', () => {
    expect(() => assertAuthUserIdForTenantWrite(null)).toThrow(IdentityProvisionError);
    expect(() => assertAuthUserIdForTenantWrite('')).toThrow(IdentityProvisionError);
    try {
      assertAuthUserIdForTenantWrite(null);
    } catch (err) {
      expect(err.code).toBe('AUTH_USER_NOT_FOUND');
    }
    expect(assertAuthUserIdForTenantWrite('auth-123')).toBe('auth-123');
  });
});

describe('identityAuthResolver', () => {
  it('lookupAuthUserByEmail retorna usuário existente', async () => {
    const supabase = buildAuthSupabase({ listUsers: [AUTH_USER] });
    const user = await lookupAuthUserByEmail(supabase, AUTH_USER.email);
    expect(user?.id).toBe(AUTH_USER.id);
  });

  it('recoverAuthUserAfterEmailExists recupera após email_exists', async () => {
    const supabase = buildAuthSupabase({ listUsers: [AUTH_USER] });
    const user = await recoverAuthUserAfterEmailExists(supabase, AUTH_USER.email);
    expect(user.id).toBe(AUTH_USER.id);
  });

  it('recoverAuthUserAfterEmailExists falha se auth não encontrado', async () => {
    const supabase = buildAuthSupabase({ listUsers: [] });
    await expect(
      recoverAuthUserAfterEmailExists(supabase, 'inexistente@clinica.com'),
    ).rejects.toMatchObject({ code: 'AUTH_USER_NOT_FOUND' });
  });

  it('requireAuthUserId usa explicitUser quando disponível', async () => {
    const supabase = buildAuthSupabase();
    const user = await requireAuthUserId(supabase, AUTH_USER.email, { explicitUser: AUTH_USER });
    expect(user.id).toBe(AUTH_USER.id);
  });

  it('requireAuthUserId recupera após email_exists', async () => {
    const supabase = buildAuthSupabase({ listUsers: [AUTH_USER] });
    const user = await requireAuthUserId(supabase, AUTH_USER.email, {
      afterInviteError: { code: 'email_exists', message: 'User already registered' },
    });
    expect(user.id).toBe(AUTH_USER.id);
  });
});

describe('dispatchCollaboratorInvite — fluxo fail-safe', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_APP_ANON_KEY', '');
    vi.stubEnv('EMAIL_API_KEY', '');
    vi.stubEnv('EMAIL_FROM_ADDRESS', '');
    vi.stubEnv('APP_URL', 'http://localhost:5176');
    vi.stubEnv('APP_INVITE_REDIRECT_TO', 'http://localhost:5176/auth/callback');
    vi.stubEnv('APP_PASSWORD_RESET_REDIRECT_TO', 'http://localhost:5176/auth/reset');
  });

  const baseArgs = {
    email: AUTH_USER.email,
    tenantId: 'tenant-1',
    role: 'atendimento',
    collaboratorId: 'col-1',
    collaboratorName: 'Colaborador Teste',
    userName: 'Colaborador Teste',
    profileRole: 'atendimento',
  };

  it('usuário novo: inviteUserByEmail e retorna user com id', async () => {
    const supabase = buildAuthSupabase({
      listUsers: [],
      inviteUser: AUTH_USER,
    });
    const result = await dispatchCollaboratorInvite(supabase, baseArgs, { mode: 'invite' });
    expect(result.user?.id).toBe(AUTH_USER.id);
    expect(supabase.auth.admin.inviteUserByEmail).toHaveBeenCalled();
  });

  it('usuário existente: NÃO chama inviteUserByEmail — usa recovery', async () => {
    const supabase = buildAuthSupabase({ listUsers: [AUTH_USER] });
    const result = await dispatchCollaboratorInvite(supabase, baseArgs, { mode: 'resend' });
    expect(result.user?.id).toBe(AUTH_USER.id);
    expect(supabase.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('email_exists: recupera auth user e continua sem erro', async () => {
    const supabase = buildAuthSupabase({
      listUsersSequence: [[], [AUTH_USER]],
      inviteError: { code: 'email_exists', message: 'User already registered', status: 422 },
    });
    const result = await dispatchCollaboratorInvite(supabase, baseArgs, { mode: 'invite' });
    expect(result.user?.id).toBe(AUTH_USER.id);
    expect(supabase.auth.admin.inviteUserByEmail).toHaveBeenCalled();
  });

  it('usuário existente sem tenant_user: ainda retorna auth user id válido', async () => {
    const supabase = buildAuthSupabase({ listUsers: [AUTH_USER] });
    const result = await dispatchCollaboratorInvite(supabase, baseArgs);
    expect(result.user?.id).toBeTruthy();
    expect(assertAuthUserIdForTenantWrite(result.user.id)).toBe(AUTH_USER.id);
  });
});

describe('tenant_users write guard — cenários de vínculo', () => {
  function simulateTenantUpsert({ existingTenantUser, authUserId }) {
    assertAuthUserIdForTenantWrite(authUserId, { phase: 'before_write' });
    const payload = {
      tenant_id: 'tenant-1',
      email: 'colaborador@clinica.com',
      user_id: authUserId,
    };
    if (existingTenantUser?.id) {
      return { ...existingTenantUser, ...payload, operation: 'update' };
    }
    return { id: 'tu-new', ...payload, operation: 'upsert' };
  }

  it('tenant_user sem user_id: bloqueia antes do banco', () => {
    expect(() => simulateTenantUpsert({ existingTenantUser: { id: 'tu-1', user_id: null }, authUserId: null }))
      .toThrow(IdentityProvisionError);
  });

  it('user_id órfão: upsert com authUserId válido preenche user_id', () => {
    const result = simulateTenantUpsert({
      existingTenantUser: { id: 'tu-1', user_id: 'orphan-deleted' },
      authUserId: AUTH_USER.id,
    });
    expect(result.user_id).toBe(AUTH_USER.id);
    expect(result.operation).toBe('update');
  });

  it('usuário existente sem tenant_user: upsert cria com user_id', () => {
    const result = simulateTenantUpsert({ existingTenantUser: null, authUserId: AUTH_USER.id });
    expect(result.user_id).toBe(AUTH_USER.id);
    expect(result.operation).toBe('upsert');
  });

  it('todos os cenários terminam com tenant_users.user_id preenchido', () => {
    const scenarios = [
      { label: 'novo', existing: null, authId: 'auth-new' },
      { label: 'existente', existing: { id: 'tu-1', user_id: AUTH_USER.id }, authId: AUTH_USER.id },
      { label: 'sem tenant_user', existing: null, authId: AUTH_USER.id },
      { label: 'órfão', existing: { id: 'tu-2', user_id: 'deleted-id' }, authId: AUTH_USER.id },
      { label: 'email_exists', existing: { id: 'tu-3', user_id: null }, authId: AUTH_USER.id },
    ];
    for (const scenario of scenarios) {
      const row = simulateTenantUpsert({
        existingTenantUser: scenario.existing,
        authUserId: scenario.authId,
      });
      expect(row.user_id, `cenário: ${scenario.label}`).toBeTruthy();
      expect(assertAuthUserIdForTenantWrite(row.user_id)).toBe(scenario.authId);
    }
  });
});
