/**
 * Sprint 1C Ticket 1.9 — Full read adoption (100% leituras via repository).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import {
  createCollaborator,
  getCollaborator,
  getProfessionalOptions,
  listCollaborators,
} from '../services/collaboratorService.js';
import { getCollaboratorAccessLink } from '../services/collaboratorAccessRecoveryService.js';
import { listTenantCollaborators } from '../services/tenantCollaboratorService.js';
import {
  __setCollaboratorRepositoryFactoryForTest,
  __setCollaboratorServiceBridgeFlagsForTest,
} from '../services/collaboratorServiceRepositoryBridge.js';
import { collaboratorIndexedDbRepository } from '../repositories/collaborator/collaboratorIndexedDbRepository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../services/collaboratorService.js');
const ADAPTER_PATH = path.resolve(__dirname, '../services/collaboratorServiceReadAdapter.js');
const TENANT_COLLAB_PATH = path.resolve(__dirname, '../services/tenantCollaboratorService.js');
const ACCESS_RECOVERY_PATH = path.resolve(__dirname, '../services/collaboratorAccessRecoveryService.js');

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const admin = { id: 'user-admin', role: 'admin', tenantId: TENANT };

function seedCollaborator(overrides = {}) {
  return createCollaborator(admin, {
    apelido: 'Dr. Full Read',
    nomeCompleto: 'Full Read Teste',
    rhCategoria: 'Corpo Clínico',
    cargo: 'Clínico Geral',
    tipoVinculo: 'CLT',
    setor: 'Clínico',
    conselhoNome: 'CRO',
    conselhoUf: 'SP',
    registroProfissional: '776655',
    status: 'ativo',
    ...overrides,
  });
}

describe('collaboratorFullReadAdoption — isolamento loadDb/withDb leitura', () => {
  it('collaboratorService.js não importa loadDb', () => {
    const content = readFileSync(SERVICE_PATH, 'utf8');
    expect(content).not.toMatch(/import\s*\{[^}]*\bloadDb\b/);
    expect(content).not.toContain('loadDb(');
  });

  it('collaboratorServiceReadAdapter.js não importa loadDb', () => {
    const content = readFileSync(ADAPTER_PATH, 'utf8');
    expect(content).not.toMatch(/import\s*\{[^}]*\bloadDb\b/);
    expect(content).not.toContain('loadDb(');
  });

  it('tenantCollaboratorService.js não usa loadDb para leitura', () => {
    const content = readFileSync(TENANT_COLLAB_PATH, 'utf8');
    expect(content).not.toContain('loadDb(');
  });

  it('collaboratorAccessRecoveryService.js não usa loadDb', () => {
    const content = readFileSync(ACCESS_RECOVERY_PATH, 'utf8');
    expect(content).not.toContain('loadDb(');
  });
});

describe('collaboratorFullReadAdoption — leituras via repository', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setCollaboratorRepositoryFactoryForTest(null);
    __setCollaboratorServiceBridgeFlagsForTest(null);
  });

  it('getProfessionalOptions delega listProfessionalOptionsLegacySync', () => {
    const created = seedCollaborator();
    const spy = vi.spyOn(collaboratorIndexedDbRepository, 'listProfessionalOptionsLegacySync');
    const options = getProfessionalOptions({ tenantId: TENANT });
    expect(spy).toHaveBeenCalled();
    expect(options.some((o) => o.id === created.id || o.value === created.id)).toBe(true);
    spy.mockRestore();
  });

  it('getCollaborator satélites via getLegacySatellitesSync', () => {
    const created = seedCollaborator({ registroProfissional: '665544' });
    withDb((db) => {
      db.collaboratorPhones.push({
        id: 'ph-full-read',
        collaboratorId: created.id,
        ddd: '11',
        numero: '988887777',
        tipo: 'Celular',
        principal: true,
      });
      return db;
    });
    const spy = vi.spyOn(collaboratorIndexedDbRepository, 'getLegacySatellitesSync');
    const detail = getCollaborator(created.id);
    expect(spy).toHaveBeenCalledWith(created.id);
    expect(detail.phones).toHaveLength(1);
    spy.mockRestore();
  });

  it('getCollaboratorAccessLink delega getLegacyAccessLinkSync', () => {
    const created = seedCollaborator({ registroProfissional: '554433' });
    withDb((db) => {
      db.collaboratorAccess.push({
        collaboratorId: created.id,
        userId: 'user-linked',
        role: 'admin',
      });
      return db;
    });
    const spy = vi.spyOn(collaboratorIndexedDbRepository, 'getLegacyAccessLinkSync');
    const link = getCollaboratorAccessLink(created.id);
    expect(spy).toHaveBeenCalledWith(created.id);
    expect(link?.userId).toBe('user-linked');
    spy.mockRestore();
  });

  it('listTenantCollaborators (modo local) delega listCollaboratorsByTenantLegacySync', async () => {
    seedCollaborator();
    const spy = vi.spyOn(collaboratorIndexedDbRepository, 'listCollaboratorsByTenantLegacySync');
    const list = await listTenantCollaborators(TENANT, { legacy: true });
    expect(spy).toHaveBeenCalledWith(TENANT);
    expect(list.length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('listCollaborators e getCollaborator mantêm paridade pós migração completa', () => {
    const created = seedCollaborator({ registroProfissional: '443322' });
    const list = listCollaborators({ tenantId: TENANT });
    expect(list.find((c) => c.id === created.id)?.apelido).toBe('Dr. Full Read');
    expect(getCollaborator(created.id)?.profile?.nomeCompleto).toBe('Full Read Teste');
  });

  it('flags OFF — listCore Supabase não invocado em leituras legadas', () => {
    const listCore = vi.fn();
    __setCollaboratorRepositoryFactoryForTest(() => ({
      listLegacySync: (f, s) => collaboratorIndexedDbRepository.listLegacySync(f, s),
      getLegacyProfileSync: (id) => collaboratorIndexedDbRepository.getLegacyProfileSync(id),
      getLegacySatellitesSync: (id) => collaboratorIndexedDbRepository.getLegacySatellitesSync(id),
      listProfessionalOptionsLegacySync: (o, s) =>
        collaboratorIndexedDbRepository.listProfessionalOptionsLegacySync(o, s),
      listCore,
    }));
    seedCollaborator({ registroProfissional: '332211' });
    listCollaborators({ tenantId: TENANT });
    getProfessionalOptions({ tenantId: TENANT });
    expect(listCore).not.toHaveBeenCalled();
  });
});
