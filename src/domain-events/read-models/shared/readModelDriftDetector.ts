/**
 * @module domain-events/read-models/shared/readModelDriftDetector
 * @description Detector de drift estrutural — Phase 8.2.
 * Sem dados sensíveis completos.
 */

import type {
  ReadModelDriftKind,
  ReadModelDriftRecord,
  ReadModelDriftSeverity,
} from './readModelSoakTypes.js';

const METADATA_FIELDS = new Set([
  'builtAt',
  'lifecycleState',
]);

function severityFor(kind: ReadModelDriftKind): ReadModelDriftSeverity {
  if (kind === 'none' || kind === 'metadata-only') return 'info';
  if (kind === 'stale-snapshot' || kind === 'version-drift') return 'warn';
  return 'error';
}

export function createDriftRecord(input: {
  readModelId: string;
  tenantId: string;
  kind: ReadModelDriftKind;
  fields?: string[];
  expected?: unknown;
  actual?: unknown;
  sourceProjection?: string | null;
  message: string;
}): ReadModelDriftRecord {
  return Object.freeze({
    readModelId: input.readModelId,
    tenantId: input.tenantId,
    kind: input.kind,
    severity: severityFor(input.kind),
    fields: Object.freeze([...(input.fields || [])]),
    expected: input.expected ?? null,
    actual: input.actual ?? null,
    detectedAt: new Date().toISOString(),
    sourceProjection: input.sourceProjection ?? null,
    message: String(input.message || '').slice(0, 240),
  });
}

export function classifyFieldDrift(field: string): ReadModelDriftKind {
  if (METADATA_FIELDS.has(field)) return 'metadata-only';
  if (field === 'tenantId' || field.startsWith('tenant')) return 'tenant-scope-drift';
  if (field === 'version' || field.startsWith('sourceVersions')) return 'version-drift';
  if (field.startsWith('payload') || field.includes('indicator') || field.includes('counter')) {
    return 'counter-drift';
  }
  return 'invalid-snapshot';
}

/** Agrega kinds: counter > tenant > version > stale > missing > invalid > metadata > none */
export function aggregateDriftKind(kinds: readonly ReadModelDriftKind[]): ReadModelDriftKind {
  const set = new Set(kinds.filter((k) => k !== 'none'));
  if (set.size === 0) return 'none';
  if (set.has('counter-drift')) return 'counter-drift';
  if (set.has('tenant-scope-drift')) return 'tenant-scope-drift';
  if (set.has('version-drift')) return 'version-drift';
  if (set.has('stale-snapshot')) return 'stale-snapshot';
  if (set.has('missing-snapshot')) return 'missing-snapshot';
  if (set.has('invalid-snapshot')) return 'invalid-snapshot';
  if (set.has('metadata-only')) return 'metadata-only';
  return 'invalid-snapshot';
}

const driftLog: ReadModelDriftRecord[] = [];
const DRIFT_CAP = 200;

export function appendReadModelDrift(record: ReadModelDriftRecord): void {
  driftLog.push(record);
  while (driftLog.length > DRIFT_CAP) driftLog.shift();
}

export function getReadModelDriftLog(filter?: {
  readModelId?: string;
  tenantId?: string;
}): ReadModelDriftRecord[] {
  return driftLog
    .filter((d) => {
      if (filter?.readModelId && d.readModelId !== filter.readModelId) return false;
      if (filter?.tenantId && d.tenantId !== filter.tenantId) return false;
      return true;
    })
    .map((d) => ({ ...d, fields: [...d.fields] }));
}

export function __clearReadModelDriftLogForTest(): void {
  driftLog.length = 0;
}
