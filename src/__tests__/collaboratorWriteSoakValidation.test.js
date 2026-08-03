/**
 * Phase 5.4 — Write soak & staging validation (simulated).
 * Valida contratos dual-write + flags staging sem Supabase remoto.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, loadDb } from '../db/index.js';
import {
  createCollaborator,
  createCollaboratorWithSystemAccess,
  getCollaborator,
  listCollaborators,
  updateCollaborator,
  uploadCollaboratorPhoto,
} from '../services/collaboratorService.js';
import {
  __setCollaboratorRepositoryFactoryForTest,
  __setCollaboratorServiceBridgeFlagsForTest,
  shouldUseCollaboratorRepositoryWrite,
} from '../services/collaboratorServiceRepositoryBridge.js';
import {
  __runCollaboratorDualWriteCreateForTest,
  __runCollaboratorDualWriteUpdateForTest,
} from '../services/collaboratorServiceWriteAdapter.js';
import { CollaboratorRepository } from '../repositories/collaborator/collaboratorRepository.ts';
import { createCollaboratorCache } from '../repositories/collaborator/collaboratorCache.ts';
import { mapSupabaseRowToCore, toLegacyCollaboratorShape } from '../repositories/collaborator/collaboratorMapper.ts';
import {
  getCollaboratorRepositoryFlags,
  isRhSupabaseWriteEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/collaborator/collaboratorRepositoryFlags.ts';
import { RH_STAGING_SOAK_FLAGS_RESOLVED } from './rhTestFlagContract.js';

vi.mock('../services/collaboratorAccessProvisionService.js', () => ({
  provisionCollaboratorSystemAccess: vi.fn(),
  linkCollaboratorTenantAccess: vi.fn(),
  listTenantUsersAccess: vi.fn(),
}));

import { provisionCollaboratorSystemAccess } from '../services/collaboratorAccessProvisionService.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const UUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const admin = { id: 'user-admin', role: 'admin', tenantId: TENANT };

const SOAK_FLAGS = RH_STAGING_SOAK_FLAGS_RESOLVED;

function buildSupabaseRow(overrides = {}) {
  return {
    id: UUID,
    tenant_id: TENANT,
    legacy_id: overrides.legacy_id || 'col-soak-001',
    status: overrides.status || 'ativo',
    apelido: overrides.apelido || 'Dr. Soak',
    nome_completo: overrides.nome_completo || 'Soak Validation',
    nome_social: null,
    sexo: null,
    data_nascimento: null,
    email: overrides.email || 'soak@test.com',
    foto_url: overrides.foto_url || null,
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
    apelido: 'Dr. Soak',
    nomeCompleto: 'Soak Validation',
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

function createSoakMocks(legacyId = 'col-soak-001') {
  let core = mapSupabaseRowToCore(buildSupabaseRow({ legacy_id: legacyId }));
  return {
    supabase: {
      list: vi.fn().mockImplementation(async () => [core]),
      findByUuid: vi.fn().mockImplementation(async () => core),
      findByLegacyId: vi.fn().mockImplementation(async () => core),
      upsert: vi.fn().mockImplementation(async (_tenant, dto) => {
        core = mapSupabaseRowToCore(buildSupabaseRow({
          legacy_id: dto.legacy_id || legacyId,
          apelido: dto.apelido || core.apelido,
          nome_completo: dto.nome_completo || core.nomeCompleto,
          status: dto.status || core.status,
          foto_url: dto.foto_url ?? null,
        }));
        return core;
      }),
      softDelete: vi.fn().mockImplementation(async () => {
        core = mapSupabaseRowToCore(buildSupabaseRow({
          legacy_id: legacyId,
          status: 'inativo',
          deleted_at: new Date().toISOString(),
        }));
      }),
    },
    indexedDb: {
      list: vi.fn(() => []),
      findByLegacyId: vi.fn(() => core),
      findByUuid: vi.fn(() => core),
      listLegacySync: vi.fn(() => []),
      getLegacyProfileSync: vi.fn(() => toLegacyCollaboratorShape(core)),
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
    getCore: () => core,
  };
}

describe('collaboratorWriteSoak — contrato flags staging', () => {
  it('combinação soak READ+READ_PRIMARY+WRITE+SHADOW+COMPARE é válida', () => {
    const flags = getCollaboratorRepositoryFlags({ overrides: SOAK_FLAGS });
    expect(flags.RH_SUPABASE_WRITE).toBe(true);
    expect(flags.RH_SUPABASE_READ_PRIMARY).toBe(true);
    expect(flags.RH_SHADOW_READ).toBe(true);
    expect(flags.RH_COMPARE_IDB_SUPABASE).toBe(true);
  });

  it('build PROD trava WRITE mesmo com env true', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getCollaboratorRepositoryFlags({
        overrides: { ...SOAK_FLAGS },
      });
      expect(flags.RH_SUPABASE_WRITE).toBe(false);
      expect(isRhSupabaseWriteEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia READ_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getCollaboratorRepositoryFlags({
      overrides: {
        RH_SUPABASE_READ: true,
        RH_SUPABASE_READ_PRIMARY: true,
      },
    });
    expect(flags.RH_SUPABASE_READ_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('collaboratorWriteSoak — dual-write + hydrate + read-after-write', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: SOAK_FLAGS });
    __setCollaboratorRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('create remoto + hydrate local + read-after-write READ_PRIMARY', async () => {
    const mocks = createSoakMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: SOAK_FLAGS },
    });
    __setCollaboratorRepositoryFactoryForTest(() => repo);

    const created = createCollaborator(admin, seedPayload({ registroProfissional: '11122' }));
    await __runCollaboratorDualWriteCreateForTest(admin, created);

    expect(mocks.supabase.upsert).toHaveBeenCalled();
    expect(mocks.indexedDb.upsertMirror).toHaveBeenCalled();

    const listResult = await repo.listCore(TENANT);
    expect(listResult.source).toBe('supabase');

    const profile = repo.getLegacyProfileSync(created.id);
    expect(profile?.apelido).toBe('Dr. Soak');
  });

  it('update remoto + hydrate + leitura sync preservada', async () => {
    const mocks = createSoakMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: SOAK_FLAGS },
    });
    __setCollaboratorRepositoryFactoryForTest(() => repo);

    const created = createCollaborator(admin, seedPayload({ registroProfissional: '22233' }));
    await __runCollaboratorDualWriteCreateForTest(admin, created);

    const updated = updateCollaborator(admin, created.id, { apelido: 'Dr. Soak Updated' });
    await __runCollaboratorDualWriteUpdateForTest(admin, created.id, updated, created);

    expect(mocks.supabase.upsert.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(updated.apelido).toBe('Dr. Soak Updated');
    expect(getCollaborator(created.id)?.profile?.apelido).toBe('Dr. Soak Updated');
  });

  it('softDelete remoto quando inativa com uuid', async () => {
    const mocks = createSoakMocks();
    const repo = new CollaboratorRepository({
      supabase: mocks.supabase,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: SOAK_FLAGS },
    });
    __setCollaboratorRepositoryFactoryForTest(() => repo);

    const created = createCollaborator(admin, seedPayload({ registroProfissional: '33344' }));
    const withUuid = { ...created, uuid: UUID, status: 'inativo' };

    await __runCollaboratorDualWriteUpdateForTest(admin, created.id, withUuid, created);

    expect(mocks.supabase.softDelete).toHaveBeenCalledWith(TENANT, UUID);
  });
});

describe('collaboratorWriteSoak — rollback e resiliência', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  afterEach(() => {
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('rollback WRITE=false — dual-write skipped', async () => {
    const createCore = vi.fn();
    __setCollaboratorRepositoryFactoryForTest(() => ({ createCore }));
    __setCollaboratorServiceBridgeFlagsForTest(null);

    expect(shouldUseCollaboratorRepositoryWrite()).toBe(false);
    const created = createCollaborator(admin, seedPayload({ registroProfissional: '44455' }));
    const result = await __runCollaboratorDualWriteCreateForTest(admin, created);

    expect(result.skipped).toBe(true);
    expect(createCore).not.toHaveBeenCalled();
    expect(loadDb().collaborators.some((c) => c.id === created.id)).toBe(true);
  });

  it('erro remoto preserva IDB local', async () => {
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: SOAK_FLAGS });
    __setCollaboratorRepositoryFactoryForTest(() => ({
      createCore: vi.fn().mockRejectedValue(new Error('remote conflict')),
    }));

    const created = createCollaborator(admin, seedPayload({ registroProfissional: '55566' }));
    const result = await __runCollaboratorDualWriteCreateForTest(admin, created);

    expect(result.ok).toBe(false);
    expect(loadDb().collaborators.find((c) => c.id === created.id)?.apelido).toBe('Dr. Soak');
  });

  it('COMPARE divergente não quebra listCollaborators síncrono', async () => {
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: SOAK_FLAGS });
    __setCollaboratorRepositoryFactoryForTest(() => ({
      listLegacySync: vi.fn(() => []),
      compareIdbVsSupabase: vi.fn().mockResolvedValue({
        tenantId: TENANT,
        comparedAt: new Date().toISOString(),
        matchCount: 0,
        mismatchCount: 3,
        onlyInIndexedDb: ['col-a'],
        onlyInSupabase: ['col-b'],
        diffs: [{ ref: 'col-c', field: 'apelido', indexedDbValue: 'A', supabaseValue: 'B' }],
        shadow: {
          tenantId: TENANT,
          comparedAt: new Date().toISOString(),
          counts: { local: 1, remote: 2 },
          match: [],
          missing_local: [{ ref: { legacyId: 'col-b', uuid: '', tenantId: TENANT } }],
          missing_remote: [],
          field_diff: [],
          duplicate: [],
          invalid_uuid: [],
          invalid_legacy: [],
        },
      }),
    }));

    createCollaborator(admin, seedPayload({ registroProfissional: '66677' }));
    expect(() => listCollaborators({ tenantId: TENANT })).not.toThrow();
    await new Promise((r) => setTimeout(r, 15));
  });
});

describe('collaboratorWriteSoak — contratos UI preservados', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    __setCollaboratorServiceBridgeFlagsForTest({ overrides: SOAK_FLAGS });
    __setCollaboratorRepositoryFactoryForTest(() => ({
      createCore: vi.fn().mockResolvedValue(mapSupabaseRowToCore(buildSupabaseRow())),
      updateCore: vi.fn().mockResolvedValue(mapSupabaseRowToCore(buildSupabaseRow())),
    }));
    vi.mocked(provisionCollaboratorSystemAccess).mockReset();
  });

  afterEach(() => {
    __setCollaboratorServiceBridgeFlagsForTest(null);
    __setCollaboratorRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('uploadCollaboratorPhoto delega updateCollaborator sem quebrar', () => {
    const created = createCollaborator(admin, seedPayload({ registroProfissional: '77788' }));
    const updated = uploadCollaboratorPhoto(admin, created.id, {
      type: 'image/png',
      size: 2048,
      dataUrl: 'data:image/png;base64,AAA',
    });
    expect(updated.fotoUrl).toContain('data:image/png');
  });

  it('createCollaboratorWithSystemAccess preserva chamada provision API', async () => {
    vi.mocked(provisionCollaboratorSystemAccess).mockResolvedValue({
      tenant_user: { user_id: 'u-soak', role: 'admin', tenant_id: TENANT },
    });

    const result = await createCollaboratorWithSystemAccess(
      admin,
      { ...seedPayload({ registroProfissional: '88899' }), email: 'soak@implanprime.test' },
      { tenant_id: TENANT },
    );

    expect(provisionCollaboratorSystemAccess).toHaveBeenCalled();
    expect(result.collaborator?.id).toMatch(/^col-/);
    expect(result.systemAccess).toBeTruthy();
  });
});
