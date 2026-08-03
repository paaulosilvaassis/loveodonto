/**
 * @module domain-events/projections/analyticsProjectionMetrics
 * @description Métricas in-memory tenant-scoped — Phase 8.3.
 * Globais = somatório operacional apenas (sem payload de negócio).
 */

import { buildAnalyticsProjectionScopeKey } from './analyticsProjectionScope.js';
import type { AnalyticsProjectionId } from './analyticsProjectionTypes.js';

export interface AnalyticsProjectionScopeMetrics {
  totalEventsApplied: number;
  totalEventsSkipped: number;
  totalEventsRejected: number;
  totalProjectionUpdates: number;
  totalProjectionCreates: number;
  totalResets: number;
  totalRebuilds: number;
  totalTenantScopeErrors: number;
  totalTenantScopeMismatches: number;
  lastEventAt: string | null;
  lastError: string | null;
}

export interface AnalyticsProjectionMetricsSnapshot {
  totalProjections: number;
  projectionUpdates: number;
  projectionRebuilds: number;
  projectionResets: number;
  projectionSkips: number;
  projectionRejects: number;
  tenantScopeErrors: number;
  tenantScopeMismatches: number;
  startedAt: string | null;
  lastUpdateAt: string | null;
}

const metrics: AnalyticsProjectionMetricsSnapshot = {
  totalProjections: 0,
  projectionUpdates: 0,
  projectionRebuilds: 0,
  projectionResets: 0,
  projectionSkips: 0,
  projectionRejects: 0,
  tenantScopeErrors: 0,
  tenantScopeMismatches: 0,
  startedAt: null,
  lastUpdateAt: null,
};

const byScope = new Map<string, AnalyticsProjectionScopeMetrics>();

function emptyScope(): AnalyticsProjectionScopeMetrics {
  return {
    totalEventsApplied: 0,
    totalEventsSkipped: 0,
    totalEventsRejected: 0,
    totalProjectionUpdates: 0,
    totalProjectionCreates: 0,
    totalResets: 0,
    totalRebuilds: 0,
    totalTenantScopeErrors: 0,
    totalTenantScopeMismatches: 0,
    lastEventAt: null,
    lastError: null,
  };
}

function ensureScope(
  projectionId: AnalyticsProjectionId | string,
  tenantId: string,
): AnalyticsProjectionScopeMetrics {
  const key = buildAnalyticsProjectionScopeKey(String(projectionId), tenantId);
  if (!byScope.has(key)) byScope.set(key, emptyScope());
  return byScope.get(key)!;
}

function touchGlobal(
  key: Exclude<
    keyof AnalyticsProjectionMetricsSnapshot,
    'startedAt' | 'lastUpdateAt' | 'totalProjections'
  >,
): void {
  const now = new Date().toISOString();
  if (!metrics.startedAt) metrics.startedAt = now;
  metrics.lastUpdateAt = now;
  metrics[key] += 1;
}

export function setAnalyticsProjectionTotalMetric(count: number): void {
  metrics.totalProjections = Math.max(0, count);
}

export function recordProjectionUpdateMetric(): void {
  touchGlobal('projectionUpdates');
}

export function recordProjectionRebuildMetric(): void {
  touchGlobal('projectionRebuilds');
}

export function recordProjectionResetMetric(): void {
  touchGlobal('projectionResets');
}

export function recordProjectionSkipMetric(): void {
  touchGlobal('projectionSkips');
}

export function recordProjectionRejectMetric(): void {
  touchGlobal('projectionRejects');
}

export function recordTenantScopeErrorMetric(): void {
  touchGlobal('tenantScopeErrors');
}

export function recordTenantScopeMismatchMetric(): void {
  touchGlobal('tenantScopeMismatches');
}

export function recordScopeMetric(
  projectionId: AnalyticsProjectionId | string,
  tenantId: string,
  kind:
    | 'apply'
    | 'skip'
    | 'reject'
    | 'update'
    | 'create'
    | 'reset'
    | 'rebuild'
    | 'scope-error'
    | 'mismatch',
  error?: string,
): void {
  const entry = ensureScope(projectionId, tenantId);
  const now = new Date().toISOString();
  entry.lastEventAt = now;
  switch (kind) {
    case 'apply':
      entry.totalEventsApplied += 1;
      break;
    case 'skip':
      entry.totalEventsSkipped += 1;
      break;
    case 'reject':
      entry.totalEventsRejected += 1;
      break;
    case 'update':
      entry.totalProjectionUpdates += 1;
      break;
    case 'create':
      entry.totalProjectionCreates += 1;
      break;
    case 'reset':
      entry.totalResets += 1;
      break;
    case 'rebuild':
      entry.totalRebuilds += 1;
      break;
    case 'scope-error':
      entry.totalTenantScopeErrors += 1;
      entry.lastError = String(error || '').slice(0, 200);
      break;
    case 'mismatch':
      entry.totalTenantScopeMismatches += 1;
      entry.lastError = String(error || 'TENANT_SCOPE_MISMATCH').slice(0, 200);
      break;
    default:
      break;
  }
}

export function getAnalyticsProjectionScopeMetrics(
  projectionId: string,
  tenantId: string,
): AnalyticsProjectionScopeMetrics {
  return { ...ensureScope(projectionId, tenantId) };
}

export function getAllAnalyticsProjectionScopeMetrics(): Record<
  string,
  AnalyticsProjectionScopeMetrics
> {
  const out: Record<string, AnalyticsProjectionScopeMetrics> = {};
  for (const [k, v] of byScope.entries()) out[k] = { ...v };
  return out;
}

export function getAnalyticsProjectionMetrics(): AnalyticsProjectionMetricsSnapshot {
  return { ...metrics };
}

export function __clearAnalyticsProjectionMetricsForTest(): void {
  metrics.totalProjections = 0;
  metrics.projectionUpdates = 0;
  metrics.projectionRebuilds = 0;
  metrics.projectionResets = 0;
  metrics.projectionSkips = 0;
  metrics.projectionRejects = 0;
  metrics.tenantScopeErrors = 0;
  metrics.tenantScopeMismatches = 0;
  metrics.startedAt = null;
  metrics.lastUpdateAt = null;
  byScope.clear();
}
