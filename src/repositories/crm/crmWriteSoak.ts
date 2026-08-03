/**
 * @module repositories/crm/crmWriteSoak
 * @description Métricas e relatório de soak — Phase 6.4 (in-memory, staging/dev).
 */

import { getRepositoryWriteAuditLog } from '../shared/repositoryV3WriteAudit.js';

export interface CrmWriteSoakMetrics {
  totalWrites: number;
  primaryOk: number;
  primaryFailed: number;
  shadowOk: number;
  shadowFailed: number;
  fallbackLegacy: number;
  hydrateOk: number;
  hydrateFailed: number;
  compareDiffs: number;
  skipped: number;
  lastError: string | null;
  startedAt: string | null;
  lastEventAt: string | null;
}

const metrics: CrmWriteSoakMetrics = {
  totalWrites: 0,
  primaryOk: 0,
  primaryFailed: 0,
  shadowOk: 0,
  shadowFailed: 0,
  fallbackLegacy: 0,
  hydrateOk: 0,
  hydrateFailed: 0,
  compareDiffs: 0,
  skipped: 0,
  lastError: null,
  startedAt: null,
  lastEventAt: null,
};

type CrmWriteSoakCounterKey = Exclude<keyof CrmWriteSoakMetrics, 'lastError' | 'startedAt' | 'lastEventAt'>;

function touchMetric(event: CrmWriteSoakCounterKey): void {
  const now = new Date().toISOString();
  if (!metrics.startedAt) metrics.startedAt = now;
  metrics.lastEventAt = now;
  metrics[event] += 1;
}

export function recordCrmWriteSoakTotalWrite(): void {
  touchMetric('totalWrites');
}

export function recordCrmWriteSoakPrimaryOk(): void {
  touchMetric('primaryOk');
}

export function recordCrmWriteSoakPrimaryFailed(): void {
  touchMetric('primaryFailed');
}

export function recordCrmWriteSoakShadowOk(): void {
  touchMetric('shadowOk');
}

export function recordCrmWriteSoakShadowFailed(): void {
  touchMetric('shadowFailed');
}

export function recordCrmWriteSoakFallbackLegacy(error?: unknown): void {
  touchMetric('fallbackLegacy');
  metrics.lastError = error instanceof Error
    ? error.message
    : String(error || 'crm-write-fallback');
}

export function recordCrmWriteSoakHydrateOk(): void {
  touchMetric('hydrateOk');
}

export function recordCrmWriteSoakHydrateFailed(error?: unknown): void {
  touchMetric('hydrateFailed');
  if (error) {
    metrics.lastError = error instanceof Error ? error.message : String(error);
  }
}

export function recordCrmWriteSoakCompareDiff(): void {
  touchMetric('compareDiffs');
}

export function recordCrmWriteSoakSkipped(): void {
  touchMetric('skipped');
}

export function getCrmWriteSoakMetrics(): CrmWriteSoakMetrics {
  return { ...metrics };
}

export function buildCrmWriteSoakReport(
  tenantId: string,
  compareReport: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const audit = getRepositoryWriteAuditLog();
  const tenantAudit = audit.filter((entry) => entry.tenantId === tenantId);
  const okCount = tenantAudit.filter((e) => e.syncResult === 'ok').length;
  const failedCount = tenantAudit.filter((e) => e.syncResult === 'failed').length;
  const shadowCount = tenantAudit.filter((e) => e.syncResult === 'shadow').length;

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    metrics: getCrmWriteSoakMetrics(),
    auditSummary: {
      total: tenantAudit.length,
      ok: okCount,
      failed: failedCount,
      shadow: shadowCount,
      skipped: tenantAudit.filter((e) => e.syncResult === 'skipped').length,
    },
    consistency: compareReport,
    rollback: 'Desligar CRM_WRITE_PRIMARY restaura authority IndexedDB imediata.',
  };
}

export function logCrmWriteSoakDev(
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[CRM_WRITE_SOAK]', event, payload);
}

export function __clearCrmWriteSoakForTest(): void {
  metrics.totalWrites = 0;
  metrics.primaryOk = 0;
  metrics.primaryFailed = 0;
  metrics.shadowOk = 0;
  metrics.shadowFailed = 0;
  metrics.fallbackLegacy = 0;
  metrics.hydrateOk = 0;
  metrics.hydrateFailed = 0;
  metrics.compareDiffs = 0;
  metrics.skipped = 0;
  metrics.lastError = null;
  metrics.startedAt = null;
  metrics.lastEventAt = null;
}
