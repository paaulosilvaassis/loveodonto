/**
 * @module domain-events/read-models/shared/readModelMetrics
 * @description Métricas estruturais CQRS Read Models — Phase 8.1 (segmentadas).
 */

export interface ReadModelPerIdMetrics {
  builds: number;
  rebuilds: number;
  snapshots: number;
  cacheHits: number;
  cacheMisses: number;
  invalidations: number;
  skips: number;
  failures: number;
  staleSnapshots: number;
}

export interface ReadModelFoundationMetricsSnapshot {
  totalReadModels: number;
  totalSnapshots: number;
  rebuilds: number;
  cacheHits: number;
  cacheMisses: number;
  invalidations: number;
  staleSnapshots: number;
  skips: number;
  failures: number;
  byReadModel: Record<string, ReadModelPerIdMetrics>;
  startedAt: string | null;
  lastEventAt: string | null;
}

function emptyPerId(): ReadModelPerIdMetrics {
  return {
    builds: 0,
    rebuilds: 0,
    snapshots: 0,
    cacheHits: 0,
    cacheMisses: 0,
    invalidations: 0,
    skips: 0,
    failures: 0,
    staleSnapshots: 0,
  };
}

const metrics: ReadModelFoundationMetricsSnapshot = {
  totalReadModels: 0,
  totalSnapshots: 0,
  rebuilds: 0,
  cacheHits: 0,
  cacheMisses: 0,
  invalidations: 0,
  staleSnapshots: 0,
  skips: 0,
  failures: 0,
  byReadModel: {},
  startedAt: null,
  lastEventAt: null,
};

function ensurePerId(readModelId?: string): ReadModelPerIdMetrics | null {
  const id = String(readModelId || '').trim();
  if (!id) return null;
  if (!metrics.byReadModel[id]) metrics.byReadModel[id] = emptyPerId();
  return metrics.byReadModel[id];
}

function touchGlobal(
  key: Exclude<
    keyof ReadModelFoundationMetricsSnapshot,
    'startedAt' | 'lastEventAt' | 'totalReadModels' | 'totalSnapshots' | 'byReadModel'
  >,
): void {
  const now = new Date().toISOString();
  if (!metrics.startedAt) metrics.startedAt = now;
  metrics.lastEventAt = now;
  metrics[key] += 1;
}

export function setReadModelTotalMetric(count: number): void {
  metrics.totalReadModels = Math.max(0, count);
}

export function setReadModelTotalSnapshotsMetric(count: number): void {
  metrics.totalSnapshots = Math.max(0, count);
}

export function recordReadModelSnapshotBuildMetric(readModelId?: string): void {
  const now = new Date().toISOString();
  if (!metrics.startedAt) metrics.startedAt = now;
  metrics.lastEventAt = now;
  const per = ensurePerId(readModelId);
  if (per) per.builds += 1;
}

export function recordReadModelRebuildMetric(readModelId?: string): void {
  touchGlobal('rebuilds');
  const per = ensurePerId(readModelId);
  if (per) per.rebuilds += 1;
}

export function recordReadModelCacheHitMetric(readModelId?: string): void {
  touchGlobal('cacheHits');
  const per = ensurePerId(readModelId);
  if (per) per.cacheHits += 1;
}

export function recordReadModelCacheMissMetric(readModelId?: string): void {
  touchGlobal('cacheMisses');
  const per = ensurePerId(readModelId);
  if (per) per.cacheMisses += 1;
}

export function recordReadModelInvalidationMetric(readModelId?: string): void {
  touchGlobal('invalidations');
  const per = ensurePerId(readModelId);
  if (per) per.invalidations += 1;
}

export function recordReadModelStaleSnapshotMetric(readModelId?: string): void {
  touchGlobal('staleSnapshots');
  const per = ensurePerId(readModelId);
  if (per) per.staleSnapshots += 1;
}

export function recordReadModelSkipMetric(readModelId?: string): void {
  touchGlobal('skips');
  const per = ensurePerId(readModelId);
  if (per) per.skips += 1;
}

export function recordReadModelFailureMetric(readModelId?: string): void {
  touchGlobal('failures');
  const per = ensurePerId(readModelId);
  if (per) per.failures += 1;
}

export function recordReadModelSnapshotCountMetric(readModelId?: string): void {
  const per = ensurePerId(readModelId);
  if (per) per.snapshots += 1;
}

export function getReadModelFoundationMetrics(): ReadModelFoundationMetricsSnapshot {
  const byReadModel: Record<string, ReadModelPerIdMetrics> = {};
  for (const [id, m] of Object.entries(metrics.byReadModel)) {
    byReadModel[id] = { ...m };
  }
  return { ...metrics, byReadModel };
}

export function getReadModelMetricsById(readModelId: string): ReadModelPerIdMetrics {
  return { ...(metrics.byReadModel[String(readModelId || '').trim()] || emptyPerId()) };
}

export function __clearReadModelFoundationMetricsForTest(): void {
  metrics.totalReadModels = 0;
  metrics.totalSnapshots = 0;
  metrics.rebuilds = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.invalidations = 0;
  metrics.staleSnapshots = 0;
  metrics.skips = 0;
  metrics.failures = 0;
  metrics.byReadModel = {};
  metrics.startedAt = null;
  metrics.lastEventAt = null;
}
