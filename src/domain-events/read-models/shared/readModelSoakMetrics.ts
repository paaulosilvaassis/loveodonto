/**
 * @module domain-events/read-models/shared/readModelSoakMetrics
 * @description Métricas de soak in-memory por readModelId + tenantId — Phase 8.2.
 */

import { readModelScopeKey } from './readModelTenant.js';

export interface ReadModelSoakMetricsEntry {
  totalBuildAttempts: number;
  totalBuildSucceeded: number;
  totalBuildFailed: number;
  totalRebuilds: number;
  totalSnapshotsCompared: number;
  totalConsistent: number;
  totalDrifts: number;
  totalCacheHits: number;
  totalCacheMisses: number;
  totalInvalidations: number;
  totalStaleSnapshots: number;
  totalTenantIsolationFailures: number;
  totalProjectionScopeWarnings: number;
  lastBuildAt: string | null;
  lastComparisonAt: string | null;
  lastError: string | null;
}

function emptyEntry(): ReadModelSoakMetricsEntry {
  return {
    totalBuildAttempts: 0,
    totalBuildSucceeded: 0,
    totalBuildFailed: 0,
    totalRebuilds: 0,
    totalSnapshotsCompared: 0,
    totalConsistent: 0,
    totalDrifts: 0,
    totalCacheHits: 0,
    totalCacheMisses: 0,
    totalInvalidations: 0,
    totalStaleSnapshots: 0,
    totalTenantIsolationFailures: 0,
    totalProjectionScopeWarnings: 0,
    lastBuildAt: null,
    lastComparisonAt: null,
    lastError: null,
  };
}

const byScope = new Map<string, ReadModelSoakMetricsEntry>();

function ensure(readModelId: string, tenantId: string): ReadModelSoakMetricsEntry {
  const key = readModelScopeKey(readModelId, tenantId, { allowTestFallback: true });
  if (!byScope.has(key)) byScope.set(key, emptyEntry());
  return byScope.get(key)!;
}

function touch(
  readModelId: string,
  tenantId: string,
  field: keyof Omit<
    ReadModelSoakMetricsEntry,
    'lastBuildAt' | 'lastComparisonAt' | 'lastError'
  >,
): void {
  const entry = ensure(readModelId, tenantId);
  entry[field] += 1;
}

export function recordSoakBuildAttempt(readModelId: string, tenantId: string): void {
  touch(readModelId, tenantId, 'totalBuildAttempts');
  ensure(readModelId, tenantId).lastBuildAt = new Date().toISOString();
}

export function recordSoakBuildSucceeded(readModelId: string, tenantId: string): void {
  touch(readModelId, tenantId, 'totalBuildSucceeded');
}

export function recordSoakBuildFailed(
  readModelId: string,
  tenantId: string,
  error: string,
): void {
  touch(readModelId, tenantId, 'totalBuildFailed');
  ensure(readModelId, tenantId).lastError = String(error || '').slice(0, 200);
}

export function recordSoakRebuild(readModelId: string, tenantId: string): void {
  touch(readModelId, tenantId, 'totalRebuilds');
}

export function recordSoakComparison(
  readModelId: string,
  tenantId: string,
  consistent: boolean,
): void {
  touch(readModelId, tenantId, 'totalSnapshotsCompared');
  if (consistent) touch(readModelId, tenantId, 'totalConsistent');
  else touch(readModelId, tenantId, 'totalDrifts');
  ensure(readModelId, tenantId).lastComparisonAt = new Date().toISOString();
}

export function recordSoakCacheHit(readModelId: string, tenantId: string): void {
  touch(readModelId, tenantId, 'totalCacheHits');
}

export function recordSoakCacheMiss(readModelId: string, tenantId: string): void {
  touch(readModelId, tenantId, 'totalCacheMisses');
}

export function recordSoakInvalidation(readModelId: string, tenantId: string): void {
  touch(readModelId, tenantId, 'totalInvalidations');
}

export function recordSoakStaleSnapshot(readModelId: string, tenantId: string): void {
  touch(readModelId, tenantId, 'totalStaleSnapshots');
}

export function recordSoakTenantIsolationFailure(
  readModelId: string,
  tenantId: string,
): void {
  touch(readModelId, tenantId, 'totalTenantIsolationFailures');
}

export function recordSoakProjectionScopeWarning(
  readModelId: string,
  tenantId: string,
): void {
  touch(readModelId, tenantId, 'totalProjectionScopeWarnings');
}

export function getReadModelSoakMetrics(
  readModelId: string,
  tenantId: string,
): ReadModelSoakMetricsEntry {
  return { ...ensure(readModelId, tenantId) };
}

export function getAllReadModelSoakMetrics(): Record<string, ReadModelSoakMetricsEntry> {
  const out: Record<string, ReadModelSoakMetricsEntry> = {};
  for (const [key, value] of byScope.entries()) {
    out[key] = { ...value };
  }
  return out;
}

export function sumReadModelSoakMetrics(): {
  builds: number;
  rebuilds: number;
  consistent: number;
  drifts: number;
  cacheHits: number;
  cacheMisses: number;
  projectionScopeWarnings: number;
  tenantIsolationFailures: number;
  staleSnapshots: number;
  buildFailures: number;
} {
  let builds = 0;
  let rebuilds = 0;
  let consistent = 0;
  let drifts = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  let projectionScopeWarnings = 0;
  let tenantIsolationFailures = 0;
  let staleSnapshots = 0;
  let buildFailures = 0;
  for (const m of byScope.values()) {
    builds += m.totalBuildSucceeded;
    rebuilds += m.totalRebuilds;
    consistent += m.totalConsistent;
    drifts += m.totalDrifts;
    cacheHits += m.totalCacheHits;
    cacheMisses += m.totalCacheMisses;
    projectionScopeWarnings += m.totalProjectionScopeWarnings;
    tenantIsolationFailures += m.totalTenantIsolationFailures;
    staleSnapshots += m.totalStaleSnapshots;
    buildFailures += m.totalBuildFailed;
  }
  return {
    builds,
    rebuilds,
    consistent,
    drifts,
    cacheHits,
    cacheMisses,
    projectionScopeWarnings,
    tenantIsolationFailures,
    staleSnapshots,
    buildFailures,
  };
}

export function __clearReadModelSoakMetricsForTest(): void {
  byScope.clear();
}
