/**
 * @module repositories/shared/repositoryV3WriteAudit
 * @description Auditoria de write in-memory reutilizável — Repository V3 Write Toolkit.
 * Sem persistência definitiva nesta fase.
 */

export type RepositoryWriteSyncResult = 'ok' | 'failed' | 'skipped' | 'shadow';

export interface RepositoryWriteAuditRecord {
  writeSource: string;
  legacyId: string;
  remoteId: string | null;
  correlationId: string;
  tenantId: string;
  timestamp: string;
  retryCount: number;
  syncResult: RepositoryWriteSyncResult;
  domain: string;
  error?: string;
}

const auditLog: RepositoryWriteAuditRecord[] = [];
const MAX_AUDIT_ENTRIES = 200;

export function recordRepositoryWriteAudit(entry: RepositoryWriteAuditRecord): RepositoryWriteAuditRecord {
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_ENTRIES) auditLog.shift();
  if (import.meta.env?.DEV) {
    console.debug('[REPOSITORY_WRITE_AUDIT]', entry);
  }
  return entry;
}

export function createRepositoryWriteAuditEntry(input: {
  writeSource: string;
  legacyId: string;
  remoteId?: string | null;
  correlationId: string;
  tenantId: string;
  retryCount?: number;
  syncResult: RepositoryWriteSyncResult;
  domain: string;
  error?: string;
}): RepositoryWriteAuditRecord {
  return recordRepositoryWriteAudit({
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

export function getRepositoryWriteAuditLog(): RepositoryWriteAuditRecord[] {
  return [...auditLog];
}

export function __clearRepositoryWriteAuditForTest(): void {
  auditLog.length = 0;
}
