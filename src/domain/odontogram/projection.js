import { cloneCanonicalJson } from './canonicalJson.js';
import { EVENT_RULES, validateCanonicalEvent } from './eventEngine.js';
import { getTeethForDentitionStage } from './identifiers.js';

/**
 * Um evento original pode ser alvo de no máximo uma correção no stream.
 * Correções posteriores do mesmo referencedEventId falham fechado.
 * A linha histórica original nunca é apagada nem reescrita.
 */
export const MULTIPLE_CORRECTION_POLICY = 'reject_after_first';

export const CLINICAL_SCHEMA_VERSION = '1.0.0';
export const PROJECTED_CHART_STATUSES = Object.freeze(['draft', 'in_review', 'finalized']);

function isCorrectionEvent(type) {
  return EVENT_RULES[type]?.referencedEventId === 'required';
}

const LIFECYCLE_EVENTS = Object.freeze({
  chart_created: true,
  chart_submitted_for_review: true,
  chart_finalized: true,
  chart_reopened: true,
});

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

export function createEmptyProjection() {
  return {
    schemaVersion: CLINICAL_SCHEMA_VERSION,
    chartId: null,
    tenantId: null,
    patientId: null,
    dentitionStage: null,
    status: null,
    lastAppliedEventId: null,
    lastSequence: 0,
    teeth: {},
    clinicalLinks: [],
    audit: {
      eventIds: [],
      corrections: [],
      originalEvents: {},
      correctedReferencedIds: [],
    },
  };
}

function remember(state, event) {
  state.audit.eventIds.push(event.id);
  state.audit.originalEvents[event.id] = {
    id: event.id,
    sequence: event.sequence,
    eventType: event.eventType,
    toothFdi: event.toothFdi,
    conditionCode: event.conditionCode,
    surfaces: event.surfaces.slice(),
    occurredAt: event.occurredAt,
    reason: event.reason,
    referencedEventId: event.referencedEventId,
  };
  state.lastAppliedEventId = event.id;
  state.lastSequence = event.sequence;
}

function assertIdentity(state, event) {
  if (state.tenantId !== event.tenantId || state.chartId !== event.chartId || state.patientId !== event.patientId) {
    return fail('IDENTITY_MISMATCH', 'tenant, patient e chart não podem mudar no mesmo stream.');
  }
  return null;
}

function assertToothInStage(state, event) {
  if (!event.toothFdi) return null;
  const allowed = getTeethForDentitionStage(state.dentitionStage) || [];
  if (!allowed.includes(event.toothFdi)) {
    return fail('TOOTH_OUTSIDE_DENTITION', 'Dente fora do estágio de dentição do chart.', {
      toothFdi: event.toothFdi,
      dentitionStage: state.dentitionStage,
    });
  }
  return null;
}

function applyCorrectionGuard(state, event) {
  if (!isCorrectionEvent(event.eventType)) return null;
  const original = state.audit.originalEvents[event.referencedEventId];
  if (!original) {
    return fail('INVALID_REFERENCE', 'Correção deve referenciar evento anterior do mesmo stream.', {
      referencedEventId: event.referencedEventId,
    });
  }
  if (original.sequence >= event.sequence) {
    return fail('FORWARD_REFERENCE', 'Correção não pode referenciar evento futuro ou atual.');
  }
  if (
    (event.eventType === 'condition_corrected' || event.eventType === 'condition_removed')
    && original.toothFdi !== event.toothFdi
  ) {
    return fail('INVALID_REFERENCE', 'Correção de condição deve referenciar o mesmo dente.');
  }
  if (state.audit.correctedReferencedIds.includes(event.referencedEventId)) {
    return fail(
      'MULTIPLE_CORRECTION',
      'Política reject_after_first: o mesmo evento original não admite segunda correção.',
      { referencedEventId: event.referencedEventId, policy: MULTIPLE_CORRECTION_POLICY },
    );
  }
  state.audit.correctedReferencedIds.push(event.referencedEventId);
  state.audit.corrections.push({
    correctionEventId: event.id,
    referencedEventId: event.referencedEventId,
    eventType: event.eventType,
    reason: event.reason,
  });
  return null;
}

function applyLifecycle(state, event) {
  if (event.eventType === 'chart_created') {
    if (state.lastSequence !== 0) {
      return fail('INVALID_LIFECYCLE', 'chart_created só é permitido como primeiro evento.');
    }
    state.tenantId = event.tenantId;
    state.chartId = event.chartId;
    state.patientId = event.patientId;
    state.dentitionStage = event.payload.dentitionStage;
    state.status = 'draft';
    return null;
  }
  if (event.eventType === 'chart_submitted_for_review') {
    if (state.status !== 'draft') {
      return fail('INVALID_LIFECYCLE', 'chart_submitted_for_review exige status draft.');
    }
    state.status = 'in_review';
    return null;
  }
  if (event.eventType === 'chart_finalized') {
    if (state.status !== 'draft' && state.status !== 'in_review') {
      return fail('INVALID_LIFECYCLE', 'chart_finalized exige draft ou in_review.');
    }
    state.status = 'finalized';
    return null;
  }
  if (event.eventType === 'chart_reopened') {
    if (state.status !== 'finalized') {
      return fail('INVALID_LIFECYCLE', 'chart_reopened exige chart finalizado.');
    }
    state.status = 'draft';
    return null;
  }
  return fail('UNKNOWN_EVENT_TYPE', 'Tipo de evento desconhecido na projeção.');
}

function applyCondition(state, event) {
  if (event.eventType === 'condition_recorded' || event.eventType === 'condition_corrected') {
    state.teeth[event.toothFdi] = {
      fdi: event.toothFdi,
      conditionCode: event.conditionCode,
      surfaces: event.surfaces.slice(),
      sourceEventId: event.id,
    };
    return null;
  }
  if (event.eventType === 'condition_removed') {
    delete state.teeth[event.toothFdi];
    return null;
  }
  if (event.eventType === 'correction_recorded') {
    return null;
  }
  return fail('UNKNOWN_EVENT_TYPE', 'Tipo de evento desconhecido na projeção.');
}

function applyProcedure(state, event) {
  state.clinicalLinks.push({
    eventId: event.id,
    eventType: event.eventType,
    toothFdi: event.toothFdi,
    appointmentId: event.appointmentId,
    plannedProcedureId: event.plannedProcedureId,
    budgetItemId: event.budgetItemId,
    executedProcedureId: event.executedProcedureId,
  });
  return null;
}

function applyEvent(state, event) {
  const next = cloneCanonicalJson(state);
  if (next.lastSequence === 0) {
    if (event.eventType !== 'chart_created') {
      return fail('CHART_NOT_CREATED', 'O stream deve começar com chart_created.');
    }
  } else {
    const identityErr = assertIdentity(next, event);
    if (identityErr) return identityErr;
  }
  if (next.status === 'finalized' && event.eventType !== 'chart_reopened') {
    return fail('CHART_FINALIZED', 'Chart finalizado não aceita mutação clínica ordinária.');
  }
  const toothErr = event.eventType === 'chart_created' ? null : assertToothInStage(next, event);
  if (toothErr) return toothErr;
  const correctionErr = applyCorrectionGuard(next, event);
  if (correctionErr) return correctionErr;

  let applied = null;
  if (LIFECYCLE_EVENTS[event.eventType]) applied = applyLifecycle(next, event);
  else if (event.eventType.startsWith('condition_') || event.eventType === 'correction_recorded') {
    applied = applyCondition(next, event);
  } else if (event.eventType.startsWith('procedure_')) {
    applied = applyProcedure(next, event);
  } else {
    applied = fail('UNKNOWN_EVENT_TYPE', 'Tipo de evento desconhecido na projeção.');
  }
  if (applied) return applied;
  remember(next, event);
  return succeed(next);
}

export function projectOdontogramEvents(events) {
  if (!Array.isArray(events)) {
    return fail('INVALID_STREAM', 'Stream de eventos deve ser um array ordenado.');
  }
  let state = createEmptyProjection();
  const seenIds = new Set();
  for (let index = 0; index < events.length; index += 1) {
    const validated = validateCanonicalEvent(events[index]);
    if (!validated.ok) return validated;
    const event = validated.value;
    if (event.sequence !== index + 1 || event.sequence !== state.lastSequence + 1) {
      return fail('NON_MONOTONIC_SEQUENCE', 'sequence deve ser inteiro monotônico a partir de 1, na ordem do array.', {
        expected: state.lastSequence + 1,
        received: event.sequence,
        index,
      });
    }
    if (seenIds.has(event.id)) {
      return fail('DUPLICATE_EVENT_ID', 'IDs de evento duplicados são rejeitados.', { id: event.id });
    }
    seenIds.add(event.id);
    const applied = applyEvent(state, event);
    if (!applied.ok) return applied;
    state = applied.value;
  }
  const projection = cloneCanonicalJson(state);
  return succeed(projection);
}
