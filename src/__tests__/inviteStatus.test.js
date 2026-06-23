import { describe, expect, it } from 'vitest';
import { resolveCollaboratorAccessDisplayStatus } from '../utils/inviteStatus.js';

describe('inviteStatus — coluna Acesso', () => {
  it('sem tenant_user exibe Sem acesso', () => {
    expect(resolveCollaboratorAccessDisplayStatus(null).label).toBe('Sem acesso');
    expect(resolveCollaboratorAccessDisplayStatus({}).label).toBe('Sem acesso');
  });

  it('convite pendente exibe Convite enviado', () => {
    const status = resolveCollaboratorAccessDisplayStatus({
      id: 'tu-1',
      invitation_status: 'pending',
      has_system_access: true,
      user_id: null,
    });
    expect(status.label).toBe('Convite enviado');
    expect(status.key).toBe('sent');
  });

  it('usuário ativo exibe Ativo', () => {
    const status = resolveCollaboratorAccessDisplayStatus({
      id: 'tu-2',
      invitation_status: 'accepted',
      has_system_access: true,
      user_id: 'auth-user-1',
    });
    expect(status.label).toBe('Ativo');
    expect(status.key).toBe('active');
  });
});
