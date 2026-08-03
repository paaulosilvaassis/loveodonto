/**
 * Phase 7.3 — Domain Event Observability Foundation.
 * Isolada: sem consumers, sem HTTP, sem alteração de domínios.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDomainEventFlags,
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  isDomainEventObservabilityEnabled,
  DomainEventFlagsValidationError,
} from '../domain-events/domainEventFlags.ts';
import { emitDomainEventAuditHook } from '../domain-events/shared/domainEventAuditHooks.ts';
import { __clearDomainEventAuditHooksForTest } from '../domain-events/shared/domainEventAuditHooks.ts';
import { __clearDomainEventAuditForTest } from '../domain-events/domainEventAudit.ts';
import { buildDomainEvent } from '../domain-events/domainEventMapper.ts';
import {
  recordDomainEventMetricPrepared,
  recordDomainEventMetricPublished,
  recordDomainEventMetricSkipped,
  recordDomainEventMetricRejected,
  recordDomainEventMetricFailure,
  recordDomainEventMetricDuplicate,
  recordDomainEventMetricRetry,
  recordDomainEventMetricNoOp,
  recordDomainEventMetricFromAuditStatus,
  getDomainEventMetrics,
  __clearDomainEventMetricsForTest,
} from '../domain-events/observability/domainEventMetrics.ts';
import {
  recordDomainEventTrace,
  getDomainEventTraces,
  findDomainEventTracesByCorrelation,
  findDomainEventTracesByAggregate,
  findDomainEventTracesByEventType,
  findDomainEventTracesByTenant,
  __clearDomainEventTracesForTest,
} from '../domain-events/observability/domainEventTrace.ts';
import {
  appendDomainEventTimeline,
  getDomainEventTimelineFlat,
  buildDomainEventTimelineTree,
  getDomainEventTimelineByCorrelation,
  __clearDomainEventTimelineForTest,
} from '../domain-events/observability/domainEventTimeline.ts';
import {
  diagnoseDomainEventRegistry,
  diagnoseDomainEventFlags,
  diagnoseDomainEventCandidate,
  diagnoseDomainEventDuplicates,
  runDomainEventDiagnostics,
} from '../domain-events/observability/domainEventDiagnostics.ts';
import { getDomainEventHealth } from '../domain-events/observability/domainEventHealth.ts';
import {
  inspectDomainEvents,
  inspectDomainEventByCorrelation,
  inspectDomainEventByAggregate,
  inspectDomainEventByType,
  inspectDomainEventByTenant,
  inspectDomainEventHealth,
  inspectDomainEventDiagnostics,
} from '../domain-events/observability/domainEventInspector.ts';
import {
  attachDomainEventObservability,
  detachDomainEventObservability,
  isDomainEventObservabilityAttached,
} from '../domain-events/observability/attachDomainEventObservability.ts';
import {
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
  DOMAIN_EVENTS_FLAGS_RESOLVED,
} from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OBS_DIR = path.join(__dirname, '../domain-events/observability');

const FLAGS_OBS = {
  overrides: {
    DOMAIN_EVENTS: true,
    DOMAIN_EVENT_AUDIT: true,
    DOMAIN_EVENT_OBSERVABILITY: true,
  },
};

function clearAll() {
  __clearDomainEventMetricsForTest();
  __clearDomainEventTracesForTest();
  __clearDomainEventTimelineForTest();
  __clearDomainEventAuditForTest();
  __clearDomainEventAuditHooksForTest();
  detachDomainEventObservability();
}

describe('domainEventObservability — estrutura', () => {
  it('pasta observability contém arquivos Phase 7.3', () => {
    const files = readdirSync(OBS_DIR);
    for (const f of [
      'domainEventMetrics.ts',
      'domainEventTrace.ts',
      'domainEventTimeline.ts',
      'domainEventDiagnostics.ts',
      'domainEventHealth.ts',
      'domainEventInspector.ts',
      'attachDomainEventObservability.ts',
      'index.ts',
    ]) {
      expect(files).toContain(f);
    }
  });
});

describe('domainEventObservability — Feature Flags / Production Guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearAll();
  });

  it('contrato vitest mantém OBSERVABILITY OFF', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_OBSERVABILITY).toBe('false');
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_OBSERVABILITY).toBe(false);
    expect(isDomainEventObservabilityEnabled()).toBe(false);
  });

  it('OBSERVABILITY exige DOMAIN_EVENTS', () => {
    expect(() =>
      getDomainEventFlags({
        overrides: { DOMAIN_EVENTS: false, DOMAIN_EVENT_OBSERVABILITY: true },
      }),
    ).toThrow(DomainEventFlagsValidationError);
  });

  it('production locked inclui DOMAIN_EVENT_OBSERVABILITY', () => {
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('DOMAIN_EVENT_OBSERVABILITY');
  });

  it('PROD trava OBSERVABILITY mesmo com overrides', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED });
      expect(flags.DOMAIN_EVENT_OBSERVABILITY).toBe(false);
      expect(isDomainEventObservabilityEnabled({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED })).toBe(
        false,
      );
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('attach é no-op com flags OFF', () => {
    const unsub = attachDomainEventObservability();
    expect(isDomainEventObservabilityAttached()).toBe(false);
    unsub();
  });
});

describe('domainEventObservability — Metrics', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('incrementa todos os contadores', () => {
    recordDomainEventMetricPrepared();
    recordDomainEventMetricPublished();
    recordDomainEventMetricSkipped();
    recordDomainEventMetricRejected();
    recordDomainEventMetricFailure();
    recordDomainEventMetricDuplicate();
    recordDomainEventMetricRetry();
    recordDomainEventMetricNoOp();
    const m = getDomainEventMetrics();
    expect(m.totalPrepared).toBe(1);
    expect(m.totalPublished).toBe(1);
    expect(m.totalSkipped).toBe(1);
    expect(m.totalRejected).toBe(1);
    expect(m.totalFailures).toBe(1);
    expect(m.totalDuplicates).toBe(1);
    expect(m.totalRetries).toBe(1);
    expect(m.totalNoOps).toBe(1);
    expect(m.startedAt).toBeTruthy();
    expect(m.lastEventAt).toBeTruthy();
  });

  it('mapeia audit status → métricas', () => {
    recordDomainEventMetricFromAuditStatus('prepared');
    recordDomainEventMetricFromAuditStatus('published');
    recordDomainEventMetricFromAuditStatus('skipped', 'DOMAIN_EVENTS=false');
    recordDomainEventMetricFromAuditStatus('skipped', 'dedup hit');
    recordDomainEventMetricFromAuditStatus('skipped', 'other');
    recordDomainEventMetricFromAuditStatus('rejected', 'invalid');
    const m = getDomainEventMetrics();
    expect(m.totalPrepared).toBe(1);
    expect(m.totalPublished).toBe(1);
    expect(m.totalNoOps).toBe(1);
    expect(m.totalDuplicates).toBe(1);
    expect(m.totalSkipped).toBe(1);
    expect(m.totalRejected).toBe(1);
    expect(m.totalFailures).toBe(1);
  });

  it('sem persistência — clear zera estado', () => {
    recordDomainEventMetricPublished();
    __clearDomainEventMetricsForTest();
    expect(getDomainEventMetrics().totalPublished).toBe(0);
  });
});

describe('domainEventObservability — Trace', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('registra e consulta por correlation/aggregate/type/tenant', () => {
    recordDomainEventTrace({
      eventId: 'e1',
      eventType: 'LEAD_CREATED',
      aggregateType: 'lead',
      aggregateId: 'lead-1',
      tenantId: 't1',
      correlationId: 'corr-1',
      causationId: null,
      status: 'published',
    });
    recordDomainEventTrace({
      eventId: 'e2',
      eventType: 'LEAD_UPDATED',
      aggregateType: 'lead',
      aggregateId: 'lead-1',
      tenantId: 't1',
      correlationId: 'corr-1',
      causationId: 'e1',
      status: 'published',
    });
    expect(getDomainEventTraces()).toHaveLength(2);
    expect(findDomainEventTracesByCorrelation('corr-1')).toHaveLength(2);
    expect(findDomainEventTracesByAggregate('lead', 'lead-1')).toHaveLength(2);
    expect(findDomainEventTracesByEventType('LEAD_CREATED')).toHaveLength(1);
    expect(findDomainEventTracesByTenant('t1')).toHaveLength(2);
  });
});

describe('domainEventObservability — Timeline', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('monta árvore por causation', () => {
    const root = recordDomainEventTrace({
      eventId: 'root',
      eventType: 'LEAD_CREATED',
      aggregateType: 'lead',
      aggregateId: 'l1',
      tenantId: 't',
      correlationId: 'c1',
      causationId: null,
      status: 'published',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const child = recordDomainEventTrace({
      eventId: 'child',
      eventType: 'LEAD_UPDATED',
      aggregateType: 'lead',
      aggregateId: 'l1',
      tenantId: 't',
      correlationId: 'c1',
      causationId: 'root',
      status: 'published',
      timestamp: '2026-01-01T00:00:01.000Z',
    });
    appendDomainEventTimeline(root);
    appendDomainEventTimeline(child);
    expect(getDomainEventTimelineFlat()).toHaveLength(2);
    expect(getDomainEventTimelineByCorrelation('c1')).toHaveLength(2);
    const tree = buildDomainEventTimelineTree('c1');
    expect(tree).toHaveLength(1);
    expect(tree[0].eventId).toBe('root');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].eventId).toBe('child');
  });
});

describe('domainEventObservability — Diagnostics', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('registry consistente sem erros', () => {
    expect(diagnoseDomainEventRegistry().filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('detecta flags conflitantes via snapshot', () => {
    const issues = diagnoseDomainEventFlags({
      DOMAIN_EVENTS: false,
      DOMAIN_EVENT_AUDIT: true,
      DOMAIN_EVENT_OBSERVABILITY: true,
      DOMAIN_EVENT_CONSUMERS: true,
      DOMAIN_EVENT_CONSUMER_AUDIT: true,
      DOMAIN_EVENT_CONSUMER_RETRY: true,
      DOMAIN_EVENT_PROJECTION: true,
      DOMAIN_EVENT_ANALYTICS: true,
      LEAD_ANALYTICS_READ_MODEL: true,
      CQRS_READ_MODEL: true,
      APPOINTMENT_ANALYTICS_READ_MODEL: true,
      FINANCIAL_ANALYTICS_READ_MODEL: true,
    });
    expect(issues.some((i) => i.code === 'CONFLICTING_FLAGS')).toBe(true);
  });

  it('detecta evento inválido / payload / correlation', () => {
    const issues = diagnoseDomainEventCandidate({
      type: 'NOT_A_REAL_EVENT',
      payload: null,
      correlationId: null,
      causationId: null,
      aggregateId: 'x',
    });
    expect(issues.some((i) => i.code === 'INVALID_EVENT')).toBe(true);
    expect(issues.some((i) => i.code === 'INVALID_PAYLOAD')).toBe(true);
    expect(issues.some((i) => i.code === 'BROKEN_CORRELATION')).toBe(true);
    expect(issues.some((i) => i.code === 'MISSING_CAUSATION')).toBe(true);
  });

  it('detecta duplicate publish em traces', () => {
    const traces = [
      {
        traceId: '1',
        eventId: 'dup',
        eventType: 'LEAD_CREATED',
        aggregateType: 'lead',
        aggregateId: 'a',
        tenantId: 't',
        correlationId: 'c',
        causationId: null,
        status: 'published',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      {
        traceId: '2',
        eventId: 'dup',
        eventType: 'LEAD_CREATED',
        aggregateType: 'lead',
        aggregateId: 'a',
        tenantId: 't',
        correlationId: 'c',
        causationId: null,
        status: 'published',
        timestamp: '2026-01-01T00:00:01.000Z',
      },
    ];
    expect(diagnoseDomainEventDuplicates(traces).some((i) => i.code === 'DUPLICATE_PUBLISH')).toBe(
      true,
    );
  });

  it('runDomainEventDiagnostics agrega ok', () => {
    const report = runDomainEventDiagnostics({
      candidate: { type: 'LEAD_CREATED', payload: { id: '1' }, correlationId: 'c' },
    });
    expect(report.ok).toBe(true);
    expect(report.checkedAt).toBeTruthy();
  });
});

describe('domainEventObservability — Health', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('overall idle com DOMAIN_EVENTS off', () => {
    const health = getDomainEventHealth();
    expect(health.domainEventsEnabled).toBe(false);
    expect(health.overall).toBe('idle');
    expect(health.components.map((c) => c.component)).toEqual([
      'publisher',
      'registry',
      'validator',
      'serializer',
      'bus',
      'audit',
      'retry',
      'deduplication',
    ]);
  });
});

describe('domainEventObservability — Inspector', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('snapshot interno sem HTTP', () => {
    recordDomainEventTrace({
      eventId: 'e1',
      eventType: 'LEAD_CREATED',
      aggregateType: 'lead',
      aggregateId: 'l1',
      tenantId: 't1',
      correlationId: 'corr',
      causationId: null,
      status: 'published',
    });
    appendDomainEventTimeline(getDomainEventTraces()[0]);
    const snap = inspectDomainEvents();
    expect(snap.traces).toHaveLength(1);
    expect(snap.metrics).toBeDefined();
    expect(snap.health).toBeDefined();
    expect(snap.diagnostics).toBeDefined();
    expect(inspectDomainEventByCorrelation('corr').traces).toHaveLength(1);
    expect(inspectDomainEventByAggregate('lead', 'l1')).toHaveLength(1);
    expect(inspectDomainEventByType('LEAD_CREATED')).toHaveLength(1);
    expect(inspectDomainEventByTenant('t1')).toHaveLength(1);
    expect(inspectDomainEventHealth().overall).toBe('idle');
    expect(inspectDomainEventDiagnostics({ type: 'LEAD_CREATED', payload: {} }).ok).toBe(true);
  });
});

describe('domainEventObservability — attach via audit hooks', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('com OBSERVABILITY on, audit alimenta metrics/trace/timeline', () => {
    attachDomainEventObservability(FLAGS_OBS);
    expect(isDomainEventObservabilityAttached()).toBe(true);

    const event = buildDomainEvent({
      eventType: 'LEAD_CREATED',
      tenantId: 'tenant-obs',
      aggregateId: 'lead-obs',
      payload: { id: 'lead-obs' },
      correlationId: 'corr-obs',
      causationId: null,
    });

    emitDomainEventAuditHook({ event, status: 'prepared' });
    emitDomainEventAuditHook({ event, status: 'published' });

    const m = getDomainEventMetrics();
    expect(m.totalPrepared).toBe(1);
    expect(m.totalPublished).toBe(1);
    expect(getDomainEventTraces()).toHaveLength(2);
    expect(getDomainEventTimelineFlat()).toHaveLength(2);
    expect(getDomainEventTraces()[0].correlationId).toBe('corr-obs');
    expect(getDomainEventTraces()[0].causationId).toBeNull();
  });
});
