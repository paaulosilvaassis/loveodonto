/**
 * Phase 7.8 / 8.3 — Analytics Projection Foundation (tenant-scoped).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDomainEventFlags,
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  isDomainEventAnalyticsEnabled,
  DomainEventFlagsValidationError,
} from '../domain-events/domainEventFlags.ts';
import {
  ANALYTICS_PROJECTION_REGISTRY,
  applyAnalyticsProjectionFromEvent,
  applyAnalyticsProjectionEvent,
  getAnalyticsProjection,
  getAnalyticsProjectionHealth,
  getAnalyticsProjectionHistoryCount,
  getAnalyticsProjectionMetrics,
  listAnalyticsProjectionsForTenant,
  hasAnalyticsProjectionForEvent,
  inspectAnalyticsProjections,
  inspectAnalyticsProjectionById,
  listAnalyticsProjectionRegistry,
  listAnalyticsProjectionDefinitions,
  rebuildAnalyticsProjectionsIfEnabled,
  reduceAppointmentCounter,
  reduceCrmCounter,
  reduceFinancialCounter,
  createEmptyAnalyticsProjection,
  setAnalyticsProjectionCap,
  resetAnalyticsProjections,
  buildAnalyticsProjectionScopeKey,
  parseAnalyticsProjectionScopeKey,
  __clearAnalyticsProjectionStoreForTest,
  __clearAnalyticsProjectionMetricsForTest,
  __clearAnalyticsProjectionDiagnosticsForTest,
} from '../domain-events/projections/index.ts';
import {
  inspectDomainEvents,
  inspectDomainEventAnalyticsProjections,
} from '../domain-events/observability/domainEventInspector.ts';
import {
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
  DOMAIN_EVENTS_FLAGS_RESOLVED,
} from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const TENANT_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };

function clearAll() {
  __clearAnalyticsProjectionStoreForTest();
  __clearAnalyticsProjectionMetricsForTest();
  __clearAnalyticsProjectionDiagnosticsForTest();
}

function sampleEvent(overrides = {}) {
  return {
    eventId: 'de-analytics-1',
    eventType: 'LEAD_CREATED',
    tenantId: TENANT,
    timestamp: '2026-07-13T18:00:00.000Z',
    ...overrides,
  };
}

describe('analyticsProjection — flags / guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearAll();
  });

  it('contrato OFF + default false', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_ANALYTICS).toBe('false');
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_ANALYTICS).toBe(false);
    expect(isDomainEventAnalyticsEnabled()).toBe(false);
  });

  it('ANALYTICS exige DOMAIN_EVENTS e DOMAIN_EVENT_CONSUMERS', () => {
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: false, DOMAIN_EVENT_ANALYTICS: true },
    })).toThrow(DomainEventFlagsValidationError);
    expect(() => getDomainEventFlags({
      overrides: {
        DOMAIN_EVENTS: true,
        DOMAIN_EVENT_CONSUMERS: false,
        DOMAIN_EVENT_ANALYTICS: true,
      },
    })).toThrow(/ANALYTICS/);
  });

  it('production locked inclui ANALYTICS', () => {
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('DOMAIN_EVENT_ANALYTICS');
  });

  it('PROD trava ANALYTICS', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      expect(getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED }).DOMAIN_EVENT_ANALYTICS)
        .toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });
});

describe('analyticsProjection — registry / reducers / store', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('registry mapeia evento → projection tenant-scoped', () => {
    expect(listAnalyticsProjectionRegistry().length).toBeGreaterThan(0);
    expect(hasAnalyticsProjectionForEvent('LEAD_CREATED')).toBe(true);
    expect(ANALYTICS_PROJECTION_REGISTRY.every(
      (e) => e.scope === 'tenant' && e.tenantRequired === true,
    )).toBe(true);
    expect(listAnalyticsProjectionDefinitions().every((d) => d.scope === 'tenant')).toBe(true);
  });

  it('scope key helpers', () => {
    const key = buildAnalyticsProjectionScopeKey('crm-counter', TENANT);
    expect(key).toBe(`crm-counter::${TENANT}`);
    expect(parseAnalyticsProjectionScopeKey(key)).toEqual({
      projectionId: 'crm-counter',
      tenantId: TENANT,
    });
    expect(() => buildAnalyticsProjectionScopeKey('crm-counter', '')).toThrow(
      /inválido|INVALID|MISSING|tenantId/i,
    );
  });

  it('reducers incrementam counters sem mutar input', () => {
    const base = createEmptyAnalyticsProjection('crm-counter', TENANT);
    const event = sampleEvent();
    const next = reduceCrmCounter(base, event);
    expect(base.version).toBe(0);
    expect(base.counters.leadsCreated).toBe(0);
    expect(next.version).toBe(1);
    expect(next.tenantId).toBe(TENANT);
    expect(next.scope).toBe('tenant');
    expect(next.counters.leadsCreated).toBe(1);
    expect(Object.isFrozen(next)).toBe(true);

    const appt = reduceAppointmentCounter(
      createEmptyAnalyticsProjection('appointment-counter', TENANT),
      sampleEvent({ eventType: 'APPOINTMENT_CREATED', eventId: 'de-a1' }),
    );
    expect(appt.counters.appointmentsCreated).toBe(1);

    const fin = reduceFinancialCounter(
      createEmptyAnalyticsProjection('financial-counter', TENANT),
      sampleEvent({ eventType: 'RECEIVABLE_CREATED', eventId: 'de-r1' }),
    );
    expect(fin.counters.receivablesCreated).toBe(1);
  });

  it('flags OFF = no-op skip', () => {
    const result = applyAnalyticsProjectionFromEvent(sampleEvent());
    expect(result.skipped).toBe(true);
    expect(result.applied).toBe(false);
    expect(getAnalyticsProjectionMetrics().projectionSkips).toBeGreaterThanOrEqual(1);
    expect(getAnalyticsProjection('crm-counter', TENANT)).toBeNull();
  });

  it('builder aplica LEAD / APPOINTMENT / RECEIVABLE por tenant', () => {
    applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-l1' }), FLAGS_ON);
    applyAnalyticsProjectionFromEvent(
      sampleEvent({ eventId: 'de-a1', eventType: 'APPOINTMENT_CREATED' }),
      FLAGS_ON,
    );
    applyAnalyticsProjectionFromEvent(
      sampleEvent({ eventId: 'de-r1', eventType: 'RECEIVABLE_CREATED' }),
      FLAGS_ON,
    );

    expect(getAnalyticsProjection('crm-counter', TENANT)?.counters.leadsCreated).toBe(1);
    expect(getAnalyticsProjection('appointment-counter', TENANT)?.counters.appointmentsCreated).toBe(1);
    expect(getAnalyticsProjection('financial-counter', TENANT)?.counters.receivablesCreated).toBe(1);
    expect(getAnalyticsProjectionMetrics().projectionUpdates).toBe(3);
  });

  it('tenant A isolado de tenant B', () => {
    applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-a' }), FLAGS_ON);
    applyAnalyticsProjectionFromEvent(
      sampleEvent({ eventId: 'de-b', tenantId: TENANT_B }),
      FLAGS_ON,
    );
    applyAnalyticsProjectionFromEvent(
      sampleEvent({ eventId: 'de-b2', tenantId: TENANT_B, eventType: 'LEAD_UPDATED' }),
      FLAGS_ON,
    );
    expect(getAnalyticsProjection('crm-counter', TENANT)?.counters.leadsCreated).toBe(1);
    expect(getAnalyticsProjection('crm-counter', TENANT_B)?.counters.leadsCreated).toBe(1);
    expect(getAnalyticsProjection('crm-counter', TENANT_B)?.counters.leadsUpdated).toBe(1);
    expect(getAnalyticsProjection('crm-counter', TENANT)?.counters.leadsUpdated).toBe(0);
    expect(getAnalyticsProjection('crm-counter')).toBeNull();
  });

  it('evento sem tenant rejeitado', () => {
    const result = applyAnalyticsProjectionFromEvent(
      sampleEvent({ eventId: 'de-nt', tenantId: '' }),
      FLAGS_ON,
    );
    expect(result.rejected).toBe(true);
    expect(result.code).toMatch(/TENANT_SCOPE|MISSING|INVALID/);
    expect(getAnalyticsProjectionMetrics().projectionRejects).toBeGreaterThanOrEqual(1);
  });

  it('tenant mismatch rejeitado', () => {
    const result = applyAnalyticsProjectionEvent({
      event: sampleEvent({ eventId: 'de-mm' }),
      tenantId: TENANT_B,
      flagsInput: FLAGS_ON,
    });
    expect(result.rejected).toBe(true);
    expect(result.code).toBe('TENANT_SCOPE_MISMATCH');
  });

  it('snapshots imutáveis', () => {
    const result = applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-imm-1' }), FLAGS_ON);
    expect(result.snapshots).toHaveLength(1);
    expect(Object.isFrozen(result.snapshots[0])).toBe(true);
    expect(Object.isFrozen(result.snapshots[0].counters)).toBe(true);
    expect(() => {
      result.snapshots[0].version = 999;
    }).toThrow();
  });

  it('projection history cap por scope', () => {
    setAnalyticsProjectionCap(2);
    applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-cap-1' }), FLAGS_ON);
    applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-cap-2', eventType: 'LEAD_UPDATED' }), FLAGS_ON);
    applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-cap-3', eventType: 'LEAD_MOVED' }), FLAGS_ON);
    // empty seed + 3 updates — cap 2 no history do scope
    expect(getAnalyticsProjectionHistoryCount({ tenantId: TENANT, projectionId: 'crm-counter' }))
      .toBe(2);
  });

  it('metrics e rebuild/reset por tenant', () => {
    applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-m1' }), FLAGS_ON);
    rebuildAnalyticsProjectionsIfEnabled(FLAGS_ON, TENANT);
    expect(getAnalyticsProjectionMetrics().projectionRebuilds).toBeGreaterThanOrEqual(1);
    expect(getAnalyticsProjection('crm-counter', TENANT)?.version).toBe(0);
    resetAnalyticsProjections();
    expect(getAnalyticsProjectionMetrics().projectionResets).toBeGreaterThanOrEqual(1);
  });

  it('health idle / ready / healthy', () => {
    expect(getAnalyticsProjectionHealth().overall).toBe('idle');
    expect(getAnalyticsProjectionHealth(FLAGS_ON).overall).toBe('ready');
    applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-h1' }), FLAGS_ON);
    expect(getAnalyticsProjectionHealth(FLAGS_ON, { tenantId: TENANT }).overall).toBe('healthy');
  });

  it('inspector exige tenant para dados de negócio', () => {
    applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-i1' }), FLAGS_ON);
    const empty = inspectAnalyticsProjections(FLAGS_ON);
    expect(empty.projections).toHaveLength(0);
    expect(empty.note).toMatch(/tenantId/);

    const local = inspectAnalyticsProjections(FLAGS_ON, { tenantId: TENANT });
    expect(local.projections.some((p) => p.projectionId === 'crm-counter')).toBe(true);
    expect(local.health.overall).toBe('healthy');
    expect(inspectAnalyticsProjectionById('crm-counter', TENANT)?.counters.leadsCreated).toBe(1);

    const snap = inspectDomainEvents();
    expect(snap.analyticsProjections).toBeTruthy();
    expect(inspectDomainEventAnalyticsProjections(FLAGS_ON, { tenantId: TENANT }).metrics.projectionUpdates)
      .toBeGreaterThanOrEqual(1);
  });

  it('list tenant projections', () => {
    applyAnalyticsProjectionFromEvent(sampleEvent({ eventId: 'de-l' }), FLAGS_ON);
    expect(listAnalyticsProjectionsForTenant(TENANT).length).toBeGreaterThanOrEqual(1);
  });

  it('ausência de side-effects / domínio intocado', () => {
    const projDir = path.join(__dirname, '../domain-events/projections');
    for (const file of fs.readdirSync(projDir)) {
      if (!file.endsWith('.ts')) continue;
      const src = fs.readFileSync(path.join(projDir, file), 'utf8');
      expect(src).not.toMatch(/supabase|indexedDB|localStorage|fetch\(|whatsapp|createLead|updateLead/i);
      expect(src).not.toMatch(/from ['"].*services\//);
    }

    for (const file of [
      'crmService.js',
      'appointmentService.js',
      'receivablesService.js',
      'eventAuditProjectionConsumer.ts',
      'attachEventAuditProjection.ts',
    ]) {
      const base = file.endsWith('.ts')
        ? path.join(__dirname, '../domain-events/consumers', file)
        : path.join(__dirname, '../services', file);
      const src = fs.readFileSync(base, 'utf8');
      expect(src).not.toMatch(/analyticsProjection|DOMAIN_EVENT_ANALYTICS|applyAnalyticsProjection/);
    }
  });
});
