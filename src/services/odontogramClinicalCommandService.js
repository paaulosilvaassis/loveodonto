import { authorizeOdontogramOperation } from '../domain/odontogram/authorizationContract.js';
import { validateCanonicalEvent } from '../domain/odontogram/eventEngine.js';
import { hashOdontogramEvent, verifyOdontogramEventChain } from '../domain/odontogram/eventHashChain.js';
import {
  EVENT_TYPE_TO_OPERATION,
  OdontogramCommandError,
  ODONTOGRAM_COMMAND_ERROR_CODES as E,
  assertOdontogramCommand,
  assertTransaction,
  assertTransactionPort,
  assertTrustedOdontogramServerActor,
  buildCanonicalEventDraft,
  canonicalToothState,
  isCanonicalUuid,
  mapEngineErrorCode,
} from '../domain/odontogram/persistenceContract.js';
import { projectOdontogramEvents } from '../domain/odontogram/projection.js';
import { ODONTOGRAM_SCHEMA_VERSION } from '../domain/odontogram/schemaContract.js';
import { buildChartVersion } from '../domain/odontogram/versioning.js';

function throwErr(code, message, details) {
  throw new OdontogramCommandError(code, message, details);
}

function unwrap(result, fallbackCode) {
  if (result.ok) return result.value;
  throwErr(result.error?.code || fallbackCode, result.error?.message, result.error?.details);
}

function nextId(idGenerator, field) {
  if (typeof idGenerator !== 'function') throwErr(E.TRANSACTION_PORT_INVALID, 'idGenerator é obrigatório.');
  const id = idGenerator(field);
  if (!isCanonicalUuid(id)) throwErr(E.INVALID_PERSISTENCE_ID, 'ID gerado inválido.', { field });
  return id;
}

function resolveOccurredAt(command, clock) {
  if (command.occurredAt) return command.occurredAt;
  if (typeof clock !== 'function') throwErr(E.INVALID_COMMAND, 'occurredAt ou clock confiável é obrigatório.');
  const value = clock();
  if (typeof value !== 'string' || value !== value.trim() || Number.isNaN(Date.parse(value))) {
    throwErr(E.INVALID_COMMAND, 'clock confiável devolveu timestamp inválido.');
  }
  return value;
}

function authorize(actor, operation, chartStatus) {
  const decision = authorizeOdontogramOperation({
    operation,
    permissions: actor.permissions,
    tenantMatches: actor.tenantMatches,
    patientMatches: actor.patientMatches,
    chartStatus,
    adminOverride: actor.adminOverride,
  });
  if (decision.allowed) return;
  if (decision.code === 'TENANT_MISMATCH') throwErr(E.TENANT_MISMATCH, 'Tenant não autorizado.');
  if (decision.code === 'PATIENT_MISMATCH') throwErr(E.PATIENT_MISMATCH, 'Paciente não autorizado.');
  throwErr(E.AUTHORIZATION_DENIED, 'Operação clínica negada.', { reason: decision.code });
}

function assertChartIdentity(chart, actor) {
  if (!chart) throwErr(E.CHART_NOT_FOUND, 'Chart não encontrado.');
  if (chart.deletedAt) throwErr(E.CHART_DELETED, 'Chart removido.');
  if (chart.tenantId !== actor.tenantId) throwErr(E.TENANT_MISMATCH, 'Chart pertence a outro tenant.');
  if (chart.patientId !== actor.patientId) throwErr(E.PATIENT_MISMATCH, 'Chart pertence a outro paciente.');
}

function requireValidEvent(draft) {
  const result = validateCanonicalEvent(draft);
  if (!result.ok) throwErr(mapEngineErrorCode(result.error.code), 'Evento canônico rejeitado.');
  return result.value;
}

async function hashedEvent(validated, previousEventHash, createdAt) {
  const digest = unwrap(await hashOdontogramEvent({ ...validated, previousEventHash }));
  return Object.freeze({ ...validated, previousEventHash, eventHash: digest, createdAt });
}

async function replay(events) {
  const projected = projectOdontogramEvents(events);
  if (!projected.ok) throwErr(mapEngineErrorCode(projected.error.code), 'Projeção clínica rejeitada.');
  return projected.value;
}

async function persistVersion(tx, params) {
  const built = unwrap(await buildChartVersion({
    id: nextId(params.idGenerator, 'chartVersion'),
    projection: params.projection,
    versionNumber: params.versionNumber,
    sourceRowVersion: params.sourceRowVersion,
    createdAt: params.occurredAt,
    createdBy: params.actor.userId,
  }));
  await tx.insertChartVersion({
    id: built.id,
    tenantId: built.tenantId,
    chartId: built.chartId,
    patientId: built.patientId,
    versionNumber: built.versionNumber,
    schemaVersion: ODONTOGRAM_SCHEMA_VERSION,
    sourceRowVersion: built.sourceRowVersion,
    snapshot: built.snapshot,
    snapshotHash: built.snapshotHash,
    previousVersionHash: params.previousVersionHash,
    reason: params.reason ?? null,
    createdAt: built.createdAt,
    createdBy: built.createdBy,
  });
  return built;
}

async function persistTeeth(tx, { actor, chartId, projection, eventId, idGenerator, occurredAt }) {
  const active = (await tx.loadCurrentToothStates({ tenantId: actor.tenantId, chartId }) || [])
    .filter((row) => !row.deletedAt);
  const desired = projection.teeth || {};
  const upserts = Object.entries(desired).map(([fdi, tooth]) => {
    const existing = active.find((row) => row.toothFdi === fdi);
    return {
      id: existing?.id || nextId(idGenerator, 'toothState'),
      tenantId: actor.tenantId,
      chartId,
      patientId: actor.patientId,
      toothFdi: fdi,
      state: canonicalToothState(tooth),
      lastEventId: eventId,
      createdAt: existing?.createdAt || occurredAt,
      createdBy: existing?.createdBy || actor.userId,
      updatedAt: occurredAt,
      updatedBy: actor.userId,
      deletedAt: null,
      deletedBy: null,
    };
  });
  const softDeletes = active
    .filter((row) => !desired[row.toothFdi])
    .map((row) => ({
      ...row,
      deletedAt: occurredAt,
      deletedBy: actor.userId,
      lastEventId: eventId,
      updatedAt: occurredAt,
      updatedBy: actor.userId,
    }));
  await tx.updateToothStateProjection({ upserts, softDeletes });
}

async function createChart(tx, { actor, command, occurredAt, idGenerator }) {
  if (await tx.getActiveChart({ tenantId: actor.tenantId, patientId: actor.patientId })) {
    throwErr(E.ACTIVE_CHART_ALREADY_EXISTS, 'Já existe chart ativo para o paciente.');
  }
  const chartId = nextId(idGenerator, 'chart');
  const eventId = nextId(idGenerator, 'event');
  const event = await hashedEvent(
    requireValidEvent(buildCanonicalEventDraft({ actor, command, chartId, sequence: 1, eventId, occurredAt })),
    null,
    occurredAt,
  );
  await tx.insertChart({
    id: chartId,
    tenantId: actor.tenantId,
    patientId: actor.patientId,
    dentitionStage: command.dentitionStage,
    schemaVersion: ODONTOGRAM_SCHEMA_VERSION,
    status: 'draft',
    rowVersion: 1,
    createdAt: occurredAt,
    createdBy: actor.userId,
    updatedAt: occurredAt,
    updatedBy: actor.userId,
    finalizedAt: null,
    finalizedBy: null,
    deletedAt: null,
    deletedBy: null,
  });
  await tx.insertEvent(event);
  const projection = await replay([event]);
  await persistTeeth(tx, { actor, chartId, projection, eventId, idGenerator, occurredAt });
  return { chartId, event, projection, rowVersion: 1, versionsCreated: 0 };
}

async function mutateChart(tx, { actor, command, chart, occurredAt, idGenerator }) {
  if (chart.rowVersion !== command.expectedRowVersion) {
    throwErr(E.OPTIMISTIC_CONCURRENCY_CONFLICT, 'row_version obsoleto.');
  }
  const stored = await tx.listEventsOrdered({ tenantId: actor.tenantId, chartId: chart.id });
  unwrap(await verifyOdontogramEventChain(stored), E.EVENT_CHAIN_INVALID);
  const latest = stored[stored.length - 1];
  if (!latest) throwErr(E.EVENT_SEQUENCE_CONFLICT, 'Chart sem evento inicial.');
  const eventId = nextId(idGenerator, 'event');
  const event = await hashedEvent(
    requireValidEvent(buildCanonicalEventDraft({
      actor, command, chartId: chart.id, sequence: latest.sequence + 1, eventId, occurredAt,
    })),
    latest.eventHash,
    occurredAt,
  );
  const currentProjection = await replay(stored);
  const versions = await tx.listChartVersions({ tenantId: actor.tenantId, chartId: chart.id });
  let versionsCreated = 0;
  if (command.intent === 'chart_reopened') {
    await persistVersion(tx, {
      actor,
      projection: currentProjection,
      versionNumber: versions.length + 1,
      sourceRowVersion: chart.rowVersion,
      previousVersionHash: versions[versions.length - 1]?.snapshotHash ?? null,
      occurredAt,
      idGenerator,
      reason: command.reason ?? 'reopen',
    });
    versionsCreated += 1;
  }
  await tx.insertEvent(event);
  const projection = await replay([...stored, event]);
  await persistTeeth(tx, { actor, chartId: chart.id, projection, eventId, idGenerator, occurredAt });
  const finalized = projection.status === 'finalized';
  await tx.updateChartProjectionMetadata({
    tenantId: actor.tenantId,
    chartId: chart.id,
    expectedRowVersion: command.expectedRowVersion,
    patch: {
      status: projection.status,
      updatedAt: occurredAt,
      updatedBy: actor.userId,
      finalizedAt: finalized ? occurredAt : null,
      finalizedBy: finalized ? actor.userId : null,
    },
  });
  if (command.intent === 'chart_finalized') {
    await persistVersion(tx, {
      actor,
      projection,
      versionNumber: versions.length + versionsCreated + 1,
      sourceRowVersion: chart.rowVersion,
      previousVersionHash: versions[versions.length - 1]?.snapshotHash ?? null,
      occurredAt,
      idGenerator,
      reason: command.reason ?? 'finalize',
    });
    versionsCreated += 1;
  }
  return {
    chartId: chart.id,
    event,
    projection,
    rowVersion: command.expectedRowVersion + 1,
    versionsCreated,
  };
}

export function createOdontogramClinicalCommandService(deps) {
  const portCheck = assertTransactionPort(deps?.transactionPort);
  return Object.freeze({
    async executeCommand(input) {
      if (!portCheck.ok) return { ok: false, value: null, error: portCheck.error };
      try {
        const actor = unwrap(assertTrustedOdontogramServerActor(input?.actorContext), E.INVALID_ACTOR_CONTEXT);
        const command = unwrap(assertOdontogramCommand(input?.command));
        const occurredAt = resolveOccurredAt(command, deps.clock);
        const operation = EVENT_TYPE_TO_OPERATION[command.intent];
        if (!operation) throwErr(E.INVALID_COMMAND, 'intent sem operação de autorização.');
        if (command.intent === 'chart_created') authorize(actor, operation, null);
        const value = await deps.transactionPort.withTransaction(async (tx) => {
          unwrap(assertTransaction(tx));
          if (command.intent === 'chart_created') {
            return createChart(tx, { actor, command, occurredAt, idGenerator: deps.idGenerator });
          }
          const chart = await tx.getChartForUpdate({ tenantId: actor.tenantId, chartId: command.chartId });
          assertChartIdentity(chart, actor);
          authorize(actor, operation, chart.status);
          return mutateChart(tx, { actor, command, chart, occurredAt, idGenerator: deps.idGenerator });
        });
        return { ok: true, value: Object.freeze(value), error: null };
      } catch (err) {
        if (err instanceof OdontogramCommandError) {
          return { ok: false, value: null, error: { code: err.code, message: err.message, details: err.details } };
        }
        return { ok: false, value: null, error: { code: E.TRANSACTION_FAILED, message: 'Falha transacional.', details: {} } };
      }
    },
  });
}
