/**
 * @module repositories/financial/financialWriteAudit
 * @description Auditoria de write in-memory — Phase 5.13 (sem persistência definitiva).
 */

import type { FinancialDomain, FinancialWriteAuditRecord } from './financialTypes.js';

const auditLog: FinancialWriteAuditRecord[] = [];
const MAX_AUDIT_ENTRIES = 200;

export function recordFinancialWriteAudit(entry: FinancialWriteAuditRecord): FinancialWriteAuditRecord {
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_ENTRIES) auditLog.shift();
  if (import.meta.env?.DEV) {
    console.debug('[FINANCIAL_WRITE_AUDIT]', entry);
  }
  return entry;
}

export function createFinancialWriteAuditEntry(input: {
  writeSource: string;
  legacyId: string;
  remoteId?: string | null;
  correlationId: string;
  tenantId: string;
  retryCount?: number;
  syncResult: FinancialWriteAuditRecord['syncResult'];
  domain: FinancialDomain;
  error?: string;
}): FinancialWriteAuditRecord {
  return recordFinancialWriteAudit({
    writeSource: input.writeSource,
    legacyId: input.legacyId,
    remoteId: input.remoteId ?? null,
    correlationId: input.correlationId,
    tenantId: input.tenantId,
    timestamp: new Date().toISOString(),
    retryCount: input.retryCount ?? 0,
    syncResult: input.syncResult,
    domain: input.domain,
    error: input.error,
  });
}

export function getFinancialWriteAuditLog(): FinancialWriteAuditRecord[] {
  return [...auditLog];
}

export function __clearFinancialWriteAuditForTest(): void {
  auditLog.length = 0;
}
