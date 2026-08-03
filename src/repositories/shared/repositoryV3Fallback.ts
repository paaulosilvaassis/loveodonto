/**
 * @module repositories/shared/repositoryV3Fallback
 * @description Fallback reutilizável para falhas de write remoto — Repository V3 Write Toolkit.
 * Preserva IndexedDB; nunca propaga falha ao caller legado.
 */

import { createRepositoryWriteAuditEntry } from './repositoryV3WriteAudit.js';
import { logRepositoryDev } from './repositoryV3SyncHelpers.js';

export interface RepositoryWriteFallbackContext {
  domain: string;
  tenantId: string;
  legacyId: string;
  correlationId: string;
  writeSource: string;
  retryCount?: number;
  event: string;
  error: unknown;
}

export interface RepositoryWriteFallbackResult {
  preservedIndexedDb: true;
  rollbackAvailable: true;
  auditRecorded: boolean;
}

export function handleRepositoryWriteFallback(
  context: RepositoryWriteFallbackContext,
): RepositoryWriteFallbackResult {
  const message = context.error instanceof Error
    ? context.error.message
    : String(context.error || 'remote-write-failed');

  createRepositoryWriteAuditEntry({
    writeSource: context.writeSource,
    legacyId: context.legacyId,
    remoteId: null,
    correlationId: context.correlationId,
    tenantId: context.tenantId,
    retryCount: context.retryCount ?? 0,
    syncResult: 'failed',
    domain: context.domain,
    error: message,
  });

  logRepositoryDev('WRITE_FALLBACK', context.event, {
    domain: context.domain,
    tenantId: context.tenantId,
    legacyId: context.legacyId,
    error: message,
    indexedDbPreserved: true,
    rollback: 'flag-off-immediate',
  });

  return {
    preservedIndexedDb: true,
    rollbackAvailable: true,
    auditRecorded: true,
  };
}
