import { describe, expect, it } from 'vitest';
import {
  EVENT_HASH_CONTENT_FIELDS,
  buildEventHashCandidate,
  canonicalizeJson,
  hashOdontogramEvent,
  verifyOdontogramEventChain,
} from '../domain/odontogram/index.js';

const BASE = Object.freeze({
  schemaVersion: '1.0.0',
  tenantId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001',
  patientId: 'patient-test-1',
  chartId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002',
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0003',
  sequence: 1,
  eventType: 'chart_created',
  toothFdi: null,
  surfaces: [],
  conditionCode: null,
  payload: { dentitionStage: 'permanent' },
  reason: null,
  occurredAt: '2026-03-01T12:00:00.000Z',
  actorId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0004',
  appointmentId: null,
  budgetItemId: null,
  executedProcedureId: null,
  plannedProcedureId: null,
  referencedEventId: null,
  previousEventHash: null,
});

describe('OD-1E hash-chain de eventos', () => {
  it('hasheia o primeiro evento com previousEventHash null e 64 hex minúsculos', async () => {
    const hashed = await hashOdontogramEvent(BASE);
    expect(hashed.ok).toBe(true);
    expect(hashed.value).toMatch(/^[0-9a-f]{64}$/);
    expect(EVENT_HASH_CONTENT_FIELDS).toContain('previousEventHash');
    expect(EVENT_HASH_CONTENT_FIELDS).not.toContain('eventHash');
    expect(EVENT_HASH_CONTENT_FIELDS).not.toContain('createdAt');
  });

  it('encadeia o segundo evento, é determinístico e independente da ordem de inserção das chaves', async () => {
    const first = await hashOdontogramEvent(BASE);
    const secondInput = {
      ...BASE,
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0005',
      sequence: 2,
      eventType: 'condition_recorded',
      toothFdi: '16',
      conditionCode: 'caries',
      surfaces: ['O'],
      payload: {},
      previousEventHash: first.value,
    };
    const second = await hashOdontogramEvent(secondInput);
    const again = await hashOdontogramEvent(secondInput);
    expect(second.value).toBe(again.value);
    const reordered = {
      previousEventHash: first.value,
      eventType: 'condition_recorded',
      payload: {},
      surfaces: ['O'],
      conditionCode: 'caries',
      toothFdi: '16',
      sequence: 2,
      id: secondInput.id,
      schemaVersion: BASE.schemaVersion,
      tenantId: BASE.tenantId,
      patientId: BASE.patientId,
      chartId: BASE.chartId,
      occurredAt: BASE.occurredAt,
      actorId: BASE.actorId,
      appointmentId: null,
      budgetItemId: null,
      executedProcedureId: null,
      plannedProcedureId: null,
      referencedEventId: null,
      reason: null,
    };
    expect((await hashOdontogramEvent(reordered)).value).toBe(second.value);
    const changed = await hashOdontogramEvent({ ...secondInput, conditionCode: 'restoration' });
    expect(changed.value).not.toBe(second.value);
    const chain = await verifyOdontogramEventChain([
      { ...BASE, eventHash: first.value },
      { ...secondInput, eventHash: second.value },
    ]);
    expect(chain.ok).toBe(true);
  });

  it('detecta previous hash quebrado, lacuna de sequence e autoinclusão de eventHash', async () => {
    const first = await hashOdontogramEvent(BASE);
    const secondInput = {
      ...BASE,
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0005',
      sequence: 2,
      eventType: 'condition_recorded',
      toothFdi: '16',
      conditionCode: 'caries',
      previousEventHash: 'b'.repeat(64),
    };
    const second = await hashOdontogramEvent(secondInput);
    const broken = await verifyOdontogramEventChain([
      { ...BASE, eventHash: first.value },
      { ...secondInput, eventHash: second.value },
    ]);
    expect(broken.error.code).toBe('EVENT_CHAIN_INVALID');
    const gap = await verifyOdontogramEventChain([
      { ...BASE, eventHash: first.value },
      { ...secondInput, sequence: 3, previousEventHash: first.value, eventHash: second.value },
    ]);
    expect(gap.error.code).toBe('EVENT_SEQUENCE_CONFLICT');
    expect(buildEventHashCandidate({ ...BASE, eventHash: first.value }).error.code).toBe('HASH_FIELD_FORBIDDEN');
    expect((await hashOdontogramEvent({ ...BASE, sequence: 1, previousEventHash: first.value })).error.code)
      .toBe('INVALID_PREVIOUS_HASH');
    expect((await hashOdontogramEvent({ ...BASE, sequence: 2, previousEventHash: null })).error.code)
      .toBe('INVALID_PREVIOUS_HASH');
  });

  it('não muta a entrada e o JSON canônico do candidato é estável', () => {
    const input = { ...BASE, payload: { dentitionStage: 'permanent', note: 'ok' } };
    const before = JSON.stringify(input);
    const built = buildEventHashCandidate(input);
    expect(built.ok).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(canonicalizeJson(built.value)).toBe(canonicalizeJson(buildEventHashCandidate(input).value));
  });
});
