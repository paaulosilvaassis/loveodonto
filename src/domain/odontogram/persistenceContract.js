import { cloneCanonicalJson } from './canonicalJson.js';
import {
  DENTITION_STAGES,
  ODONTOGRAM_EVENT_FIELD_MAP,
  ODONTOGRAM_EVENT_TYPES,
} from './schemaContract.js';

export const ODONTOGRAM_COMMAND_ERROR_CODES = Object.freeze({
  INVALID_ACTOR_CONTEXT: 'INVALID_ACTOR_CONTEXT',
  AUTHORIZATION_DENIED: 'AUTHORIZATION_DENIED',
  INVALID_COMMAND: 'INVALID_COMMAND',
  CHART_NOT_FOUND: 'CHART_NOT_FOUND',
  ACTIVE_CHART_ALREADY_EXISTS: 'ACTIVE_CHART_ALREADY_EXISTS',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  PATIENT_MISMATCH: 'PATIENT_MISMATCH',
  CHART_DELETED: 'CHART_DELETED',
  OPTIMISTIC_CONCURRENCY_CONFLICT: 'OPTIMISTIC_CONCURRENCY_CONFLICT',
  INVALID_PERSISTENCE_ID: 'INVALID_PERSISTENCE_ID',
  EVENT_CHAIN_INVALID: 'EVENT_CHAIN_INVALID',
  EVENT_SEQUENCE_CONFLICT: 'EVENT_SEQUENCE_CONFLICT',
  CORRECTION_REFERENCE_INVALID: 'CORRECTION_REFERENCE_INVALID',
  TRANSACTION_PORT_INVALID: 'TRANSACTION_PORT_INVALID',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  UNKNOWN_PERSISTENCE_FIELD: 'UNKNOWN_PERSISTENCE_FIELD',
});

export class OdontogramCommandError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OdontogramCommandError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export const TRUSTED_ODONTOGRAM_SERVER_ACTOR_KIND = 'TrustedOdontogramServerActor';

export const CREATE_CHART_EXPECTED_ROW_VERSION = 0;

export const VERSION_CREATION_EVENT_TYPES = Object.freeze(['chart_finalized', 'chart_reopened']);

export const DATABASE_GENERATED_FIELDS = Object.freeze({
  charts: Object.freeze(['created_at', 'updated_at']),
  toothStates: Object.freeze(['created_at', 'updated_at']),
  events: Object.freeze(['created_at']),
  chartVersions: Object.freeze(['created_at']),
  rowVersionOnUpdate: 'trigger app_odontogram_protect_mutable_row increments row_version',
});

export const TRANSACTION_PORT_METHODS = Object.freeze([
  'getChartForUpdate',
  'getActiveChart',
  'getLatestEvent',
  'listEventsOrdered',
  'insertChart',
  'insertEvent',
  'updateToothStateProjection',
  'updateChartProjectionMetadata',
  'insertChartVersion',
  'loadCurrentToothStates',
  'listChartVersions',
]);

const CANONICAL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP = Object.freeze({
  ...ODONTOGRAM_EVENT_FIELD_MAP,
  eventHash: 'event_hash',
  previousEventHash: 'previous_event_hash',
  createdAt: 'created_at',
});

export const ODONTOGRAM_CHART_FIELD_MAP = Object.freeze({
  id: 'id',
  tenantId: 'tenant_id',
  patientId: 'patient_id',
  dentitionStage: 'dentition_stage',
  schemaVersion: 'schema_version',
  status: 'status',
  rowVersion: 'row_version',
  createdAt: 'created_at',
  createdBy: 'created_by',
  updatedAt: 'updated_at',
  updatedBy: 'updated_by',
  finalizedAt: 'finalized_at',
  finalizedBy: 'finalized_by',
  deletedAt: 'deleted_at',
  deletedBy: 'deleted_by',
});

export const ODONTOGRAM_TOOTH_STATE_FIELD_MAP = Object.freeze({
  id: 'id',
  tenantId: 'tenant_id',
  chartId: 'chart_id',
  patientId: 'patient_id',
  toothFdi: 'tooth_fdi',
  state: 'state',
  rowVersion: 'row_version',
  lastEventId: 'last_event_id',
  createdAt: 'created_at',
  createdBy: 'created_by',
  updatedAt: 'updated_at',
  updatedBy: 'updated_by',
  deletedAt: 'deleted_at',
  deletedBy: 'deleted_by',
});

export const ODONTOGRAM_CHART_VERSION_FIELD_MAP = Object.freeze({
  id: 'id',
  tenantId: 'tenant_id',
  chartId: 'chart_id',
  patientId: 'patient_id',
  versionNumber: 'version_number',
  schemaVersion: 'schema_version',
  sourceRowVersion: 'source_row_version',
  snapshot: 'snapshot',
  snapshotHash: 'snapshot_hash',
  previousVersionHash: 'previous_version_hash',
  reason: 'reason',
  createdAt: 'created_at',
  createdBy: 'created_by',
});

export const EVENT_TYPE_TO_OPERATION = Object.freeze({
  chart_created: 'create_chart',
  condition_recorded: 'record_condition',
  condition_corrected: 'correct_condition',
  condition_removed: 'remove_condition',
  procedure_planned: 'plan_procedure',
  procedure_authorized: 'record_procedure_progress',
  procedure_started: 'record_procedure_progress',
  procedure_completed: 'record_procedure_progress',
  procedure_cancelled: 'record_procedure_progress',
  chart_submitted_for_review: 'submit_for_review',
  chart_finalized: 'finalize_chart',
  chart_reopened: 'reopen_chart',
  correction_recorded: 'correct_condition',
});

const COMMAND_KEYS = Object.freeze([
  'intent', 'expectedRowVersion', 'occurredAt', 'chartId', 'dentitionStage',
  'toothFdi', 'surfaces', 'conditionCode', 'payload', 'reason',
  'referencedEventId', 'appointmentId', 'plannedProcedureId',
  'budgetItemId', 'executedProcedureId',
]);

const FORBIDDEN_COMMAND_KEYS = Object.freeze([
  'adminOverride', 'actorId', 'createdBy', 'created_by', 'sequence',
  'eventHash', 'event_hash', 'previousEventHash', 'previous_event_hash',
  'snapshotHash', 'snapshot_hash', 'tenantId', 'patientId', 'userId',
]);

const ACTOR_KEYS = Object.freeze([
  'kind', 'userId', 'tenantId', 'patientId', 'permissions',
  'tenantMatches', 'patientMatches', 'adminOverride', 'appointmentId',
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

export function isCanonicalUuid(value) {
  return typeof value === 'string' && value === value.trim() && CANONICAL_UUID_RE.test(value);
}

export function isPersistencePatientId(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function rejectUnknownKeys(input, allowed) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.UNKNOWN_PERSISTENCE_FIELD, 'Campo desconhecido rejeitado.', { key });
    }
  }
  return null;
}

function mapByContract(input, fieldMap) {
  if (!isPlainObject(input)) return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'Objeto de persistência inválido.');
  const unknown = rejectUnknownKeys(input, Object.keys(fieldMap));
  if (unknown) return unknown;
  const row = {};
  for (const [domainKey, sqlKey] of Object.entries(fieldMap)) {
    if (Object.prototype.hasOwnProperty.call(input, domainKey)) {
      const value = input[domainKey];
      row[sqlKey] = value !== null && typeof value === 'object' ? cloneCanonicalJson(value) : value;
    }
  }
  return succeed(Object.freeze(row));
}

export function mapDomainEventToSqlRow(event) {
  return mapByContract(event, ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP);
}

export function mapDomainChartToSqlRow(chart) {
  return mapByContract(chart, ODONTOGRAM_CHART_FIELD_MAP);
}

export function mapDomainToothStateToSqlRow(state) {
  return mapByContract(state, ODONTOGRAM_TOOTH_STATE_FIELD_MAP);
}

export function mapDomainChartVersionToSqlRow(version) {
  return mapByContract(version, ODONTOGRAM_CHART_VERSION_FIELD_MAP);
}

export function assertTransactionPort(port) {
  if (!isPlainObject(port) || typeof port.withTransaction !== 'function') {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.TRANSACTION_PORT_INVALID, 'transactionPort.withTransaction é obrigatório.');
  }
  return succeed(port);
}

export function assertTransaction(tx) {
  if (!isPlainObject(tx)) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.TRANSACTION_PORT_INVALID, 'Transação inválida.');
  }
  for (const method of TRANSACTION_PORT_METHODS) {
    if (typeof tx[method] !== 'function') {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.TRANSACTION_PORT_INVALID, 'Método transacional ausente.', { method });
    }
  }
  return succeed(tx);
}

export function assertTrustedOdontogramServerActor(actor) {
  if (!isPlainObject(actor) || actor.kind !== TRUSTED_ODONTOGRAM_SERVER_ACTOR_KIND) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_ACTOR_CONTEXT, 'Contexto de ator confiável ausente.');
  }
  const unknown = rejectUnknownKeys(actor, [...ACTOR_KEYS]);
  if (unknown) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_ACTOR_CONTEXT, 'Contexto de ator contém campo estranho.', unknown.error.details);
  }
  if (!isCanonicalUuid(actor.userId) || !isCanonicalUuid(actor.tenantId) || !isPersistencePatientId(actor.patientId)) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_ACTOR_CONTEXT, 'Identidade de ator inválida na fronteira de persistência.');
  }
  if (!Array.isArray(actor.permissions)) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_ACTOR_CONTEXT, 'permissions deve ser array.');
  }
  if (actor.tenantMatches !== true) return fail(ODONTOGRAM_COMMAND_ERROR_CODES.TENANT_MISMATCH, 'Tenant não verificado.');
  if (actor.patientMatches !== true) return fail(ODONTOGRAM_COMMAND_ERROR_CODES.PATIENT_MISMATCH, 'Paciente não verificado.');
  if (actor.adminOverride !== undefined && actor.adminOverride !== true && actor.adminOverride !== false) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_ACTOR_CONTEXT, 'adminOverride deve ser boolean estrito.');
  }
  if (actor.appointmentId != null && !isPersistencePatientId(actor.appointmentId)) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_ACTOR_CONTEXT, 'appointmentId de contexto inválido.');
  }
  return succeed(Object.freeze({
    kind: TRUSTED_ODONTOGRAM_SERVER_ACTOR_KIND,
    userId: actor.userId,
    tenantId: actor.tenantId,
    patientId: actor.patientId,
    permissions: Object.freeze([...actor.permissions]),
    tenantMatches: true,
    patientMatches: true,
    adminOverride: actor.adminOverride === true,
    appointmentId: actor.appointmentId ?? null,
  }));
}

export function assertOdontogramCommand(command) {
  if (!isPlainObject(command)) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'Command inválido.');
  }
  for (const key of Object.keys(command)) {
    if (FORBIDDEN_COMMAND_KEYS.includes(key)) {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'Command contém campo proibido.', { key });
    }
    if (!COMMAND_KEYS.includes(key)) {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'Command contém campo desconhecido.', { key });
    }
  }
  if (!ODONTOGRAM_EVENT_TYPES.includes(command.intent)) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'intent deve ser um event type canônico.');
  }
  if (!Number.isInteger(command.expectedRowVersion) || command.expectedRowVersion < 0) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'expectedRowVersion deve ser inteiro >= 0.');
  }
  if (command.intent === 'chart_created') {
    if (command.expectedRowVersion !== CREATE_CHART_EXPECTED_ROW_VERSION) {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'Criação exige expectedRowVersion inicial 0.');
    }
    if (command.chartId != null) {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'chartId de criação é gerado pelo serviço.');
    }
    if (!DENTITION_STAGES.includes(command.dentitionStage)) {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'dentitionStage canônico obrigatório.');
    }
  } else {
    if (command.expectedRowVersion < 1) {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'Mutação exige expectedRowVersion positivo.');
    }
    if (!isCanonicalUuid(command.chartId)) {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_PERSISTENCE_ID, 'chartId deve ser UUID canônico.');
    }
  }
  if (command.occurredAt != null) {
    if (typeof command.occurredAt !== 'string' || command.occurredAt !== command.occurredAt.trim() || Number.isNaN(Date.parse(command.occurredAt))) {
      return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND, 'occurredAt inválido.');
    }
  }
  if (command.referencedEventId != null && !isCanonicalUuid(command.referencedEventId)) {
    return fail(ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_PERSISTENCE_ID, 'referencedEventId deve ser UUID canônico.');
  }
  return succeed(command);
}

export function buildCanonicalEventDraft({ actor, command, chartId, sequence, eventId, occurredAt }) {
  const payload = command.intent === 'chart_created'
    ? { ...(isPlainObject(command.payload) ? command.payload : {}), dentitionStage: command.dentitionStage }
    : (isPlainObject(command.payload) ? command.payload : {});
  return {
    id: eventId,
    sequence,
    tenantId: actor.tenantId,
    chartId,
    patientId: actor.patientId,
    actorId: actor.userId,
    eventType: command.intent,
    occurredAt,
    toothFdi: command.toothFdi ?? null,
    surfaces: command.surfaces ?? [],
    conditionCode: command.conditionCode ?? null,
    payload,
    reason: command.reason ?? null,
    referencedEventId: command.referencedEventId ?? null,
    appointmentId: command.appointmentId ?? null,
    plannedProcedureId: command.plannedProcedureId ?? null,
    budgetItemId: command.budgetItemId ?? null,
    executedProcedureId: command.executedProcedureId ?? null,
  };
}

export function mapEngineErrorCode(code) {
  if (code === 'INVALID_REFERENCE' || code === 'FORWARD_REFERENCE' || code === 'MULTIPLE_CORRECTION' || code === 'SELF_REFERENCE') {
    return ODONTOGRAM_COMMAND_ERROR_CODES.CORRECTION_REFERENCE_INVALID;
  }
  if (code === 'NON_MONOTONIC_SEQUENCE' || code === 'DUPLICATE_EVENT_ID') {
    return ODONTOGRAM_COMMAND_ERROR_CODES.EVENT_SEQUENCE_CONFLICT;
  }
  if (code === 'IDENTITY_MISMATCH') return ODONTOGRAM_COMMAND_ERROR_CODES.TENANT_MISMATCH;
  if (code === 'CHART_NOT_CREATED') return ODONTOGRAM_COMMAND_ERROR_CODES.CHART_NOT_FOUND;
  return ODONTOGRAM_COMMAND_ERROR_CODES.INVALID_COMMAND;
}

export function canonicalToothState(tooth) {
  return Object.freeze({
    fdi: tooth.fdi,
    conditionCode: tooth.conditionCode,
    surfaces: Object.freeze([...(tooth.surfaces || [])]),
    sourceEventId: tooth.sourceEventId,
  });
}
