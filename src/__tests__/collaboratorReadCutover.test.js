/**
 * Phase 5.2 — Collaborator Repository Read Cutover.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import {
  createCollaborator,
  getCollaborator,
  getProfessionalOptions,
  listCollaborators,
} from '../services/collaboratorService.js';
import { listTenantCollaborators } from '../services/tenantCollaboratorService.js';
import {
  __setCollaboratorRepositoryFactoryForTest,
  __setCollaboratorServiceBridgeFlagsForTest,
  scheduleCollaboratorRhCacheRehydrate,
  shouldUseCollaboratorRepositoryRead,
} from '../services/collaboratorServiceRepositoryBridge.js';
import { CollaboratorRepository } from '../repositories/collaborator/collaboratorRepository.ts';
import { createCollaboratorCache } from '../repositories/collaborator/collaboratorCache.ts';
import { mapSupabaseRowToCore } from '../repositories/collaborator/collaboratorMapper.ts';
import { collaboratorIndexedDbRepository } from '../repositories/collaborator/collaboratorIndexedDbRepository.ts';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const UUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const LEGACY_ID = 'col-read-cutover-001';
const admin = { id: 'user-admin', role: 'admin', tenantId: TENANT };

const READ_PRIMARY_FLAGS = {
  RH_SUPABASE_READ: true,
  RH_SUPABASE_READ_PRIMARY: true,
  RH_SUPABASE_WRITE: false,
  RH_IDB_WRITE_DISABLED: false,
  RH_ALLOW_SYNTHETIC_STUBS: true,
  RH_SHADOW_READ: false,
  RH_COMPARE_IDB_SUPABASE: false,
};

function buildSupabaseRow(overrides = {}) {
  return {
    id: UUID,
    tenant_id: TENANT,
    legacy_id: LEGACY_ID,
    status: 'ativo',
    apelido: 'Dr. Cutover',
    nome_completo: 'Cutover Read Primary',
    nome_social: null,
    sexo: null,
    data_nascimento: null,
    email: 'cutover@test.com',
    foto_url: null,
    rh_categoria: 'corpo_clinico',
    cargo: 'Periodontista',
    rh_funcao_descricao: null,
    tipo_vinculo: 'clt',
    setor: 'clinico',
    especialidades: [],
    registro_profissional: '12345',
    conselho_nome: 'CRO',
    conselho_uf: 'SP',
    agenda_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    created_by: null,
    updated_by: null,
    deleted_at: null,
    ...overrides,
  };
}

function createReadPrimaryMocks(idbRows = []) {
  const core = mapSupabaseRowToCore(buildSupabaseRow());
  return {
    supabase: {
      list: vi.fn().mockResolvedValue([core]),
      findByUuid: vi.fn().mockResolvedValue(core),
      findByLegacyId: vi.fn().mockResolvedValue(core),
      upsert: vi.fn().mockResolvedValue(core),
      softDelete: vi.fn().mockResolvedValue(undefined),
    },
    indexedDb: {
      list: vi.fn(() => idbRows.map((r) => mapSupabaseRowToCore(buildSupabaseRow({ legacy_id: r.id, apelido: r.apelido })))),
      findByLegacyId: vi.fn(() => null),
      findByUuid: vi.fn(() => null),
      listLegacySync: vi.fn(() => idbRows),
      getLegacyProfileSync: vi.fn((id) => idbRows.find((r) => r.id === id) ?? null),
      getLegacySatellitesSync: vi.fn(() => ({
        documents: {},
        education: [],
        nationality: {},
        phones: [],
        addresses: [],
        relationships: {},
        characteristics: {},
        additional: { notes: '' },
        insurances: [],
        access: {},
        workHours: [],
        finance: {},
      })),
      listProfessionalOptionsLegacySync: vi.fn(() => idbRows),
      listCollaboratorsByTenantLegacySync: vi.fn(() => idbRows),
      getPrimaryPhoneLegacySync: vi.fn(() => ''),
      getLegacyAccessLinkSync: vi.fn(() => null),
      getClinicProfileTenantIdSync: vi.fn(() => TENANT),
      upsertMirror: vi.fn((row) => mapSupabaseRowToCore(buildSupabaseRow({ legacy_id: row.id }))),
      removeMirror: vi.fn(),
    },
    cache: createCollaboratorCache(),
    core,
  };
}

describe('collaboratorReadCutover — flags default', () => {
  beforeEach(() => {
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  it('shouldUseCollaboratorRepositoryRead permanece false com contrato Vitest', () => {
    expect(shouldUseCollaboratorRepositoryRead()).toBe(false);
  });
});

describe('collaboratorReadCutover — READ_PRIMARY async', () => {
  it('listCore usa Supabase como fonte primária e hidrata IDB', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });

    const result = await repo.listCore(TENANT);

    expect(result.source).toBe('supabase');
    expect(mocks.supabase.list).toHaveBeenCalled();
    expect(mocks.indexedDb.upsertMirror).toHaveBeenCalled();
  });

  it('listCore offline usa indexeddb-offline sem Supabase', async () => {
    const offlineSpy = vi.spyOn(
      await import('../repositories/collaborator/collaboratorRepositorySync.ts'),
      'isBrowserOffline',
    ).mockReturnValue(true);
    const mocks = createReadPrimaryMocks([{ id: LEGACY_ID, tenant_id: TENANT, status: 'ativo', apelido: 'Off' }]);
    mocks.indexedDb.list.mockReturnValue([mocks.core]);

    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });

    const result = await repo.listCore(TENANT);

    expect(result.source).toBe('indexeddb-offline');
    expect(mocks.supabase.list).not.toHaveBeenCalled();
    offlineSpy.mockRestore();
  });

  it('getLegacyProfileSync READ_PRIMARY prefere cache em memória pós-hydrate', () => {
    const mocks = createReadPrimaryMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });

    mocks.cache.set(TENANT, mocks.core);
    mocks.indexedDb.getLegacyProfileSync.mockReturnValue({
      id: LEGACY_ID,
      tenant_id: TENANT,
      apelido: 'IDB Stale',
      nomeCompleto: 'Stale',
      status: 'ativo',
    });

    const profile = repo.getLegacyProfileSync(LEGACY_ID);

    expect(profile.apelido).toBe('Dr. Cutover');
    expect(profile.nomeCompleto).toBe('Cutover Read Primary');
  });
});

describe('collaboratorReadCutover — adapter e services', () => {
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
    vi.restoreAllMocks();
  });

  it('read adapter agenda scheduleCollaboratorRhCacheRehydrate quando READ_PRIMARY', async () => {
    const rehydrateSpy = vi.spyOn(
      await import('../services/collaboratorServiceRepositoryBridge.js'),
      'scheduleCollaboratorRhCacheRehydrate',
    ).mockImplementation(() => {});

    __setCollaboratorServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });
    createCollaborator(admin, {
      apelido: 'Dr. Agenda',
      nomeCompleto: 'Agenda Cutover',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Periodontista',
      tipoVinculo: 'CLT',
      setor: 'Clínico',
      conselhoUf: 'SP',
      registroProfissional: '99881',
      status: 'ativo',
    });

    listCollaborators({ tenantId: TENANT });
    getProfessionalOptions({ tenantId: TENANT });

    expect(rehydrateSpy).toHaveBeenCalledWith(TENANT);
    rehydrateSpy.mockRestore();
  });

  it('shadow read não altera retorno de listCollaborators', async () => {
    const created = createCollaborator(admin, {
      apelido: 'Shadow',
      nomeCompleto: 'Shadow Safe',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Clínico Geral',
      tipoVinculo: 'CLT',
      setor: 'Clínico',
      conselhoUf: 'SP',
      registroProfissional: '88776',
      status: 'ativo',
    });

    __setCollaboratorServiceBridgeFlagsForTest({
      overrides: {
        ...READ_PRIMARY_FLAGS,
        RH_SHADOW_READ: true,
        RH_COMPARE_IDB_SUPABASE: true,
      },
    });
    __setCollaboratorRepositoryFactoryForTest(() => ({
      listLegacySync: (f, s) => collaboratorIndexedDbRepository.listLegacySync(f, s),
      getLegacyProfileSync: (id) => collaboratorIndexedDbRepository.getLegacyProfileSync(id),
      getLegacySatellitesSync: (id) => collaboratorIndexedDbRepository.getLegacySatellitesSync(id),
      listProfessionalOptionsLegacySync: (o, s) =>
        collaboratorIndexedDbRepository.listProfessionalOptionsLegacySync(o, s),
      compareIdbVsSupabase: vi.fn().mockResolvedValue({
        tenantId: TENANT,
        comparedAt: new Date().toISOString(),
        matchCount: 1,
        mismatchCount: 0,
        onlyInIndexedDb: [],
        onlyInSupabase: [],
        diffs: [],
        shadow: {
          tenantId: TENANT,
          comparedAt: new Date().toISOString(),
          counts: { local: 1, remote: 1 },
          match: [],
          missing_local: [],
          missing_remote: [],
          field_diff: [],
          duplicate: [],
          invalid_uuid: [],
          invalid_legacy: [],
        },
      }),
    }));

    const list = listCollaborators({ tenantId: TENANT });
    expect(list.find((c) => c.id === created.id)?.apelido).toBe('Shadow');
    await new Promise((r) => setTimeout(r, 15));
    expect(getCollaborator(created.id)?.profile?.id).toBe(created.id);
  });

  it('agenda lista profissionais após cutover (modo local)', () => {
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
    const list = getProfessionalOptions({ tenantId: TENANT });
    expect(list.length).toBe(1);
  });

  it('listTenantCollaborators modo local usa repository by tenant', async () => {
    createCollaborator(admin, {
      apelido: 'Tenant Row',
      nomeCompleto: 'Tenant Cutover',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Clínico Geral',
      tipoVinculo: 'CLT',
      setor: 'Clínico',
      conselhoUf: 'SP',
      registroProfissional: '77661',
      status: 'ativo',
    });
    const spy = vi.spyOn(collaboratorIndexedDbRepository, 'listCollaboratorsByTenantLegacySync');
    const list = await listTenantCollaborators(TENANT, { legacy: true });
    expect(spy).toHaveBeenCalledWith(TENANT);
    expect(list.length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('escrita createCollaborator permanece IDB — sem createCore remoto', () => {
    const createCore = vi.fn();
    __setCollaboratorRepositoryFactoryForTest(() => ({
      listLegacySync: (f, s) => collaboratorIndexedDbRepository.listLegacySync(f, s),
      getLegacyProfileSync: (id) => collaboratorIndexedDbRepository.getLegacyProfileSync(id),
      getLegacySatellitesSync: (id) => collaboratorIndexedDbRepository.getLegacySatellitesSync(id),
      createCore,
    }));
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });

    createCollaborator(admin, {
      apelido: 'Write Guard',
      nomeCompleto: 'No Remote Write',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Clínico Geral',
      tipoVinculo: 'CLT',
      setor: 'Clínico',
      conselhoUf: 'SP',
      registroProfissional: '66554',
      status: 'ativo',
    });

    expect(createCore).not.toHaveBeenCalled();
  });
});

describe('collaboratorReadCutover — wiring invariants', () => {
  it('scheduleCollaboratorRhCacheRehydrate é no-op com flags default', () => {
    __setCollaboratorServiceBridgeFlagsForTest(null);
    expect(() => scheduleCollaboratorRhCacheRehydrate(TENANT)).not.toThrow();
  });
});
