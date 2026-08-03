import { describe, expect, it } from 'vitest';
import { buildUserInviteEmail, resolveProfileRoleLabel } from '../../server/email/buildUserInviteEmail.js';

describe('buildUserInviteEmail', () => {
  it('monta assunto e corpo com link de convite', () => {
    const result = buildUserInviteEmail({
      userName: 'Maria Silva',
      clinicName: 'Clínica Teste',
      profileRole: 'dentista',
      setupLink: 'https://loveodonto.com.br/primeiro-acesso#token',
      appUrl: 'https://loveodonto.com.br',
    });

    expect(result.subject).toContain('Clínica Teste');
    expect(result.text).toContain('Maria Silva');
    expect(result.text).toContain('https://loveodonto.com.br/primeiro-acesso#token');
    expect(result.html).toContain('Dentista');
  });

  it('resolve rótulo de perfil desconhecido', () => {
    expect(resolveProfileRoleLabel('custom_role')).toBe('custom_role');
    expect(resolveProfileRoleLabel('admin')).toBe('Administrador');
  });
});
