/**
 * Sprint 1C Ticket 1.8 — Repository read adoption (listCollaborators / getCollaborator).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import {
  createCollaborator,
  getCollaborator,
  listCollaborators,
} from '../services/collaboratorService.js';
import {
  __setCollaboratorRepositoryFactoryForTest,
  __setCollaboratorServiceBridgeFlagsForTest,
} from '../services/collaboratorServiceRepositoryBridge.js';
import { collaboratorIndexedDbRepository } from '../repositories/collaborator/collaboratorIndexedDbRepository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../services/collaboratorService.js');

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const admin = { id: 'user-admin', role: 'admin', tenantId: TENANT };

function seedCollaborator(overrides = {}) {
  return createCollaborator(admin, {
    apelido: 'Dra. Read',
    nomeCompleto: 'Read Adoption Teste',
    rhCategoria: 'Corpo Clínico',
    cargo: 'Clínico Geral',
    tipoVinculo: 'CLT',
    setor: 'Clínico',
    conselhoNome: 'CRO',
    conselhoUf: 'SP',
    registroProfissional: '998877',
    status: 'ativo',
    ...overrides,
  });
}

describe('collaboratorServiceReadAdoption — paridade de retorno', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  it('listCollaborators retorna colaboradores com mesmos campos legados', () => {
    const created = seedCollaborator();
    const list = listCollaborators({ tenantId: TENANT });
    const row = list.find((c) => c.id === created.id);
    expect(row).toBeTruthy();
    expect(row.apelido).toBe('Dra. Read');
    expect(row.nomeCompleto).toBe('Read Adoption Teste');
    expect(row.cargo).toBe('Clínico Geral');
    expect(row.registroProfissional).toBe('998877');
  });

  it('listCollaborators respeita filtros status e cargo', () => {
    seedCollaborator({ status: 'ativo', cargo: 'Clínico Geral' });
    seedCollaborator({
      apelido: 'Inativa',
      nomeCompleto: 'Inativa Teste',
      registroProfissional: '112233',
      status: 'inativo',
      cargo: 'Recepcionista',
    });
    const ativos = listCollaborators({ tenantId: TENANT, status: 'ativo' });
    expect(ativos.every((c) => c.status === 'ativo')).toBe(true);
    const recep = listCollaborators({ tenantId: TENANT, cargo: 'Recepcionista' });
    expect(recep).toHaveLength(1);
    expect(recep[0].apelido).toBe('Inativa');
  });

  it('getCollaborator retorna aggregate com profile e satélites', () => {
    const created = seedCollaborator();
    const detail = getCollaborator(created.id);
    expect(detail).not.toBeNull();
    expect(detail.profile.id).toBe(created.id);
    expect(detail.profile.apelido).toBe('Dra. Read');
    expect(detail).toHaveProperty('documents');
    expect(detail).toHaveProperty('phones');
    expect(detail).toHaveProperty('access');
    expect(detail).toHaveProperty('workHours');
    expect(detail).toHaveProperty('finance');
    expect(detail.additional).toEqual({ notes: '' });
  });

  it('getCollaborator retorna null para id inexistente', () => {
    expect(getCollaborator('col-inexistente')).toBeNull();
  });
});

describe('collaboratorServiceReadAdoption — repository como porta de leitura', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    __setCollaboratorServiceBridgeFlagsForTest(null);
  });

  afterEach(() => {
    __setCollaboratorRepositoryFactoryForTest(null);
    __setCollaboratorServiceBridgeFlagsForTest(null);
  });

  it('listCollaborators delega listLegacySync ao repository', () => {
    const created = seedCollaborator();
    const listLegacySpy = vi.spyOn(collaboratorIndexedDbRepository, 'listLegacySync');
    const list = listCollaborators({ tenantId: TENANT });
    expect(listLegacySpy).toHaveBeenCalled();
    expect(list.some((c) => c.id === created.id)).toBe(true);
    listLegacySpy.mockRestore();
  });

  it('getCollaborator delega getLegacyProfileSync ao repository', () => {
    const created = seedCollaborator();
    const profileSpy = vi.spyOn(collaboratorIndexedDbRepository, 'getLegacyProfileSync');
    const detail = getCollaborator(created.id);
    expect(profileSpy).toHaveBeenCalledWith(created.id);
    expect(detail?.profile?.id).toBe(created.id);
    profileSpy.mockRestore();
  });

  it('flags OFF — repository mock Supabase não é invocado na listagem', () => {
    const supabaseList = vi.fn();
    __setCollaboratorRepositoryFactoryForTest(() => ({
      listLegacySync: (filters, saas) => collaboratorIndexedDbRepository.listLegacySync(filters, saas),
      getLegacyProfileSync: (id) => collaboratorIndexedDbRepository.getLegacyProfileSync(id),
      getLegacySatellitesSync: (id) => collaboratorIndexedDbRepository.getLegacySatellitesSync(id),
      compareIdbVsSupabase: vi.fn(),
      listCore: supabaseList,
    }));
    seedCollaborator();
    listCollaborators({ tenantId: TENANT });
    expect(supabaseList).not.toHaveBeenCalled();
  });

  it('shadow read continua opcional com flags default', async () => {
    const compareMock = vi.fn().mockResolvedValue({});
    __setCollaboratorRepositoryFactoryForTest(() => ({
      listLegacySync: (filters, saas) => collaboratorIndexedDbRepository.listLegacySync(filters, saas),
      getLegacyProfileSync: (id) => collaboratorIndexedDbRepository.getLegacyProfileSync(id),
      getLegacySatellitesSync: (id) => collaboratorIndexedDbRepository.getLegacySatellitesSync(id),
      compareIdbVsSupabase: compareMock,
    }));
    seedCollaborator();
    listCollaborators({ tenantId: TENANT });
    await new Promise((r) => setTimeout(r, 15));
    expect(compareMock).not.toHaveBeenCalled();
  });
});

describe('collaboratorServiceReadAdoption — isolamento collaboratorService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('collaboratorService.js não importa loadDb', () => {
    const content = readFileSync(SERVICE_PATH, 'utf8');
    expect(content).not.toMatch(/import\s*\{[^}]*\bloadDb\b/);
    expect(content).not.toContain('loadDb(');
  });

  it('listCollaborators e getCollaborator delegam ao read adapter', () => {
    const content = readFileSync(SERVICE_PATH, 'utf8');
    const listBlock = content.match(
      /export const listCollaborators[\s\S]*?^export const getCollaborator/m,
    )?.[0] ?? '';
    const getBlock = content.match(
      /export const getCollaborator[\s\S]*?^export const createCollaborator/m,
    )?.[0] ?? '';
    expect(listBlock).toContain('readListCollaborators');
    expect(getBlock).toContain('readGetCollaborator');
  });

  it('satélites de getCollaborator ainda carregam do IDB via read adapter', () => {
    const created = seedCollaborator({ registroProfissional: '445566' });
    withDb((db) => {
      db.collaboratorPhones = db.collaboratorPhones || [];
      db.collaboratorPhones.push({
        id: 'ph-read-test',
        collaboratorId: created.id,
        ddd: '11',
        numero: '999998888',
        tipo: 'Celular',
        principal: true,
      });
      return db;
    });
    const detail = getCollaborator(created.id);
    expect(detail.phones).toHaveLength(1);
    expect(detail.phones[0].numero).toBe('999998888');
  });
});
