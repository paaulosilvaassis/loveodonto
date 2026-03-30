import { beforeEach, describe, expect, it } from 'vitest';
import { migrateDb } from '../db/migrations.js';
import { DB_VERSION } from '../db/schema.js';
import { initDb, resetDb } from '../db/index.js';
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
      rhCategoria: 'Corpo Clínico',
      cargo: 'Clínico Geral',
      tipoVinculo: 'CLT',
      setor: 'Clínico',
      conselhoNome: 'CRO',
      conselhoUf: 'SP',
      registroProfissional: '123456',
      status: 'ativo',
    });
    const updated = updateCollaborator(admin, collaborator.id, { apelido: 'Dra. Ana S' });
    expect(updated.apelido).toBe('Dra. Ana S');
  });

  it('valida upload de foto', () => {
    const collaborator = createCollaborator(admin, {
      apelido: 'Dr. Carlos',
      nomeCompleto: 'Carlos Lima',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Implantodontista',
      tipoVinculo: 'PJ',
      setor: 'Clínico',
      conselhoUf: 'RJ',
      registroProfissional: '998877',
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
      rhCategoria: 'Recepção e Atendimento',
      cargo: 'Recepcionista',
      tipoVinculo: 'CLT',
      setor: 'Recepção',
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
      rhCategoria: 'Corpo Clínico',
      cargo: 'Periodontista',
      tipoVinculo: 'CLT',
      setor: 'Clínico',
      conselhoUf: 'MG',
      registroProfissional: '554433',
      status: 'ativo',
    });
    const list = getProfessionalOptions();
    expect(list.length).toBe(1);
  });

  it('migration 37 remove apenas placeholders do fluxo antigo (Novo colaborador + Recepção)', () => {
    const badId = 'col-placeholder';
    const goodRecepId = 'col-real-recep';
    const keptWithEmailId = 'col-novo-com-email';
    const migrated = migrateDb({
      version: 36,
      collaborators: [
        {
          id: badId,
          apelido: 'Novo colaborador',
          nomeCompleto: 'Novo colaborador',
          cargo: 'Recepção',
          status: 'ativo',
        },
        {
          id: keptWithEmailId,
          apelido: 'Novo colaborador',
          nomeCompleto: 'Novo colaborador',
          cargo: 'Recepção',
          status: 'ativo',
          email: 'real@clinica.com',
        },
        {
          id: goodRecepId,
          apelido: 'Maria',
          nomeCompleto: 'Maria Silva',
          cargo: 'Recepção',
          status: 'ativo',
        },
      ],
      collaboratorPhones: [
        { id: 'ph1', collaboratorId: badId, ddd: '11', numero: '988887777', tipo: 'Celular', principal: true },
      ],
      collaboratorWorkHours: [{ collaboratorId: badId, diaSemana: 1, inicio: '08:00', fim: '18:00', ativo: true }],
    });
    expect(migrated.version).toBe(DB_VERSION);
    expect(migrated.collaborators.map((c) => c.id).sort()).toEqual([goodRecepId, keptWithEmailId].sort());
    expect(migrated.collaboratorPhones || []).toHaveLength(0);
    expect((migrated.collaboratorWorkHours || []).filter((w) => w.collaboratorId === badId)).toHaveLength(0);
  });

  it('migration 38 preenche campos RH e mapeia cargos legados', () => {
    const migrated = migrateDb({
      version: 37,
      collaborators: [
        {
          id: 'c1',
          apelido: 'Legado',
          nomeCompleto: 'Legado Teste',
          cargo: 'Dentista',
          status: 'ativo',
          email: '',
        },
      ],
    });
    expect(migrated.version).toBe(DB_VERSION);
    const c = migrated.collaborators[0];
    expect(c.rhCategoria).toBe('Corpo Clínico');
    expect(c.cargo).toBe('Clínico Geral');
    expect(c.tipoVinculo).toBe('');
  });
});
