import { cloneCanonicalJson, hashCanonicalSnapshot } from './canonicalJson.js';
import { ODONTOGRAM_SCHEMA_VERSION } from './schemaContract.js';

const HASH_RE = /^[0-9a-f]{64}$/;
const FORBIDDEN_HASH_KEYS = Object.freeze([
  'eventHash', 'event_hash', 'snapshotHash', 'snapshot_hash',
]);

export const EVENT_HASH_CONTENT_FIELDS = Object.freeze([
  'schemaVersion',
  'tenantId',
  'patientId',
  'chartId',
  'id',
  'sequence',
  'eventType',
  'toothFdi',
  'surfaces',
  'conditionCode',
  'payload',
  'reason',
  'occurredAt',
  'actorId',
  'appointmentId',
  'budgetItemId',
  'executedProcedureId',
  'plannedProcedureId',
  'referencedEventId',
  'previousEventHash',
]);

function fail(code, message, details = {}) {
  return Object.freeze({
    ok: false,
    value: null,
    error: Object.freeze({ code, message, details: Object.freeze({ ...details }) }),
  });
}

function succeed(value) {
  return Object.freeze({ ok: true, value, error: null });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertNoForbiddenHashKeys(value, seen) {
  if (value === null || typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = assertNoForbiddenHashKeys(item, seen);
      if (nested) return nested;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_HASH_KEYS.includes(key)) {
      return fail('HASH_FIELD_FORBIDDEN', 'Campo de hash não pode integrar o conteúdo hasheado.', { key });
    }
    const nested = assertNoForbiddenHashKeys(value[key], seen);
    if (nested) return nested;
  }
  return null;
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function buildEventHashCandidate(input) {
  if (!isPlainObject(input)) return fail('INVALID_HASH_INPUT', 'Candidato de hash deve ser objeto.');
  const forbidden = assertNoForbiddenHashKeys(input, new Set());
  if (forbidden) return forbidden;
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    return fail('INVALID_SEQUENCE', 'sequence deve ser inteiro positivo.');
  }
  if (input.sequence === 1) {
    if (input.previousEventHash !== null) {
      return fail('INVALID_PREVIOUS_HASH', 'O primeiro evento exige previousEventHash null.');
    }
  } else if (typeof input.previousEventHash !== 'string' || !HASH_RE.test(input.previousEventHash)) {
    return fail('INVALID_PREVIOUS_HASH', 'Eventos seguintes exigem previousEventHash SHA-256.');
  }
  if (!isIsoTimestamp(input.occurredAt)) {
    return fail('INVALID_TIMESTAMP', 'occurredAt inválido no candidato de hash.');
  }
  const candidate = {
    schemaVersion: input.schemaVersion ?? ODONTOGRAM_SCHEMA_VERSION,
    tenantId: input.tenantId ?? null,
    patientId: input.patientId ?? null,
    chartId: input.chartId ?? null,
    id: input.id ?? null,
    sequence: input.sequence,
    eventType: input.eventType ?? null,
    toothFdi: input.toothFdi ?? null,
    surfaces: Array.isArray(input.surfaces) ? [...input.surfaces] : [],
    conditionCode: input.conditionCode ?? null,
    payload: isPlainObject(input.payload) ? cloneCanonicalJson(input.payload) : {},
    reason: input.reason ?? null,
    occurredAt: input.occurredAt,
    actorId: input.actorId ?? null,
    appointmentId: input.appointmentId ?? null,
    budgetItemId: input.budgetItemId ?? null,
    executedProcedureId: input.executedProcedureId ?? null,
    plannedProcedureId: input.plannedProcedureId ?? null,
    referencedEventId: input.referencedEventId ?? null,
    previousEventHash: input.previousEventHash,
  };
  return succeed(Object.freeze(candidate));
}

export async function hashOdontogramEvent(input) {
  const built = buildEventHashCandidate(input);
  if (!built.ok) return built;
  try {
    const digest = await hashCanonicalSnapshot(built.value);
    if (typeof digest !== 'string' || !HASH_RE.test(digest)) {
      return fail('INVALID_HASH', 'SHA-256 canônico inválido.');
    }
    return succeed(digest);
  } catch (err) {
    return fail(err?.code || 'HASH_UNAVAILABLE', 'Falha ao calcular hash do evento.');
  }
}

export async function verifyOdontogramEventChain(events) {
  if (!Array.isArray(events)) return fail('INVALID_STREAM', 'Cadeia deve ser um array ordenado.');
  let previousHash = null;
  let expectedSequence = 1;
  for (const event of events) {
    if (!isPlainObject(event)) return fail('EVENT_CHAIN_INVALID', 'Evento da cadeia inválido.');
    if (event.sequence !== expectedSequence) {
      return fail('EVENT_SEQUENCE_CONFLICT', 'Lacuna ou ordem inválida na sequence.', {
        expected: expectedSequence,
        received: event.sequence,
      });
    }
    if (expectedSequence === 1 && event.previousEventHash !== null) {
      return fail('EVENT_CHAIN_INVALID', 'Primeiro evento não pode ter previousEventHash.');
    }
    if (expectedSequence > 1 && event.previousEventHash !== previousHash) {
      return fail('EVENT_CHAIN_INVALID', 'previousEventHash não encadeia o evento anterior.');
    }
    const hashed = await hashOdontogramEvent({
      schemaVersion: event.schemaVersion,
      tenantId: event.tenantId,
      patientId: event.patientId,
      chartId: event.chartId,
      id: event.id,
      sequence: event.sequence,
      eventType: event.eventType,
      toothFdi: event.toothFdi,
      surfaces: event.surfaces,
      conditionCode: event.conditionCode,
      payload: event.payload,
      reason: event.reason,
      occurredAt: event.occurredAt,
      actorId: event.actorId,
      appointmentId: event.appointmentId,
      budgetItemId: event.budgetItemId,
      executedProcedureId: event.executedProcedureId,
      plannedProcedureId: event.plannedProcedureId,
      referencedEventId: event.referencedEventId,
      previousEventHash: event.previousEventHash,
    });
    if (!hashed.ok) return hashed;
    if (event.eventHash !== hashed.value) {
      return fail('EVENT_CHAIN_INVALID', 'eventHash armazenado diverge do conteúdo.');
    }
    previousHash = event.eventHash;
    expectedSequence += 1;
  }
  return succeed(Object.freeze({ length: events.length, lastEventHash: previousHash }));
}
