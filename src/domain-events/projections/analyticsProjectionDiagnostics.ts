/**
 * @module domain-events/projections/analyticsProjectionDiagnostics
 * @description Diagnósticos locais de scope — Phase 8.3.
 * Alimenta buffer in-memory; sem HTTP/UI.
 */

export type AnalyticsProjectionDiagnosticCode =
  | 'MISSING_TENANT_SCOPE'
  | 'INVALID_TENANT_SCOPE'
  | 'TENANT_SCOPE_MISMATCH'
  | 'INVALID_SCOPE_KEY'
  | 'RESIDUAL_GLOBAL_PROJECTION';

export interface AnalyticsProjectionDiagnosticIssue {
  readonly code: AnalyticsProjectionDiagnosticCode | string;
  readonly message: string;
  readonly detectedAt: string;
}

const log: AnalyticsProjectionDiagnosticIssue[] = [];
const CAP = 100;

export function recordAnalyticsProjectionDiagnostic(
  code: string,
  message: string,
): void {
  log.push(
    Object.freeze({
      code,
      message: String(message || '').slice(0, 240),
      detectedAt: new Date().toISOString(),
    }),
  );
  while (log.length > CAP) log.shift();
}

export function getAnalyticsProjectionDiagnostics(): AnalyticsProjectionDiagnosticIssue[] {
  return log.map((i) => ({ ...i }));
}

export function __clearAnalyticsProjectionDiagnosticsForTest(): void {
  log.length = 0;
}
