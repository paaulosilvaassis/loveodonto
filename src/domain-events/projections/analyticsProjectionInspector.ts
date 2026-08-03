/**
 * @module domain-events/projections/analyticsProjectionInspector
 * @description Inspeção tenant-scoped — Phase 8.3.
 * Sem HTTP. Sem UI. Sem dump multi-tenant silencioso.
 */

import type { DomainEventFlagsInput } from '../domainEventFlags.js';
import type {
  AnalyticsProjectionId,
  AnalyticsProjectionSnapshot,
} from './analyticsProjectionTypes.js';
import {
  listAnalyticsProjectionDefinitions,
  listAnalyticsProjectionRegistry,
} from './analyticsProjectionRegistry.js';
import {
  getAnalyticsProjection,
  getAnalyticsProjectionHistory,
  getAnalyticsProjectionHistoryCount,
  listAnalyticsProjectionsForTenant,
  listResidualGlobalAnalyticsProjections,
  getAllAnalyticsProjections,
} from './analyticsProjectionStore.js';
import {
  getAnalyticsProjectionMetrics,
  getAllAnalyticsProjectionScopeMetrics,
  getAnalyticsProjectionScopeMetrics,
} from './analyticsProjectionMetrics.js';
import { getAnalyticsProjectionHealth } from './analyticsProjectionHealth.js';
import { getAnalyticsProjectionDiagnostics } from './analyticsProjectionDiagnostics.js';
import { buildAnalyticsProjectionScopeKey } from './analyticsProjectionScope.js';

export interface AnalyticsProjectionInspectorSnapshot {
  tenantId: string | null;
  projections: AnalyticsProjectionSnapshot[];
  history: AnalyticsProjectionSnapshot[];
  historyCount: number;
  registrySize: number;
  definitions: ReturnType<typeof listAnalyticsProjectionDefinitions>;
  metrics: ReturnType<typeof getAnalyticsProjectionMetrics>;
  scopeMetrics: Record<string, ReturnType<typeof getAnalyticsProjectionScopeMetrics>>;
  health: ReturnType<typeof getAnalyticsProjectionHealth>;
  residualGlobal: AnalyticsProjectionSnapshot[];
  diagnostics: ReturnType<typeof getAnalyticsProjectionDiagnostics>;
  inspectedAt: string;
  note: string;
}

/**
 * Inspeção consolidada.
 * Sem tenantId: não retorna dados de negócio de todos os tenants
 * (a menos que diagnosticAllTenants=true).
 */
export function inspectAnalyticsProjections(
  flagsInput: DomainEventFlagsInput = {},
  options: { tenantId?: string | null; diagnosticAllTenants?: boolean } = {},
): AnalyticsProjectionInspectorSnapshot {
  const tenantId =
    options.tenantId != null && String(options.tenantId).trim() !== ''
      ? String(options.tenantId).trim()
      : null;

  const projections = tenantId
    ? listAnalyticsProjectionsForTenant(tenantId)
    : options.diagnosticAllTenants
      ? getAllAnalyticsProjections({ diagnostic: true })
      : [];

  const history = tenantId
    ? getAnalyticsProjectionHistory({ tenantId })
    : [];

  const scopeMetrics = tenantId
    ? {
        [buildAnalyticsProjectionScopeKey('crm-counter', tenantId)]:
          getAnalyticsProjectionScopeMetrics('crm-counter', tenantId),
        [buildAnalyticsProjectionScopeKey('appointment-counter', tenantId)]:
          getAnalyticsProjectionScopeMetrics('appointment-counter', tenantId),
        [buildAnalyticsProjectionScopeKey('financial-counter', tenantId)]:
          getAnalyticsProjectionScopeMetrics('financial-counter', tenantId),
      }
    : options.diagnosticAllTenants
      ? getAllAnalyticsProjectionScopeMetrics()
      : {};

  return {
    tenantId,
    projections,
    history,
    historyCount: tenantId
      ? getAnalyticsProjectionHistoryCount({ tenantId })
      : history.length,
    registrySize: listAnalyticsProjectionRegistry().length,
    definitions: listAnalyticsProjectionDefinitions(),
    metrics: getAnalyticsProjectionMetrics(),
    scopeMetrics,
    health: getAnalyticsProjectionHealth(flagsInput, { tenantId }),
    residualGlobal: listResidualGlobalAnalyticsProjections(),
    diagnostics: getAnalyticsProjectionDiagnostics(),
    inspectedAt: new Date().toISOString(),
    note: tenantId
      ? `scoped to tenant=${tenantId}`
      : options.diagnosticAllTenants
        ? 'diagnostic dump — all tenants'
        : 'tenantId required for business projection data',
  };
}

export function inspectAnalyticsProjectionById(
  projectionId: AnalyticsProjectionId,
  tenantId?: string | null,
): AnalyticsProjectionSnapshot | null {
  return getAnalyticsProjection(projectionId, tenantId);
}

export function inspectAnalyticsProjectionCounters(
  projectionId: AnalyticsProjectionId,
  tenantId?: string | null,
) {
  return getAnalyticsProjection(projectionId, tenantId)?.counters ?? null;
}

export function inspectAnalyticsProjectionScopeKey(
  projectionId: AnalyticsProjectionId,
  tenantId: string,
): string {
  return buildAnalyticsProjectionScopeKey(projectionId, tenantId);
}
