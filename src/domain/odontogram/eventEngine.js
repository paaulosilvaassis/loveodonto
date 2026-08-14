import { getConditionDefinition, isValidConditionCode } from './conditions.js';
import { cloneCanonicalJson } from './canonicalJson.js';
import { DENTITION_STAGES, normalizeFdiToothId } from './identifiers.js';
import { getApplicableSurfaces, SURFACE_CODES } from './surfaces.js';

const R = Object.freeze({ required: 'required', optional: 'optional', forbidden: 'forbidden' });
const LINK_FIELDS = Object.freeze([
  'appointmentId',
  'plannedProcedureId',
  'budgetItemId',
  'executedProcedureId',
]);
const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  'receivable_id', 'payment_id', 'paid', 'amount_paid', 'authorized', 'bytes',
  'base64', 'data_uri', 'dicom', 'stl', 'mesh',
]);

function links(planned, appointment, executed, budget) {
  return Object.freeze({
    plannedProcedureId: planned,
    appointmentId: appointment,
    executedProcedureId: executed,
    budgetItemId: budget,
  });
}

function rule(toothFdi, conditionCode, surfaces, referencedEventId, reason, linkage) {
  return Object.freeze({
    toothFdi, conditionCode, surfaces, referencedEventId, reason, linkages: linkage,
  });
}

const FORBIDDEN_LINKS = links(R.forbidden, R.forbidden, R.forbidden, R.forbidden);

export const EVENT_RULES = Object.freeze({
  chart_created: rule(R.forbidden, R.forbidden, R.forbidden, R.forbidden, R.forbidden, FORBIDDEN_LINKS),
  condition_recorded: rule(R.required, R.required, R.optional, R.forbidden, R.forbidden, FORBIDDEN_LINKS),
  condition_corrected: rule(R.required, R.required, R.optional, R.required, R.required, FORBIDDEN_LINKS),
  condition_removed: rule(R.required, R.optional, R.forbidden, R.required, R.required, FORBIDDEN_LINKS),
  procedure_planned: rule(R.optional, R.forbidden, R.optional, R.forbidden, R.optional, links(R.required, R.optional, R.forbidden, R.optional)),
  procedure_authorized: rule(R.optional, R.forbidden, R.optional, R.forbidden, R.optional, links(R.required, R.optional, R.forbidden, R.optional)),
  procedure_started: rule(R.optional, R.forbidden, R.optional, R.forbidden, R.optional, links(R.optional, R.optional, R.optional, R.optional)),
  procedure_completed: rule(R.optional, R.forbidden, R.optional, R.forbidden, R.optional, links(R.optional, R.optional, R.optional, R.optional)),
  procedure_cancelled: rule(R.optional, R.forbidden, R.optional, R.forbidden, R.optional, links(R.optional, R.optional, R.optional, R.optional)),
  chart_submitted_for_review: rule(R.forbidden, R.forbidden, R.forbidden, R.forbidden, R.forbidden, FORBIDDEN_LINKS),
  chart_reopened: rule(R.forbidden, R.forbidden, R.forbidden, R.forbidden, R.required, FORBIDDEN_LINKS),
  chart_finalized: rule(R.forbidden, R.forbidden, R.forbidden, R.forbidden, R.optional, FORBIDDEN_LINKS),
  correction_recorded: rule(R.optional, R.optional, R.optional, R.required, R.required, FORBIDDEN_LINKS),
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

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function opaqueId(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    return fail('INVALID_ID', `${field} deve ser string opaca não vazia, já trimada.`, { field });
  }
  return null;
}

function optionalId(value, field, presence) {
  if (value == null) {
    return presence === R.required
      ? fail('MISSING_FIELD', `${field} é obrigatório.`, { field })
      : { ok: true, value: null };
  }
  if (presence === R.forbidden) {
    return fail('FORBIDDEN_FIELD', `${field} não é permitido neste evento.`, { field });
  }
  const invalid = opaqueId(value, field);
  return invalid || { ok: true, value };
}

function isoTimestamp(value, field) {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0) {
    return fail('INVALID_TIMESTAMP', `${field} deve ser timestamp ISO-8601 trimado.`, { field });
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return fail('INVALID_TIMESTAMP', `${field} não é um timestamp válido.`, { field });
  }
  return succeed(value);
}

function readSurfaces(raw, presence, toothFdi, conditionCode) {
  if (raw == null || (Array.isArray(raw) && raw.length === 0)) {
    if (presence === R.required) return fail('MISSING_SURFACES', 'Superfícies obrigatórias.');
    return succeed(Object.freeze([]));
  }
  if (presence === R.forbidden) {
    return fail('FORBIDDEN_SURFACES', 'Superfícies não são permitidas neste evento.');
  }
  if (!Array.isArray(raw)) return fail('INVALID_SURFACES', 'surfaces deve ser array.');
  const seen = new Set();
  for (const item of raw) {
    if (!SURFACE_CODES.includes(item)) {
      return fail('INVALID_SURFACE_CODE', 'Código de superfície inválido.', { received: item });
    }
    if (seen.has(item)) {
      return fail('DUPLICATE_SURFACE', 'Superfícies duplicadas rejeitadas.', { surface: item });
    }
    seen.add(item);
  }
  if (toothFdi) {
    const applicable = getApplicableSurfaces(toothFdi);
    for (const code of seen) {
      if (!applicable.includes(code)) {
        return fail('SURFACE_NOT_APPLICABLE', `Superfície ${code} não se aplica ao dente ${toothFdi}.`);
      }
    }
  }
  const definition = conditionCode ? getConditionDefinition(conditionCode) : null;
  if (definition?.scope === 'tooth' && seen.size > 0) {
    return fail('INCOMPATIBLE_SURFACES', 'Condição de dente inteiro não admite superfícies.');
  }
  return succeed(SURFACE_CODES.filter((code) => seen.has(code)));
}

function assertProcedureLink(type, linksValue) {
  if (type === 'procedure_started') {
    if (!linksValue.appointmentId && !linksValue.executedProcedureId) {
      return fail('MISSING_CLINICAL_LINK', 'procedure_started exige appointmentId ou executedProcedureId.');
    }
  }
  if (type === 'procedure_completed') {
    if (!linksValue.executedProcedureId && !linksValue.appointmentId) {
      return fail(
        'MISSING_CLINICAL_LINK',
        'procedure_completed exige executedProcedureId ou appointmentId; budgetItemId sozinho não conclui.',
      );
    }
  }
  if (type === 'procedure_cancelled') {
    if (!linksValue.plannedProcedureId && !linksValue.executedProcedureId) {
      return fail('MISSING_CLINICAL_LINK', 'procedure_cancelled exige plannedProcedureId ou executedProcedureId.');
    }
  }
  return null;
}

export function validateCanonicalEvent(input) {
  if (!isPlainObject(input)) return fail('INVALID_EVENT', 'Evento deve ser objeto JSON.');
  if (!EVENT_RULES[input.eventType]) {
    return fail('UNKNOWN_EVENT_TYPE', 'Tipo de evento desconhecido.', { eventType: input.eventType });
  }
  const spec = EVENT_RULES[input.eventType];
  const idErr = opaqueId(input.id, 'id');
  if (idErr) return idErr;
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    return fail('INVALID_SEQUENCE', 'sequence deve ser inteiro positivo.');
  }
  for (const field of ['tenantId', 'chartId', 'patientId', 'actorId']) {
    const err = opaqueId(input[field], field);
    if (err) return err;
  }
  const occurred = isoTimestamp(input.occurredAt, 'occurredAt');
  if (!occurred.ok) return occurred;

  const tooth = optionalId(input.toothFdi, 'toothFdi', spec.toothFdi);
  if (!tooth.ok) return tooth;
  let toothFdi = tooth.value;
  if (toothFdi != null) {
    if (normalizeFdiToothId(toothFdi) !== toothFdi) {
      return fail('INVALID_FDI', 'toothFdi deve ser FDI canônico.', { toothFdi });
    }
  }

  if (spec.conditionCode === R.required && input.conditionCode == null) {
    return fail('MISSING_CONDITION', 'conditionCode é obrigatório.');
  }
  if (spec.conditionCode === R.forbidden && input.conditionCode != null) {
    return fail('FORBIDDEN_CONDITION', 'conditionCode não é permitido neste evento.');
  }
  if (input.conditionCode != null && !isValidConditionCode(input.conditionCode)) {
    return fail('INVALID_CONDITION', 'conditionCode fora do catálogo OD-1A.', { conditionCode: input.conditionCode });
  }

  const surfaces = readSurfaces(input.surfaces, spec.surfaces, toothFdi, input.conditionCode || null);
  if (!surfaces.ok) return surfaces;

  const referenced = optionalId(input.referencedEventId, 'referencedEventId', spec.referencedEventId);
  if (!referenced.ok) return referenced;
  if (referenced.value && referenced.value === input.id) {
    return fail('SELF_REFERENCE', 'Correção não pode referenciar a si mesma.');
  }

  const reason = optionalId(input.reason, 'reason', spec.reason);
  if (!reason.ok) return reason;

  const payload = input.payload == null ? {} : input.payload;
  if (!isPlainObject(payload)) return fail('INVALID_PAYLOAD', 'payload deve ser objeto JSON.');
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      return fail('FORBIDDEN_PAYLOAD_KEY', 'payload contém chave financeira ou binária.', { key });
    }
  }
  if (input.eventType === 'chart_created') {
    if (!DENTITION_STAGES.includes(payload.dentitionStage)) {
      return fail('INVALID_DENTITION_STAGE', 'chart_created exige dentitionStage canônico.');
    }
  }

  const linkage = {};
  for (const field of LINK_FIELDS) {
    const presence = spec.linkages[field];
    const resolved = optionalId(input[field], field, presence);
    if (!resolved.ok) return resolved;
    linkage[field] = resolved.value;
  }
  const linkErr = assertProcedureLink(input.eventType, linkage);
  if (linkErr) return linkErr;

  const clonedPayload = cloneCanonicalJson(payload);
  return succeed(Object.freeze({
    id: input.id,
    sequence: input.sequence,
    tenantId: input.tenantId,
    chartId: input.chartId,
    patientId: input.patientId,
    actorId: input.actorId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    toothFdi,
    surfaces: surfaces.value,
    conditionCode: input.conditionCode || null,
    payload: clonedPayload,
    reason: reason.value,
    referencedEventId: referenced.value,
    appointmentId: linkage.appointmentId,
    plannedProcedureId: linkage.plannedProcedureId,
    budgetItemId: linkage.budgetItemId,
    executedProcedureId: linkage.executedProcedureId,
  }));
}
