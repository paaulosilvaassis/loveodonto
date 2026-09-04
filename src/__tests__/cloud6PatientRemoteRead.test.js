/**
 * CLOUD.6 — Patient remote read / hydrate / flags (unit).
 * Sem PHI real. Sem mutation remota.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, loadDb } from '../db/index.js';
import { createPatientRepository } from '../repositories/patient/patientRepository.ts';
import {
  PATIENTS_REPOSITORY_FLAG_DEFAULTS,
  getPatientRepositoryFlags,
  isPatientsReadPrimaryEnabled,
} from '../repositories/patient/patientRepositoryFlags.ts';
import {
  __setPatientServiceBridgeFlagsForTest,
  schedulePatientCacheRehydrate,
  shouldUsePatientRepositoryRead,
} from '../services/patientRepositoryBridge.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const LEGACY = 'patient-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeCore(overrides = {}) {
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    legacyId: LEGACY,
    tenantId: TENANT,
    guid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    fullName: 'Fixture Paciente',
    nickname: 'Fix',
    socialName: '',
    sex: 'F',
    birthDate: '2002-12-15',
    cpf: '39053344705',
    photoUrl: null,
    status: 'active',
    blocked: false,
    blockReason: '',
    blockAt: null,
    tags: [],
    leadSource: '',
    hasFinancialResponsible: false,
    dependentFullName: '',
    hasPendingData: false,
    pendingFields: [],
    pendingCriticalFields: [],
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('CLOUD.6 patient remote read', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
    __setPatientServiceBridgeFlagsForTest(null);
  });

  it('defaults mantêm READ/WRITE primary OFF', () => {
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_READ).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_SHADOW).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_READ_PRIMARY).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_WRITE).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_WRITE_PRIMARY).toBe(false);
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_READ).toBe(false);
    expect(isPatientsReadPrimaryEnabled()).toBe(false);
    expect(shouldUsePatientRepositoryRead()).toBe(false);
  });

  it('syncCacheFromRemote hidrata IDB sem limpar outras collections', async () => {
    const adminApi = {
      listPatients: vi.fn(async () => [makeCore()]),
      getPatient: vi.fn(),
      createPatient: vi.fn(),
      updatePatient: vi.fn(),
      softDeletePatient: vi.fn(),
    };
    const repo = createPatientRepository({
      adminApi,
      flagsInput: {
        overrides: {
          PATIENTS_READ: true,
          PATIENTS_READ_PRIMARY: true,
          PATIENTS_SHADOW: true,
          PATIENTS_WRITE: false,
          PATIENTS_WRITE_PRIMARY: false,
          PATIENTS_DUAL_WRITE: false,
          PATIENTS_COMPARE: false,
        },
      },
    });

    // seed unrelated collection
    const before = loadDb();
    expect(Array.isArray(before.appointments)).toBe(true);

    const n = await repo.syncCacheFromRemote(TENANT);
    expect(n).toBe(1);
    expect(adminApi.listPatients).toHaveBeenCalledTimes(1);

    const after = loadDb();
    expect(after.patients.some((p) => p.id === LEGACY)).toBe(true);
    expect(after.patients.find((p) => p.id === LEGACY).birth_date).toBe('2002-12-15');
    expect(after.appointments).toEqual(before.appointments);
  });

  it('schedulePatientCacheRehydrate no-op quando READ_PRIMARY off', () => {
    __setPatientServiceBridgeFlagsForTest({
      overrides: { ...PATIENTS_REPOSITORY_FLAG_DEFAULTS },
    });
    expect(() => schedulePatientCacheRehydrate(TENANT)).not.toThrow();
  });
});
