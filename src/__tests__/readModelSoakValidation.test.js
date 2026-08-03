/**
 * Phase 8.2 — Read Model Soak + Consistency Validation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  getDomainEventFlags,
  isCqrsReadModelSoakEnabled,
  isCqrsReadModelConsistencyEnabled,
  DomainEventFlagsValidationError,
} from '../domain-events/domainEventFlags.ts';
import {
  attachAnalyticsReadModels,
  detachAllAnalyticsReadModels,
  __clearAnalyticsReadModelAttachForTest,
  __clearReadModelRegistryForTest,
  __clearReadModelBuilderStateForTest,
  __clearReadModelLifecycleForTest,
  __clearReadModelFoundationMetricsForTest,
  __clearReadModelCacheForTest,
  __clearLeadAnalyticsStoreForTest,
  __clearLeadAnalyticsMetricsForTest,
  buildReadModelSnapshotExplicit,
  getLastReadModelSnapshot,
  listReadModelSnapshotHistory,
  resetReadModelSnapshots,
  invalidateReadModelCache,
  putReadModelCache,
  getReadModelCache,
  setReadModelCachePolicy,
  clearReadModelCache,
  runReadModelSoakValidation,
  buildReadModelSoakReport,
  compareReadModelSnapshots,
  validateReadModelEnvelopeStructure,
  getReadModelProjectionScope,
  evaluateProjectionScopeForTenantBuild,
  getReadModelSoakMetrics,
  __clearReadModelSoakMetricsForTest,
  __clearReadModelDriftLogForTest,
  inspectReadModelFoundation,
  inspectReadModelById,
  getReadModelFoundationHealth,
  getReadModelHealthById,
  validateLeadAnalyticsCompatibility,
  getLeadAnalyticsSnapshot,
  READ_MODEL_SOAK_MAX_ITERATIONS,
} from '../domain-events/read-models/index.ts';
import { __clearAnalyticsProjectionStoreForTest } from '../domain-events/projections/index.ts';
import {
  DOMAIN_EVENTS_FLAGS_RESOLVED,
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
} from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const TENANT_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
const FLAGS_OFF = { overrides: { ...DOMAIN_EVENTS_FLAGS_RESOLVED, CQRS_READ_MODEL_SOAK: false } };
const NOW = '2026-07-13T20:00:00.000Z';

const CRM_PROJ = {
  crm: {
    counters: { leadsCreated: 3, leadsUpdated: 1, leadsMoved: 2 },
    version: 5,
    updatedAt: NOW,
  },
};

function clearAll() {
  detachAllAnalyticsReadModels();
  __clearAnalyticsReadModelAttachForTest();
  __clearReadModelRegistryForTest();
  __clearReadModelBuilderStateForTest();
  __clearReadModelLifecycleForTest();
  __clearReadModelFoundationMetricsForTest();
  __clearReadModelCacheForTest();
  __clearLeadAnalyticsStoreForTest();
  __clearLeadAnalyticsMetricsForTest();
  __clearAnalyticsProjectionStoreForTest();
  __clearReadModelSoakMetricsForTest();
  __clearReadModelDriftLogForTest();
}

describe('readModelSoakValidation — flags', () => {
  it('defaults OFF e production locked', () => {
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL_SOAK).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL_CONSISTENCY).toBe(false);
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_CQRS_READ_MODEL_SOAK).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_CQRS_READ_MODEL_CONSISTENCY).toBe('false');
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('CQRS_READ_MODEL_SOAK');
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('CQRS_READ_MODEL_CONSISTENCY');
    expect(isCqrsReadModelSoakEnabled()).toBe(false);
    expect(isCqrsReadModelConsistencyEnabled()).toBe(false);
  });

  it('SOAK exige CQRS_READ_MODEL + ANALYTICS', () => {
    expect(() => getDomainEventFlags({
      overrides: {
        DOMAIN_EVENTS: true,
        DOMAIN_EVENT_CONSUMERS: true,
        DOMAIN_EVENT_ANALYTICS: true,
        CQRS_READ_MODEL: false,
        CQRS_READ_MODEL_SOAK: true,
      },
    })).toThrow(/CQRS_READ_MODEL_SOAK/);
    expect(() => getDomainEventFlags({
      overrides: {
        DOMAIN_EVENTS: true,
        DOMAIN_EVENT_CONSUMERS: true,
        DOMAIN_EVENT_ANALYTICS: true,
        CQRS_READ_MODEL: true,
        CQRS_READ_MODEL_SOAK: true,
      },
    })).not.toThrow();
  });

  it('PROD trava SOAK', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      expect(getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED }).CQRS_READ_MODEL_SOAK)
        .toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });
});

describe('readModelSoakValidation — projection scope', () => {
  it('três counters são tenant-scoped (Phase 8.3)', () => {
    expect(getReadModelProjectionScope('lead-analytics').scope).toBe('tenant');
    expect(getReadModelProjectionScope('appointment-analytics').scope).toBe('tenant');
    expect(getReadModelProjectionScope('financial-analytics').scope).toBe('tenant');
  });

  it('scope tenant permite build sem allowGlobalTestScope', () => {
    const r = evaluateProjectionScopeForTenantBuild({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
    });
    expect(r.allowed).toBe(true);
    expect(r.mode).toBe('tenant');
    expect(r.warning).toBeNull();
  });
});

describe('readModelSoakValidation — soak runner', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('flags OFF → idle no-op', () => {
    const run = runReadModelSoakValidation({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_OFF,
    });
    expect(run.status).toBe('idle');
    expect(run.iterations).toBe(0);
    expect(run.promotionBlocked).toBe(true);
  });

  it('runner explícito com iterações e métricas — passing', () => {
    const run = runReadModelSoakValidation({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      iterations: 3,
      flagsInput: FLAGS_ON,
      now: NOW,
    });
    expect(run.iterations).toBe(3);
    expect(run.results.every((r) => r.buildSucceeded)).toBe(true);
    expect(run.promotionBlocked).toBe(true);
    expect(run.status).toBe('passing');
    expect(run.scopeWarnings).toHaveLength(0);
    const m = getReadModelSoakMetrics('lead-analytics', TENANT_A);
    expect(m.totalBuildAttempts).toBe(3);
    expect(m.totalBuildSucceeded).toBe(3);
  });

  it('limite de iterações', () => {
    const run = runReadModelSoakValidation({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      iterations: 999,
      flagsInput: FLAGS_ON,
      now: NOW,
    });
    expect(run.iterations).toBe(READ_MODEL_SOAK_MAX_ITERATIONS);
  });

  it('relatório hold quando passing limpo', () => {
    runReadModelSoakValidation({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      now: NOW,
    });
    const report = buildReadModelSoakReport(FLAGS_ON);
    expect(['hold', 'block']).toContain(report.promotionRecommendation);
    expect(report.overall).toBe('passing');
  });
});

describe('readModelSoakValidation — consistency + drift', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('snapshot consistente', () => {
    const built = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    const result = compareReadModelSnapshots({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      expected: built.snapshot,
      actual: getLastReadModelSnapshot('lead-analytics', TENANT_A),
      sourceProjection: 'crm-counter',
    });
    expect(result.consistent).toBe(true);
    expect(['none', 'metadata-only']).toContain(result.driftKind);
    expect(result.scopeWarning).toBeNull();
    expect(result.projectionScope).toBe('tenant');
  });

  it('counter drift', () => {
    const built = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    const actual = {
      ...built.snapshot,
      payload: {
        ...built.snapshot.payload,
        indicators: {
          ...built.snapshot.payload.indicators,
          totalLeads: 999,
        },
      },
    };
    const result = compareReadModelSnapshots({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      expected: built.snapshot,
      actual,
      sourceProjection: 'crm-counter',
    });
    expect(result.consistent).toBe(false);
    expect(result.driftKind).toBe('counter-drift');
  });

  it('version drift + missing + stale + invalid', () => {
    const built = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    expect(compareReadModelSnapshots({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      expected: built.snapshot,
      actual: { ...built.snapshot, version: 999 },
    }).driftKind).toBe('version-drift');

    expect(compareReadModelSnapshots({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      expected: built.snapshot,
      actual: null,
    }).driftKind).toBe('missing-snapshot');

    expect(compareReadModelSnapshots({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      expected: built.snapshot,
      actual: built.snapshot,
      treatAsStale: true,
    }).driftKind).toBe('stale-snapshot');

    expect(compareReadModelSnapshots({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      expected: null,
      actual: built.snapshot,
    }).driftKind).toBe('invalid-snapshot');
  });

  it('metadata-only não quebra consistência', () => {
    const built = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    const result = compareReadModelSnapshots({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      expected: built.snapshot,
      actual: { ...built.snapshot, builtAt: '2099-01-01T00:00:00.000Z' },
    });
    expect(result.consistent).toBe(true);
    expect(result.driftKind).toBe('metadata-only');
  });

  it('envelope structure', () => {
    const built = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    expect(validateReadModelEnvelopeStructure(built.snapshot).valid).toBe(true);
    expect(validateReadModelEnvelopeStructure(null).valid).toBe(false);
  });
});

describe('readModelSoakValidation — tenant isolation', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('Lead/Appointment/Financial tenants A vs B', () => {
    for (const [id, proj] of [
      ['lead-analytics', CRM_PROJ],
      ['appointment-analytics', {
        appointment: {
          counters: {
            appointmentsCreated: 1,
            appointmentsCancelled: 0,
            appointmentsRescheduled: 0,
            appointmentsConfirmed: 0,
            appointmentsStatusChanged: 0,
            appointmentsUpdated: 0,
          },
          version: 1,
          updatedAt: NOW,
        },
      }],
      ['financial-analytics', {
        financial: {
          counters: {
            receivablesCreated: 1,
            receivablesUpdated: 0,
            payablesCreated: 0,
            payablesUpdated: 0,
            payablesDeleted: 0,
            financingsCreated: 0,
            financingsUpdated: 0,
            paymentsReceived: 0,
          },
          version: 1,
          updatedAt: NOW,
        },
      }],
    ]) {
      buildReadModelSnapshotExplicit({
        readModelId: id,
        tenantId: TENANT_A,
        projectionSnapshots: proj,
        flagsInput: FLAGS_ON,
        useCache: false,
        now: NOW,
      });
      buildReadModelSnapshotExplicit({
        readModelId: id,
        tenantId: TENANT_B,
        projectionSnapshots: {
          ...proj,
          [Object.keys(proj)[0]]: {
            ...Object.values(proj)[0],
            version: 99,
            counters: Object.fromEntries(
              Object.entries(Object.values(proj)[0].counters).map(([k, v]) => [k, Number(v) + 10]),
            ),
          },
        },
        flagsInput: FLAGS_ON,
        useCache: false,
        now: NOW,
      });
      const a = getLastReadModelSnapshot(id, TENANT_A);
      const b = getLastReadModelSnapshot(id, TENANT_B);
      expect(a.tenantId).toBe(TENANT_A);
      expect(b.tenantId).toBe(TENANT_B);
      expect(JSON.stringify(a.payload)).not.toBe(JSON.stringify(b.payload));
      expect(listReadModelSnapshotHistory({ readModelId: id, tenantId: TENANT_A })
        .every((s) => s.tenantId === TENANT_A)).toBe(true);
    }
  });

  it('cache isolation + invalidate isolation', () => {
    const a = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    putReadModelCache('lead-analytics', a.snapshot, { tenantId: TENANT_A });
    expect(getReadModelCache('lead-analytics', { tenantId: TENANT_A })).toBeTruthy();
    expect(getReadModelCache('lead-analytics', { tenantId: TENANT_B })).toBeNull();
    invalidateReadModelCache('lead-analytics', { tenantId: TENANT_A });
    expect(getReadModelCache('lead-analytics', { tenantId: TENANT_A })).toBeNull();

    const b = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_B,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    putReadModelCache('lead-analytics', b.snapshot, { tenantId: TENANT_B });
    invalidateReadModelCache('lead-analytics', { tenantId: TENANT_A });
    expect(getReadModelCache('lead-analytics', { tenantId: TENANT_B })).toBeTruthy();
  });

  it('rebuild A não altera B', () => {
    buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_B,
      projectionSnapshots: {
        crm: { counters: { leadsCreated: 9, leadsUpdated: 0, leadsMoved: 0 }, version: 9, updatedAt: NOW },
      },
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    const beforeB = getLastReadModelSnapshot('lead-analytics', TENANT_B);
    buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: {
        crm: { counters: { leadsCreated: 1, leadsUpdated: 0, leadsMoved: 0 }, version: 2, updatedAt: NOW },
      },
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    expect(getLastReadModelSnapshot('lead-analytics', TENANT_B).version).toBe(beforeB.version);
    expect(getLastReadModelSnapshot('lead-analytics', TENANT_B).payload.indicators.totalLeads)
      .toBe(beforeB.payload.indicators.totalLeads);
  });

  it('Inspector exige tenant para dados de negócio', () => {
    buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    const denied = inspectReadModelById('lead-analytics', { requireTenant: true });
    expect(denied.lastSnapshot).toBeNull();
    expect(denied.tenantIsolationWarning).toMatch(/tenantId/);
    const ok = inspectReadModelById('lead-analytics', { tenantId: TENANT_A, requireTenant: true });
    expect(ok.lastSnapshot?.tenantId).toBe(TENANT_A);
  });

  it('projection tenant-scoped soak sem scope warnings', () => {
    const run = runReadModelSoakValidation({
      readModelId: 'appointment-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: {
        appointment: {
          counters: {
            appointmentsCreated: 1,
            appointmentsCancelled: 0,
            appointmentsRescheduled: 0,
            appointmentsConfirmed: 0,
            appointmentsStatusChanged: 0,
            appointmentsUpdated: 0,
          },
          version: 1,
          updatedAt: NOW,
        },
      },
      flagsInput: FLAGS_ON,
      now: NOW,
    });
    expect(run.scopeWarnings).toHaveLength(0);
    expect(run.status).toBe('passing');
    expect(run.promotionBlocked).toBe(true);
  });
});

describe('readModelSoakValidation — lifecycle + cache', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('falha de rebuild preserva último snapshot válido', () => {
    const ok = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    expect(ok.built).toBe(true);
    const version = ok.snapshot.version;
    const fail = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: {},
      flagsInput: {
        overrides: {
          DOMAIN_EVENTS: false,
          DOMAIN_EVENT_CONSUMERS: false,
          DOMAIN_EVENT_ANALYTICS: false,
          CQRS_READ_MODEL: false,
          LEAD_ANALYTICS_READ_MODEL: false,
          APPOINTMENT_ANALYTICS_READ_MODEL: false,
          FINANCIAL_ANALYTICS_READ_MODEL: false,
          CQRS_READ_MODEL_SOAK: false,
          CQRS_READ_MODEL_CONSISTENCY: false,
        },
      },
      useCache: false,
      now: NOW,
    });
    expect(fail.built).toBe(false);
    expect(getLastReadModelSnapshot('lead-analytics', TENANT_A).version).toBe(version);
  });

  it('modelos independentes', () => {
    buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    resetReadModelSnapshots({ readModelId: 'appointment-analytics' });
    expect(getLastReadModelSnapshot('lead-analytics', TENANT_A)).toBeTruthy();
  });

  it('cache hit/miss/TTL/clear', () => {
    setReadModelCachePolicy({ ttlMs: 60_000 });
    const built = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    putReadModelCache('lead-analytics', built.snapshot, { tenantId: TENANT_A, ttlMs: 1000 });
    expect(getReadModelCache('lead-analytics', { tenantId: TENANT_A })).toBeTruthy();
    expect(getReadModelCache('lead-analytics', {
      tenantId: TENANT_A,
      nowMs: Date.now() + 5000,
    })).toBeNull();
    putReadModelCache('lead-analytics', built.snapshot, { tenantId: TENANT_A });
    clearReadModelCache();
    expect(getReadModelCache('lead-analytics', { tenantId: TENANT_A })).toBeNull();
  });
});

describe('readModelSoakValidation — lead compatibility + health + inspector', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('facade + shared store sem duplicidade', () => {
    buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    const legacy = getLeadAnalyticsSnapshot(TENANT_A);
    const shared = getLastReadModelSnapshot('lead-analytics', TENANT_A);
    expect(legacy.version).toBe(shared.version);
    expect(legacy.indicators.totalConverted).toBe(2);
    expect(legacy.indicators.totalLost).toBe(0);
    const compat = validateLeadAnalyticsCompatibility({ tenantId: TENANT_A, flagsInput: FLAGS_ON });
    expect(compat.singleSourceOfTruth).toBe(true);
    expect(compat.noDuplicateStore).toBe(true);
    expect(compat.indicatorsDocumented.leadsMovedAsConversionProxy).toBe(true);
  });

  it('health healthy para analytics tenant-scoped', () => {
    buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
    });
    expect(getReadModelHealthById('lead-analytics', FLAGS_ON, TENANT_A).status).toBe('healthy');
    const health = getReadModelFoundationHealth(FLAGS_ON);
    expect(['healthy', 'ready', 'warning']).toContain(health.overall);
  });

  it('inspector expõe soak/drift/scope tenant', () => {
    runReadModelSoakValidation({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      now: NOW,
    });
    const snap = inspectReadModelFoundation(FLAGS_ON);
    expect(['hold', 'block']).toContain(snap.soakReport.promotionRecommendation);
    expect(snap.projectionScopes.every((p) => p.scope === 'tenant')).toBe(true);
    expect(snap.soakMetrics).toBeTruthy();
  });
});

describe('readModelSoakValidation — safety', () => {
  it('sem Repository / IndexedDB / Supabase / HTTP / UI / persistência', () => {
    const sharedDir = path.join(__dirname, '../domain-events/read-models/shared');
    const files = fs.readdirSync(sharedDir).filter((f) =>
      /Soak|Consistency|Drift|ProjectionScope/.test(f));
    const blob = files.map((f) => fs.readFileSync(path.join(sharedDir, f), 'utf8')).join('\n');
    expect(blob).not.toMatch(/indexedDB|localStorage|createClient|from\(['"]@supabase|express\.|ioredis|createServer/i);
    expect(blob).not.toMatch(/\bsetInterval\s*\(|\bsetTimeout\s*\(/);
  });

  it('nenhum auto-bootstrap no index', () => {
    const index = fs.readFileSync(
      path.join(__dirname, '../domain-events/read-models/shared/index.ts'),
      'utf8',
    );
    expect(index).not.toMatch(/runReadModelSoakValidation\(/);
    expect(index).not.toMatch(/attachAnalyticsReadModels\(/);
  });
});
