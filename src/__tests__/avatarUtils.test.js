import { describe, expect, it } from 'vitest';
import {
  getInitialsFromName,
  getUserAvatarUrl,
  mapCollaboratorToProfessionalOption,
} from '../utils/avatarUtils.js';

describe('avatarUtils', () => {
  it('resolve fotoUrl em diferentes chaves', () => {
    expect(getUserAvatarUrl({ fotoUrl: 'https://cdn.test/photo.jpg' })).toBe('https://cdn.test/photo.jpg');
    expect(getUserAvatarUrl({ photo_url: 'data:image/png;base64,abc' })).toBe('data:image/png;base64,abc');
    expect(getUserAvatarUrl({ profile: { fotoUrl: '/uploads/a.jpg' } })).toMatch(/\/uploads\/a\.jpg$/);
  });

  it('usa foto do colaborador vinculado em usuário', () => {
    const url = getUserAvatarUrl({
      full_name: 'Juliana',
      linked_collaborator: { fotoUrl: 'https://cdn.test/juliana.jpg' },
    });
    expect(url).toBe('https://cdn.test/juliana.jpg');
  });

  it('gera iniciais a partir do nome', () => {
    expect(getInitialsFromName('Dra. Juliana Silva')).toBe('DS');
    expect(getInitialsFromName('', 'juliana@clinica.com')).toBe('J');
  });

  it('mapeia colaborador para opção da agenda com avatar', () => {
    const option = mapCollaboratorToProfessionalOption({
      id: 'col-1',
      nomeCompleto: 'Juliana',
      cargo: 'Dentista',
      fotoUrl: 'data:image/jpeg;base64,xyz',
      status: 'ativo',
    });
    expect(option.avatarUrl).toBe('data:image/jpeg;base64,xyz');
    expect(option.name).toBe('Juliana');
  });
});
