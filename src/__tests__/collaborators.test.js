import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, initDb, resetDb } from '../db/index.js';
import {
  createCollaborator,
  getProfessionalOptions,
  updateCollaborator,
  updateCollaboratorAccess,
  updateCollaboratorFinance,
  uploadCollaboratorPhoto,
} from '../services/collaboratorService.js';

const admin = { id: 'user-admin', role: 'admin' };
const recepcao = { id: 'user-2', role: 'recepcao' };

describe('Colaboradores', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('cria e atualiza colaborador', () => {
    const collaborator = createCollaborator(admin, {
      apelido: 'Dra. Ana',
      nomeCompleto: 'Ana Souza',
      cargo: 'Dentista',
      status: 'ativo',
    });
    const updated = updateCollaborator(admin, collaborator.id, { apelido: 'Dra. Ana S' });
    expect(updated.apelido).toBe('Dra. Ana S');
  });

  it('valida upload de foto', () => {
    const collaborator = createCollaborator(admin, {
      apelido: 'Dr. Carlos',
      nomeCompleto: 'Carlos Lima',
      cargo: 'Dentista',
      status: 'ativo',
    });
    expect(() =>
      uploadCollaboratorPhoto(admin, collaborator.id, {
        type: 'image/gif',
        size: 1024,
        dataUrl: 'data:image/gif;base64,AAA',
      })
    ).toThrow('Tipo de arquivo inválido.');
  });

  it('bloqueia edição de financeiro e acesso para recepção', () => {
    const collaborator = createCollaborator(admin, {
      apelido: 'Maria',
      nomeCompleto: 'Maria Silva',
      cargo: 'Recepção',
      status: 'ativo',
    });
    expect(() =>
      updateCollaboratorFinance(recepcao, collaborator.id, { tipoRemuneracao: 'fixo', valorFixo: 1000 })
    ).toThrow('Permissão insuficiente.');
    expect(() =>
      updateCollaboratorAccess(recepcao, collaborator.id, { role: 'recepcao', userId: 'user-admin' })
    ).toThrow('Permissão insuficiente.');
  });

  it('exibe profissionais para agenda', () => {
    createCollaborator(admin, {
      apelido: 'Dr. João',
      nomeCompleto: 'João Costa',
      cargo: 'Dentista',
      status: 'ativo',
    });
    const list = getProfessionalOptions();
    expect(list.length).toBe(1);
  });
});
