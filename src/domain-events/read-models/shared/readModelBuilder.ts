/**
 * @module domain-events/read-models/shared/readModelBuilder
 * @description Orquestração explícita Projection → Builder → Snapshot — Phase 8.1.
 * Tenant-aware. Sem auto-execução. Flags OFF → no-op.
 */

import { isCqrsReadModelEnabled, type DomainEventFlagsInput } from '../../domainEventFlags.js';
import { getReadModelDefinition } from './readModelRegistry.js';
import {
  getReadModelLifecycleState,
  setReadModelLifecycleState,
} from './readModelLifecycle.js';
import {
  getReadModelCache,
  putReadModelCache,
} from './readModelCache.js';
import {
  recordReadModelFailureMetric,
  recordReadModelRebuildMetric,
  recordReadModelSkipMetric,
  recordReadModelSnapshotBuildMetric,
  recordReadModelSnapshotCountMetric,
  setReadModelTotalSnapshotsMetric,
} from './readModelMetrics.js';
import type { ReadModelSnapshotEnvelope } from './readModelTypes.js';
import { cqrsReadModelNoopReason } from './readModelFlags.js';
import {
  requireReadModelTenantId,
  readModelScopeKey,
  parseReadModelScopeKey,
} from './readModelTenant.js';

export interface BuildReadModelResult {
  readonly built: boolean;
  readonly skipped: boolean;
  readonly reason?: string;
  readonly fromCache: boolean;
  readonly snapshot: ReadModelSnapshotEnvelope | null;
}

const lastSnapshots = new Map<string, ReadModelSnapshotEnvelope>();
const snapshotHistory: ReadModelSnapshotEnvelope[] = [];
let historyCap = 200;

export function setReadModelSnapshotHistoryCap(cap: number): void {
  historyCap = Math.max(1, Math.floor(cap) || 200);
  while (snapshotHistory.length > historyCap) snapshotHistory.shift();
}

export function getLastReadModelSnapshot(
  readModelId: string,
  tenantId?: string | null,
): ReadModelSnapshotEnvelope | null {
  const key = readModelScopeKey(readModelId, tenantId, { allowTestFallback: true });
  return lastSnapshots.get(key) ?? null;
}

export function listReadModelSnapshotHistory(filter?: {
  readModelId?: string;
  tenantId?: string | null;
}): ReadModelSnapshotEnvelope[] {
  const id = filter?.readModelId ? String(filter.readModelId).trim() : '';
  const tid = filter?.tenantId != null ? String(filter.tenantId).trim() : '';
  return snapshotHistory
    .filter((s) => {
      if (id && s.readModelId !== id) return false;
      if (tid && String(s.tenantId || '') !== tid) return false;
      return true;
    })
    .map((s) => ({
      ...s,
      sourceProjectionIds: [...s.sourceProjectionIds],
      sourceVersions: { ...s.sourceVersions },
      payload: { ...(s.payload as object) },
    }));
}

/**
 * Executa builder registrado de forma explícita.
 * Requer tenantId (ou allowTestFallback).
 */
export function buildReadModelSnapshotExplicit(input: {
  readModelId: string;
  projectionSnapshots?: Readonly<Record<string, unknown>>;
  tenantId?: string | null;
  now?: string;
  useCache?: boolean;
  allowTestFallback?: boolean;
  flagsInput?: DomainEventFlagsInput;
}): BuildReadModelResult {
  const flagsInput = input.flagsInput || {};
  const id = String(input.readModelId || '').trim();
  const noop = cqrsReadModelNoopReason(flagsInput);
  if (noop || !isCqrsReadModelEnabled(flagsInput)) {
    recordReadModelSkipMetric(id);
    return {
      built: false,
      skipped: true,
      reason: noop || 'CQRS_READ_MODEL=false',
      fromCache: false,
      snapshot: null,
    };
  }

  let tenantId: string;
  try {
    tenantId = requireReadModelTenantId(input.tenantId, {
      allowTestFallback: input.allowTestFallback === true,
    });
  } catch (err) {
    recordReadModelSkipMetric(id);
    return {
      built: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
      fromCache: false,
      snapshot: null,
    };
  }

  const definition = getReadModelDefinition(id);
  if (!definition) {
    recordReadModelSkipMetric(id);
    return {
      built: false,
      skipped: true,
      reason: 'read model not registered',
      fromCache: false,
      snapshot: null,
    };
  }

  if (input.useCache !== false && definition.cachePolicy.enabled) {
    const cached = getReadModelCache(id, { tenantId });
    if (cached) {
      return {
        built: false,
        skipped: false,
        reason: 'cache hit',
        fromCache: true,
        snapshot: cached,
      };
    }
  }

  const scope = readModelScopeKey(id, tenantId);
  const previous = lastSnapshots.get(scope) ?? null;
  const currentState = getReadModelLifecycleState(id, tenantId);
  const wasReady = currentState === 'ready' || currentState === 'stale';

  try {
    setReadModelLifecycleState(
      id,
      currentState === 'stale' || wasReady ? 'rebuilding' : 'building',
      tenantId,
    );
  } catch (err) {
    recordReadModelFailureMetric(id);
    return {
      built: false,
      skipped: false,
      reason: err instanceof Error ? err.message : String(err),
      fromCache: false,
      snapshot: null,
    };
  }

  try {
    recordReadModelSnapshotBuildMetric(id);
    const snapshot = definition.builder({
      readModelId: id,
      previous,
      projectionSnapshots: input.projectionSnapshots || {},
      tenantId,
      now: input.now,
    });

    // Enforce tenant isolation on result
    const frozenTenant = String(snapshot.tenantId || tenantId);
    if (frozenTenant !== tenantId) {
      throw new Error('builder violou isolamento de tenant');
    }

    lastSnapshots.set(scope, snapshot);
    snapshotHistory.push(snapshot);
    if (snapshotHistory.length > historyCap) snapshotHistory.shift();
    setReadModelTotalSnapshotsMetric(snapshotHistory.length);
    recordReadModelSnapshotCountMetric(id);

    if (definition.cachePolicy.enabled) {
      putReadModelCache(id, snapshot, {
        tenantId,
        ttlMs: definition.cachePolicy.ttlMs,
      });
    }

    if (wasReady) recordReadModelRebuildMetric(id);
    setReadModelLifecycleState(id, 'ready', tenantId);

    return {
      built: true,
      skipped: false,
      fromCache: false,
      snapshot,
    };
  } catch (err) {
    recordReadModelFailureMetric(id);
    try {
      setReadModelLifecycleState(id, 'degraded', tenantId);
    } catch {
      // isolation: não propagar falha de lifecycle
    }
    return {
      built: false,
      skipped: false,
      reason: err instanceof Error ? err.message : String(err),
      fromCache: false,
      snapshot: null,
    };
  }
}

export function resetReadModelSnapshots(filter?: {
  readModelId?: string;
  tenantId?: string | null;
}): void {
  if (!filter?.readModelId && filter?.tenantId == null) {
    lastSnapshots.clear();
    snapshotHistory.length = 0;
    historyCap = 200;
    setReadModelTotalSnapshotsMetric(0);
    return;
  }
  const id = filter.readModelId ? String(filter.readModelId).trim() : '';
  const tid = filter.tenantId != null ? String(filter.tenantId).trim() : '';
  for (const key of [...lastSnapshots.keys()]) {
    const parsed = parseReadModelScopeKey(key);
    if (id && parsed.readModelId !== id) continue;
    if (tid && parsed.tenantId !== tid) continue;
    lastSnapshots.delete(key);
  }
  for (let i = snapshotHistory.length - 1; i >= 0; i -= 1) {
    const s = snapshotHistory[i];
    if (id && s.readModelId !== id) continue;
    if (tid && String(s.tenantId || '') !== tid) continue;
    snapshotHistory.splice(i, 1);
  }
  setReadModelTotalSnapshotsMetric(snapshotHistory.length);
}

export function __clearReadModelBuilderStateForTest(): void {
  resetReadModelSnapshots();
}
