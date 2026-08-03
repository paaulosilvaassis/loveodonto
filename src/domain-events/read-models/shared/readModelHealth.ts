/**
 * @module domain-events/read-models/shared/readModelHealth
 * @description Health compartilhado — Phase 8.2 (soak / scope / isolation).
 * Projection global/unknown em modelo tenant-aware → nunca healthy silencioso.
 */

import {
  isCqrsReadModelEnabled,
  type DomainEventFlagsInput,
} from '../../domainEventFlags.js';
import { getRegisteredReadModelCount, listReadModels } from './readModelRegistry.js';
import {
  getReadModelLifecycleState,
  listReadModelLifecycleStates,
} from './readModelLifecycle.js';
import {
  getReadModelFoundationMetrics,
  getReadModelMetricsById,
} from './readModelMetrics.js';
import { getReadModelCachePolicy } from './readModelCache.js';
import { getReadModelProjectionScope, READ_MODEL_PRIMARY_PROJECTION } from './readModelProjectionScope.js';
import { sumReadModelSoakMetrics } from './readModelSoakMetrics.js';
import { buildReadModelSoakReport } from './readModelSoakReport.js';
import type { ReadModelHealthStatus } from './readModelTypes.js';

export interface ReadModelItemHealth {
  readModelId: string;
  status: ReadModelHealthStatus;
  detail: string;
  lifecycleByTenant: Record<string, string>;
  metrics: ReturnType<typeof getReadModelMetricsById>;
  projectionScope: string;
  projectionScopeWarning: string | null;
}

export interface ReadModelFoundationHealthReport {
  overall: ReadModelHealthStatus;
  checkedAt: string;
  cqrsEnabled: boolean;
  registeredCount: number;
  cacheSize: number;
  lifecycle: Record<string, string>;
  byReadModel: ReadModelItemHealth[];
  detail: string;
  soak: {
    drifts: number;
    tenantIsolationFailures: number;
    staleSnapshots: number;
    buildFailures: number;
    projectionScopeWarnings: number;
    promotionRecommendation: string;
  };
  projectionScopeWarnings: string[];
}

function statusFromLifecycle(states: string[]): ReadModelHealthStatus {
  if (states.some((s) => s === 'degraded')) return 'degraded';
  if (states.some((s) => s === 'stale')) return 'stale';
  if (states.some((s) => s === 'ready')) return 'healthy';
  if (states.length === 0) return 'ready';
  return 'ready';
}

/** Só alerta scope para Read Models com projection primária declarada. */
function mustWarnProjectionScope(readModelId: string, scope: string): boolean {
  if (!(readModelId in READ_MODEL_PRIMARY_PROJECTION)) return false;
  return scope === 'global' || scope === 'unknown';
}

function downgradeForGlobalScope(
  readModelId: string,
  status: ReadModelHealthStatus,
  scope: string,
): ReadModelHealthStatus {
  if (!mustWarnProjectionScope(readModelId, scope)) return status;
  if (status === 'healthy' || status === 'ready') return 'warning';
  return status;
}

export function getReadModelHealthById(
  readModelId: string,
  flagsInput: DomainEventFlagsInput = {},
  tenantId?: string | null,
): ReadModelItemHealth {
  const id = String(readModelId || '').trim();
  const metrics = getReadModelMetricsById(id);
  const { scope, projectionId } = getReadModelProjectionScope(id);
  const scopeWarning = mustWarnProjectionScope(id, scope)
    ? scope === 'global'
      ? `projection ${projectionId || '?'} is global — multi-tenant consistency not claimed`
      : `projection scope unknown for ${id}`
    : null;

  if (!isCqrsReadModelEnabled(flagsInput)) {
    return {
      readModelId: id,
      status: 'idle',
      detail: 'CQRS_READ_MODEL=false',
      lifecycleByTenant: {},
      metrics,
      projectionScope: scope,
      projectionScopeWarning: scopeWarning,
    };
  }

  if (tenantId != null) {
    const state = getReadModelLifecycleState(id, tenantId);
    let status: ReadModelHealthStatus =
      state === 'degraded'
        ? 'degraded'
        : state === 'stale'
          ? 'stale'
          : state === 'ready'
            ? 'healthy'
            : 'ready';
    status = downgradeForGlobalScope(id, status, scope);
    if (metrics.failures > 0 && status !== 'degraded') status = 'degraded';
    return {
      readModelId: id,
      status,
      detail: `lifecycle=${state}; scope=${scope}`,
      lifecycleByTenant: { [String(tenantId)]: state },
      metrics,
      projectionScope: scope,
      projectionScopeWarning: scopeWarning,
    };
  }

  const lifecycle = listReadModelLifecycleStates();
  const byTenant: Record<string, string> = {};
  for (const [key, state] of Object.entries(lifecycle)) {
    if (key === id || key.startsWith(`${id}::`)) {
      const tenant = key.includes('::') ? key.split('::').slice(1).join('::') : '_';
      byTenant[tenant] = state;
    }
  }
  let status = statusFromLifecycle(Object.values(byTenant));
  if (Object.keys(byTenant).length === 0 && metrics.builds === 0) status = 'ready';
  status = downgradeForGlobalScope(id, status, scope);
  if (metrics.failures > 0 && status !== 'degraded') status = 'degraded';
  return {
    readModelId: id,
    status,
    detail: `tenants=${Object.keys(byTenant).length} failures=${metrics.failures} scope=${scope}`,
    lifecycleByTenant: byTenant,
    metrics,
    projectionScope: scope,
    projectionScopeWarning: scopeWarning,
  };
}

export function getReadModelFoundationHealth(
  flagsInput: DomainEventFlagsInput = {},
): ReadModelFoundationHealthReport {
  const cqrsEnabled = isCqrsReadModelEnabled(flagsInput);
  const registeredCount = getRegisteredReadModelCount();
  const lifecycle = listReadModelLifecycleStates();
  const metrics = getReadModelFoundationMetrics();
  const cache = getReadModelCachePolicy();
  const checkedAt = new Date().toISOString();
  const byReadModel = listReadModels().map((e) =>
    getReadModelHealthById(e.definition.readModelId, flagsInput),
  );
  const soakReport = buildReadModelSoakReport(flagsInput);
  const soakSums = sumReadModelSoakMetrics();
  const projectionScopeWarnings = byReadModel
    .map((m) => m.projectionScopeWarning)
    .filter((w): w is string => !!w);

  const soak = {
    drifts: soakReport.drifts,
    tenantIsolationFailures: soakReport.tenantIsolationFailures,
    staleSnapshots: soakSums.staleSnapshots,
    buildFailures: soakSums.buildFailures + byReadModel.reduce(
      (acc, m) => acc + (m.metrics.failures || 0),
      0,
    ),
    projectionScopeWarnings:
      soakReport.projectionScopeWarnings + projectionScopeWarnings.length,
    promotionRecommendation: soakReport.promotionRecommendation,
  };

  if (!cqrsEnabled) {
    return {
      overall: 'idle',
      checkedAt,
      cqrsEnabled,
      registeredCount,
      cacheSize: cache.size,
      lifecycle,
      byReadModel,
      detail: 'CQRS_READ_MODEL=false',
      soak: {
        drifts: 0,
        tenantIsolationFailures: 0,
        staleSnapshots: 0,
        buildFailures: 0,
        projectionScopeWarnings: 0,
        promotionRecommendation: 'not-applicable',
      },
      projectionScopeWarnings: [],
    };
  }

  const statuses = byReadModel.map((m) => m.status);
  const hasNonTenantScope = byReadModel.some(
    (m) => mustWarnProjectionScope(m.readModelId, m.projectionScope),
  );

  let overall: ReadModelHealthStatus = 'ready';
  if (soak.tenantIsolationFailures > 0) {
    overall = 'degraded';
  } else if (statuses.some((s) => s === 'degraded') || soak.buildFailures > 0) {
    overall = 'degraded';
  } else if (statuses.some((s) => s === 'stale') || soak.staleSnapshots > 0) {
    overall = 'stale';
  } else if (
    hasNonTenantScope
    || projectionScopeWarnings.length > 0
    || soak.projectionScopeWarnings > 0
    || soak.drifts > 0
    || statuses.some((s) => s === 'warning')
  ) {
    overall = 'warning';
  } else if (statuses.some((s) => s === 'healthy')) {
    overall = 'healthy';
  } else if (registeredCount === 0 && metrics.totalSnapshots === 0) {
    overall = 'ready';
  } else if (metrics.totalSnapshots > 0) {
    overall = 'healthy';
  }

  if (hasNonTenantScope && overall === 'healthy') {
    overall = 'warning';
  }

  return {
    overall,
    checkedAt,
    cqrsEnabled,
    registeredCount,
    cacheSize: cache.size,
    lifecycle,
    byReadModel,
    detail: `registered=${registeredCount} snapshots=${metrics.totalSnapshots} scopeWarnings=${projectionScopeWarnings.length}`,
    soak,
    projectionScopeWarnings,
  };
}
