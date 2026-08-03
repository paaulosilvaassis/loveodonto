/**
 * Phase 5.3 — Collaborator Repository Write Cutover.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, loadDb } from '../db/index.js';
import {
  createCollaborator,
  updateCollaborator,
} from '../services/collaboratorService.js';
import {
  __setCollaboratorRepositoryFactoryForTest,
  __setCollaboratorServiceBridgeFlagsForTest,
  shouldUseCollaboratorRepositoryWrite,
} from '../services/collaboratorServiceRepositoryBridge.js';
import {
  __runCollaboratorDualWriteCreateForTest,
  __runCollaboratorDualWriteUpdateForTest,
  mapLegacyRowToCreateDto,
  mapLegacyRowToUpdateDto,
} from '../services/collaboratorServiceWriteAdapter.js';
import { CollaboratorRepository } from '../repositories/collaborator/collaboratorRepository.ts';
import { createCollaboratorCache } from '../repositories/collaborator/collaboratorCache.ts';
import { mapSupabaseRowToCore } from '../repositories/collaborator/collaboratorMapper.ts';
import { collaboratorIndexedDbRepository } from '../repositories/collaborator/collaboratorIndexedDbRepository.ts';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const UUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const admin = { id: 'user-admin', role: 'admin', tenantId: TENANT };

const WRITE_FLAGS = {
  RH_SUPABASE_READ: true,
  RH_SUPABASE_READ_PRIMARY: false,
  RH_SUPABASE_WRITE: true,
  RH_IDB_WRITE_DISABLED: false,
  RH_ALLOW_SYNTHETIC_STUBS: true,
  RH_SHADOW_READ: false,
  RH_COMPARE_IDB_SUPABASE: false,
};

function buildSupabaseRow(overrides = {}) {
  return {
    id: UUID,
    tenant_id: TENANT,
    legacy_id: overrides.legacy_id || 'col-write-001',
    status: 'ativo',
    apelido: 'Dr. Write',
    nome_completo: 'Write Cutover',
    nome_social: null,
    sexo: null,
    data_nascimento: null,
    email: 'write@test.com',
    foto_url: null,
    rh_categoria: 'corpo_clinico',
    cargo: 'Periodontista',
    rh_funcao_descricao: null,
    tipo_vinculo: 'clt',
    setor: 'clinico',
    especialidades: [],
    registro_profissional: '54321',
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

function seedPayload(overrides = {}) {
  return {
    apelido: 'Dr. Write',
    nomeCompleto: 'Write Cutover',
    rhCategoria: 'Corpo Clínico',
    cargo: 'Periodontista',
    tipoVinculo: 'CLT',
    setor: 'Clínico',
    conselhoNome: 'CRO',
    conselhoUf: 'SP',
    registroProfissional: '54321',
    status: 'ativo',
    ...overrides,
  };
}

function createWriteMocks() {
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
      list: vi.fn(() => []),
      findByLegacyId: vi.fn(() => null),
      findByUuid: vi.fn(() => null),
      listLegacySync: vi.fn(() => []),
      getLegacyProfileSync: vi.fn(() => null),
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
      listProfessionalOptionsLegacySync: vi.fn(() => []),
      listCollaboratorsByTenantLegacySync: vi.fn(() => []),
      getPrimaryPhoneLegacySync: vi.fn(() => ''),
      getLegacyAccessLinkSync: vi.fn(() => null),
      getClinicProfileTenantIdSync: vi.fn(() => TENANT),
      upsertMirror: vi.fn((row) => mapSupabaseRowToCore(buildSupabaseRow({ legacy_id: row.id }))),
      removeMirror: vi.fn(),
      mirrorCollaboratorUuidOnly: vi.fn(() => 'updated'),
    },
    cache: createCollaboratorCache(),
    core,
  };
}

describe('collaboratorWriteCutover — flags default', () => {
  beforeEach(() => {
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  it('shouldUseCollaboratorRepositoryWrite permanece false', () => {
    expect(shouldUseCollaboratorRepositoryWrite()).toBe(false);
  });
});

describe('collaboratorWriteCutover — mappers', () => {
  it('mapLegacyRowToCreateDto preserva legacyId e campos RH', () => {
    const dto = mapLegacyRowToCreateDto({
      id: 'col-map-001',
      apelido: 'Ana',
      nomeCompleto: 'Ana Map',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Dentista',
      tipoVinculo: 'CLT',
      setor: 'Clínico',
      registroProfissional: '111',
    });
    expect(dto.legacyId).toBe('col-map-001');
    expect(dto.apelido).toBe('Ana');
    expect(dto.rhCategoria).toBe('Corpo Clínico');
  });

  it('mapLegacyRowToUpdateDto gera patch parcial', () => {
    const prev = { apelido: 'Ana', nomeCompleto: 'Ana', status: 'ativo' };
    const next = { apelido: 'Ana S', nomeCompleto: 'Ana', status: 'ativo' };
    const patch = mapLegacyRowToUpdateDto(next, prev);
    expect(patch.apelido).toBe('Ana S');
    expect(patch.nomeCompleto).toBeUndefined();
  });
});

describe('collaboratorWriteCutover — dual write repository', () => {
  it('createCore WRITE=true persiste Supabase e hidrata IDB', async () => {
    const mocks = createWriteMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });

    await repo.createCore(
      { id: 'u1', tenantId: TENANT },
      {
        legacyId: 'col-write-001',
        apelido: 'Dr. Write',
        nomeCompleto: 'Write Cutover',
        rhCategoria: 'corpo_clinico',
        cargo: 'Periodontista',
        tipoVinculo: 'clt',
        setor: 'clinico',
      },
    );

    expect(mocks.supabase.upsert).toHaveBeenCalled();
    expect(mocks.indexedDb.upsertMirror).toHaveBeenCalled();
  });

  it('updateCore WRITE=true atualiza Supabase e espelho', async () => {
    const mocks = createWriteMocks();
    mocks.indexedDb.findByLegacyId.mockReturnValue(mocks.core);
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });

    await repo.updateCore(
      { id: 'u1', tenantId: TENANT },
      'col-write-001',
      { apelido: 'Dr. Write Updated' },
    );

    expect(mocks.supabase.upsert).toHaveBeenCalled();
    expect(mocks.indexedDb.upsertMirror).toHaveBeenCalled();
  });

  it('softDeleteCore WRITE=true marca inativo remoto e local', async () => {
    const mocks = createWriteMocks();
    mocks.indexedDb.findByLegacyId.mockReturnValue(mocks.core);
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });

    await repo.softDeleteCore({ id: 'u1', tenantId: TENANT }, 'col-write-001');

    expect(mocks.supabase.softDelete).toHaveBeenCalledWith(TENANT, UUID);
    expect(mocks.indexedDb.upsertMirror).toHaveBeenCalled();
  });
});

describe('collaboratorWriteCutover — service adapter', () => {
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

  it('createCollaborator WRITE=false não invoca createCore', async () => {
    const createCore = vi.fn();
    __setCollaboratorRepositoryFactoryForTest(() => ({
      listLegacySync: (f, s) => collaboratorIndexedDbRepository.listLegacySync(f, s),
      createCore,
    }));

    createCollaborator(admin, seedPayload());
    await new Promise((r) => setTimeout(r, 5));
    expect(createCore).not.toHaveBeenCalled();
  });

  it('dual-write create WRITE=true chama createCore após IDB', async () => {
    const createCore = vi.fn().mockResolvedValue(mapSupabaseRowToCore(buildSupabaseRow()));
    __setCollaboratorRepositoryFactoryForTest(() => ({ createCore }));
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const created = createCollaborator(admin, seedPayload());
    expect(loadDb().collaborators.some((c) => c.id === created.id)).toBe(true);

    const result = await __runCollaboratorDualWriteCreateForTest(admin, created);
    expect(result.ok).toBe(true);
    expect(createCore).toHaveBeenCalled();
  });

  it('rollback — falha Supabase preserva IDB e retorna ok:false', async () => {
    const createCore = vi.fn().mockRejectedValue(new Error('duplicate key'));
    __setCollaboratorRepositoryFactoryForTest(() => ({ createCore }));
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const created = createCollaborator(admin, seedPayload({ registroProfissional: '99988' }));
    expect(loadDb().collaborators.some((c) => c.id === created.id)).toBe(true);

    const result = await __runCollaboratorDualWriteCreateForTest(admin, created);
    expect(result.ok).toBe(false);
    expect(loadDb().collaborators.some((c) => c.id === created.id)).toBe(true);
  });

  it('dual-write update WRITE=true chama updateCore', async () => {
    const updateCore = vi.fn().mockResolvedValue(mapSupabaseRowToCore(buildSupabaseRow()));
    __setCollaboratorRepositoryFactoryForTest(() => ({ updateCore }));
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const created = createCollaborator(admin, seedPayload({ registroProfissional: '88877' }));
    const updated = updateCollaborator(admin, created.id, { apelido: 'Dr. Updated' });

    const result = await __runCollaboratorDualWriteUpdateForTest(
      admin,
      created.id,
      updated,
      created,
    );
    expect(result.ok).toBe(true);
    expect(updateCore).toHaveBeenCalled();
  });

  it('inativação com uuid dispara softDeleteCore', async () => {
    const softDeleteCore = vi.fn().mockResolvedValue(undefined);
    __setCollaboratorRepositoryFactoryForTest(() => ({ softDeleteCore }));
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const created = createCollaborator(admin, seedPayload({ registroProfissional: '77766' }));
    const withUuid = { ...created, uuid: UUID, status: 'inativo' };

    const result = await __runCollaboratorDualWriteUpdateForTest(
      admin,
      created.id,
      withUuid,
      created,
    );
    expect(result.ok).toBe(true);
    expect(softDeleteCore).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT }),
      created.id,
    );
  });

  it('offline — falha remota não remove registro IDB local', async () => {
    const updateCore = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    __setCollaboratorRepositoryFactoryForTest(() => ({ updateCore }));
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });

    const created = createCollaborator(admin, seedPayload({ registroProfissional: '66655' }));
    updateCollaborator(admin, created.id, { apelido: 'Offline Safe' });

    const result = await __runCollaboratorDualWriteUpdateForTest(
      admin,
      created.id,
      { ...created, apelido: 'Offline Safe' },
      created,
    );
    expect(result.ok).toBe(false);
    expect(loadDb().collaborators.find((c) => c.id === created.id)?.apelido).toBe('Offline Safe');
  });
});

describe('collaboratorWriteCutover — shadow não bloqueia write', () => {
  it('COMPARE ativo agenda shadow sem alterar retorno sync', async () => {
    const createCore = vi.fn().mockResolvedValue(mapSupabaseRowToCore(buildSupabaseRow()));
    const compareIdbVsSupabase = vi.fn().mockResolvedValue({
      tenantId: TENANT,
      comparedAt: new Date().toISOString(),
      matchCount: 1,
      mismatchCount: 0,
      onlyInIndexedDb: [],
      onlyInSupabase: [],
      diffs: [],
    });

    __setCollaboratorRepositoryFactoryForTest(() => ({ createCore, compareIdbVsSupabase }));
    __setCollaboratorServiceBridgeFlagsForTest({
      overrides: {
        ...WRITE_FLAGS,
        RH_SHADOW_READ: true,
        RH_COMPARE_IDB_SUPABASE: true,
      },
    });

    const created = createCollaborator(admin, seedPayload({ registroProfissional: '55544' }));
    expect(created.apelido).toBe('Dr. Write');

    await __runCollaboratorDualWriteCreateForTest(admin, created);
    await new Promise((r) => setTimeout(r, 15));
    expect(compareIdbVsSupabase).toHaveBeenCalled();
  });
});
