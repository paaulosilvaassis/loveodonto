/**
 * CLOUD.9B — production dry-run contracts (no remote mutation).
 */
import { describe, expect, it } from 'vitest';
import {
  PATIENT_CLASS,
  classifyAllPatients,
  classifySatelliteRows,
  normalizeBirthDate,
  planRecordNumberCollisions,
  resolveTenantMapping,
} from '../domain/patients/patientBackfillDryRun.js';

const PROD = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const mapping = {
  targetStagingTenantUuid: PROD,
  sourceTenantIds: [PROD],
};

describe('CLOUD.9B production backfill dry-run contracts', () => {
  it('production tenant maps by identity (no remap)', () => {
    const mapped = resolveTenantMapping(PROD, mapping);
    expect(mapped.ok).toBe(true);
    expect(mapped.resolved).toBe(PROD);
    expect(mapped.via).toBe('identity');
  });

  it('normalizeBirthDate keeps CLOUD.5 DD/MM/YYYY 00:00:00 contract', () => {
    expect(normalizeBirthDate('15/12/2002 00:00:00')).toBe('2002-12-15');
  });

  it('empty production remote classifies all parents INSERT_SAFE', () => {
    const locals = Array.from({ length: 3 }, (_, i) => ({
      id: `patient-11111111-1111-4111-8111-11111111111${i}`,
      tenant_id: PROD,
      full_name: `Paciente ${i}`,
      cpf: null,
      birth_date: '01/01/1990 00:00:00',
      status: 'active',
      blocked: false,
      lead_source: '',
    }));
    const { counters } = classifyAllPatients(locals, [], mapping);
    expect(counters.INSERT_SAFE).toBe(3);
    expect(counters.CONFLICT).toBe(0);
    expect(counters.INVALID).toBe(0);
    expect(counters.MISSING_TENANT).toBe(0);
  });

  it('satellites become INSERT_AFTER_PARENT when parents are INSERT_SAFE', () => {
    const parentId = 'patient-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const parentClassByLegacy = new Map([[parentId, PATIENT_CLASS.INSERT_SAFE]]);
    const { counters, orphans } = classifySatelliteRows({
      rows: [{ id: 'record-1', patient_id: parentId, record_number: '1' }],
      localPatientIds: new Set([parentId]),
      parentClassByLegacy,
      remoteParentByLegacy: new Map(),
    });
    expect(counters.INSERT_AFTER_PARENT).toBe(1);
    expect(counters.ORPHAN_LOCAL).toBe(0);
    expect(orphans).toHaveLength(0);
  });

  it('record_number collision keeps first by legacy id and suffixes loser', () => {
    const plan = planRecordNumberCollisions([
      {
        id: 'record-4bb143f4-8175-45e7-8cfe-efc47aa96b96',
        patient_id: 'patient-c9cc87da-317b-4b6a-9afe-8ded726aec37',
        record_number: '1915',
      },
      {
        id: 'record-26fbd7eb-321b-4e2c-a7a4-781bcb6ac870',
        patient_id: 'patient-a9701d3f-0a39-485a-a305-eaf2dd406516',
        record_number: '1915',
      },
    ]);
    expect(plan.collisionGroups).toBe(1);
    expect(plan.collisionAdjustments).toBe(1);
    expect(plan.report[0].kept_legacy_id).toBe('record-26fbd7eb-321b-4e2c-a7a4-781bcb6ac870');
    expect(plan.report[0].adjusted_record_number).toBe(
      '1915__record-4bb143f4-8175-45e7-8cfe-efc47aa96b96',
    );
  });
});
