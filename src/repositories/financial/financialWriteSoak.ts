/**
 * @module repositories/financial/financialWriteSoak
 * @description Métricas e relatório de soak — Phase 5.14 (in-memory, staging/dev).
 */

import type { FinancialDomain } from './financialTypes.js';
import { getFinancialWriteAuditLog } from './financialWriteAudit.js';

export interface FinancialWriteSoakMetrics {
  primaryOk: number;
  primaryFailed: number;
  shadowOk: number;
  shadowFailed: number;
  skipped: number;
  fallbackLegacy: number;
  startedAt: string | null;
  lastEventAt: string | null;
}

const metrics: FinancialWriteSoakMetrics = {
  primaryOk: 0,
  primaryFailed: 0,
  shadowOk: 0,
  shadowFailed: 0,
  skipped: 0,
  fallbackLegacy: 0,
  startedAt: null,
  lastEventAt: null,
};

function touchMetric(event: keyof FinancialWriteSoakMetrics): void {
  const now = new Date().toISOString();
  if (!metrics.startedAt) metrics.startedAt = now;
  metrics.lastEventAt = now;
  if (typeof metrics[event] === 'number') {
    (metrics[event] as number) += 1;
  }
}

export function recordFinancialWriteSoakPrimaryOk(): void {
  touchMetric('primaryOk');
}

export function recordFinancialWriteSoakPrimaryFailed(): void {
  touchMetric('primaryFailed');
}

export function recordFinancialWriteSoakShadowOk(): void {
  touchMetric('shadowOk');
}

export function recordFinancialWriteSoakShadowFailed(): void {
  touchMetric('shadowFailed');
}

export function recordFinancialWriteSoakSkipped(): void {
  touchMetric('skipped');
}

export function recordFinancialWriteSoakFallbackLegacy(): void {
  touchMetric('fallbackLegacy');
}

export function getFinancialWriteSoakMetrics(): FinancialWriteSoakMetrics {
  return { ...metrics };
}

export function buildFinancialWriteSoakReport(
  tenantId: string,
  compareReport: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const audit = getFinancialWriteAuditLog();
  const tenantAudit = audit.filter((entry) => entry.tenantId === tenantId);
  const okCount = tenantAudit.filter((e) => e.syncResult === 'ok').length;
  const failedCount = tenantAudit.filter((e) => e.syncResult === 'failed').length;
  const shadowCount = tenantAudit.filter((e) => e.syncResult === 'shadow').length;

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    metrics: getFinancialWriteSoakMetrics(),
    auditSummary: {
      total: tenantAudit.length,
      ok: okCount,
      failed: failedCount,
      shadow: shadowCount,
      skipped: tenantAudit.filter((e) => e.syncResult === 'skipped').length,
    },
    consistency: compareReport,
    rollback: 'Desligar FINANCIAL_WRITE_PRIMARY restaura authority IndexedDB imediata.',
  };
}

export function logFinancialWriteSoakDev(
  event: string,
  payload: Record<string, unknown> & { domain?: FinancialDomain },
): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[FINANCIAL_WRITE_SOAK]', event, payload);
}

export function __clearFinancialWriteSoakForTest(): void {
  metrics.primaryOk = 0;
  metrics.primaryFailed = 0;
  metrics.shadowOk = 0;
  metrics.shadowFailed = 0;
  metrics.skipped = 0;
  metrics.fallbackLegacy = 0;
  metrics.startedAt = null;
  metrics.lastEventAt = null;
}
