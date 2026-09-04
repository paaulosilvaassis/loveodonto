/**
 * CLOUD.4 — unit tests for patient backfill dry-run classifier.
 * No production / no remote mutation.
 */
import { describe, expect, it } from 'vitest';
import {
  PATIENT_CLASS,
  CONFLICT_REASON,
  classifyLocalPatient,
  classifyAllPatients,
  classifySatelliteRows,
  buildLocalIndexCounts,
  buildRemoteIndexes,
  resolveTenantMapping,
  canonicalPatientHash,
  buildCanonicalPatientPayload,
  maskCpf,
} from '../domain/patients/patientBackfillDryRun.js';

const TARGET = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const SOURCE = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const mapping = {
  targetStagingTenantUuid: TARGET,
  sourceTenantIds: [SOURCE, 'tenant-1'],
};

function localPatient(overrides = {}) {
  return {
    id: 'patient-11111111-1111-4111-8111-111111111111',
    tenant_id: SOURCE,
    full_name: 'Maria Silva',
    cpf: '529.982.247-25',
    birth_date: '1990-01-15',
    status: 'active',
    blocked: false,
    lead_source: 'indicacao',
    ...overrides,
  };
}

describe('CLOUD.4 patient backfill dry-run classifier', () => {
  it('resolveTenantMapping maps clinic UUID and tenant-1', () => {
    expect(resolveTenantMapping(SOURCE, mapping).resolved).toBe(TARGET);
    expect(resolveTenantMapping('tenant-1', mapping).resolved).toBe(TARGET);
    expect(resolveTenantMapping('unknown-tenant', mapping).ok).toBe(false);
  });

  it('maskCpf hides identity', () => {
    expect(maskCpf('52998224725')).toBe('***.***.***-25');
  });

  it('INSERT_SAFE when remote empty', () => {
    const { localLegacyCounts, localCpfCounts } = buildLocalIndexCounts([localPatient()]);
    const result = classifyLocalPatient(localPatient(), {
      remoteByLegacy: new Map(),
      remoteByCpf: new Map(),
      localLegacyCounts,
      localCpfCounts,
      tenantMapping: mapping,
    });
    expect(result.class).toBe(PATIENT_CLASS.INSERT_SAFE);
    expect(result.resolvedTenantId).toBe(TARGET);
    expect(result.payload.cpf).toBe('52998224725');
  });

  it('MATCH_EXISTING when hashes align', () => {
    const local = localPatient();
    const payload = buildCanonicalPatientPayload(local, TARGET);
    const remote = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenant_id: TARGET,
      legacy_id: local.id,
      full_name: local.full_name,
      cpf: '52998224725',
      birth_date: '1990-01-15',
      status: 'active',
      blocked: false,
      lead_source: 'indicacao',
    };
    const { localLegacyCounts, localCpfCounts } = buildLocalIndexCounts([local]);
    const { remoteByLegacy, remoteByCpf } = buildRemoteIndexes([remote]);
    const result = classifyLocalPatient(local, {
      remoteByLegacy,
      remoteByCpf,
      localLegacyCounts,
      localCpfCounts,
      tenantMapping: mapping,
    });
    expect(result.class).toBe(PATIENT_CLASS.MATCH_EXISTING);
    expect(result.localHash).toBe(canonicalPatientHash(payload));
  });

  it('CONFLICT_REMOTE_LEGACY_DIVERGED on name mismatch', () => {
    const local = localPatient();
    const remote = {
      tenant_id: TARGET,
      legacy_id: local.id,
      full_name: 'Outro Nome',
      cpf: '52998224725',
      birth_date: '1990-01-15',
      status: 'active',
      blocked: false,
      lead_source: 'indicacao',
    };
    const { localLegacyCounts, localCpfCounts } = buildLocalIndexCounts([local]);
    const { remoteByLegacy, remoteByCpf } = buildRemoteIndexes([remote]);
    const result = classifyLocalPatient(local, {
      remoteByLegacy,
      remoteByCpf,
      localLegacyCounts,
      localCpfCounts,
      tenantMapping: mapping,
    });
    expect(result.class).toBe(PATIENT_CLASS.CONFLICT);
    expect(result.reason).toBe(CONFLICT_REASON.CONFLICT_REMOTE_LEGACY_DIVERGED);
    expect(result.diffs).toContain('full_name');
  });

  it('CONFLICT_REMOTE_CPF_OTHER_LEGACY', () => {
    const local = localPatient();
    const remote = {
      tenant_id: TARGET,
      legacy_id: 'patient-22222222-2222-4222-8222-222222222222',
      full_name: 'Outro',
      cpf: '52998224725',
      status: 'active',
    };
    const { localLegacyCounts, localCpfCounts } = buildLocalIndexCounts([local]);
    const { remoteByLegacy, remoteByCpf } = buildRemoteIndexes([remote]);
    const result = classifyLocalPatient(local, {
      remoteByLegacy,
      remoteByCpf,
      localLegacyCounts,
      localCpfCounts,
      tenantMapping: mapping,
    });
    expect(result.class).toBe(PATIENT_CLASS.CONFLICT);
    expect(result.reason).toBe(CONFLICT_REASON.CONFLICT_REMOTE_CPF_OTHER_LEGACY);
  });

  it('INVALID missing name / bad cpf / bad id', () => {
    const baseCtx = {
      remoteByLegacy: new Map(),
      remoteByCpf: new Map(),
      localLegacyCounts: new Map([['patient-x', 1]]),
      localCpfCounts: new Map(),
      tenantMapping: mapping,
    };
    expect(classifyLocalPatient(localPatient({ full_name: '' }), {
      ...baseCtx,
      localLegacyCounts: new Map([[localPatient().id, 1]]),
    }).class).toBe(PATIENT_CLASS.INVALID);

    expect(classifyLocalPatient(localPatient({ cpf: '123' }), {
      ...baseCtx,
      localLegacyCounts: new Map([[localPatient().id, 1]]),
    }).reason).toBe('INVALID_CPF_LENGTH');

    expect(classifyLocalPatient(localPatient({ id: 'bad-id' }), baseCtx).reason)
      .toBe('INVALID_LEGACY_ID');
  });

  it('MISSING_TENANT when unmapped', () => {
    const local = localPatient({ tenant_id: 'other-clinic' });
    const { localLegacyCounts, localCpfCounts } = buildLocalIndexCounts([local]);
    const result = classifyLocalPatient(local, {
      remoteByLegacy: new Map(),
      remoteByCpf: new Map(),
      localLegacyCounts,
      localCpfCounts,
      tenantMapping: mapping,
    });
    expect(result.class).toBe(PATIENT_CLASS.MISSING_TENANT);
  });

  it('duplicate local CPF / legacy', () => {
    const a = localPatient();
    const b = localPatient({ id: 'patient-22222222-2222-4222-8222-222222222222' });
    const all = classifyAllPatients([a, b], [], mapping);
    // same CPF on two locals
    expect(all.counters.CONFLICT).toBe(2);
    expect(all.conflictReasons.CONFLICT_LOCAL_DUPLICATE_CPF).toBe(2);

    const dupId = classifyAllPatients([a, { ...a }], [], mapping);
    expect(dupId.conflictReasons.CONFLICT_LOCAL_DUPLICATE_LEGACY).toBe(2);
  });

  it('satellite orphan and pending parent insert', () => {
    const parentClassByLegacy = new Map([
      ['patient-11111111-1111-4111-8111-111111111111', PATIENT_CLASS.INSERT_SAFE],
    ]);
    const localPatientIds = new Set(['patient-11111111-1111-4111-8111-111111111111']);
    const classified = classifySatelliteRows({
      rows: [
        { id: 'phone-1', patient_id: 'patient-11111111-1111-4111-8111-111111111111' },
        { id: 'phone-2', patient_id: 'patient-missing' },
      ],
      localPatientIds,
      parentClassByLegacy,
      remoteParentByLegacy: new Map(),
    });
    expect(classified.counters.PENDING_PARENT_INSERT_SAFE).toBe(1);
    expect(classified.counters.ORPHAN_LOCAL).toBe(1);
  });
});
