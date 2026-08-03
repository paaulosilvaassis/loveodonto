/**
 * @module domain-events/projections/analyticsProjectionHealth
 * @description Health de Analytics Projections por tenant — Phase 8.3.
 */

import {
  isDomainEventAnalyticsEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import {
  listAnalyticsProjectionDefinitions,
  listAnalyticsProjectionRegistry,
} from './analyticsProjectionRegistry.js';
import {
  getAnalyticsProjectionMetrics,
  getAllAnalyticsProjectionScopeMetrics,
  getAnalyticsProjectionScopeMetrics,
} from './analyticsProjectionMetrics.js';
import {
  getAnalyticsProjectionCount,
  getAnalyticsProjectionHistoryCount,
  listAnalyticsProjectionsForTenant,
  listResidualGlobalAnalyticsProjections,
} from './analyticsProjectionStore.js';
import type { AnalyticsProjectionHealthStatus } from './analyticsProjectionTypes.js';

export interface AnalyticsProjectionTenantHealth {
  tenantId: string;
  status: AnalyticsProjectionHealthStatus;
  projectionCount: number;
  detail: string;
}

export interface AnalyticsProjectionHealthReport {
  overall: AnalyticsProjectionHealthStatus;
  checkedAt: string;
  analyticsEnabled: boolean;
  registrySize: number;
  projectionCount: number;
  historyCount: number;
  detail: string;
  byTenant: AnalyticsProjectionTenantHealth[];
  residualGlobalCount: number;
  tenantScopeErrors: number;
}

export function getAnalyticsProjectionHealthForTenant(
  tenantId: string,
  flagsInput: DomainEventFlagsInput = {},
): AnalyticsProjectionTenantHealth {
  const tid = String(tenantId || '').trim();
  if (!tid) {
    return {
      tenantId: '',
      status: 'degraded',
      projectionCount: 0,
      detail: 'MISSING_TENANT_SCOPE',
    };
  }
  if (!isDomainEventAnalyticsEnabled(flagsInput)) {
    return {
      tenantId: tid,
      status: 'idle',
      projectionCount: 0,
      detail: 'DOMAIN_EVENT_ANALYTICS=false',
    };
  }
  const snaps = listAnalyticsProjectionsForTenant(tid);
  const scopeMetrics = [
    getAnalyticsProjectionScopeMetrics('crm-counter', tid),
    getAnalyticsProjectionScopeMetrics('appointment-counter', tid),
    getAnalyticsProjectionScopeMetrics('financial-counter', tid),
  ];
  const errors = scopeMetrics.reduce(
    (a, m) => a + m.totalTenantScopeErrors + m.totalTenantScopeMismatches + m.totalEventsRejected,
    0,
  );
  const invalid = snaps.some((s) => s.scope !== 'tenant' || !s.tenantId);
  if (invalid || errors > 0) {
    return {
      tenantId: tid,
      status: 'degraded',
      projectionCount: snaps.length,
      detail: invalid ? 'invalid/residual scope' : `scope errors=${errors}`,
    };
  }
  if (snaps.length === 0) {
    return {
      tenantId: tid,
      status: 'ready',
      projectionCount: 0,
      detail: 'awaiting tenant projection updates',
    };
  }
  return {
    tenantId: tid,
    status: 'healthy',
    projectionCount: snaps.length,
    detail: `projections=${snaps.length}`,
  };
}

export function getAnalyticsProjectionHealth(
  flagsInput: DomainEventFlagsInput = {},
  options: { tenantId?: string | null } = {},
): AnalyticsProjectionHealthReport {
  const analyticsEnabled = isDomainEventAnalyticsEnabled(flagsInput);
  const registrySize = listAnalyticsProjectionRegistry().length;
  const defs = listAnalyticsProjectionDefinitions();
  const residual = listResidualGlobalAnalyticsProjections();
  const metrics = getAnalyticsProjectionMetrics();
  const checkedAt = new Date().toISOString();
  const allScope = getAllAnalyticsProjectionScopeMetrics();

  const tenantIds = new Set<string>();
  if (options.tenantId) tenantIds.add(String(options.tenantId).trim());
  for (const key of Object.keys(allScope)) {
    const idx = key.indexOf('::');
    if (idx > 0) tenantIds.add(key.slice(idx + 2));
  }

  const byTenant = [...tenantIds]
    .filter(Boolean)
    .map((tid) => getAnalyticsProjectionHealthForTenant(tid, flagsInput));

  const projectionCount = options.tenantId
    ? getAnalyticsProjectionCount(options.tenantId)
    : getAnalyticsProjectionCount();
  const historyCount = options.tenantId
    ? getAnalyticsProjectionHistoryCount({ tenantId: options.tenantId })
    : Object.values(allScope).length;

  const registryInconsistent = defs.some(
    (d) => d.scope !== 'tenant' || d.tenantRequired !== true,
  );

  if (!analyticsEnabled) {
    return {
      overall: 'idle',
      checkedAt,
      analyticsEnabled,
      registrySize,
      projectionCount,
      historyCount,
      detail: 'DOMAIN_EVENT_ANALYTICS=false',
      byTenant,
      residualGlobalCount: residual.length,
      tenantScopeErrors: metrics.tenantScopeErrors + metrics.tenantScopeMismatches,
    };
  }

  if (registrySize === 0 || registryInconsistent) {
    return {
      overall: 'degraded',
      checkedAt,
      analyticsEnabled,
      registrySize,
      projectionCount,
      historyCount,
      detail: registryInconsistent
        ? 'registry inconsistent — scope must be tenant'
        : 'analytics enabled but registry empty',
      byTenant,
      residualGlobalCount: residual.length,
      tenantScopeErrors: metrics.tenantScopeErrors + metrics.tenantScopeMismatches,
    };
  }

  if (
    residual.length > 0
    || metrics.tenantScopeErrors > 0
    || metrics.tenantScopeMismatches > 0
    || byTenant.some((t) => t.status === 'degraded')
  ) {
    return {
      overall: 'degraded',
      checkedAt,
      analyticsEnabled,
      registrySize,
      projectionCount,
      historyCount,
      detail: `degraded tenants=${byTenant.filter((t) => t.status === 'degraded').length} residualGlobal=${residual.length}`,
      byTenant,
      residualGlobalCount: residual.length,
      tenantScopeErrors: metrics.tenantScopeErrors + metrics.tenantScopeMismatches,
    };
  }

  if (metrics.projectionUpdates === 0 && byTenant.every((t) => t.projectionCount === 0)) {
    return {
      overall: 'ready',
      checkedAt,
      analyticsEnabled,
      registrySize,
      projectionCount,
      historyCount,
      detail: 'registry ready — awaiting tenant-scoped projection updates',
      byTenant,
      residualGlobalCount: 0,
      tenantScopeErrors: 0,
    };
  }

  // Consolidado não oculta: se algum tenant degraded já caiu acima
  const overall: AnalyticsProjectionHealthStatus = byTenant.some((t) => t.status === 'healthy')
    || metrics.projectionUpdates > 0
    ? 'healthy'
    : 'ready';

  return {
    overall,
    checkedAt,
    analyticsEnabled,
    registrySize,
    projectionCount,
    historyCount,
    detail: `updates=${metrics.projectionUpdates} rejects=${metrics.projectionRejects} tenants=${byTenant.length}`,
    byTenant,
    residualGlobalCount: 0,
    tenantScopeErrors: 0,
  };
}
