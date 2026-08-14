import { describe, expect, it } from 'vitest';
import { EVENT_RULES, validateCanonicalEvent } from '../domain/odontogram/index.js';
import {
  CHART_STATUSES,
  ODONTOGRAM_CORRECTION_EVENT_TYPES,
  ODONTOGRAM_EVENT_TYPES,
  ODONTOGRAM_SCHEMA_VERSION,
} from '../domain/odontogram/schemaContract.js';

const IDENTITY = Object.freeze({
  tenantId: 'tenant-test-1',
  chartId: 'chart-test-1',
  patientId: 'patient-test-1',
  actorId: 'dentist-test-1',
  occurredAt: '2026-03-01T12:00:00.000Z',
});

function buildEvent(overrides) {
  return { ...IDENTITY, ...overrides };
}

describe('OD-1C regras dos 13 tipos de evento', () => {
  it('define regra explícita para cada tipo canônico, sem catálogo paralelo', () => {
    expect(Object.keys(EVENT_RULES)).toEqual([...ODONTOGRAM_EVENT_TYPES]);
    const correctionTypes = ODONTOGRAM_EVENT_TYPES.filter(
      (type) => EVENT_RULES[type].referencedEventId === 'required',
    );
    expect(correctionTypes).toEqual([...ODONTOGRAM_CORRECTION_EVENT_TYPES]);
    expect(CHART_STATUSES).toEqual(['draft', 'in_review', 'finalized']);
    expect(ODONTOGRAM_SCHEMA_VERSION).toBe('1.0.0');
    for (const type of ODONTOGRAM_EVENT_TYPES) {
      const spec = EVENT_RULES[type];
      expect(['required', 'optional', 'forbidden']).toContain(spec.toothFdi);
      expect(['required', 'optional', 'forbidden']).toContain(spec.conditionCode);
      expect(['required', 'optional', 'forbidden']).toContain(spec.surfaces);
      expect(['required', 'optional', 'forbidden']).toContain(spec.referencedEventId);
      expect(['required', 'optional', 'forbidden']).toContain(spec.reason);
    }
  });

  it('aceita envelopes mínimos válidos para os 13 tipos', () => {
    const samples = [
      buildEvent({ id: 'evt-created', sequence: 1, eventType: 'chart_created', payload: { dentitionStage: 'permanent' } }),
      buildEvent({ id: 'evt-recorded', sequence: 2, eventType: 'condition_recorded', toothFdi: '16', conditionCode: 'caries', surfaces: ['O', 'M'] }),
      buildEvent({ id: 'evt-corrected', sequence: 3, eventType: 'condition_corrected', toothFdi: '16', conditionCode: 'restoration', surfaces: ['O'], referencedEventId: 'evt-recorded', reason: 'Ajuste clínico de restauração.' }),
      buildEvent({ id: 'evt-removed', sequence: 4, eventType: 'condition_removed', toothFdi: '16', referencedEventId: 'evt-recorded', reason: 'Condição lançada no dente errado.' }),
      buildEvent({ id: 'evt-planned', sequence: 5, eventType: 'procedure_planned', plannedProcedureId: 'proc-plan-1', toothFdi: '16' }),
      buildEvent({ id: 'evt-auth', sequence: 6, eventType: 'procedure_authorized', plannedProcedureId: 'proc-plan-1' }),
      buildEvent({ id: 'evt-started', sequence: 7, eventType: 'procedure_started', appointmentId: 'appt-test-1' }),
      buildEvent({ id: 'evt-completed', sequence: 8, eventType: 'procedure_completed', executedProcedureId: 'exec-test-1' }),
      buildEvent({ id: 'evt-cancelled', sequence: 9, eventType: 'procedure_cancelled', plannedProcedureId: 'proc-plan-1' }),
      buildEvent({ id: 'evt-review', sequence: 10, eventType: 'chart_submitted_for_review' }),
      buildEvent({ id: 'evt-reopened', sequence: 11, eventType: 'chart_reopened', reason: 'Reabertura para correção clínica.' }),
      buildEvent({ id: 'evt-finalized', sequence: 12, eventType: 'chart_finalized' }),
      buildEvent({ id: 'evt-generic', sequence: 13, eventType: 'correction_recorded', referencedEventId: 'evt-recorded', reason: 'Nota de auditoria clínica.' }),
    ];
    for (const sample of samples) {
      const result = validateCanonicalEvent(sample);
      expect(result.ok, sample.eventType).toBe(true);
    }
  });

  it('rejeita tipo desconhecido', () => {
    const result = validateCanonicalEvent(buildEvent({
      id: 'evt-x',
      sequence: 1,
      eventType: 'tab_opened',
      payload: { dentitionStage: 'permanent' },
    }));
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('UNKNOWN_EVENT_TYPE');
    expect(result.value).toBeNull();
  });

  it('rejeita FDI, condição e superfície inválidos, sem conversão silenciosa', () => {
    const invalidFdi = validateCanonicalEvent(buildEvent({
      id: 'evt-fdi',
      sequence: 1,
      eventType: 'condition_recorded',
      toothFdi: '99',
      conditionCode: 'caries',
    }));
    const invalidCondition = validateCanonicalEvent(buildEvent({
      id: 'evt-cond',
      sequence: 1,
      eventType: 'condition_recorded',
      toothFdi: '16',
      conditionCode: 'CARIE',
    }));
    const invalidSurface = validateCanonicalEvent(buildEvent({
      id: 'evt-surf',
      sequence: 1,
      eventType: 'condition_recorded',
      toothFdi: '16',
      conditionCode: 'caries',
      surfaces: ['m'],
    }));
    expect(invalidFdi.error.code).toBe('INVALID_FDI');
    expect(invalidCondition.error.code).toBe('INVALID_CONDITION');
    expect(invalidSurface.error.code).toBe('INVALID_SURFACE_CODE');
  });

  it('rejeita superfícies duplicadas e devolve ordem canônica', () => {
    const duplicated = validateCanonicalEvent(buildEvent({
      id: 'evt-dup',
      sequence: 1,
      eventType: 'condition_recorded',
      toothFdi: '16',
      conditionCode: 'caries',
      surfaces: ['O', 'M', 'O'],
    }));
    expect(duplicated.ok).toBe(false);
    expect(duplicated.error.code).toBe('DUPLICATE_SURFACE');

    const ordered = validateCanonicalEvent(buildEvent({
      id: 'evt-order',
      sequence: 1,
      eventType: 'condition_recorded',
      toothFdi: '16',
      conditionCode: 'caries',
      surfaces: ['O', 'M', 'D'],
    }));
    expect(ordered.ok).toBe(true);
    expect(ordered.value.surfaces).toEqual(['M', 'D', 'O']);
  });

  it('exige vínculo clínico em procedure_completed e rejeita budgetItemId sozinho', () => {
    const budgetOnly = validateCanonicalEvent(buildEvent({
      id: 'evt-budget',
      sequence: 1,
      eventType: 'procedure_completed',
      budgetItemId: 'budget-item-test-1',
    }));
    expect(budgetOnly.ok).toBe(false);
    expect(budgetOnly.error.code).toBe('MISSING_CLINICAL_LINK');

    const completed = validateCanonicalEvent(buildEvent({
      id: 'evt-done',
      sequence: 1,
      eventType: 'procedure_completed',
      executedProcedureId: 'exec-test-1',
      budgetItemId: 'budget-item-test-1',
    }));
    expect(completed.ok).toBe(true);

    const byAppointment = validateCanonicalEvent(buildEvent({
      id: 'evt-appt',
      sequence: 1,
      eventType: 'procedure_completed',
      appointmentId: 'appt-test-1',
    }));
    expect(byAppointment.ok).toBe(true);
  });

  it('exige referência e razão clínica nas correções, sem auto-referência', () => {
    const missing = validateCanonicalEvent(buildEvent({
      id: 'evt-corr',
      sequence: 1,
      eventType: 'condition_corrected',
      toothFdi: '16',
      conditionCode: 'restoration',
    }));
    expect(missing.ok).toBe(false);
    expect(['MISSING_FIELD', 'MISSING_CONDITION']).toContain(missing.error.code);

    const selfRef = validateCanonicalEvent(buildEvent({
      id: 'evt-self',
      sequence: 1,
      eventType: 'correction_recorded',
      referencedEventId: 'evt-self',
      reason: 'Tentativa inválida.',
    }));
    expect(selfRef.error.code).toBe('SELF_REFERENCE');

    const blankReason = validateCanonicalEvent(buildEvent({
      id: 'evt-blank',
      sequence: 1,
      eventType: 'chart_reopened',
      reason: '   ',
    }));
    expect(blankReason.ok).toBe(false);
  });

  it('rejeita IDs só com trim, payload financeiro e não muta o caller', () => {
    const trimOnly = validateCanonicalEvent(buildEvent({
      id: '   ',
      sequence: 1,
      eventType: 'chart_created',
      payload: { dentitionStage: 'permanent' },
    }));
    expect(trimOnly.ok).toBe(false);

    const financial = validateCanonicalEvent(buildEvent({
      id: 'evt-fin',
      sequence: 1,
      eventType: 'chart_created',
      payload: { dentitionStage: 'permanent', payment_id: 'pay-1' },
    }));
    expect(financial.error.code).toBe('FORBIDDEN_PAYLOAD_KEY');

    const missingSurfaces = validateCanonicalEvent(buildEvent({
      id: 'evt-missing',
      sequence: 1,
      eventType: 'condition_recorded',
      toothFdi: '16',
      conditionCode: 'missing',
      surfaces: ['O'],
    }));
    expect(missingSurfaces.error.code).toBe('INCOMPATIBLE_SURFACES');

    const input = buildEvent({
      id: 'evt-mut',
      sequence: 1,
      eventType: 'condition_recorded',
      toothFdi: '16',
      conditionCode: 'caries',
      surfaces: ['O', 'M'],
      payload: { note: 'fictício' },
    });
    const snapshot = JSON.stringify(input);
    const result = validateCanonicalEvent(input);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(input)).toBe(snapshot);
    result.value.surfaces.push('D');
    result.value.payload.note = 'alterado';
    expect(input.surfaces).toEqual(['O', 'M']);
    expect(input.payload.note).toBe('fictício');
    expect(result.value.surfaces).not.toBe(input.surfaces);
    expect(result.value.payload).not.toBe(input.payload);
  });

  it('proíbe payload de dente em eventos de ciclo de vida', () => {
    const created = validateCanonicalEvent(buildEvent({
      id: 'evt-bad-created',
      sequence: 1,
      eventType: 'chart_created',
      toothFdi: '16',
      conditionCode: 'caries',
      payload: { dentitionStage: 'permanent' },
    }));
    expect(created.ok).toBe(false);
    expect(created.error.code).toBe('FORBIDDEN_FIELD');
  });
});
