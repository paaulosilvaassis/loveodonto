/**
 * @module repositories/shared/repositoryV3WritePipeline
 * @description Pipeline reutilizável de escrita remota — Repository V3 Write Toolkit.
 *
 * Fluxo dual-write:
 *   legacy IDB (já gravado) → remote write → audit shadow → descarta resposta ao caller
 */

import {
  markRepositoryWriteIdempotent,
  resolveRepositoryWriteMeta,
  shouldSkipDuplicateRepositoryWrite,
  type RepositoryWriteMeta,
} from './repositoryV3Idempotency.js';
import {
  createRepositoryWriteAuditEntry,
  type RepositoryWriteSyncResult,
} from './repositoryV3WriteAudit.js';
import { logRepositoryDev } from './repositoryV3SyncHelpers.js';

export interface RepositoryWritePipelineOptions<TLegacy, TRemote> {
  domain: string;
  tenantId: string;
  legacyId: string;
  operation: string;
  partialMeta?: RepositoryWriteMeta;
  defaultWriteSource?: string;
  isWritePrimary?: boolean;
  writeCompare?: boolean;
  getLegacyCore?: () => TLegacy | null;
  executeRemote: (meta: ReturnType<typeof resolveRepositoryWriteMeta>) => Promise<TRemote | null | void>;
  compareWrite?: (legacy: TLegacy | null, remote: TRemote | null) => { match: boolean; diffs?: unknown[] };
  onPrimarySuccess?: (remote: TRemote) => void;
  extractRemoteId?: (remote: TRemote | null | void) => string | null;
}

export interface RepositoryWritePipelineResult {
  skipped: boolean;
  syncResult: RepositoryWriteSyncResult;
  remoteId: string | null;
}

function resolveRemoteId<T>(remote: T | null | void, extract?: (r: T | null | void) => string | null): string | null {
  if (!remote) return null;
  if (extract) return extract(remote);
  const obj = remote as Record<string, unknown>;
  return String(obj?.uuid ?? obj?.legacyId ?? obj?.id ?? '') || null;
}

export async function runRepositoryWritePipeline<TLegacy, TRemote>(
  options: RepositoryWritePipelineOptions<TLegacy, TRemote>,
): Promise<RepositoryWritePipelineResult> {
  const {
    domain,
    tenantId,
    legacyId,
    operation,
    partialMeta = {},
    defaultWriteSource = 'legacy-dual-write',
    isWritePrimary = false,
    writeCompare = false,
    getLegacyCore,
    executeRemote,
    compareWrite,
    onPrimarySuccess,
    extractRemoteId,
  } = options;

  const meta = resolveRepositoryWriteMeta(domain, tenantId, legacyId, operation, partialMeta, {
    defaultWriteSource: isWritePrimary ? 'primary-write-hydrate' : defaultWriteSource,
    correlationPrefix: `${domain}-corr`,
  });

  if (shouldSkipDuplicateRepositoryWrite(meta.idempotencyKey)) {
    createRepositoryWriteAuditEntry({
      writeSource: meta.writeSource,
      legacyId,
      remoteId: null,
      correlationId: meta.correlationId,
      tenantId,
      retryCount: meta.retryCount,
      syncResult: 'skipped',
      domain,
    });
    return { skipped: true, syncResult: 'skipped', remoteId: null };
  }

  const legacyCore = getLegacyCore?.() ?? null;
  const remote = await executeRemote(meta);
  markRepositoryWriteIdempotent(meta.idempotencyKey);

  if (writeCompare && compareWrite) {
    const comparison = compareWrite(legacyCore, (remote as TRemote) ?? null);
    if (!comparison.match) {
      logRepositoryDev('WRITE_COMPARE', `${domain}:${operation}`, {
        tenantId,
        legacyId,
        diffs: comparison.diffs,
      });
    }
  }

  const remoteId = resolveRemoteId(remote, extractRemoteId);
  const syncResult: RepositoryWriteSyncResult = isWritePrimary
    ? (remote ? 'ok' : 'failed')
    : 'shadow';

  createRepositoryWriteAuditEntry({
    writeSource: meta.writeSource,
    legacyId,
    remoteId,
    correlationId: meta.correlationId,
    tenantId,
    retryCount: meta.retryCount,
    syncResult,
    domain,
    error: !remote && isWritePrimary ? 'remote-empty' : undefined,
  });

  if (isWritePrimary && remote && onPrimarySuccess) {
    onPrimarySuccess(remote as TRemote);
  }

  logRepositoryDev('WRITE_PIPELINE', `${domain}:${operation}`, {
    tenantId,
    legacyId,
    syncResult,
    primary: isWritePrimary,
    remoteDiscarded: !isWritePrimary,
  });

  return { skipped: false, syncResult, remoteId };
}
