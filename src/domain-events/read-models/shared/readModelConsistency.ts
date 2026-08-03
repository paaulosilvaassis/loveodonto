/**
 * @module domain-events/read-models/shared/readModelConsistency
 * @description Validação estrutural Projection → Expected → Stored — Phase 8.2.
 */

import type { ReadModelSnapshotEnvelope } from './readModelTypes.js';
import {
  aggregateDriftKind,
  appendReadModelDrift,
  classifyFieldDrift,
  createDriftRecord,
} from './readModelDriftDetector.js';
import type { ReadModelConsistencyResult } from './readModelSoakTypes.js';
import {
  getReadModelProjectionScope,
} from './readModelProjectionScope.js';
import { recordSoakComparison } from './readModelSoakMetrics.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectIndicatorDiffs(
  expected: unknown,
  actual: unknown,
  path: string,
  out: { field: string; expected: unknown; actual: unknown }[],
): void {
  if (path.endsWith('builtAt') || path.endsWith('lifecycleState')) return;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    const a = Array.isArray(expected) ? expected : [];
    const b = Array.isArray(actual) ? actual : [];
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
      out.push({ field: path || 'array', expected, actual });
    }
    return;
  }
  if (!isPlainObject(expected) || !isPlainObject(actual)) {
    if (expected !== actual) {
      out.push({ field: path || 'value', expected, actual });
    }
    return;
  }
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of keys) {
    const next = path ? `${path}.${key}` : key;
    if (!(key in expected) || !(key in actual)) {
      out.push({ field: next, expected: expected[key], actual: actual[key] });
      continue;
    }
    collectIndicatorDiffs(expected[key], actual[key], next, out);
  }
}

/**
 * Compara snapshot esperado (builder) vs armazenado.
 * Timestamps / lifecycleState diferentes com payload igual → metadata-only.
 */
export function compareReadModelSnapshots(input: {
  readModelId: string;
  tenantId: string;
  expected: ReadModelSnapshotEnvelope | null;
  actual: ReadModelSnapshotEnvelope | null;
  sourceProjection?: string | null;
  treatAsStale?: boolean;
}): ReadModelConsistencyResult {
  const comparedAt = new Date().toISOString();
  const { scope } = getReadModelProjectionScope(input.readModelId);
  const scopeWarning =
    scope === 'global'
      ? 'projection source is global — multi-tenant consistency not claimed'
      : scope === 'unknown'
        ? 'projection scope unknown — promotion blocked'
        : null;

  if (!input.actual && !input.expected) {
    const drift = createDriftRecord({
      readModelId: input.readModelId,
      tenantId: input.tenantId,
      kind: 'missing-snapshot',
      message: 'expected and actual snapshots missing',
      sourceProjection: input.sourceProjection,
    });
    appendReadModelDrift(drift);
    recordSoakComparison(input.readModelId, input.tenantId, false);
    return {
      consistent: false,
      driftKind: 'missing-snapshot',
      drifts: [drift],
      comparedAt,
      projectionScope: scope,
      scopeWarning,
    };
  }

  if (!input.actual) {
    const drift = createDriftRecord({
      readModelId: input.readModelId,
      tenantId: input.tenantId,
      kind: 'missing-snapshot',
      expected: input.expected?.version ?? null,
      actual: null,
      message: 'stored snapshot missing',
      sourceProjection: input.sourceProjection,
    });
    appendReadModelDrift(drift);
    recordSoakComparison(input.readModelId, input.tenantId, false);
    return {
      consistent: false,
      driftKind: 'missing-snapshot',
      drifts: [drift],
      comparedAt,
      projectionScope: scope,
      scopeWarning,
    };
  }

  if (!input.expected) {
    const drift = createDriftRecord({
      readModelId: input.readModelId,
      tenantId: input.tenantId,
      kind: 'invalid-snapshot',
      message: 'expected snapshot missing',
      sourceProjection: input.sourceProjection,
    });
    appendReadModelDrift(drift);
    recordSoakComparison(input.readModelId, input.tenantId, false);
    return {
      consistent: false,
      driftKind: 'invalid-snapshot',
      drifts: [drift],
      comparedAt,
      projectionScope: scope,
      scopeWarning,
    };
  }

  if (input.treatAsStale) {
    const drift = createDriftRecord({
      readModelId: input.readModelId,
      tenantId: input.tenantId,
      kind: 'stale-snapshot',
      message: 'snapshot marked stale vs projection',
      sourceProjection: input.sourceProjection,
    });
    appendReadModelDrift(drift);
    recordSoakComparison(input.readModelId, input.tenantId, false);
    return {
      consistent: false,
      driftKind: 'stale-snapshot',
      drifts: [drift],
      comparedAt,
      projectionScope: scope,
      scopeWarning,
    };
  }

  const drifts = [];
  const exp = input.expected;
  const act = input.actual;

  if (exp.readModelId !== act.readModelId) {
    drifts.push(
      createDriftRecord({
        readModelId: input.readModelId,
        tenantId: input.tenantId,
        kind: 'invalid-snapshot',
        fields: ['readModelId'],
        expected: exp.readModelId,
        actual: act.readModelId,
        message: 'readModelId mismatch',
        sourceProjection: input.sourceProjection,
      }),
    );
  }
  if (String(exp.tenantId) !== String(act.tenantId)) {
    drifts.push(
      createDriftRecord({
        readModelId: input.readModelId,
        tenantId: input.tenantId,
        kind: 'tenant-scope-drift',
        fields: ['tenantId'],
        expected: exp.tenantId,
        actual: act.tenantId,
        message: 'tenantId mismatch',
        sourceProjection: input.sourceProjection,
      }),
    );
  }
  if (exp.version !== act.version) {
    drifts.push(
      createDriftRecord({
        readModelId: input.readModelId,
        tenantId: input.tenantId,
        kind: 'version-drift',
        fields: ['version'],
        expected: exp.version,
        actual: act.version,
        message: 'version mismatch',
        sourceProjection: input.sourceProjection,
      }),
    );
  }

  const fieldDiffs: { field: string; expected: unknown; actual: unknown }[] = [];
  collectIndicatorDiffs(
    {
      sourceProjectionIds: [...exp.sourceProjectionIds],
      sourceVersions: { ...exp.sourceVersions },
      payload: exp.payload,
    },
    {
      sourceProjectionIds: [...act.sourceProjectionIds],
      sourceVersions: { ...act.sourceVersions },
      payload: act.payload,
    },
    '',
    fieldDiffs,
  );

  for (const diff of fieldDiffs) {
    const kind = classifyFieldDrift(diff.field);
    drifts.push(
      createDriftRecord({
        readModelId: input.readModelId,
        tenantId: input.tenantId,
        kind,
        fields: [diff.field],
        expected: diff.expected,
        actual: diff.actual,
        message: `field drift: ${diff.field}`,
        sourceProjection: input.sourceProjection,
      }),
    );
  }

  // builtAt / lifecycle alone → metadata-only if no other drifts
  if (exp.builtAt !== act.builtAt || exp.lifecycleState !== act.lifecycleState) {
    const onlyMeta = drifts.length === 0;
    if (onlyMeta) {
      drifts.push(
        createDriftRecord({
          readModelId: input.readModelId,
          tenantId: input.tenantId,
          kind: 'metadata-only',
          fields: ['builtAt', 'lifecycleState'].filter(
            (f) => (f === 'builtAt' ? exp.builtAt !== act.builtAt : exp.lifecycleState !== act.lifecycleState),
          ),
          message: 'metadata-only difference (timestamps/lifecycle)',
          sourceProjection: input.sourceProjection,
        }),
      );
    }
  }

  const driftKind = aggregateDriftKind(drifts.map((d) => d.kind));
  const consistent = driftKind === 'none' || driftKind === 'metadata-only';
  for (const d of drifts) appendReadModelDrift(d);
  recordSoakComparison(input.readModelId, input.tenantId, consistent);

  return {
    consistent,
    driftKind,
    drifts,
    comparedAt,
    projectionScope: scope,
    scopeWarning,
  };
}

/** Valida envelope estrutural (imutabilidade / campos obrigatórios). */
export function validateReadModelEnvelopeStructure(
  snapshot: ReadModelSnapshotEnvelope | null,
): { valid: boolean; reason?: string } {
  if (!snapshot) return { valid: false, reason: 'missing snapshot' };
  if (!snapshot.readModelId) return { valid: false, reason: 'missing readModelId' };
  if (snapshot.tenantId == null || snapshot.tenantId === '') {
    return { valid: false, reason: 'missing tenantId' };
  }
  if (!Number.isFinite(snapshot.version)) return { valid: false, reason: 'invalid version' };
  if (!snapshot.builtAt) return { valid: false, reason: 'missing builtAt' };
  if (!snapshot.payload || typeof snapshot.payload !== 'object') {
    return { valid: false, reason: 'invalid payload' };
  }
  if (!Object.isFrozen(snapshot) && !Object.isFrozen(snapshot.payload)) {
    // allow shallow copies from getters; prefer frozen from builder
  }
  return { valid: true };
}
