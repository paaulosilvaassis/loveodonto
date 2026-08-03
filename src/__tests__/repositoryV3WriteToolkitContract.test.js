/**
 * Phase 6.3 — Repository V3 Write Toolkit contract tests.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  __clearRepositoryWriteIdempotencyForTest,
  buildRepositoryCorrelationId,
  buildRepositoryIdempotencyKey,
  markRepositoryWriteIdempotent,
  resolveRepositoryWriteMeta,
  shouldSkipDuplicateRepositoryWrite,
} from '../repositories/shared/repositoryV3Idempotency.ts';
import {
  __clearRepositoryWriteAuditForTest,
  createRepositoryWriteAuditEntry,
  getRepositoryWriteAuditLog,
} from '../repositories/shared/repositoryV3WriteAudit.ts';
import { handleRepositoryWriteFallback } from '../repositories/shared/repositoryV3Fallback.ts';
import { runRepositoryWritePipeline } from '../repositories/shared/repositoryV3WritePipeline.ts';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';

describe('repositoryV3WriteToolkit — idempotency', () => {
  beforeEach(() => {
    __clearRepositoryWriteIdempotencyForTest();
  });

  it('buildRepositoryIdempotencyKey é determinístico', () => {
    const key = buildRepositoryIdempotencyKey('lead', TENANT, 'lead-1', 'create');
    expect(key).toBe(`lead:${TENANT}:lead-1:create`);
  });

  it('resolveRepositoryWriteMeta exige tenant e legacyId', () => {
    const meta = resolveRepositoryWriteMeta('lead', TENANT, 'lead-1', 'create');
    expect(meta.correlationId).toBeTruthy();
    expect(meta.idempotencyKey).toContain('lead-1');
    expect(meta.writeSource).toBe('legacy-dual-write');
  });

  it('shouldSkipDuplicateRepositoryWrite respeita TTL', () => {
    const key = buildRepositoryIdempotencyKey('lead', TENANT, 'lead-1', 'create');
    expect(shouldSkipDuplicateRepositoryWrite(key)).toBe(false);
    markRepositoryWriteIdempotent(key);
    expect(shouldSkipDuplicateRepositoryWrite(key)).toBe(true);
  });

  it('buildRepositoryCorrelationId aceita seed', () => {
    expect(buildRepositoryCorrelationId('seed-123')).toBe('seed-123');
  });
});

describe('repositoryV3WriteToolkit — audit', () => {
  beforeEach(() => {
    __clearRepositoryWriteAuditForTest();
  });

  it('createRepositoryWriteAuditEntry registra entrada in-memory', () => {
    createRepositoryWriteAuditEntry({
      writeSource: 'legacy-dual-write',
      legacyId: 'lead-1',
      remoteId: 'uuid-1',
      correlationId: 'corr-1',
      tenantId: TENANT,
      syncResult: 'shadow',
      domain: 'lead',
    });
    const log = getRepositoryWriteAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].legacyId).toBe('lead-1');
    expect(log[0].syncResult).toBe('shadow');
  });
});

describe('repositoryV3WriteToolkit — fallback', () => {
  beforeEach(() => {
    __clearRepositoryWriteAuditForTest();
  });

  it('handleRepositoryWriteFallback preserva IDB e registra audit', () => {
    const result = handleRepositoryWriteFallback({
      domain: 'lead',
      tenantId: TENANT,
      legacyId: 'lead-1',
      correlationId: 'corr-1',
      writeSource: 'legacy-dual-write',
      event: 'createLead',
      error: new Error('remote failed'),
    });
    expect(result.preservedIndexedDb).toBe(true);
    expect(result.rollbackAvailable).toBe(true);
    expect(getRepositoryWriteAuditLog()[0].syncResult).toBe('failed');
  });
});

describe('repositoryV3WriteToolkit — write pipeline', () => {
  beforeEach(() => {
    __clearRepositoryWriteIdempotencyForTest();
    __clearRepositoryWriteAuditForTest();
  });

  it('runRepositoryWritePipeline dual-write descarta remote (shadow)', async () => {
    let remoteCalled = false;
    const result = await runRepositoryWritePipeline({
      domain: 'lead',
      tenantId: TENANT,
      legacyId: 'lead-1',
      operation: 'create',
      isWritePrimary: false,
      writeCompare: false,
      getLegacyCore: () => ({ legacyId: 'lead-1', tenantId: TENANT }),
      executeRemote: async () => {
        remoteCalled = true;
        return { legacyId: 'lead-1', uuid: 'remote-uuid' };
      },
      extractRemoteId: (remote) => remote?.uuid ?? null,
    });
    expect(remoteCalled).toBe(true);
    expect(result.syncResult).toBe('shadow');
    expect(getRepositoryWriteAuditLog()[0].syncResult).toBe('shadow');
  });

  it('runRepositoryWritePipeline skipped em idempotência', async () => {
    const key = buildRepositoryIdempotencyKey('lead', TENANT, 'lead-dup', 'create');
    markRepositoryWriteIdempotent(key);
    const result = await runRepositoryWritePipeline({
      domain: 'lead',
      tenantId: TENANT,
      legacyId: 'lead-dup',
      operation: 'create',
      partialMeta: { idempotencyKey: key },
      executeRemote: async () => ({ legacyId: 'lead-dup' }),
    });
    expect(result.skipped).toBe(true);
  });
});
