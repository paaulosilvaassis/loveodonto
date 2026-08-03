/**
 * @module domain-events/read-models/shared/readModelPromotionEvaluator
 * @description Avalia Promotion Contract por Read Model — Phase 8.4.
 */

import type { DomainEventFlagsInput } from '../../domainEventFlags.js';
import { getReadModelDefinition } from './readModelRegistry.js';
import { listReadModelLifecycleStates } from './readModelLifecycle.js';
import { getReadModelCachePolicy } from './readModelCache.js';
import { getReadModelMetricsById } from './readModelMetrics.js';
import { getReadModelHealthById } from './readModelHealth.js';
import { getReadModelDriftLog } from './readModelDriftDetector.js';
import { getAllReadModelSoakMetrics } from './readModelSoakMetrics.js';
import { buildReadModelSoakReport } from './readModelSoakReport.js';
import { getReadModelProjectionScope } from './readModelProjectionScope.js';
import { parseReadModelScopeKey } from './readModelTenant.js';
import { runReadModelPromotionChecklist } from './readModelPromotionChecklist.js';
import type {
  ReadModelPromotionContract,
  ReadModelPromotionStatus,
} from './readModelPromotionTypes.js';

function deriveStatus(
  checks: ReturnType<typeof runReadModelPromotionChecklist>,
): {
  status: ReadModelPromotionStatus;
  blockers: string[];
  warnings: string[];
} {
  const blockers = checks
    .filter((c) => c.result === 'fail' && c.blocking)
    .map((c) => `${c.checkId}: ${c.message}`);
  const warnings = checks
    .filter((c) => c.result === 'warn')
    .map((c) => `${c.checkId}: ${c.message}`);

  if (blockers.length > 0) {
    return { status: 'blocked', blockers, warnings };
  }
  if (warnings.length > 0) {
    const softGates = warnings.some((w) =>
      w.startsWith('registry:')
      || w.startsWith('soak:')
      || w.startsWith('snapshot:')
      || w.startsWith('consistency:'),
    );
    if (softGates) {
      return { status: 'not_ready', blockers, warnings };
    }
    return { status: 'warning', blockers, warnings };
  }
  if (checks.some((c) => c.result === 'pass')
    && checks.every((c) => c.result === 'pass' || c.result === 'skip')) {
    return { status: 'ready', blockers, warnings };
  }
  return { status: 'not_ready', blockers, warnings };
}

export function evaluateReadModelPromotion(
  readModelId: string,
  flagsInput: DomainEventFlagsInput = {},
): ReadModelPromotionContract {
  const id = String(readModelId || '').trim();
  const checks = runReadModelPromotionChecklist(id, flagsInput);
  const { status, blockers, warnings } = deriveStatus(checks);
  const definition = getReadModelDefinition(id);
  const { scope } = getReadModelProjectionScope(id);
  const lifecycleAll = listReadModelLifecycleStates();
  const statesSample: Record<string, string> = {};
  for (const [key, state] of Object.entries(lifecycleAll)) {
    if (key === id || key.startsWith(`${id}::`)) {
      statesSample[key] = state;
    }
  }
  const cache = getReadModelCachePolicy();
  const metrics = getReadModelMetricsById(id);
  const health = getReadModelHealthById(id, flagsInput);
  const soakReport = buildReadModelSoakReport(flagsInput);
  const drifts = getReadModelDriftLog({ readModelId: id });
  const hard = drifts.filter(
    (d) => d.kind !== 'none' && d.kind !== 'metadata-only' && d.severity === 'error',
  );
  const soakMetrics = getAllReadModelSoakMetrics();
  let compared = 0;
  let consistent = 0;
  for (const [key, m] of Object.entries(soakMetrics)) {
    if (parseReadModelScopeKey(key).readModelId !== id) continue;
    compared += m.totalSnapshotsCompared;
    consistent += m.totalConsistent;
  }

  return Object.freeze({
    readModelId: id,
    version: definition?.version ?? null,
    tenantScope: scope === 'tenant' ? 'tenant' : scope === 'unknown' ? 'unknown' : 'missing',
    projectionScope: scope,
    lifecycle: Object.freeze({
      autoRebuild: definition ? definition.lifecycle.autoRebuild === false ? false : true : null,
      registered: !!definition,
      statesSample: Object.freeze({ ...statesSample }),
    }),
    cache: Object.freeze({
      enabled: definition?.cachePolicy.enabled ?? null,
      ttlMs: definition?.cachePolicy.ttlMs ?? cache.ttlMs,
      size: cache.size,
    }),
    consistency: Object.freeze({
      consistent: compared === 0 ? null : consistent === compared && hard.length === 0,
      compared,
    }),
    drift: Object.freeze({
      total: drifts.length,
      hard: hard.length,
    }),
    soak: Object.freeze({
      status: soakReport.byReadModel[id] ?? null,
      promotionRecommendation: soakReport.promotionRecommendation,
    }),
    health: Object.freeze({
      operational: health.status,
    }),
    metrics: Object.freeze({
      builds: metrics.builds,
      failures: metrics.failures,
    }),
    inspector: Object.freeze({ available: true as const }),
    promotionStatus: status,
    promotionWarnings: Object.freeze([...warnings]),
    promotionBlockers: Object.freeze([...blockers]),
    checks: Object.freeze([...checks]),
    evaluatedAt: new Date().toISOString(),
  });
}
