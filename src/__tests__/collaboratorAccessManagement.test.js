import { describe, expect, it } from 'vitest';
import {
  resolveAccessManagementActions,
  resolveCollaboratorAccountStatus,
} from '../utils/collaboratorAccessManagement.js';

describe('collaboratorAccessManagement', () => {
  it('sem tenant user retorna Sem acesso', () => {
    expect(resolveCollaboratorAccountStatus(null).label).toBe('Sem acesso');
  });

  it('conta bloqueada quando acesso desativado', () => {
    const status = resolveCollaboratorAccountStatus({
      id: 'tu-1',
      has_system_access: false,
      user_id: 'auth-1',
    });
    expect(status.key).toBe('blocked');
    expect(status.label).toBe('Conta bloqueada');
  });

  it('convite pendente sem auth user', () => {
    const status = resolveCollaboratorAccountStatus({
      id: 'tu-1',
      has_system_access: true,
      invitation_status: 'sent',
      user_id: null,
    });
    expect(status.key).toBe('invite_pending');
  });

  it('conta ativa com auth user aceito', () => {
    const status = resolveCollaboratorAccountStatus({
      id: 'tu-1',
      has_system_access: true,
      invitation_status: 'accepted',
      user_id: 'auth-1',
      auth_user_valid: true,
      last_sign_in_at: '2026-01-01T10:00:00Z',
    });
    expect(status.key).toBe('active');
    expect(status.label).toBe('Conta ativa');
  });

  it('não mostra redefinir senha se convite pendente', () => {
    const tenantUser = {
      id: 'tu-1',
      has_system_access: true,
      invitation_status: 'sent',
      user_id: 'auth-1',
      auth_user_valid: true,
    };
    const accountStatus = resolveCollaboratorAccountStatus(tenantUser);
    const actions = resolveAccessManagementActions({ tenantUser, accountStatus, hasValidEmail: true });
    expect(actions.canResetPassword).toBe(false);
    expect(actions.canResendInvite).toBe(true);
  });

  it('mostra redefinir senha para conta ativa', () => {
    const tenantUser = {
      id: 'tu-1',
      has_system_access: true,
      invitation_status: 'accepted',
      user_id: 'auth-1',
      auth_user_valid: true,
      invitation: { accepted_at: '2026-01-01T10:00:00Z' },
    };
    const accountStatus = resolveCollaboratorAccountStatus(tenantUser);
    const actions = resolveAccessManagementActions({ tenantUser, accountStatus, hasValidEmail: true });
    expect(actions.canResetPassword).toBe(true);
    expect(actions.canDeactivate).toBe(true);
    expect(actions.canActivate).toBe(false);
  });

  it('mostra ativar acesso quando conta bloqueada', () => {
    const tenantUser = {
      id: 'tu-1',
      has_system_access: false,
      user_id: 'auth-1',
      auth_user_valid: true,
    };
    const accountStatus = resolveCollaboratorAccountStatus(tenantUser);
    const actions = resolveAccessManagementActions({ tenantUser, accountStatus, hasValidEmail: true });
    expect(actions.canDeactivate).toBe(false);
    expect(actions.canActivate).toBe(true);
  });
});
