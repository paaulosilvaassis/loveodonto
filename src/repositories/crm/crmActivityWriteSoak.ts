/**
 * @module repositories/crm/crmActivityWriteSoak
 * @description Métricas e relatório de soak — Phase 6.8 Activity Primary Write (in-memory).
 */

import { getRepositoryWriteAuditLog } from '../shared/repositoryV3WriteAudit.js';

export interface CrmActivityWriteSoakMetrics {
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

const metrics: CrmActivityWriteSoakMetrics = {
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

type CounterKey = Exclude<keyof CrmActivityWriteSoakMetrics, 'lastError' | 'startedAt' | 'lastEventAt'>;

function touchMetric(event: CounterKey): void {
  const now = new Date().toISOString();
  if (!metrics.startedAt) metrics.startedAt = now;
  metrics.lastEventAt = now;
  metrics[event] += 1;
}

export function recordCrmActivityWriteSoakTotalWrite(): void {
  touchMetric('totalWrites');
}

export function recordCrmActivityWriteSoakPrimaryOk(): void {
  touchMetric('primaryOk');
}

export function recordCrmActivityWriteSoakPrimaryFailed(): void {
  touchMetric('primaryFailed');
}

export function recordCrmActivityWriteSoakShadowOk(): void {
  touchMetric('shadowOk');
}

export function recordCrmActivityWriteSoakShadowFailed(): void {
  touchMetric('shadowFailed');
}

export function recordCrmActivityWriteSoakFallbackLegacy(error?: unknown): void {
  touchMetric('fallbackLegacy');
  metrics.lastError = error instanceof Error
    ? error.message
    : String(error || 'crm-activity-write-fallback');
}

export function recordCrmActivityWriteSoakHydrateOk(): void {
  touchMetric('hydrateOk');
}

export function recordCrmActivityWriteSoakHydrateFailed(error?: unknown): void {
  touchMetric('hydrateFailed');
  if (error) {
    metrics.lastError = error instanceof Error ? error.message : String(error);
  }
}

export function recordCrmActivityWriteSoakCompareDiff(): void {
  touchMetric('compareDiffs');
}

export function recordCrmActivityWriteSoakSkipped(): void {
  touchMetric('skipped');
}

export function getCrmActivityWriteSoakMetrics(): CrmActivityWriteSoakMetrics {
  return { ...metrics };
}

export function buildCrmActivityWriteSoakReport(
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
    metrics: getCrmActivityWriteSoakMetrics(),
    auditSummary: {
      total: tenantAudit.length,
      ok: okCount,
      failed: failedCount,
      shadow: shadowCount,
      skipped: tenantAudit.filter((e) => e.syncResult === 'skipped').length,
    },
    consistency: compareReport,
    activityStreamProjection: 'Activity DTO reconstrói shapes legados das 4 stores após hydrate.',
    rollback: 'Desligar CRM_ACTIVITY_WRITE_PRIMARY restaura authority IndexedDB imediata.',
  };
}

export function logCrmActivityWriteSoakDev(
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[CRM_ACTIVITY_WRITE_SOAK]', event, payload);
}

export function __clearCrmActivityWriteSoakForTest(): void {
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
