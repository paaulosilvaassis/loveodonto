/**
 * CLOUD.7 — Patient WRITE_PRIMARY remote-first (unit).
 * Sem PHI real. Sem mutation remota real.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import { createPatientRepository } from '../repositories/patient/patientRepository.ts';
import {
  PATIENTS_REPOSITORY_FLAG_DEFAULTS,
  getPatientRepositoryFlags,
  isPatientsWritePrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/patient/patientRepositoryFlags.ts';
import {
  __setPatientRepositoryFactoryForTest,
  __setPatientServiceBridgeFlagsForTest,
  shouldUsePatientRepositoryWrite,
  shouldUsePatientRepositoryWritePrimary,
} from '../services/patientRepositoryBridge.js';
import {
  PatientRemoteWriteError,
  __runPatientPrimaryWriteCreateForTest,
  __runPatientPrimaryWriteSoftDeleteForTest,
  __runPatientPrimaryWriteUpdateForTest,
  commitPatientWritePrimaryCreate,
  commitPatientWritePrimarySoftDelete,
  commitPatientWritePrimaryUpdate,
  schedulePatientDualWriteCreate,
} from '../services/patientWriteAdapter.js';
import {
  createPatientQuick,
  softDeletePatient,
  updatePatientProfile,
} from '../services/patientService.js';
import { assertPatientsPermission } from '../../server/lib/patientsPermissionGuard.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const LEGACY = 'patient-cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const PRIMARY_FLAGS = {
  PATIENTS_READ: true,
  PATIENTS_READ_PRIMARY: true,
  PATIENTS_SHADOW: false,
  PATIENTS_COMPARE: false,
  PATIENTS_WRITE: true,
  PATIENTS_WRITE_PRIMARY: true,
  PATIENTS_DUAL_WRITE: false,
  PATIENTS_WRITE_COMPARE: false,
};

const adminUser = {
  id: 'user-cloud7',
  role: 'admin',
  tenantId: TENANT,
  permissions: ['patients:write', 'patients:read', 'patients:status'],
};

function makeCore(overrides = {}) {
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    legacyId: LEGACY,
    tenantId: TENANT,
    guid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    fullName: 'CLOUD7 TEST PATIENT',
    nickname: '',
    socialName: '',
    sex: 'NI',
    birthDate: '2000-01-01',
    cpf: null,
    photoUrl: null,
    status: 'active',
    blocked: false,
    blockReason: '',
    blockAt: null,
    tags: ['cloud7-synthetic'],
    leadSource: '',
    hasFinancialResponsible: false,
    dependentFullName: '',
    hasPendingData: false,
    pendingFields: [],
    pendingCriticalFields: [],
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function createWriteMocks(overrides = {}) {
  const createPatient = vi.fn().mockImplementation(async (_tid, dto) => makeCore({
    legacyId: dto.legacyId,
    fullName: dto.fullName,
    nickname: dto.nickname || '',
    tags: dto.tags || [],
    cpf: dto.cpf || null,
  }));
  const updatePatient = vi.fn().mockImplementation(async (_tid, ref, dto) => makeCore({
    legacyId: ref,
    nickname: dto.nickname ?? 'CLOUD7 UPDATED',
    fullName: dto.fullName ?? 'CLOUD7 TEST PATIENT',
  }));
  const softDeletePatientFn = vi.fn().mockResolvedValue(true);
  return {
    adminApi: {
      listPatients: vi.fn().mockResolvedValue([]),
      getPatient: vi.fn().mockResolvedValue(null),
      createPatient,
      updatePatient,
      softDeletePatient: softDeletePatientFn,
      ...overrides.adminApi,
    },
    indexedDb: {
      listLegacySync: vi.fn(() => (loadDb().patients || []).map((r) => ({ ...r }))),
      getLegacyProfileSync: vi.fn((id) => {
        const row = (loadDb().patients || []).find((p) => p.id === id);
        return row ? { profile: { ...row } } : null;
      }),
    },
  };
}

describe('CLOUD.7 patient WRITE_PRIMARY — flags', () => {
  afterEach(() => {
    __setPatientServiceBridgeFlagsForTest(null);
    __setPatientRepositoryFactoryForTest(null);
    vi.unstubAllEnvs();
  });

  it('flags default OFF', () => {
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_WRITE).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_WRITE_PRIMARY).toBe(false);
    expect(isPatientsWritePrimaryEnabled()).toBe(false);
  });

  it('WRITE_PRIMARY exige PATIENTS_WRITE', () => {
    expect(() => getPatientRepositoryFlags({
      overrides: { PATIENTS_WRITE_PRIMARY: true, PATIENTS_WRITE: false, PATIENTS_READ: true },
    })).toThrow(/PATIENTS_WRITE_PRIMARY/);
  });

  it('primary ON desabilita dual-write path', () => {
    __setPatientServiceBridgeFlagsForTest({ overrides: PRIMARY_FLAGS });
    expect(shouldUsePatientRepositoryWritePrimary()).toBe(true);
    expect(shouldUsePatientRepositoryWrite()).toBe(false);
  });

  it('build PROD trava WRITE_PRIMARY', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getPatientRepositoryFlags({ overrides: PRIMARY_FLAGS });
      expect(flags.PATIENTS_WRITE_PRIMARY).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host Supabase produção bloqueia WRITE_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getPatientRepositoryFlags({ overrides: PRIMARY_FLAGS });
    expect(flags.PATIENTS_WRITE_PRIMARY).toBe(false);
  });
});

describe('CLOUD.7 patient WRITE_PRIMARY — remote-first contract', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
    withDb((db) => {
      db.clinicProfile = { tenant_id: TENANT };
      db.patients = [];
      return db;
    });
    __setPatientServiceBridgeFlagsForTest({ overrides: PRIMARY_FLAGS });
  });

  afterEach(() => {
    __setPatientServiceBridgeFlagsForTest(null);
    __setPatientRepositoryFactoryForTest(null);
  });

  it('remote-first create: remote antes de cache IDB', async () => {
    const order = [];
    const mocks = createWriteMocks();
    mocks.adminApi.createPatient = vi.fn().mockImplementation(async (_tid, dto) => {
      order.push('remote');
      expect(loadDb().patients.some((p) => p.id === dto.legacyId)).toBe(false);
      return makeCore({ legacyId: dto.legacyId, fullName: dto.fullName });
    });
    const repo = createPatientRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    });
    const origHydrate = repo.hydratePatients.bind(repo);
    repo.hydratePatients = async (...args) => {
      order.push('cache');
      return origHydrate(...args);
    };
    __setPatientRepositoryFactoryForTest(() => repo);

    const patient = {
      id: LEGACY,
      tenant_id: TENANT,
      full_name: 'CLOUD7 TEST PATIENT',
      nickname: '',
      sex: 'NI',
      birth_date: '2000-01-01',
      cpf: '',
      tags: ['cloud7-synthetic'],
      guid: crypto.randomUUID(),
    };
    const result = await commitPatientWritePrimaryCreate(adminUser, patient);
    expect(result.remoteCommitted).toBe(true);
    expect(result.cacheUpdated).toBe(true);
    expect(order).toEqual(['remote', 'cache']);
    expect(loadDb().patients.some((p) => p.id === LEGACY)).toBe(true);
    expect(mocks.adminApi.createPatient).toHaveBeenCalledTimes(1);
  });

  it('remote-first update hidrata nickname canônico', async () => {
    withDb((db) => {
      db.patients = [{
        id: LEGACY,
        tenant_id: TENANT,
        full_name: 'CLOUD7 TEST PATIENT',
        nickname: '',
        tags: ['cloud7-synthetic'],
      }];
      return db;
    });
    const mocks = createWriteMocks();
    __setPatientRepositoryFactoryForTest(() => createPatientRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
    const result = await commitPatientWritePrimaryUpdate(
      adminUser,
      LEGACY,
      { id: LEGACY, tenant_id: TENANT, full_name: 'CLOUD7 TEST PATIENT', nickname: '' },
      { nickname: 'CLOUD7 UPDATED' },
    );
    expect(result.remoteCommitted).toBe(true);
    expect(result.profile.nickname).toBe('CLOUD7 UPDATED');
    expect(loadDb().patients.find((p) => p.id === LEGACY)?.nickname).toBe('CLOUD7 UPDATED');
  });

  it('remote-first soft delete marca inactive no cache', async () => {
    withDb((db) => {
      db.patients = [{
        id: LEGACY,
        tenant_id: TENANT,
        full_name: 'CLOUD7 TEST PATIENT',
        status: 'active',
        tags: ['cloud7-synthetic'],
      }];
      return db;
    });
    const mocks = createWriteMocks();
    __setPatientRepositoryFactoryForTest(() => createPatientRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
    const result = await commitPatientWritePrimarySoftDelete(adminUser, {
      id: LEGACY,
      tenant_id: TENANT,
      full_name: 'CLOUD7 TEST PATIENT',
    });
    expect(result.remoteCommitted).toBe(true);
    expect(mocks.adminApi.softDeletePatient).toHaveBeenCalled();
    const row = loadDb().patients.find((p) => p.id === LEGACY);
    expect(row?.status).toBe('inactive');
    expect(row?.deleted_at).toBeTruthy();
  });

  it('remote failure: sem sucesso local / sem mutation committed', async () => {
    const mocks = createWriteMocks();
    mocks.adminApi.createPatient = vi.fn().mockRejectedValue(new Error('admin api down'));
    __setPatientRepositoryFactoryForTest(() => createPatientRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));

    await expect(createPatientQuick(adminUser, {
      full_name: 'CLOUD7 FAIL',
      sex: 'NI',
      birth_date: '2000-01-01',
      cpf: '',
      tags: ['cloud7-synthetic'],
    }, { allowNullCpf: true })).rejects.toBeInstanceOf(PatientRemoteWriteError);

    expect(loadDb().patients.some((p) => p.full_name === 'CLOUD7 FAIL')).toBe(false);
    expect(mocks.adminApi.createPatient).toHaveBeenCalled();
  });

  it('cache failure após remote commit: cloud preservada, sem rollback', async () => {
    const mocks = createWriteMocks();
    const repo = createPatientRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    });
    repo.hydratePatients = vi.fn().mockRejectedValue(new Error('idb write failed'));
    __setPatientRepositoryFactoryForTest(() => repo);

    const result = await __runPatientPrimaryWriteCreateForTest(adminUser, {
      id: LEGACY,
      tenant_id: TENANT,
      full_name: 'CLOUD7 CACHE FAIL',
      tags: ['cloud7-synthetic'],
      guid: crypto.randomUUID(),
    });
    expect(result.ok).toBe(true);
    expect(result.remoteCommitted).toBe(true);
    expect(result.cacheUpdated).toBe(false);
    expect(mocks.adminApi.createPatient).toHaveBeenCalledTimes(1);
    // sem soft-delete / rollback remoto
    expect(mocks.adminApi.softDeletePatient).not.toHaveBeenCalled();
  });

  it('tenant UUID fail-closed', async () => {
    __setPatientRepositoryFactoryForTest(() => createPatientRepository({
      ...createWriteMocks(),
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
    await expect(commitPatientWritePrimaryCreate(
      { id: 'u1', tenantId: 'tenant-1' },
      { id: LEGACY, full_name: 'X', tenant_id: 'tenant-1' },
    )).rejects.toMatchObject({ code: 'TENANT_UUID_REQUIRED' });
  });

  it('legacy_id preservado no create', async () => {
    const mocks = createWriteMocks();
    __setPatientRepositoryFactoryForTest(() => createPatientRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
    const created = await createPatientQuick(adminUser, {
      full_name: 'CLOUD7 TEST PATIENT',
      sex: 'NI',
      birth_date: '2000-01-01',
      tags: ['cloud7-synthetic'],
    }, { allowNullCpf: true });
    expect(created.patientId).toMatch(/^patient-[0-9a-f-]{36}$/i);
    expect(mocks.adminApi.createPatient.mock.calls[0][1].legacyId).toBe(created.patientId);
  });

  it('service update/softDelete remote-first', async () => {
    withDb((db) => {
      db.patients = [{
        id: LEGACY,
        tenant_id: TENANT,
        full_name: 'CLOUD7 TEST PATIENT',
        nickname: '',
        sex: 'NI',
        birth_date: '2000-01-01',
        cpf: '',
        status: 'active',
        tags: ['cloud7-synthetic'],
      }];
      return db;
    });
    const mocks = createWriteMocks();
    __setPatientRepositoryFactoryForTest(() => createPatientRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));

    const updated = await updatePatientProfile(adminUser, LEGACY, {
      nickname: 'CLOUD7 UPDATED',
      tags: ['cloud7-synthetic'],
    }, { allowNullCpf: true });
    expect(updated.remoteCommitted).toBe(true);
    expect(updated.nickname).toBe('CLOUD7 UPDATED');

    const deleted = await softDeletePatient(adminUser, LEGACY);
    expect(deleted.remoteCommitted).toBe(true);
    expect(mocks.adminApi.softDeletePatient).toHaveBeenCalled();
  });

  it('dual-write schedule no-op sob WRITE_PRIMARY', () => {
    const mocks = createWriteMocks();
    __setPatientRepositoryFactoryForTest(() => createPatientRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
    schedulePatientDualWriteCreate(adminUser, { id: LEGACY, full_name: 'X', tenant_id: TENANT });
    expect(mocks.adminApi.createPatient).not.toHaveBeenCalled();
  });
});

describe('CLOUD.7 patients:write permission guard', () => {
  it('membership sem patients:write → DENY', async () => {
    const supabase = {
      from(table) {
        if (table === 'tenant_users') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'tu1',
                      tenant_id: TENANT,
                      user_id: 'u-deny',
                      role: 'atendimento',
                      role_slug: 'atendimento',
                      is_active: true,
                      status: 'active',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'role_permission_defaults') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    await expect(assertPatientsPermission(supabase, {
      tenantId: TENANT,
      userId: 'u-deny',
      permission: 'patients:write',
    })).rejects.toThrow(/patients:write|Permissão/);
  });

  it('admin role bypass patients:write → PASS', async () => {
    const supabase = {
      from(table) {
        if (table === 'tenant_users') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'tu2',
                      tenant_id: TENANT,
                      user_id: 'u-admin',
                      role: 'admin',
                      role_slug: 'admin',
                      is_active: true,
                      status: 'active',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await assertPatientsPermission(supabase, {
      tenantId: TENANT,
      userId: 'u-admin',
      permission: 'patients:write',
    });
    expect(result.ok).toBe(true);
    expect(result.bypass).toBe('admin-role');
  });
});
