/**
 * Phase 5.6 — Clinic Profile Repository Write Cutover.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import {
  getClinicSummary,
  updateClinicProfile,
} from '../services/clinicService.js';
import {
  __setClinicProfileRepositoryFactoryForTest,
  __setClinicProfileServiceBridgeFlagsForTest,
  shouldUseClinicProfileRepositoryWrite,
} from '../services/clinicProfileServiceRepositoryBridge.js';
import {
  __runClinicProfileDualWriteUpdateForTest,
  mapLegacyProfileToUpdateDto,
} from '../services/clinicProfileServiceWriteAdapter.js';
import { ClinicProfileRepository } from '../repositories/clinicProfile/clinicProfileRepository.ts';
import { createClinicProfileCache } from '../repositories/clinicProfile/clinicProfileCache.ts';
import {
  getClinicProfileRepositoryFlags,
  isClinicProfileWriteEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/clinicProfile/clinicProfileRepositoryFlags.ts';
import { CLINIC_PROFILE_WRITE_FLAGS_RESOLVED } from './rhTestFlagContract.js';

vi.mock('../services/clinicProfileApi.js', () => ({
  saveClinicProfileRemote: vi.fn(),
}));

vi.mock('../services/saasAuthService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isSaasModeEnabled: vi.fn(() => true),
  };
});

vi.mock('../services/clinicLogoUploadService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveClinicLogoUrlForSave: vi.fn(async (_tid, url) => url || null),
    assertLogoUrlSafeForApi: vi.fn((url) => url || null),
  };
});

import { saveClinicProfileRemote } from '../services/clinicProfileApi.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const admin = { id: 'user-admin', role: 'admin', tenantId: TENANT };

const WRITE_FLAGS = CLINIC_PROFILE_WRITE_FLAGS_RESOLVED;

function mockSessionStorage() {
  const store = new Map();
  const sessionStorageMock = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  vi.stubGlobal('sessionStorage', sessionStorageMock);
  return sessionStorageMock;
}

function buildServerProfile(overrides = {}) {
  return {
    tenant_id: TENANT,
    clinic_id: 'clinic-7aba7127',
    name: 'Clínica Remota',
    fantasy_name: 'Clínica Remota',
    legal_name: 'Clínica Remota LTDA',
    logo_url: 'https://cdn.example/logo.webp',
    email: 'remoto@test.com',
    status: 'active',
    ...overrides,
  };
}

function seedLocalProfile(overrides = {}) {
  withDb((db) => {
    db.clinicProfile = {
      id: 'clinic-local',
      tenant_id: TENANT,
      nomeClinica: 'Clínica Local',
      nomeFantasia: 'Clínica Local',
      razaoSocial: 'Clínica Local LTDA',
      emailPrincipal: 'local@test.com',
      logoUrl: '',
      status: 'ativo',
      ...overrides,
    };
    db.clinicDocumentation = { clinicId: 'clinic-local', cnpj: '11.222.333/0001-44' };
    db.clinicPhones = [{ id: 'ph-1', principal: true, ddd: '11', numero: '99998888' }];
    return db;
  });
}

function createWriteMocks(serverProfile = buildServerProfile()) {
  const cache = createClinicProfileCache();
  return {
    adminApi: {
      fetchProfile: vi.fn().mockResolvedValue(serverProfile),
      saveProfile: vi.fn().mockResolvedValue(serverProfile),
    },
    indexedDb: {
      getLegacyProfileSync: vi.fn(() => loadDb().clinicProfile),
      getSummarySync: vi.fn(() => ({
        tenant_id: TENANT,
        nomeClinica: loadDb().clinicProfile?.nomeClinica || '',
        nomeFantasia: loadDb().clinicProfile?.nomeFantasia || '',
        cnpj: '11.222.333/0001-44',
        logoUrl: loadDb().clinicProfile?.logoUrl || '',
        telefonePrincipal: '1199998888',
        enderecoPrincipal: null,
      })),
    },
    cache,
    serverProfile,
  };
}

describe('clinicProfileWriteCutover — flags', () => {
  it('WRITE exige CLINIC_PROFILE_READ', () => {
    expect(() => getClinicProfileRepositoryFlags({
      overrides: { CLINIC_PROFILE_WRITE: true, CLINIC_PROFILE_READ: false },
    })).toThrow(/CLINIC_PROFILE_WRITE/);
  });

  it('build PROD trava WRITE', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getClinicProfileRepositoryFlags({ overrides: WRITE_FLAGS });
      expect(flags.CLINIC_PROFILE_WRITE).toBe(false);
      expect(isClinicProfileWriteEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção não afeta WRITE diretamente mas READ_PRIMARY bloqueado', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getClinicProfileRepositoryFlags({
      overrides: { ...WRITE_FLAGS, CLINIC_PROFILE_READ_PRIMARY: true },
    });
    expect(flags.CLINIC_PROFILE_READ_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });

  it('flags default — write desligado', () => {
    expect(shouldUseClinicProfileRepositoryWrite()).toBe(false);
  });
});

describe('clinicProfileWriteCutover — dual-write', () => {
  beforeEach(async () => {
    localStorage.clear();
    mockSessionStorage();
    await resetDb();
    await initDb();
    seedLocalProfile();
    __setClinicProfileServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });
    __setClinicProfileRepositoryFactoryForTest(null);
    vi.mocked(saveClinicProfileRemote).mockReset();
  });

  afterEach(() => {
    __setClinicProfileServiceBridgeFlagsForTest(null);
    __setClinicProfileRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('mapLegacyProfileToUpdateDto preserva contrato core', () => {
    const dto = mapLegacyProfileToUpdateDto({
      nomeClinica: 'A',
      nomeFantasia: 'B',
      razaoSocial: 'C',
      emailPrincipal: 'd@test.com',
      logoUrl: 'https://cdn.example/x.webp',
    });
    expect(dto).toEqual({
      nomeClinica: 'A',
      nomeFantasia: 'B',
      razaoSocial: 'C',
      emailPrincipal: 'd@test.com',
      logoUrl: 'https://cdn.example/x.webp',
    });
  });

  it('update remoto via repository + hydrate IDB', async () => {
    const mocks = createWriteMocks(buildServerProfile({ name: 'Clínica Atualizada' }));
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    const profile = loadDb().clinicProfile;
    const result = await __runClinicProfileDualWriteUpdateForTest(
      admin,
      { ...profile, nomeClinica: 'Clínica Atualizada' },
      TENANT,
      'https://cdn.example/logo.webp',
    );

    expect(result.ok).toBe(true);
    expect(mocks.adminApi.saveProfile).toHaveBeenCalled();
    expect(mocks.cache.get(TENANT)?.name).toBe('Clínica Atualizada');
  });

  it('updateClinicProfile WRITE=true agenda dual-write sem saveClinicProfileRemote legado', async () => {
    const mocks = createWriteMocks();
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    const result = await updateClinicProfile(admin, {
      nomeClinica: 'Nova Clínica',
      nomeFantasia: 'Nova Clínica',
      razaoSocial: 'Nova Clínica LTDA',
      emailPrincipal: 'nova@test.com',
    });

    expect(result.profile.nomeClinica).toBe('Nova Clínica');
    expect(saveClinicProfileRemote).not.toHaveBeenCalled();

    await __runClinicProfileDualWriteUpdateForTest(admin, result.profile, TENANT, null);
    expect(mocks.adminApi.saveProfile).toHaveBeenCalled();
  });

  it('logo http(s) incluído no DTO remoto', async () => {
    const mocks = createWriteMocks(buildServerProfile({
      logo_url: 'https://cdn.example/new-logo.webp',
    }));
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    const profile = {
      ...loadDb().clinicProfile,
      logoUrl: 'https://cdn.example/new-logo.webp',
    };
    await __runClinicProfileDualWriteUpdateForTest(
      admin,
      profile,
      TENANT,
      'https://cdn.example/new-logo.webp',
    );

    expect(mocks.adminApi.saveProfile.mock.calls[0][1].logoUrl).toBe(
      'https://cdn.example/new-logo.webp',
    );
  });

  it('invalidate cache sessionStorage após hydrate write', async () => {
    const storage = mockSessionStorage();
    storage.setItem('clinic.summary.cache', JSON.stringify({ data: {}, timestamp: Date.now() }));
    const mocks = createWriteMocks();
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    await repo.updateCore(TENANT, mapLegacyProfileToUpdateDto(loadDb().clinicProfile));
    expect(storage.getItem('clinic.summary.cache')).toBeNull();
  });
});

describe('clinicProfileWriteCutover — rollback e resiliência', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedLocalProfile();
  });

  afterEach(() => {
    __setClinicProfileServiceBridgeFlagsForTest(null);
    __setClinicProfileRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('WRITE=false — dual-write skipped', async () => {
    const saveProfile = vi.fn();
    __setClinicProfileRepositoryFactoryForTest(() => ({ updateCore: saveProfile }));
    __setClinicProfileServiceBridgeFlagsForTest(null);

    const result = await __runClinicProfileDualWriteUpdateForTest(
      admin,
      loadDb().clinicProfile,
      TENANT,
      null,
    );

    expect(result.skipped).toBe(true);
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('erro remoto preserva IDB local', async () => {
    __setClinicProfileServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });
    __setClinicProfileRepositoryFactoryForTest(() => ({
      updateCore: vi.fn().mockRejectedValue(new Error('remote conflict')),
    }));

    await updateClinicProfile(admin, {
      nomeClinica: 'IDB Preservado',
      nomeFantasia: 'IDB Preservado',
      razaoSocial: 'IDB Preservado LTDA',
      emailPrincipal: 'idb@test.com',
    });

    const result = await __runClinicProfileDualWriteUpdateForTest(
      admin,
      loadDb().clinicProfile,
      TENANT,
      null,
    );

    expect(result.ok).toBe(false);
    expect(loadDb().clinicProfile.nomeClinica).toBe('IDB Preservado');
  });

  it('offline — erro remoto não corrompe getClinicSummary', async () => {
    __setClinicProfileServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });
    __setClinicProfileRepositoryFactoryForTest(() => ({
      updateCore: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
    }));

    await updateClinicProfile(admin, {
      nomeClinica: 'Offline OK',
      nomeFantasia: 'Offline OK',
      razaoSocial: 'Offline OK LTDA',
      emailPrincipal: 'off@test.com',
    });

    await __runClinicProfileDualWriteUpdateForTest(admin, loadDb().clinicProfile, TENANT, null);
    expect(getClinicSummary(TENANT)?.nomeClinica).toBe('Offline OK');
  });

  it('duplicate update sequencial preserva último valor IDB', async () => {
    __setClinicProfileServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });
    const saveProfile = vi.fn().mockResolvedValue(buildServerProfile());
    __setClinicProfileRepositoryFactoryForTest(() => ({
      updateCore: saveProfile,
    }));

    await updateClinicProfile(admin, {
      nomeClinica: 'Primeira',
      nomeFantasia: 'Primeira',
      razaoSocial: 'Primeira LTDA',
      emailPrincipal: 'a@test.com',
    });
    await updateClinicProfile(admin, {
      nomeClinica: 'Segunda',
      nomeFantasia: 'Segunda',
      razaoSocial: 'Segunda LTDA',
      emailPrincipal: 'b@test.com',
    });

    expect(loadDb().clinicProfile.nomeClinica).toBe('Segunda');
  });
});

describe('clinicProfileWriteCutover — shadow compare', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedLocalProfile();
    __setClinicProfileServiceBridgeFlagsForTest({
      overrides: {
        ...WRITE_FLAGS,
        CLINIC_PROFILE_COMPARE_IDB_REMOTE: true,
      },
    });
  });

  afterEach(() => {
    __setClinicProfileServiceBridgeFlagsForTest(null);
    __setClinicProfileRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('shadow compare após write não quebra fluxo', async () => {
    const mocks = createWriteMocks(buildServerProfile({ name: 'Remote Diff' }));
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...WRITE_FLAGS,
          CLINIC_PROFILE_COMPARE_IDB_REMOTE: true,
        },
      },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    const comparison = await repo.compareIdbVsRemote(TENANT);
    expect(comparison?.match).toBe(false);
    expect(() => getClinicSummary(TENANT)).not.toThrow();
  });
});
