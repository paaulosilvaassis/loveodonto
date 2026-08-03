/**
 * @module domain-events/read-models/shared/readModelSoakReport
 * @description Relatório consolidado de soak — Phase 8.3 (tenant-scoped projections).
 * Não promove flags.
 */

import { isCqrsReadModelSoakEnabled, type DomainEventFlagsInput } from '../../domainEventFlags.js';
import {
  getAllReadModelSoakMetrics,
  sumReadModelSoakMetrics,
} from './readModelSoakMetrics.js';
import { getReadModelDriftLog } from './readModelDriftDetector.js';
import { getReadModelProjectionScope } from './readModelProjectionScope.js';
import { parseReadModelScopeKey } from './readModelTenant.js';
import type { ReadModelSoakReport, ReadModelSoakStatus } from './readModelSoakTypes.js';

function statusForScopeMetrics(input: {
  soakEnabled: boolean;
  attempts: number;
  failed: number;
  drifts: number;
  scopeWarnings: number;
  isolationFailures: number;
  projectionScope: string;
}): ReadModelSoakStatus {
  if (!input.soakEnabled) return 'idle';
  if (input.isolationFailures > 0) return 'failed';
  if (input.failed > 0 && input.attempts === input.failed) return 'failed';
  if (input.projectionScope !== 'tenant') return 'warning';
  if (input.drifts > 0 || input.scopeWarnings > 0) return 'warning';
  if (input.attempts > 0) return 'passing';
  return 'ready';
}

export function buildReadModelSoakReport(
  flagsInput: DomainEventFlagsInput = {},
): ReadModelSoakReport {
  const soakEnabled = isCqrsReadModelSoakEnabled(flagsInput);
  const checkedAt = new Date().toISOString();
  const all = getAllReadModelSoakMetrics();
  const sums = sumReadModelSoakMetrics();
  const drifts = getReadModelDriftLog();

  const byReadModel: Record<string, ReadModelSoakStatus> = {};
  const byTenant: Record<string, ReadModelSoakStatus> = {};
  const blockReasons: string[] = [];

  if (!soakEnabled) {
    return {
      overall: 'idle',
      checkedAt,
      byReadModel,
      byTenant,
      builds: 0,
      rebuilds: 0,
      consistent: 0,
      drifts: 0,
      cacheHits: 0,
      cacheMisses: 0,
      projectionScopeWarnings: 0,
      tenantIsolationFailures: 0,
      promotionRecommendation: 'block',
      blockReasons: ['CQRS_READ_MODEL_SOAK=false'],
      detail: 'soak idle',
    };
  }

  for (const [key, metrics] of Object.entries(all)) {
    const { readModelId, tenantId } = parseReadModelScopeKey(key);
    const { scope } = getReadModelProjectionScope(readModelId);
    const status = statusForScopeMetrics({
      soakEnabled,
      attempts: metrics.totalBuildAttempts,
      failed: metrics.totalBuildFailed,
      drifts: metrics.totalDrifts,
      scopeWarnings: metrics.totalProjectionScopeWarnings,
      isolationFailures: metrics.totalTenantIsolationFailures,
      projectionScope: scope,
    });
    byReadModel[readModelId] = status;
    byTenant[`${readModelId}::${tenantId}`] = status;
    if (scope !== 'tenant') {
      blockReasons.push(`${readModelId}: projection scope=${scope}`);
    }
    if (metrics.totalTenantIsolationFailures > 0) {
      blockReasons.push(`${readModelId}/${tenantId}: tenant isolation failures`);
    }
    if (metrics.totalDrifts > 0) {
      blockReasons.push(`${readModelId}/${tenantId}: counter drifts`);
    }
  }

  for (const id of ['lead-analytics', 'appointment-analytics', 'financial-analytics']) {
    const { scope } = getReadModelProjectionScope(id);
    if (scope !== 'tenant') {
      blockReasons.push(`${id}: analytics projection is not tenant-scoped`);
      if (!byReadModel[id]) byReadModel[id] = 'warning';
    }
  }

  const uniqueBlocks = [...new Set(blockReasons)];
  let overall: ReadModelSoakStatus = 'ready';
  const statuses = Object.values(byReadModel);
  if (statuses.includes('failed')) overall = 'failed';
  else if (statuses.includes('blocked')) overall = 'blocked';
  else if (statuses.includes('warning') || uniqueBlocks.length > 0) overall = 'warning';
  else if (statuses.includes('passing')) overall = 'passing';

  const allTenantScoped = ['lead-analytics', 'appointment-analytics', 'financial-analytics']
    .every((id) => getReadModelProjectionScope(id).scope === 'tenant');
  const clean =
    overall === 'passing'
    && uniqueBlocks.length === 0
    && sums.tenantIsolationFailures === 0
    && sums.projectionScopeWarnings === 0
    && allTenantScoped;

  return {
    overall,
    checkedAt,
    byReadModel,
    byTenant,
    builds: sums.builds,
    rebuilds: sums.rebuilds,
    consistent: sums.consistent,
    drifts: sums.drifts + drifts.filter((d) => d.kind !== 'metadata-only' && d.kind !== 'none').length,
    cacheHits: sums.cacheHits,
    cacheMisses: sums.cacheMisses,
    projectionScopeWarnings: sums.projectionScopeWarnings,
    tenantIsolationFailures: sums.tenantIsolationFailures,
    // hold = pronto para avaliação humana na 8.4; nunca auto-promote
    promotionRecommendation: clean ? 'hold' : 'block',
    blockReasons: uniqueBlocks,
    detail: clean
      ? 'soak passing — tenant-scoped projections; flags not auto-promoted (Phase 8.4 readiness)'
      : uniqueBlocks.length > 0
        ? `soak blocked/warning — ${uniqueBlocks[0]}`
        : 'soak ready',
  };
}
