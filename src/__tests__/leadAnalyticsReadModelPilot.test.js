/**
 * Phase 7.9 — Analytics Read Model Pilot (Lead Analytics).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDomainEventFlags,
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  isLeadAnalyticsReadModelEnabled,
  DomainEventFlagsValidationError,
} from '../domain-events/domainEventFlags.ts';
import {
  applyAnalyticsProjectionFromEvent,
  __clearAnalyticsProjectionStoreForTest,
  __clearAnalyticsProjectionMetricsForTest,
} from '../domain-events/projections/index.ts';
import {
  buildLeadAnalyticsSnapshot,
  createEmptyLeadAnalyticsSnapshot,
  getLeadAnalyticsHealth,
  getLeadAnalyticsHistoryCount,
  getLeadAnalyticsIndicators,
  getLeadAnalyticsMetrics,
  getLeadAnalyticsReadModel,
  inspectLeadAnalyticsReadModel,
  refreshLeadAnalyticsReadModel,
  setLeadAnalyticsCap,
  resetLeadAnalyticsStore,
  __clearLeadAnalyticsStoreForTest,
  __clearLeadAnalyticsMetricsForTest,
  __clearAnalyticsReadModelAttachForTest,
  __clearReadModelRegistryForTest,
  __clearReadModelBuilderStateForTest,
  __clearReadModelLifecycleForTest,
  __clearReadModelFoundationMetricsForTest,
  __clearReadModelCacheForTest,
} from '../domain-events/read-models/index.ts';
import {
  inspectDomainEvents,
  inspectDomainEventLeadAnalyticsReadModel,
} from '../domain-events/observability/domainEventInspector.ts';
import {
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
  DOMAIN_EVENTS_FLAGS_RESOLVED,
} from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
const NOW = '2026-07-13T18:00:00.000Z';

function clearAll() {
  __clearAnalyticsReadModelAttachForTest();
  __clearReadModelRegistryForTest();
  __clearReadModelBuilderStateForTest();
  __clearReadModelLifecycleForTest();
  __clearReadModelFoundationMetricsForTest();
  __clearReadModelCacheForTest();
  __clearLeadAnalyticsStoreForTest();
  __clearLeadAnalyticsMetricsForTest();
  __clearAnalyticsProjectionStoreForTest();
  __clearAnalyticsProjectionMetricsForTest();
}

function projectLead(eventType, eventId) {
  return applyAnalyticsProjectionFromEvent({
    eventId,
    eventType,
    tenantId: TENANT,
    timestamp: NOW,
  }, FLAGS_ON);
}

describe('leadAnalyticsReadModel — flags / guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearAll();
  });

  it('contrato OFF + default false', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_LEAD_ANALYTICS_READ_MODEL).toBe('false');
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.LEAD_ANALYTICS_READ_MODEL).toBe(false);
    expect(isLeadAnalyticsReadModelEnabled()).toBe(false);
  });

  it('LEAD_ANALYTICS_READ_MODEL exige DOMAIN_EVENTS, ANALYTICS e CQRS', () => {
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: false, LEAD_ANALYTICS_READ_MODEL: true },
    })).toThrow(DomainEventFlagsValidationError);
    expect(() => getDomainEventFlags({
      overrides: {
        DOMAIN_EVENTS: true,
        DOMAIN_EVENT_ANALYTICS: false,
        LEAD_ANALYTICS_READ_MODEL: true,
      },
    })).toThrow(/LEAD_ANALYTICS_READ_MODEL/);
    expect(() => getDomainEventFlags({
      overrides: {
        DOMAIN_EVENTS: true,
        DOMAIN_EVENT_CONSUMERS: true,
        DOMAIN_EVENT_ANALYTICS: true,
        CQRS_READ_MODEL: false,
        LEAD_ANALYTICS_READ_MODEL: true,
      },
    })).toThrow(/CQRS_READ_MODEL/);
  });

  it('production locked inclui LEAD_ANALYTICS_READ_MODEL', () => {
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('LEAD_ANALYTICS_READ_MODEL');
  });

  it('PROD trava LEAD_ANALYTICS_READ_MODEL', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      expect(
        getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED }).LEAD_ANALYTICS_READ_MODEL,
      ).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });
});

describe('leadAnalyticsReadModel — pilot', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('builder monta indicadores a partir de counters de projection', () => {
    const snap = buildLeadAnalyticsSnapshot({
      sourceCounters: { leadsCreated: 5, leadsUpdated: 2, leadsMoved: 1 },
      sourceProjectionVersion: 3,
      sourceUpdatedAt: NOW,
      tenantId: TENANT,
      previous: null,
      previousSource: null,
      now: NOW,
    });
    expect(snap.indicators.totalLeads).toBe(5);
    expect(snap.indicators.totalConverted).toBe(1);
    expect(snap.indicators.totalLost).toBe(0);
    expect(snap.indicators.totalInProgress).toBe(4);
    expect(snap.indicators.totalCreatedToday).toBe(5);
    expect(snap.indicators.totalUpdatedToday).toBe(2);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.indicators)).toBe(true);
  });

  it('flags OFF = no-op', () => {
    projectLead('LEAD_CREATED', 'de-rm-off-1');
    const result = refreshLeadAnalyticsReadModel();
    expect(result.skipped).toBe(true);
    expect(getLeadAnalyticsReadModel().version).toBe(0);
    expect(getLeadAnalyticsMetrics().snapshotSkips).toBeGreaterThanOrEqual(1);
  });

  it('refresh consome crm-counter (não Domain Event direto)', () => {
    projectLead('LEAD_CREATED', 'de-rm-1');
    projectLead('LEAD_CREATED', 'de-rm-2');
    projectLead('LEAD_MOVED', 'de-rm-3');
    projectLead('LEAD_UPDATED', 'de-rm-4');

    const result = refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT });
    expect(result.built).toBe(true);
    expect(result.snapshot?.indicators.totalLeads).toBe(2);
    expect(result.snapshot?.indicators.totalConverted).toBe(1);
    expect(result.snapshot?.indicators.totalInProgress).toBe(1);
    expect(result.snapshot?.indicators.totalCreatedToday).toBe(2);
    expect(result.snapshot?.indicators.totalUpdatedToday).toBe(1);
    expect(getLeadAnalyticsIndicators(TENANT).totalLeads).toBe(2);
  });

  it('snapshots imutáveis + history cap', () => {
    projectLead('LEAD_CREATED', 'de-rm-cap-1');
    setLeadAnalyticsCap(2);
    const a = refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT });
    projectLead('LEAD_UPDATED', 'de-rm-cap-2');
    refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT });
    projectLead('LEAD_UPDATED', 'de-rm-cap-3');
    refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT });
    expect(getLeadAnalyticsHistoryCount(TENANT)).toBe(2);
    expect(Object.isFrozen(a.snapshot)).toBe(true);
    expect(() => {
      a.snapshot.version = 99;
    }).toThrow();
  });

  it('metrics e reset', () => {
    projectLead('LEAD_CREATED', 'de-rm-m1');
    refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT });
    expect(getLeadAnalyticsMetrics().snapshotBuilds).toBeGreaterThanOrEqual(1);
    expect(getLeadAnalyticsMetrics().snapshotUpdates).toBeGreaterThanOrEqual(1);
    resetLeadAnalyticsStore();
    expect(getLeadAnalyticsMetrics().snapshotResets).toBeGreaterThanOrEqual(1);
    expect(getLeadAnalyticsReadModel(TENANT).version).toBe(0);
  });

  it('health idle / ready / healthy', () => {
    expect(getLeadAnalyticsHealth().overall).toBe('idle');
    expect(getLeadAnalyticsHealth(FLAGS_ON).overall).toBe('ready');
    projectLead('LEAD_CREATED', 'de-rm-h1');
    refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT });
    expect(getLeadAnalyticsHealth(FLAGS_ON).overall).toBe('healthy');
  });

  it('inspector expõe read model', () => {
    projectLead('LEAD_CREATED', 'de-rm-i1');
    refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT });
    const local = inspectLeadAnalyticsReadModel(FLAGS_ON, { tenantId: TENANT });
    expect(local.current.indicators.totalLeads).toBe(1);
    expect(local.health.overall).toBe('healthy');
    expect(inspectDomainEvents().leadAnalyticsReadModel.current.indicators.totalLeads).toBe(1);
    expect(
      inspectDomainEventLeadAnalyticsReadModel(FLAGS_ON).metrics.snapshotBuilds,
    ).toBeGreaterThanOrEqual(1);
  });

  it('empty snapshot estrutural', () => {
    const empty = createEmptyLeadAnalyticsSnapshot(NOW);
    expect(empty.indicators.totalLeads).toBe(0);
    expect(empty.readModelId).toBe('lead-analytics');
  });

  it('ausência de Repository / IndexedDB / Supabase / side-effects', () => {
    const files = [
      'leadAnalyticsReadModel.ts',
      'leadAnalyticsBuilder.ts',
      'leadAnalyticsDefinition.ts',
    ];
    for (const file of files) {
      const src = fs.readFileSync(
        path.join(__dirname, '../domain-events/read-models', file),
        'utf8',
      );
      expect(src).not.toMatch(/from ['"][^'"]*repositories\//);
      expect(src).not.toMatch(/\bindexedDB\b|\bIDBDatabase\b/);
      expect(src).not.toMatch(/@supabase\/|createClient\(|from ['"][^'"]*supabase/i);
      expect(src).not.toMatch(/from ['"].*services\//);
      expect(src).not.toMatch(/crmService|appointmentService|receivablesService/);
      expect(src).not.toMatch(/publishViaDomainEventFacade|publishDomainEvent/);
    }

    for (const file of [
      'crmService.js',
      'appointmentService.js',
      'receivablesService.js',
    ]) {
      const src = fs.readFileSync(path.join(__dirname, '../services', file), 'utf8');
      expect(src).not.toMatch(/leadAnalytics|LEAD_ANALYTICS_READ_MODEL|refreshLeadAnalytics/);
    }

    const projDir = path.join(__dirname, '../domain-events/projections');
    for (const file of fs.readdirSync(projDir)) {
      if (!file.endsWith('.ts')) continue;
      const src = fs.readFileSync(path.join(projDir, file), 'utf8');
      expect(src).not.toMatch(/read-models|leadAnalytics|LEAD_ANALYTICS/);
    }
  });
});