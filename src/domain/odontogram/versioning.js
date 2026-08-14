import { cloneCanonicalJson, hashCanonicalSnapshot } from './canonicalJson.js';
import { CLINICAL_SCHEMA_VERSION, PROJECTED_CHART_STATUSES } from './projection.js';

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

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    return fail('INVALID_VERSION', `${field} deve ser inteiro positivo.`, { field });
  }
  return null;
}

function opaqueId(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    return fail('INVALID_ID', `${field} deve ser string opaca não vazia, já trimada.`, { field });
  }
  return null;
}

function isoTimestamp(value, field) {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0) {
    return fail('INVALID_TIMESTAMP', `${field} deve ser timestamp ISO-8601 trimado.`, { field });
  }
  if (Number.isNaN(Date.parse(value))) {
    return fail('INVALID_TIMESTAMP', `${field} não é um timestamp válido.`, { field });
  }
  return null;
}

function buildClinicalSnapshot(projection) {
  return cloneCanonicalJson({
    schemaVersion: projection.schemaVersion,
    chartId: projection.chartId,
    tenantId: projection.tenantId,
    patientId: projection.patientId,
    dentitionStage: projection.dentitionStage,
    status: projection.status,
    lastAppliedEventId: projection.lastAppliedEventId,
    lastSequence: projection.lastSequence,
    teeth: projection.teeth,
    clinicalLinks: projection.clinicalLinks,
    audit: {
      eventIds: projection.audit.eventIds,
      corrections: projection.audit.corrections,
      originalEvents: projection.audit.originalEvents,
      correctedReferencedIds: projection.audit.correctedReferencedIds,
    },
  });
}

export async function buildChartVersion(input) {
  if (!isPlainObject(input)) return fail('INVALID_VERSION_INPUT', 'Entrada da versão deve ser objeto JSON.');
  const projection = input.projection;
  if (!isPlainObject(projection) || !isPlainObject(projection.audit) || !isPlainObject(projection.teeth)) {
    return fail('INVALID_PROJECTION', 'Projeção canônica inválida.');
  }
  if (projection.schemaVersion !== CLINICAL_SCHEMA_VERSION) {
    return fail('INVALID_SCHEMA_VERSION', 'schemaVersion da projeção é obrigatório e canônico.');
  }
  for (const field of ['chartId', 'tenantId', 'patientId']) {
    const err = opaqueId(projection[field], field);
    if (err) return err;
  }
  if (!PROJECTED_CHART_STATUSES.includes(projection.status)) {
    return fail('INVALID_STATUS', 'status canônico ausente na projeção.');
  }
  const versionErr = positiveInteger(input.versionNumber, 'versionNumber');
  if (versionErr) return versionErr;
  const rowErr = positiveInteger(input.sourceRowVersion, 'sourceRowVersion');
  if (rowErr) return rowErr;
  const createdAtErr = isoTimestamp(input.createdAt, 'createdAt');
  if (createdAtErr) return createdAtErr;
  const createdByErr = opaqueId(input.createdBy, 'createdBy');
  if (createdByErr) return createdByErr;
  if (input.id != null) {
    const idErr = opaqueId(input.id, 'id');
    if (idErr) return idErr;
  }
  let metadata = null;
  if (input.metadata != null) {
    if (!isPlainObject(input.metadata)) {
      return fail('INVALID_METADATA', 'metadata deve ser objeto JSON simples.');
    }
    metadata = cloneCanonicalJson(input.metadata);
  }

  const snapshot = buildClinicalSnapshot(projection);
  if ('snapshotHash' in snapshot || 'snapshot_hash' in snapshot) {
    return fail('HASH_IN_SNAPSHOT', 'snapshot não pode incluir o próprio hash.');
  }
  const snapshotHash = await hashCanonicalSnapshot(snapshot);
  if (typeof snapshotHash !== 'string' || snapshotHash.length !== 64 || snapshotHash !== snapshotHash.toLowerCase()) {
    return fail('INVALID_HASH', 'SHA-256 canônico inválido.');
  }

  return succeed(Object.freeze({
    id: input.id ?? null,
    versionNumber: input.versionNumber,
    sourceRowVersion: input.sourceRowVersion,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    chartId: snapshot.chartId,
    tenantId: snapshot.tenantId,
    patientId: snapshot.patientId,
    lastEventId: snapshot.lastAppliedEventId,
    snapshot,
    snapshotHash,
    metadata,
  }));
}
