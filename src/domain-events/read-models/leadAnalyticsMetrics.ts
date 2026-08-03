/**
 * @module domain-events/read-models/leadAnalyticsMetrics
 * @description Métricas in-memory do Lead Analytics Read Model — Phase 7.9.
 */

export interface LeadAnalyticsMetricsSnapshot {
  totalSnapshots: number;
  snapshotUpdates: number;
  snapshotResets: number;
  snapshotBuilds: number;
  snapshotSkips: number;
  startedAt: string | null;
  lastBuildAt: string | null;
}

const metrics: LeadAnalyticsMetricsSnapshot = {
  totalSnapshots: 0,
  snapshotUpdates: 0,
  snapshotResets: 0,
  snapshotBuilds: 0,
  snapshotSkips: 0,
  startedAt: null,
  lastBuildAt: null,
};

function touch(
  key: Exclude<
    keyof LeadAnalyticsMetricsSnapshot,
    'startedAt' | 'lastBuildAt' | 'totalSnapshots'
  >,
): void {
  const now = new Date().toISOString();
  if (!metrics.startedAt) metrics.startedAt = now;
  metrics.lastBuildAt = now;
  metrics[key] += 1;
}

export function setLeadAnalyticsTotalSnapshotsMetric(count: number): void {
  metrics.totalSnapshots = Math.max(0, count);
}

export function recordLeadAnalyticsSnapshotUpdateMetric(): void {
  touch('snapshotUpdates');
}

export function recordLeadAnalyticsSnapshotResetMetric(): void {
  touch('snapshotResets');
}

export function recordLeadAnalyticsSnapshotBuildMetric(): void {
  touch('snapshotBuilds');
}

export function recordLeadAnalyticsSnapshotSkipMetric(): void {
  touch('snapshotSkips');
}

export function getLeadAnalyticsMetrics(): LeadAnalyticsMetricsSnapshot {
  return { ...metrics };
}

export function __clearLeadAnalyticsMetricsForTest(): void {
  metrics.totalSnapshots = 0;
  metrics.snapshotUpdates = 0;
  metrics.snapshotResets = 0;
  metrics.snapshotBuilds = 0;
  metrics.snapshotSkips = 0;
  metrics.startedAt = null;
  metrics.lastBuildAt = null;
}
