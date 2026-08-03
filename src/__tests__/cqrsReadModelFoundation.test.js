/**
 * Phase 8.0 — CQRS Read Model Foundation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDomainEventFlags,
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  isCqrsReadModelEnabled,
  DomainEventFlagsValidationError,
} from '../domain-events/domainEventFlags.ts';
import {
  DEFAULT_READ_MODEL_CACHE_POLICY,
  DEFAULT_READ_MODEL_SNAPSHOT_POLICY,
  assertReadModelDefinition,
  registerReadModel,
  getRegisteredReadModelCount,
  getReadModelDefinition,
  ReadModelRegistryError,
  setReadModelLifecycleState,
  getReadModelLifecycleState,
  markReadModelStale,
  createEmptyReadModelSnapshot,
  freezeReadModelSnapshot,
  putReadModelCache,
  getReadModelCache,
  invalidateReadModelCache,
  clearReadModelCache,
  buildReadModelSnapshotExplicit,
  getReadModelFoundationMetrics,
  getReadModelFoundationHealth,
  inspectReadModelFoundation,
  __clearReadModelRegistryForTest,
  __clearReadModelLifecycleForTest,
  __clearReadModelCacheForTest,
  __clearReadModelFoundationMetricsForTest,
  __clearReadModelBuilderStateForTest,
} from '../domain-events/read-models/shared/index.ts';
import { inspectDomainEvents } from '../domain-events/observability/domainEventInspector.ts';
import {
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
  DOMAIN_EVENTS_FLAGS_RESOLVED,
} from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };

function clearAll() {
  __clearReadModelRegistryForTest();
  __clearReadModelLifecycleForTest();
  __clearReadModelCacheForTest();
  __clearReadModelFoundationMetricsForTest();
  __clearReadModelBuilderStateForTest();
}

function structuralDefinition(overrides = {}) {
  return {
    readModelId: 'structural-pilot-rm',
    readModelName: 'Structural Pilot',
    version: 1,
    projectionSources: ['crm-counter'],
    builder: ({ previous, projectionSnapshots, tenantId, now }) => freezeReadModelSnapshot({
      readModelId: 'structural-pilot-rm',
      version: (previous?.version || 0) + 1,
      builtAt: now || new Date().toISOString(),
      tenantId: tenantId ?? null,
      sourceProjectionIds: ['crm-counter'],
      sourceVersions: { 'crm-counter': Number(projectionSnapshots?.crm?.version || 0) },
      lifecycleState: 'ready',
      payload: {
        total: Number(projectionSnapshots?.crm?.total || 0),
      },
    }),
    lifecycle: { initialState: 'idle', autoRebuild: false },
    cachePolicy: { ...DEFAULT_READ_MODEL_CACHE_POLICY },
    snapshotPolicy: { ...DEFAULT_READ_MODEL_SNAPSHOT_POLICY },
    flagKey: 'CQRS_READ_MODEL',
    description: 'Structural definition for foundation tests only',
    ...overrides,
  };
}

describe('cqrsReadModelFoundation — flags / guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearAll();
  });

  it('contrato OFF + default false', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_CQRS_READ_MODEL).toBe('false');
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL).toBe(false);
    expect(isCqrsReadModelEnabled()).toBe(false);
  });

  it('CQRS_READ_MODEL exige DOMAIN_EVENTS e DOMAIN_EVENT_ANALYTICS', () => {
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: false, CQRS_READ_MODEL: true },
    })).toThrow(DomainEventFlagsValidationError);
    expect(() => getDomainEventFlags({
      overrides: {
        DOMAIN_EVENTS: true,
        DOMAIN_EVENT_ANALYTICS: false,
        CQRS_READ_MODEL: true,
      },
    })).toThrow(/CQRS_READ_MODEL/);
  });

  it('production locked inclui CQRS_READ_MODEL', () => {
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('CQRS_READ_MODEL');
  });

  it('PROD trava CQRS_READ_MODEL', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      expect(getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED }).CQRS_READ_MODEL)
        .toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });
});

describe('cqrsReadModelFoundation — registry / lifecycle / snapshots / cache', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('registry vazio por padrão e contrato inválido rejeitado', () => {
    expect(getRegisteredReadModelCount()).toBe(0);
    expect(() => assertReadModelDefinition({
      readModelId: '',
      readModelName: '',
      version: 0,
      projectionSources: [],
      builder: null,
      lifecycle: { initialState: 'idle', autoRebuild: true },
      cachePolicy: null,
      snapshotPolicy: null,
      flagKey: '',
      description: '',
    })).toThrow(ReadModelRegistryError);
  });

  it('registro explícito com ID único e sem auto-execução', () => {
    const unreg = registerReadModel(structuralDefinition());
    expect(getRegisteredReadModelCount()).toBe(1);
    expect(getReadModelDefinition('structural-pilot-rm')?.projectionSources).toEqual(['crm-counter']);
    expect(() => registerReadModel(structuralDefinition())).toThrow(/duplicado/);
    unreg();
    expect(getRegisteredReadModelCount()).toBe(0);
  });

  it('lifecycle transitions + stale', () => {
    setReadModelLifecycleState('rm-a', 'building');
    expect(getReadModelLifecycleState('rm-a')).toBe('building');
    setReadModelLifecycleState('rm-a', 'ready');
    markReadModelStale('rm-a');
    expect(getReadModelLifecycleState('rm-a')).toBe('stale');
    expect(getReadModelFoundationMetrics().staleSnapshots).toBeGreaterThanOrEqual(1);
  });

  it('snapshots imutáveis e versionados', () => {
    const empty = createEmptyReadModelSnapshot('rm-s', { n: 0 }, { tenantId: 't1' });
    expect(empty.version).toBe(0);
    expect(Object.isFrozen(empty)).toBe(true);
    expect(() => {
      empty.version = 9;
    }).toThrow();
  });

  it('cache hit/miss/invalidate', () => {
    const snap = createEmptyReadModelSnapshot('rm-c', { x: 1 }, { tenantId: 't1' });
    putReadModelCache('rm-c', snap, { tenantId: 't1', ttlMs: 60_000 });
    expect(getReadModelCache('rm-c', { tenantId: 't1' })?.payload.x).toBe(1);
    expect(getReadModelFoundationMetrics().cacheHits).toBeGreaterThanOrEqual(1);
    expect(getReadModelCache('rm-c', { tenantId: 'missing' })).toBe(null);
    expect(getReadModelFoundationMetrics().cacheMisses).toBeGreaterThanOrEqual(1);
    invalidateReadModelCache('rm-c', { tenantId: 't1' });
    clearReadModelCache();
  });

  it('flags OFF = build no-op', () => {
    registerReadModel(structuralDefinition());
    const result = buildReadModelSnapshotExplicit({
      readModelId: 'structural-pilot-rm',
      projectionSnapshots: { crm: { total: 3, version: 1 } },
    });
    expect(result.skipped).toBe(true);
    expect(result.snapshot).toBe(null);
  });

  it('builder explícito produz snapshot quando flags ON', () => {
    registerReadModel(structuralDefinition());
    const result = buildReadModelSnapshotExplicit({
      readModelId: 'structural-pilot-rm',
      projectionSnapshots: { crm: { total: 7, version: 2 } },
      tenantId: 'tenant-1',
      flagsInput: FLAGS_ON,
      useCache: false,
    });
    expect(result.built).toBe(true);
    expect(result.snapshot?.payload.total).toBe(7);
    expect(result.snapshot?.version).toBe(1);
    expect(getReadModelLifecycleState('structural-pilot-rm', 'tenant-1')).toBe('ready');
    expect(getReadModelFoundationMetrics().totalSnapshots).toBeGreaterThanOrEqual(1);

    const cached = buildReadModelSnapshotExplicit({
      readModelId: 'structural-pilot-rm',
      flagsInput: FLAGS_ON,
      useCache: true,
      tenantId: 'tenant-1',
    });
    expect(cached.fromCache).toBe(true);
  });

  it('health idle / ready / healthy', () => {
    expect(getReadModelFoundationHealth().overall).toBe('idle');
    expect(getReadModelFoundationHealth(FLAGS_ON).overall).toBe('ready');
    registerReadModel(structuralDefinition());
    buildReadModelSnapshotExplicit({
      readModelId: 'structural-pilot-rm',
      projectionSnapshots: { crm: { total: 1, version: 1 } },
      tenantId: 'tenant-1',
      flagsInput: FLAGS_ON,
      useCache: false,
    });
    expect(getReadModelFoundationHealth(FLAGS_ON).overall).toBe('healthy');
  });

  it('inspector expõe foundation', () => {
    registerReadModel(structuralDefinition());
    buildReadModelSnapshotExplicit({
      readModelId: 'structural-pilot-rm',
      projectionSnapshots: { crm: { total: 2, version: 1 } },
      tenantId: 'tenant-1',
      flagsInput: FLAGS_ON,
      useCache: false,
    });
    const snap = inspectReadModelFoundation(FLAGS_ON);
    expect(snap.registryCount).toBe(1);
    expect(snap.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(inspectDomainEvents().cqrsReadModelFoundation.registryCount).toBe(1);
  });

  it('ausência de persistência / Repository / IndexedDB / Supabase / side-effects', () => {
    const dir = path.join(__dirname, '../domain-events/read-models/shared');
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(src).not.toMatch(/from ['"][^'"]*repositories\//);
      expect(src).not.toMatch(/\bindexedDB\b|\bIDBDatabase\b/);
      expect(src).not.toMatch(/@supabase\/|createClient\(|from ['"][^'"]*supabase/i);
      expect(src).not.toMatch(/from ['"].*services\//);
      expect(src).not.toMatch(/from ['"]ioredis['"]|from ['"]redis['"]|require\(['"]redis['"]\)/);
    }
  });

  it('nenhum read model de domínio registrado no boot', () => {
    expect(getRegisteredReadModelCount()).toBe(0);
  });
});
