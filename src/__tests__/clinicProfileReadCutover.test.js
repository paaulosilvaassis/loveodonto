/**
 * Phase 5.5 — Clinic Profile Repository Read Cutover.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import {
  getClinic,
  getClinicSummary,
  updateClinicProfile,
} from '../services/clinicService.js';
import {
  __setClinicProfileRepositoryFactoryForTest,
  __setClinicProfileServiceBridgeFlagsForTest,
  shouldUseClinicProfileRepositoryRead,
} from '../services/clinicProfileServiceRepositoryBridge.js';
import {
  readGetClinicProfile,
  readGetClinicSummary,
  readHydrateClinicProfileCache,
  __compareClinicProfileIdbVsRemoteForTest,
} from '../services/clinicProfileServiceReadAdapter.js';
import { ClinicProfileRepository } from '../repositories/clinicProfile/clinicProfileRepository.ts';
import { createClinicProfileCache } from '../repositories/clinicProfile/clinicProfileCache.ts';
import {
  getClinicProfileRepositoryFlags,
  isClinicProfileReadPrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/clinicProfile/clinicProfileRepositoryFlags.ts';
import { CLINIC_PROFILE_READ_PRIMARY_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const admin = { id: 'user-admin', role: 'admin', tenantId: TENANT };

const READ_PRIMARY_FLAGS = CLINIC_PROFILE_READ_PRIMARY_FLAGS_RESOLVED;

function buildServerProfile(overrides = {}) {
  return {
    tenant_id: TENANT,
    clinic_id: 'clinic-7aba7127',
    name: 'Implan Prime',
    fantasy_name: 'Implan Prime',
    legal_name: 'Implan Prime Odontologia LTDA',
    logo_url: 'https://cdn.example/logo.webp',
    email: 'contato@implanprime.test',
    phone: '11999998888',
    cnpj: '12.345.678/0001-90',
    status: 'active',
    ...overrides,
  };
}

function seedLocalProfile(overrides = {}) {
  withDb((db) => {
    db.clinicProfile = {
      id: 'clinic-local',
      tenant_id: TENANT,
      nomeClinica: 'Local Clinic',
      nomeFantasia: 'Local Clinic',
      razaoSocial: 'Local Clinic LTDA',
      emailPrincipal: 'local@test.com',
      logoUrl: '',
      status: 'ativo',
      ...overrides,
    };
    db.clinicDocumentation = { clinicId: 'clinic-local', cnpj: '98.765.432/0001-10' };
    db.clinicPhones = [{ id: 'ph-1', principal: true, ddd: '11', numero: '88887777' }];
    db.clinicAddresses = [{ id: 'addr-1', principal: true, logradouro: 'Rua A', numero: '100' }];
    return db;
  });
}

function createReadPrimaryMocks(serverProfile = buildServerProfile()) {
  const cache = createClinicProfileCache();
  return {
    adminApi: {
      fetchProfile: vi.fn().mockResolvedValue(serverProfile),
    },
    indexedDb: {
      getLegacyProfileSync: vi.fn(() => ({
        id: 'clinic-local',
        tenant_id: TENANT,
        nomeClinica: 'Local Clinic',
        nomeFantasia: 'Local Clinic',
        razaoSocial: 'Local Clinic LTDA',
        emailPrincipal: 'local@test.com',
        logoUrl: '',
        status: 'ativo',
      })),
      getSummarySync: vi.fn(() => ({
        tenant_id: TENANT,
        nomeClinica: 'Local Clinic',
        nomeFantasia: 'Local Clinic',
        cnpj: '98.765.432/0001-10',
        logoUrl: '',
        telefonePrincipal: '1188887777',
        enderecoPrincipal: { logradouro: 'Rua A' },
      })),
    },
    cache,
    serverProfile,
  };
}

describe('clinicProfileReadCutover — flags', () => {
  it('READ_PRIMARY requer CLINIC_PROFILE_READ', () => {
    expect(() => getClinicProfileRepositoryFlags({
      overrides: { CLINIC_PROFILE_READ_PRIMARY: true, CLINIC_PROFILE_READ: false },
    })).toThrow(/CLINIC_PROFILE_READ_PRIMARY/);
  });

  it('build PROD trava READ_PRIMARY', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getClinicProfileRepositoryFlags({ overrides: READ_PRIMARY_FLAGS });
      expect(flags.CLINIC_PROFILE_READ_PRIMARY).toBe(false);
      expect(isClinicProfileReadPrimaryEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia READ_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getClinicProfileRepositoryFlags({
      overrides: { CLINIC_PROFILE_READ: true, CLINIC_PROFILE_READ_PRIMARY: true },
    });
    expect(flags.CLINIC_PROFILE_READ_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });

  it('flags default — repository read desligado', () => {
    expect(shouldUseClinicProfileRepositoryRead()).toBe(false);
  });
});

describe('clinicProfileReadCutover — read primary + hydrate', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedLocalProfile();
    __setClinicProfileServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });
    __setClinicProfileRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setClinicProfileServiceBridgeFlagsForTest(null);
    __setClinicProfileRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('hydrate remoto + read-after-write via cache', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    const { hydrated } = await readHydrateClinicProfileCache(TENANT);
    expect(hydrated).toBe(1);
    expect(mocks.adminApi.fetchProfile).toHaveBeenCalledWith(TENANT);

    const summary = readGetClinicSummary(TENANT);
    expect(summary?.nomeClinica).toBe('Implan Prime');
    expect(summary?.logoUrl).toBe('https://cdn.example/logo.webp');
  });

  it('getClinic profile usa repository quando READ_PRIMARY', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    await readHydrateClinicProfileCache(TENANT);
    const clinic = getClinic();
    expect(clinic.profile?.nomeClinica).toBe('Implan Prime');
    expect(clinic.phones).toBeDefined();
  });

  it('getClinicSummary via service delega ao repository', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    await readHydrateClinicProfileCache(TENANT);
    const summary = getClinicSummary(TENANT);
    expect(summary?.nomeFantasia).toBe('Implan Prime');
    expect(summary?.cnpj).toBe('98.765.432/0001-10');
  });

  it('offline fallback preserva IDB', async () => {
    const mocks = createReadPrimaryMocks();
    mocks.adminApi.fetchProfile.mockRejectedValue(new Error('Failed to fetch'));
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    const result = await repo.getCoreAsync(TENANT);
    expect(result.source).toBe('indexeddb-offline');
    expect(result.core?.name).toBe('Local Clinic');
  });
});

describe('clinicProfileReadCutover — fallback e escrita intacta', () => {
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

  it('flags OFF — read adapter retorna null (legado IDB)', () => {
    __setClinicProfileServiceBridgeFlagsForTest(null);
    expect(readGetClinicSummary(TENANT)).toBeNull();
    expect(readGetClinicProfile()).toBeNull();
    const summary = getClinicSummary(TENANT);
    expect(summary?.nomeClinica).toBe('Local Clinic');
  });

  it('updateClinicProfile permanece IDB-first sem repository write', async () => {
    __setClinicProfileServiceBridgeFlagsForTest(null);
    const updateRemote = vi.fn();
    vi.doMock('../services/clinicProfileApi.js', () => ({
      saveClinicProfileRemote: updateRemote,
    }));

    await updateClinicProfile(admin, {
      nomeClinica: 'Clínica Atualizada',
      nomeFantasia: 'Clínica Atualizada',
      razaoSocial: 'Clínica Atualizada LTDA',
      emailPrincipal: 'novo@test.com',
    });

    const summary = getClinicSummary(TENANT);
    expect(summary?.nomeClinica).toBe('Clínica Atualizada');
  });
});

describe('clinicProfileReadCutover — branding, logo, compare', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedLocalProfile({ logoUrl: 'data:image/png;base64,AAA' });
    __setClinicProfileServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });
  });

  afterEach(() => {
    __setClinicProfileServiceBridgeFlagsForTest(null);
    __setClinicProfileRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('logo remoto substitui cache após hydrate', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    await readHydrateClinicProfileCache(TENANT);
    const profile = readGetClinicProfile(TENANT);
    expect(profile?.logoUrl).toBe('https://cdn.example/logo.webp');
  });

  it('COMPARE divergente não quebra getClinicSummary', async () => {
    const mocks = createReadPrimaryMocks(buildServerProfile({ name: 'Remote Different' }));
    const repo = new ClinicProfileRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...READ_PRIMARY_FLAGS,
          CLINIC_PROFILE_COMPARE_IDB_REMOTE: true,
        },
      },
    });
    __setClinicProfileRepositoryFactoryForTest(() => repo);

    const comparison = await __compareClinicProfileIdbVsRemoteForTest(TENANT);
    expect(comparison?.match).toBe(false);
    expect(() => getClinicSummary(TENANT)).not.toThrow();
  });
});
