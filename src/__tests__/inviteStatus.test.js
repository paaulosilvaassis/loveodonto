import { describe, expect, it } from 'vitest';
import { resolveCollaboratorAccessDisplayStatus } from '../utils/inviteStatus.js';

describe('inviteStatus — coluna Acesso', () => {
  it('sem tenant_user exibe Sem convite', () => {
    expect(resolveCollaboratorAccessDisplayStatus(null).label).toBe('Sem convite');
    expect(resolveCollaboratorAccessDisplayStatus({}).label).toBe('Sem convite');
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

  it('usuário ativo exibe Acesso ativo', () => {
    const status = resolveCollaboratorAccessDisplayStatus({
      id: 'tu-2',
      invitation_status: 'accepted',
      has_system_access: true,
      user_id: 'auth-user-1',
    });
    expect(status.label).toBe('Convite aceito');
    expect(status.key).toBe('accepted');
  });

  it('usuário com acesso pleno exibe Acesso ativo', () => {
    const status = resolveCollaboratorAccessDisplayStatus({
      id: 'tu-3',
      invitation_status: 'none',
      has_system_access: true,
      user_id: 'auth-user-2',
    });
    expect(status.label).toBe('Acesso ativo');
    expect(status.key).toBe('active');
  });
});
