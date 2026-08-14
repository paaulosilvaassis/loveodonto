import { describe, expect, it } from 'vitest';
import {
  CHART_STATUSES,
  MULTIPLE_CORRECTION_POLICY,
  ODONTOGRAM_SCHEMA_VERSION,
  canonicalizeJson,
  createEmptyProjection,
  projectOdontogramEvents,
} from '../domain/odontogram/index.js';

const IDENTITY = {
  tenantId: 'tenant-test-1',
  chartId: 'chart-test-1',
  patientId: 'patient-test-1',
  actorId: 'dentist-test-1',
  occurredAt: '2026-03-01T12:00:00.000Z',
};

function evt(overrides) {
  return { ...IDENTITY, ...overrides };
}

function created(stage = 'permanent') {
  return evt({
    id: 'evt-1',
    sequence: 1,
    eventType: 'chart_created',
    payload: { dentitionStage: stage },
  });
}

describe('OD-1C projeção de eventos', () => {
  it('usa schema version e statuses do contrato OD-1B, sem catálogo paralelo', () => {
    expect(createEmptyProjection().schemaVersion).toBe(ODONTOGRAM_SCHEMA_VERSION);
    expect([...CHART_STATUSES]).toEqual(['draft', 'in_review', 'finalized']);
  });

  it('repete o stream de forma determinística', () => {
    const stream = [
      created(),
      evt({
        id: 'evt-2',
        sequence: 2,
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
        surfaces: ['O'],
      }),
    ];
    const first = projectOdontogramEvents(stream);
    const second = projectOdontogramEvents(stream);
    expect(first.ok).toBe(true);
    expect(canonicalizeJson(first.value)).toBe(canonicalizeJson(second.value));
    expect(first.value.status).toBe('draft');
    expect(first.value.teeth['16'].conditionCode).toBe('caries');
  });

  it('rejeita ID duplicado e ordenação não monotônica', () => {
    const duplicated = projectOdontogramEvents([
      created(),
      evt({
        id: 'evt-1',
        sequence: 2,
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
      }),
    ]);
    expect(duplicated.error.code).toBe('DUPLICATE_EVENT_ID');

    const skipped = projectOdontogramEvents([
      created(),
      evt({
        id: 'evt-2',
        sequence: 3,
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
      }),
    ]);
    expect(skipped.error.code).toBe('NON_MONOTONIC_SEQUENCE');

    const unordered = projectOdontogramEvents([
      evt({
        id: 'evt-2',
        sequence: 2,
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
      }),
      created(),
    ]);
    expect(unordered.error.code).toBe('NON_MONOTONIC_SEQUENCE');
  });

  it('rejeita mudança de tenant, patient ou chart no mesmo stream', () => {
    const result = projectOdontogramEvents([
      created(),
      evt({
        id: 'evt-2',
        sequence: 2,
        tenantId: 'tenant-test-2',
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
      }),
    ]);
    expect(result.error.code).toBe('IDENTITY_MISMATCH');
  });

  it('rejeita permanente em chart decíduo e o inverso; misto aceita os dois catálogos', () => {
    const primaryRejectsPermanent = projectOdontogramEvents([
      created('primary'),
      evt({
        id: 'evt-2',
        sequence: 2,
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
      }),
    ]);
    expect(primaryRejectsPermanent.error.code).toBe('TOOTH_OUTSIDE_DENTITION');

    const permanentRejectsPrimary = projectOdontogramEvents([
      created('permanent'),
      evt({
        id: 'evt-2',
        sequence: 2,
        eventType: 'condition_recorded',
        toothFdi: '51',
        conditionCode: 'caries',
      }),
    ]);
    expect(permanentRejectsPrimary.error.code).toBe('TOOTH_OUTSIDE_DENTITION');

    const mixed = projectOdontogramEvents([
      created('mixed'),
      evt({
        id: 'evt-2',
        sequence: 2,
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
        surfaces: ['O'],
      }),
      evt({
        id: 'evt-3',
        sequence: 3,
        eventType: 'condition_recorded',
        toothFdi: '51',
        conditionCode: 'sealant',
        surfaces: ['I'],
      }),
    ]);
    expect(mixed.ok).toBe(true);
    expect(mixed.value.teeth['16'].conditionCode).toBe('caries');
    expect(mixed.value.teeth['51'].conditionCode).toBe('sealant');
  });

  it('valida ciclo de vida, bloqueia mutação após finalize e reabre sem apagar histórico', () => {
    const invalidRepeat = projectOdontogramEvents([
      created(),
      evt({ id: 'evt-2', sequence: 2, eventType: 'chart_submitted_for_review' }),
      evt({ id: 'evt-3', sequence: 3, eventType: 'chart_submitted_for_review' }),
    ]);
    expect(invalidRepeat.error.code).toBe('INVALID_LIFECYCLE');

    const finalizedBlocks = projectOdontogramEvents([
      created(),
      evt({
        id: 'evt-2',
        sequence: 2,
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
        surfaces: ['O'],
      }),
      evt({ id: 'evt-3', sequence: 3, eventType: 'chart_finalized' }),
      evt({
        id: 'evt-4',
        sequence: 4,
        eventType: 'condition_recorded',
        toothFdi: '17',
        conditionCode: 'caries',
        surfaces: ['O'],
      }),
    ]);
    expect(finalizedBlocks.error.code).toBe('CHART_FINALIZED');

    const reopened = projectOdontogramEvents([
      created(),
      evt({
        id: 'evt-2',
        sequence: 2,
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
        surfaces: ['O'],
      }),
      evt({ id: 'evt-3', sequence: 3, eventType: 'chart_submitted_for_review' }),
      evt({ id: 'evt-4', sequence: 4, eventType: 'chart_finalized' }),
      evt({
        id: 'evt-5',
        sequence: 5,
        eventType: 'chart_reopened',
        reason: 'Reabertura para revisão clínica fictícia.',
      }),
      evt({
        id: 'evt-6',
        sequence: 6,
        eventType: 'condition_recorded',
        toothFdi: '17',
        conditionCode: 'fracture',
        surfaces: ['V'],
      }),
    ]);
    expect(reopened.ok).toBe(true);
    expect(reopened.value.status).toBe('draft');
    expect(reopened.value.teeth['16'].conditionCode).toBe('caries');
    expect(reopened.value.teeth['17'].conditionCode).toBe('fracture');
    expect(reopened.value.audit.eventIds).toEqual(['evt-1', 'evt-2', 'evt-3', 'evt-4', 'evt-5', 'evt-6']);
  });

  it('mantém o evento original após correção e rejeita referência futura, cruzada e segunda correção', () => {
    expect(MULTIPLE_CORRECTION_POLICY).toBe('reject_after_first');
    const recorded = evt({
      id: 'evt-2',
      sequence: 2,
      eventType: 'condition_recorded',
      toothFdi: '16',
      conditionCode: 'caries',
      surfaces: ['O'],
    });
    const corrected = projectOdontogramEvents([
      created(),
      recorded,
      evt({
        id: 'evt-3',
        sequence: 3,
        eventType: 'condition_corrected',
        toothFdi: '16',
        conditionCode: 'restoration',
        surfaces: ['O'],
        referencedEventId: 'evt-2',
        reason: 'Diagnóstico reavaliado em dente 16.',
      }),
    ]);
    expect(corrected.ok).toBe(true);
    expect(corrected.value.teeth['16'].conditionCode).toBe('restoration');
    expect(corrected.value.audit.originalEvents['evt-2'].conditionCode).toBe('caries');
    expect(corrected.value.audit.corrections[0].referencedEventId).toBe('evt-2');

    const forward = projectOdontogramEvents([
      created(),
      evt({
        id: 'evt-2',
        sequence: 2,
        eventType: 'condition_corrected',
        toothFdi: '16',
        conditionCode: 'restoration',
        referencedEventId: 'evt-3',
        reason: 'Referência futura inválida.',
      }),
    ]);
    expect(forward.error.code).toBe('INVALID_REFERENCE');

    const crossChart = projectOdontogramEvents([
      created(),
      recorded,
      evt({
        id: 'evt-3',
        sequence: 3,
        chartId: 'chart-test-other',
        eventType: 'condition_corrected',
        toothFdi: '16',
        conditionCode: 'restoration',
        referencedEventId: 'evt-2',
        reason: 'Chart diferente.',
      }),
    ]);
    expect(crossChart.error.code).toBe('IDENTITY_MISMATCH');

    const secondCorrection = projectOdontogramEvents([
      created(),
      recorded,
      evt({
        id: 'evt-3',
        sequence: 3,
        eventType: 'condition_corrected',
        toothFdi: '16',
        conditionCode: 'restoration',
        surfaces: ['O'],
        referencedEventId: 'evt-2',
        reason: 'Primeira correção.',
      }),
      evt({
        id: 'evt-4',
        sequence: 4,
        eventType: 'condition_corrected',
        toothFdi: '16',
        conditionCode: 'observation',
        referencedEventId: 'evt-2',
        reason: 'Segunda correção do mesmo original.',
      }),
    ]);
    expect(secondCorrection.error.code).toBe('MULTIPLE_CORRECTION');
  });

  it('não compartilha arrays/objetos aninhados com os eventos de entrada', () => {
    const surfaces = ['O', 'M'];
    const payload = { dentitionStage: 'permanent' };
    const stream = [
      evt({
        id: 'evt-1',
        sequence: 1,
        eventType: 'chart_created',
        payload,
      }),
      evt({
        id: 'evt-2',
        sequence: 2,
        eventType: 'condition_recorded',
        toothFdi: '16',
        conditionCode: 'caries',
        surfaces,
      }),
    ];
    const result = projectOdontogramEvents(stream);
    expect(result.ok).toBe(true);
    surfaces.push('D');
    payload.dentitionStage = 'mixed';
    expect(result.value.dentitionStage).toBe('permanent');
    expect(result.value.teeth['16'].surfaces).toEqual(['M', 'O']);
    expect(result.value.teeth['16'].surfaces).not.toBe(surfaces);
    result.value.teeth['16'].conditionCode = 'missing';
    const replay = projectOdontogramEvents(stream);
    expect(replay.value.teeth['16'].conditionCode).toBe('caries');
  });
});
