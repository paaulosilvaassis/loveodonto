import { describe, expect, it } from 'vitest';
import {
  resolveAccessManagementActions,
  resolveCollaboratorAccountStatus,
} from '../utils/collaboratorAccessManagement.js';
import { isCollaboratorAccessLinkNotFoundError, isStaleAuthLinkError } from '../services/collaboratorAccessProvisionService.js';

describe('access email flow helpers', () => {
  it('detecta erro de vínculo quebrado para retry', () => {
    expect(isCollaboratorAccessLinkNotFoundError('Vínculo de acesso não encontrado para este colaborador.')).toBe(true);
    expect(isStaleAuthLinkError('conta no Auth ausente')).toBe(true);
  });

  it('mostra reenviar convite quando invitation_status expired', () => {
    const tenantUser = {
      id: 'tu-1',
      has_system_access: true,
      invitation_status: 'expired',
      user_id: 'auth-1',
      auth_user_valid: true,
    };
    const accountStatus = resolveCollaboratorAccountStatus(tenantUser);
    const actions = resolveAccessManagementActions({ tenantUser, accountStatus, hasValidEmail: true });
    expect(actions.canResendInvite).toBe(true);
    expect(actions.canResetPassword).toBe(false);
  });

  it('mostra redefinir senha para conta ativa aceita', () => {
    const tenantUser = {
      id: 'tu-1',
      has_system_access: true,
      invitation_status: 'accepted',
      user_id: 'auth-1',
      auth_user_valid: true,
      invitation: { accepted_at: '2026-01-01T10:00:00Z' },
      last_sign_in_at: '2026-01-02T10:00:00Z',
    };
    const accountStatus = resolveCollaboratorAccountStatus(tenantUser);
    const actions = resolveAccessManagementActions({ tenantUser, accountStatus, hasValidEmail: true });
    expect(actions.canResetPassword).toBe(true);
    expect(actions.canResendInvite).toBe(false);
  });
});
