import { describe, expect, it } from 'vitest';
import {
  CREATE_CHART_EXPECTED_ROW_VERSION,
  DATABASE_GENERATED_FIELDS,
  EVENT_TYPE_TO_OPERATION,
  ODONTOGRAM_EVENT_FIELD_MAP,
  ODONTOGRAM_EVENT_TYPES,
  ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP,
  TRANSACTION_PORT_METHODS,
  TRUSTED_ODONTOGRAM_SERVER_ACTOR_KIND,
  VERSION_CREATION_EVENT_TYPES,
  assertOdontogramCommand,
  assertTrustedOdontogramServerActor,
  isCanonicalUuid,
  isPersistencePatientId,
  mapDomainChartToSqlRow,
  mapDomainChartVersionToSqlRow,
  mapDomainEventToSqlRow,
  mapDomainToothStateToSqlRow,
} from '../domain/odontogram/index.js';

const EVENT_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001';
const TENANT_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002';
const ACTOR_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0003';
const CHART_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0004';

function domainEvent(overrides = {}) {
  return {
    id: EVENT_UUID,
    tenantId: TENANT_UUID,
    chartId: CHART_UUID,
    patientId: 'patient-test-1',
    sequence: 1,
    eventType: 'chart_created',
    toothFdi: null,
    surfaces: [],
    conditionCode: null,
    payload: { dentitionStage: 'permanent' },
    reason: null,
    occurredAt: '2026-03-01T12:00:00.000Z',
    actorId: ACTOR_UUID,
    appointmentId: null,
    budgetItemId: null,
    executedProcedureId: null,
    plannedProcedureId: null,
    referencedEventId: null,
    eventHash: 'a'.repeat(64),
    previousEventHash: null,
    createdAt: '2026-03-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('OD-1E contrato de persistência', () => {
  it('mapeia todos os campos persistidos para snake_case da 041, sem duplicar o mapa de domínio', () => {
    expect(ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP.sequence).toBe('event_sequence');
    expect(ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP.referencedEventId).toBe('referenced_event_id');
    expect(ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP.eventHash).toBe('event_hash');
    expect(ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP.previousEventHash).toBe('previous_event_hash');
    expect(ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP.createdAt).toBe('created_at');
    for (const [domainKey, sqlKey] of Object.entries(ODONTOGRAM_EVENT_FIELD_MAP)) {
      expect(ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP[domainKey]).toBe(sqlKey);
    }
    const mapped = mapDomainEventToSqlRow(domainEvent());
    expect(mapped.ok).toBe(true);
    expect(mapped.value.event_sequence).toBe(1);
    expect(mapped.value.referenced_event_id).toBeNull();
    expect(mapped.value.event_hash).toHaveLength(64);
    expect(mapped.value.previous_event_hash).toBeNull();
    expect(mapped.value.created_at).toBe('2026-03-01T12:00:00.000Z');
    expect(Object.keys(mapped.value).length).toBe(Object.keys(ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP).length);
    expect(DATABASE_GENERATED_FIELDS.events).toEqual(['created_at']);
    expect(TRANSACTION_PORT_METHODS).toContain('insertEvent');
  });

  it('rejeita campos desconhecidos e não muta a entrada', () => {
    const input = domainEvent({ color: '#fff' });
    const before = JSON.stringify(input);
    const mapped = mapDomainEventToSqlRow(input);
    expect(mapped.ok).toBe(false);
    expect(mapped.error.code).toBe('UNKNOWN_PERSISTENCE_FIELD');
    expect(JSON.stringify(input)).toBe(before);
    expect(mapDomainChartToSqlRow({ id: CHART_UUID, extra: true }).ok).toBe(false);
    expect(mapDomainToothStateToSqlRow({ id: EVENT_UUID, mesh: [] }).ok).toBe(false);
    expect(mapDomainChartVersionToSqlRow({ id: EVENT_UUID, uiLabel: 'x' }).ok).toBe(false);
  });

  it('valida UUID canônico na fronteira e mantém patient_id textual da 041', () => {
    expect(isCanonicalUuid(EVENT_UUID)).toBe(true);
    expect(isCanonicalUuid(EVENT_UUID.toUpperCase())).toBe(false);
    expect(isCanonicalUuid(` ${EVENT_UUID}`)).toBe(false);
    expect(isCanonicalUuid('evt-1')).toBe(false);
    expect(isCanonicalUuid('')).toBe(false);
    expect(isPersistencePatientId('patient-test-1')).toBe(true);
    expect(isPersistencePatientId(' patient-test-1')).toBe(false);
    expect(isPersistencePatientId(EVENT_UUID)).toBe(true);
    expect(CREATE_CHART_EXPECTED_ROW_VERSION).toBe(0);
    expect(VERSION_CREATION_EVENT_TYPES).toEqual(['chart_finalized', 'chart_reopened']);
  });

  it('rejeita ator malformado, flags truthy e command com adminOverride', () => {
    expect(assertTrustedOdontogramServerActor(null).error.code).toBe('INVALID_ACTOR_CONTEXT');
    const base = {
      kind: TRUSTED_ODONTOGRAM_SERVER_ACTOR_KIND,
      userId: ACTOR_UUID,
      tenantId: TENANT_UUID,
      patientId: 'patient-test-1',
      permissions: ['prontuario_odontograma:edit'],
      tenantMatches: true,
      patientMatches: true,
    };
    expect(assertTrustedOdontogramServerActor({ ...base, userId: 'evt-1' }).error.code).toBe('INVALID_ACTOR_CONTEXT');
    expect(assertTrustedOdontogramServerActor({ ...base, adminOverride: 'true' }).error.code).toBe('INVALID_ACTOR_CONTEXT');
    expect(assertTrustedOdontogramServerActor({ ...base, tenantMatches: 'true' }).error.code).toBe('TENANT_MISMATCH');
    const actor = { ...base };
    const frozen = assertTrustedOdontogramServerActor(actor);
    expect(frozen.ok).toBe(true);
    actor.permissions.push('x');
    expect(frozen.value.permissions).toEqual(['prontuario_odontograma:edit']);
    expect(assertOdontogramCommand({
      intent: 'condition_recorded',
      expectedRowVersion: 1,
      chartId: CHART_UUID,
      adminOverride: true,
    }).error.code).toBe('INVALID_COMMAND');
    expect(assertOdontogramCommand({
      intent: 'condition_recorded',
      expectedRowVersion: 1,
      chartId: CHART_UUID,
      createdBy: ACTOR_UUID,
    }).error.code).toBe('INVALID_COMMAND');
    expect(new Set(Object.keys(EVENT_TYPE_TO_OPERATION))).toEqual(new Set(ODONTOGRAM_EVENT_TYPES));
  });
});
