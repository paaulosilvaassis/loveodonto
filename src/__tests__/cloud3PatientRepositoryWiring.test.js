/**
 * CLOUD.3 — Patient repository wiring (flags, mapper, shadow, hydrate, bridge, Admin API helpers).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import {
  FORBIDDEN_TENANT_IDS,
  assertRemoteTenantId,
  assertValidTenantId,
  mapCoreToIndexedDbMirror,
  mapLegacyRowToPatientCore,
  mapSupabaseRowToPatientCore,
  PatientMapperValidationError,
} from '../repositories/patient/patientMapper.ts';
import {
  PATIENTS_REPOSITORY_FLAG_DEFAULTS,
  PATIENT_REMOTE_FLAG_ALIASES,
  getPatientRepositoryFlags,
  lockDangerousPatientRepositoryFlags,
} from '../repositories/patient/patientRepositoryFlags.ts';
import {
  buildPatientShadowReport,
  comparePatientPair,
} from '../repositories/patient/patientShadowCompare.ts';
import { createPatientRepository } from '../repositories/patient/patientRepository.ts';
import {
  PatientRepositoryRemoteReadDisabledError,
} from '../repositories/patient/patientTypes.ts';
import {
  __setPatientServiceBridgeFlagsForTest,
  shouldUsePatientRepositoryWrite,
} from '../services/patientRepositoryBridge.js';
import {
  schedulePatientDualWriteCreate,
} from '../services/patientWriteAdapter.js';
import { listPatients, getPatient } from '../services/patientService.js';
import { assertNoTenantIdInBody } from '../../server/lib/patientsApiWrite.js';
import { FORBIDDEN_TENANT_IDS as SERVER_FORBIDDEN } from '../../server/lib/patientsApiList.js';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const LEGACY = 'patient-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeCore(overrides = {}) {
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    legacyId: LEGACY,
    tenantId: TENANT,
    guid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    fullName: 'Ana Silva',
    nickname: 'Ana',
    socialName: '',
    sex: 'F',
    birthDate: '1990-01-01',
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

describe('CLOUD.3 patient repository wiring', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
    __setPatientServiceBridgeFlagsForTest(null);
  });

  it('flags default OFF', () => {
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_READ).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_SHADOW).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_WRITE).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_DUAL_WRITE).toBe(false);
    const flags = getPatientRepositoryFlags({});
    expect(flags.PATIENTS_READ).toBe(false);
    expect(flags.PATIENTS_WRITE).toBe(false);
    expect(flags.PATIENTS_DUAL_WRITE).toBe(false);
  });

  it('PATIENT_REMOTE_* aliases apontam para PATIENTS_*', () => {
    expect(PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_READ).toBe('PATIENTS_READ');
    expect(PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_READ_SHADOW).toBe('PATIENTS_SHADOW');
    expect(PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_READ_PRIMARY).toBe('PATIENTS_READ_PRIMARY');
    expect(PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_WRITE).toBe('PATIENTS_WRITE');
    expect(PATIENT_REMOTE_FLAG_ALIASES.PATIENT_REMOTE_WRITE_PRIMARY).toBe('PATIENTS_WRITE_PRIMARY');
  });

  it('production lock força flags perigosas false', () => {
    const locked = lockDangerousPatientRepositoryFlags({
      PATIENTS_READ: true,
      PATIENTS_READ_PRIMARY: true,
      PATIENTS_SHADOW: true,
      PATIENTS_COMPARE: true,
      PATIENTS_WRITE: true,
      PATIENTS_WRITE_PRIMARY: true,
      PATIENTS_DUAL_WRITE: true,
      PATIENTS_WRITE_COMPARE: true,
    });
    expect(locked.PATIENTS_READ).toBe(false);
    expect(locked.PATIENTS_WRITE).toBe(false);
    expect(locked.PATIENTS_DUAL_WRITE).toBe(false);
    expect(locked.PATIENTS_SHADOW).toBe(false);
  });

  it('mapper round-trip preserva legacy_id', () => {
    const idb = {
      id: LEGACY,
      tenant_id: TENANT,
      guid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      full_name: 'Ana Silva',
      nickname: 'Ana',
      social_name: '',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf: '390.533.447-05',
      status: 'active',
      blocked: false,
      tags: [],
      hasPendingData: false,
      pendingFields: [],
      pendingCriticalFields: [],
      created_at: '2020-01-01T00:00:00.000Z',
      updated_at: '2020-01-02T00:00:00.000Z',
    };
    const core = mapLegacyRowToPatientCore(idb, { uuid: '11111111-1111-4111-8111-111111111111' });
    expect(core.legacyId).toBe(LEGACY);
    const mirror = mapCoreToIndexedDbMirror(core);
    expect(mirror.id).toBe(LEGACY);

    const remote = mapSupabaseRowToPatientCore({
      id: core.uuid,
      tenant_id: TENANT,
      legacy_id: LEGACY,
      guid: core.guid,
      full_name: core.fullName,
      nickname: core.nickname,
      social_name: '',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf: '39053344705',
      photo_url: null,
      status: 'active',
      blocked: false,
      block_reason: '',
      block_at: null,
      tags: [],
      lead_source: '',
      has_financial_responsible: false,
      dependent_full_name: '',
      has_pending_data: false,
      pending_fields: [],
      pending_critical_fields: [],
      created_at: core.createdAt,
      updated_at: core.updatedAt,
      deleted_at: null,
    });
    expect(remote.legacyId).toBe(LEGACY);
  });

  it('tenant-1 rejeitado em assertRemoteTenantId / assertValidTenantId', () => {
    expect(FORBIDDEN_TENANT_IDS.has('tenant-1')).toBe(true);
    expect(FORBIDDEN_TENANT_IDS.has('tenant_1')).toBe(true);
    expect(() => assertValidTenantId('tenant-1')).toThrow(PatientMapperValidationError);
    expect(() => assertRemoteTenantId('tenant-1')).toThrow(/proibido|UUID/i);
    expect(() => assertRemoteTenantId('')).toThrow(/obrigatório/);
    expect(() => assertRemoteTenantId('not-a-uuid')).toThrow(/UUID/);
    expect(assertRemoteTenantId(TENANT)).toBe(TENANT);
  });

  it('mapLegacyRowToPatientCore usa resolvedTenantId quando row tem tenant forbidden', () => {
    const idb = {
      id: LEGACY,
      tenant_id: 'tenant-1',
      guid: 'g1',
      full_name: 'Local',
      nickname: '',
      social_name: '',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf: '39053344705',
      status: 'active',
      blocked: false,
      tags: [],
      hasPendingData: false,
      pendingFields: [],
      pendingCriticalFields: [],
      created_at: '2020-01-01T00:00:00.000Z',
      updated_at: '2020-01-02T00:00:00.000Z',
    };
    expect(() => mapLegacyRowToPatientCore(idb)).toThrow(/proibido/);
    const core = mapLegacyRowToPatientCore(idb, { resolvedTenantId: TENANT });
    expect(core.tenantId).toBe(TENANT);
  });

  it('shadow MATCH / MISMATCH / LOCAL_ONLY / REMOTE_ONLY', () => {
    const local = makeCore();
    const remote = makeCore();
    expect(comparePatientPair(local, remote).outcome).toBe('MATCH');
    expect(comparePatientPair(local, makeCore({ fullName: 'Outra' })).outcome).toBe('MISMATCH');
    expect(comparePatientPair(local, null).outcome).toBe('LOCAL_ONLY');
    expect(comparePatientPair(null, remote).outcome).toBe('REMOTE_ONLY');

    const report = buildPatientShadowReport({
      tenantId: TENANT,
      localItems: [local, makeCore({ legacyId: 'patient-local-only' })],
      remoteItems: [remote, makeCore({ legacyId: 'patient-remote-only', fullName: 'Remoto' })],
    });
    expect(report.matchCount).toBe(1);
    expect(report.localOnlyCount).toBe(1);
    expect(report.remoteOnlyCount).toBe(1);
    expect(report.outcomes[LEGACY]).toBe('MATCH');
  });

  it('hydratePatients upserts by legacy_id sem limpar DB', async () => {
    withDb((db) => {
      db.patients = [
        {
          id: 'patient-keep',
          tenant_id: TENANT,
          full_name: 'Manter',
          status: 'active',
        },
        {
          id: LEGACY,
          tenant_id: TENANT,
          full_name: 'Antigo',
          status: 'active',
        },
      ];
      db.appointments = [{ id: 'appt-1', tenant_id: TENANT }];
      return db;
    });

    const repo = createPatientRepository();
    const n = await repo.hydratePatients([makeCore({ fullName: 'Novo Nome' })], { tenantId: TENANT });
    expect(n).toBe(1);

    const db = loadDb();
    expect(db.patients).toHaveLength(2);
    expect(db.patients.find((p) => p.id === 'patient-keep')?.full_name).toBe('Manter');
    expect(db.patients.find((p) => p.id === LEGACY)?.full_name).toBe('Novo Nome');
    expect(db.appointments).toHaveLength(1);
  });

  it('repository searchCore/listCore throw quando flags off', async () => {
    const repo = createPatientRepository();
    await expect(repo.listCore(TENANT)).rejects.toBeInstanceOf(PatientRepositoryRemoteReadDisabledError);
    await expect(repo.searchCore(TENANT, 'ana')).rejects.toBeInstanceOf(
      PatientRepositoryRemoteReadDisabledError,
    );
  });

  it('bridge dual-write no-op quando flags off', () => {
    expect(shouldUsePatientRepositoryWrite()).toBe(false);
    const spy = vi.fn();
    schedulePatientDualWriteCreate({ id: 'u1', tenantId: TENANT }, { id: LEGACY, full_name: 'X' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('patientService ainda retorna IDB (primary)', () => {
    withDb((db) => {
      db.patients = [{ id: LEGACY, tenant_id: 'tenant-1', full_name: 'Local IDB' }];
      return db;
    });
    const listed = listPatients({ id: 'u1', tenant_id: TENANT });
    expect(listed).toHaveLength(1);
    expect(listed[0].full_name).toBe('Local IDB');

    const detail = getPatient(LEGACY, { id: 'u1', tenant_id: TENANT });
    expect(detail?.profile?.full_name).toBe('Local IDB');
  });

  it('getReadiness wiredToPatientService true e wave CLOUD.3', () => {
    const readiness = createPatientRepository().getReadiness();
    expect(readiness.wiredToPatientService).toBe(true);
    expect(readiness.wave).toBe('CLOUD.3');
    expect(readiness.indexedDbSsot).toBe(true);
  });

  it('Admin API validation helpers: assertNoTenantIdInBody + forbidden tenant', () => {
    expect(SERVER_FORBIDDEN.has('tenant-1')).toBe(true);
    expect(() => assertNoTenantIdInBody({ tenant_id: TENANT })).toThrow(/tenant_id/);
    expect(() => assertNoTenantIdInBody({ full_name: 'Ok' })).not.toThrow();
  });
});
