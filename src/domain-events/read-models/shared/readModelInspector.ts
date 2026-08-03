/**
 * @module domain-events/read-models/shared/readModelInspector
 * @description Inspector unificado CQRS Read Models — Phase 8.2.
 * Sem HTTP. Sem UI. Sem payloads sensíveis além de indicadores estruturais.
 */

import type { DomainEventFlagsInput } from '../../domainEventFlags.js';
import { listReadModels, getRegisteredReadModelCount, getReadModelDefinition } from './readModelRegistry.js';
import { listReadModelLifecycleStates } from './readModelLifecycle.js';
import {
  listReadModelSnapshotHistory,
  getLastReadModelSnapshot,
} from './readModelBuilder.js';
import { getReadModelCachePolicy } from './readModelCache.js';
import {
  getReadModelFoundationMetrics,
  getReadModelMetricsById,
} from './readModelMetrics.js';
import {
  getReadModelFoundationHealth,
  getReadModelHealthById,
} from './readModelHealth.js';
import {
  getAllReadModelSoakMetrics,
  getReadModelSoakMetrics,
} from './readModelSoakMetrics.js';
import { getReadModelDriftLog } from './readModelDriftDetector.js';
import {
  getReadModelProjectionScope,
  evaluateProjectionScopeForTenantBuild,
} from './readModelProjectionScope.js';
import { buildReadModelSoakReport } from './readModelSoakReport.js';
import { buildReadModelPromotionReport } from './readModelPromotionReport.js';
import { getReadModelPromotionHealth } from './readModelPromotionHealth.js';
import { inspectReadModelPromotion } from './readModelPromotionInspector.js';

export interface ReadModelFoundationInspectorSnapshot {
  registryCount: number;
  registry: ReturnType<typeof listReadModels>;
  lifecycle: Record<string, string>;
  snapshots: ReturnType<typeof listReadModelSnapshotHistory>;
  cache: ReturnType<typeof getReadModelCachePolicy>;
  metrics: ReturnType<typeof getReadModelFoundationMetrics>;
  health: ReturnType<typeof getReadModelFoundationHealth>;
  soakMetrics: ReturnType<typeof getAllReadModelSoakMetrics>;
  drifts: ReturnType<typeof getReadModelDriftLog>;
  soakReport: ReturnType<typeof buildReadModelSoakReport>;
  projectionScopes: Array<{
    readModelId: string;
    projectionId: string | null;
    scope: string;
  }>;
  tenantIsolationWarnings: string[];
  promotion: {
    report: ReturnType<typeof buildReadModelPromotionReport>;
    health: ReturnType<typeof getReadModelPromotionHealth>;
    inspector: ReturnType<typeof inspectReadModelPromotion>;
  };
  byReadModel: Array<{
    readModelId: string;
    definitionVersion: number | null;
    health: ReturnType<typeof getReadModelHealthById>;
    metrics: ReturnType<typeof getReadModelMetricsById>;
    lastSnapshotVersion: number | null;
    projectionScope: string;
  }>;
  inspectedAt: string;
}

export function inspectReadModelFoundation(
  flagsInput: DomainEventFlagsInput = {},
): ReadModelFoundationInspectorSnapshot {
  const registry = listReadModels();
  const projectionScopes = registry.map((e) => {
    const id = e.definition.readModelId;
    const { projectionId, scope } = getReadModelProjectionScope(id);
    return { readModelId: id, projectionId, scope };
  });
  const tenantIsolationWarnings: string[] = [];
  for (const ps of projectionScopes) {
    if (ps.scope !== 'tenant') {
      tenantIsolationWarnings.push(
        `${ps.readModelId}: projection ${ps.projectionId || '?'} scope=${ps.scope}`,
      );
    }
  }

  return {
    registryCount: getRegisteredReadModelCount(),
    registry,
    lifecycle: listReadModelLifecycleStates(),
    snapshots: listReadModelSnapshotHistory(),
    cache: getReadModelCachePolicy(),
    metrics: getReadModelFoundationMetrics(),
    health: getReadModelFoundationHealth(flagsInput),
    soakMetrics: getAllReadModelSoakMetrics(),
    drifts: getReadModelDriftLog(),
    soakReport: buildReadModelSoakReport(flagsInput),
    projectionScopes,
    tenantIsolationWarnings,
    promotion: {
      report: buildReadModelPromotionReport(flagsInput),
      health: getReadModelPromotionHealth(flagsInput),
      inspector: inspectReadModelPromotion(flagsInput),
    },
    byReadModel: registry.map((e) => {
      const id = e.definition.readModelId;
      const last = getLastReadModelSnapshot(id);
      const { scope } = getReadModelProjectionScope(id);
      return {
        readModelId: id,
        definitionVersion: e.definition.version,
        health: getReadModelHealthById(id, flagsInput),
        metrics: getReadModelMetricsById(id),
        lastSnapshotVersion: last?.version ?? null,
        projectionScope: scope,
      };
    }),
    inspectedAt: new Date().toISOString(),
  };
}

/**
 * Inspeção por Read Model.
 * Dados de negócio exigem tenantId explícito quando requireTenant=true (default).
 */
export function inspectReadModelById(
  readModelId: string,
  options: {
    tenantId?: string | null;
    flagsInput?: DomainEventFlagsInput;
    requireTenant?: boolean;
  } = {},
) {
  const id = String(readModelId || '').trim();
  const requireTenant = options.requireTenant !== false;
  const tenantMissing = requireTenant && (options.tenantId == null || options.tenantId === '');
  const { scope, projectionId } = getReadModelProjectionScope(id);
  const scopeEval = options.tenantId
    ? evaluateProjectionScopeForTenantBuild({
        readModelId: id,
        tenantId: String(options.tenantId),
        allowGlobalTestScope: false,
      })
    : null;

  if (tenantMissing) {
    return {
      definition: getReadModelDefinition(id),
      lastSnapshot: null,
      history: [],
      health: getReadModelHealthById(id, options.flagsInput || {}),
      metrics: getReadModelMetricsById(id),
      soakMetrics: null,
      drifts: [],
      projectionScope: scope,
      projectionId,
      tenantIsolationWarning: 'tenantId explícito exigido para dados de negócio',
      scopeEval,
    };
  }

  const tenantId = String(options.tenantId);
  return {
    definition: getReadModelDefinition(id),
    lastSnapshot: getLastReadModelSnapshot(id, tenantId),
    history: listReadModelSnapshotHistory({
      readModelId: id,
      tenantId,
    }),
    health: getReadModelHealthById(id, options.flagsInput || {}, tenantId),
    metrics: getReadModelMetricsById(id),
    soakMetrics: getReadModelSoakMetrics(id, tenantId),
    drifts: getReadModelDriftLog({ readModelId: id, tenantId }),
    projectionScope: scope,
    projectionId,
    tenantIsolationWarning:
      scope !== 'tenant'
        ? `projection ${projectionId || '?'} is ${scope} — não afirmar isolamento multi-tenant`
        : null,
    scopeEval,
  };
}
