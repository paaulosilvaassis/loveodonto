/**
 * Phase 8.3 — Tenant-Scoped Analytics Projection Foundation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAnalyticsProjectionEvent,
  applyAnalyticsProjectionFromEvent,
  buildAnalyticsProjectionScopeKey,
  getAnalyticsProjection,
  getAnalyticsProjectionHistory,
  getAnalyticsProjectionScopeMetrics,
  getAnalyticsProjectionHealth,
  rebuildAnalyticsProjectionForTenant,
  resetAnalyticsProjectionsForTenant,
  clearAnalyticsProjectionsById,
  listResidualGlobalAnalyticsProjections,
  __clearAnalyticsProjectionStoreForTest,
  __clearAnalyticsProjectionMetricsForTest,
  __clearAnalyticsProjectionDiagnosticsForTest,
} from '../domain-events/projections/index.ts';
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
  __clearReadModelSoakMetricsForTest,
  __clearReadModelDriftLogForTest,
  refreshLeadAnalyticsReadModel,
  refreshAppointmentAnalyticsReadModel,
  refreshFinancialAnalyticsReadModel,
  getLastReadModelSnapshot,
  runReadModelSoakValidation,
  buildReadModelSoakReport,
  getReadModelProjectionScope,
} from '../domain-events/read-models/index.ts';
import { DOMAIN_EVENTS_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const TENANT_B = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
const NOW = '2026-07-13T21:00:00.000Z';

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
  __clearAnalyticsProjectionMetricsForTest();
  __clearAnalyticsProjectionDiagnosticsForTest();
  __clearReadModelSoakMetricsForTest();
  __clearReadModelDriftLogForTest();
}

function apply(eventType, eventId, tenantId) {
  return applyAnalyticsProjectionFromEvent({
    eventId,
    eventType,
    tenantId,
    timestamp: NOW,
  }, FLAGS_ON);
}

describe('Phase 8.3 — tenant-scoped store isolation', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('history/reset/rebuild isolados', () => {
    apply('LEAD_CREATED', 'e1', TENANT_A);
    apply('LEAD_CREATED', 'e2', TENANT_B);
    apply('LEAD_UPDATED', 'e3', TENANT_B);

    const histA = getAnalyticsProjectionHistory({ tenantId: TENANT_A, projectionId: 'crm-counter' });
    const histB = getAnalyticsProjectionHistory({ tenantId: TENANT_B, projectionId: 'crm-counter' });
    expect(histA.every((h) => h.tenantId === TENANT_A)).toBe(true);
    expect(histB.every((h) => h.tenantId === TENANT_B)).toBe(true);

    rebuildAnalyticsProjectionForTenant(TENANT_A, 'crm-counter');
    expect(getAnalyticsProjection('crm-counter', TENANT_A)?.version).toBe(0);
    expect(getAnalyticsProjection('crm-counter', TENANT_B)?.counters.leadsCreated).toBe(1);

    resetAnalyticsProjectionsForTenant(TENANT_B);
    expect(getAnalyticsProjection('crm-counter', TENANT_B)).toBeNull();
    expect(getAnalyticsProjection('crm-counter', TENANT_A)).toBeTruthy();
  });

  it('clear por projection não mistura tenants remanescentes de outras', () => {
    apply('LEAD_CREATED', 'c1', TENANT_A);
    apply('APPOINTMENT_CREATED', 'c2', TENANT_A);
    clearAnalyticsProjectionsById('crm-counter');
    expect(getAnalyticsProjection('crm-counter', TENANT_A)).toBeNull();
    expect(getAnalyticsProjection('appointment-counter', TENANT_A)?.counters.appointmentsCreated)
      .toBe(1);
  });

  it('nenhum residual global', () => {
    apply('LEAD_CREATED', 'g1', TENANT_A);
    expect(listResidualGlobalAnalyticsProjections()).toHaveLength(0);
    expect(getAnalyticsProjection('crm-counter', TENANT_A)?.scope).toBe('tenant');
  });
});

describe('Phase 8.3 — Read Models consomem projection do mesmo tenant', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('Lead / Appointment / Financial A ≠ B', () => {
    apply('LEAD_CREATED', 'l-a', TENANT_A);
    apply('LEAD_CREATED', 'l-b1', TENANT_B);
    apply('LEAD_CREATED', 'l-b2', TENANT_B);
    const leadA = refreshLeadAnalyticsReadModel(FLAGS_ON, { tenantId: TENANT_A, now: NOW });
    const leadB = refreshLeadAnalyticsReadModel(FLAGS_ON, { tenantId: TENANT_B, now: NOW });
    expect(leadA.built).toBe(true);
    expect(leadB.built).toBe(true);
    expect(leadA.snapshot.indicators.totalLeads).toBe(1);
    expect(leadB.snapshot.indicators.totalLeads).toBe(2);

    apply('APPOINTMENT_CREATED', 'a-a', TENANT_A);
    apply('APPOINTMENT_CANCELLED', 'a-b', TENANT_B);
    const apptA = refreshAppointmentAnalyticsReadModel(FLAGS_ON, { tenantId: TENANT_A, now: NOW });
    const apptB = refreshAppointmentAnalyticsReadModel(FLAGS_ON, { tenantId: TENANT_B, now: NOW });
    expect(apptA.indicators.totalAppointmentsCreated).toBe(1);
    expect(apptB.indicators.totalAppointmentsCancelled).toBe(1);
    expect(apptA.indicators.totalAppointmentsCancelled).toBe(0);

    apply('RECEIVABLE_CREATED', 'f-a', TENANT_A);
    apply('PAYMENT_RECEIVED', 'f-b', TENANT_B);
    const finA = refreshFinancialAnalyticsReadModel(FLAGS_ON, { tenantId: TENANT_A, now: NOW });
    const finB = refreshFinancialAnalyticsReadModel(FLAGS_ON, { tenantId: TENANT_B, now: NOW });
    expect(finA.indicators.totalReceivablesCreated).toBe(1);
    expect(finB.indicators.totalPaymentsReceived).toBe(1);

    expect(getLastReadModelSnapshot('lead-analytics', TENANT_A).tenantId).toBe(TENANT_A);
    expect(getLastReadModelSnapshot('lead-analytics', TENANT_B).tenantId).toBe(TENANT_B);
  });

  it('refresh sem tenant falha com segurança', () => {
    apply('LEAD_CREATED', 'nt', TENANT_A);
    const result = refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW });
    expect(result.built).toBe(false);
    expect(result.reason).toMatch(/tenantId/i);
  });
});

describe('Phase 8.3 — soak passing controlado', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('soak A e B passing sem drift / isolation failure', () => {
    for (const tenantId of [TENANT_A, TENANT_B]) {
      for (const rm of [
        {
          id: 'lead-analytics',
          snaps: {
            crm: {
              counters: { leadsCreated: 2, leadsUpdated: 0, leadsMoved: 1 },
              version: 3,
              updatedAt: NOW,
            },
          },
        },
        {
          id: 'appointment-analytics',
          snaps: {
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
        },
        {
          id: 'financial-analytics',
          snaps: {
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
          },
        },
      ]) {
        const run = runReadModelSoakValidation({
          readModelId: rm.id,
          tenantId,
          projectionSnapshots: rm.snaps,
          iterations: 2,
          flagsInput: FLAGS_ON,
          now: NOW,
        });
        expect(run.status).toBe('passing');
        expect(run.scopeWarnings).toHaveLength(0);
        expect(getReadModelProjectionScope(rm.id).scope).toBe('tenant');
      }
    }
    const report = buildReadModelSoakReport(FLAGS_ON);
    expect(report.overall).toBe('passing');
    expect(report.tenantIsolationFailures).toBe(0);
    expect(report.projectionScopeWarnings).toBe(0);
    expect(report.promotionRecommendation).toBe('hold');
  });

  it('evento sem tenant → blocked soak do projection apply path', () => {
    const rejected = applyAnalyticsProjectionEvent({
      event: {
        eventId: 'x',
        eventType: 'LEAD_CREATED',
        tenantId: null,
        timestamp: NOW,
      },
      flagsInput: FLAGS_ON,
    });
    expect(rejected.rejected).toBe(true);
    expect(getAnalyticsProjectionHealth(FLAGS_ON).tenantScopeErrors).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 8.3 — metrics segmentadas + safety', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('metrics por projectionId::tenantId', () => {
    apply('LEAD_CREATED', 'm1', TENANT_A);
    apply('LEAD_CREATED', 'm2', TENANT_B);
    const keyA = buildAnalyticsProjectionScopeKey('crm-counter', TENANT_A);
    const mA = getAnalyticsProjectionScopeMetrics('crm-counter', TENANT_A);
    const mB = getAnalyticsProjectionScopeMetrics('crm-counter', TENANT_B);
    expect(keyA).toContain(TENANT_A);
    expect(mA.totalEventsApplied).toBeGreaterThanOrEqual(1);
    expect(mB.totalEventsApplied).toBeGreaterThanOrEqual(1);
  });

  it('sem persistência / auto-bootstrap / HTTP', () => {
    const dir = path.join(__dirname, '../domain-events/projections');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/indexedDB|localStorage|createClient|express\.|ioredis/i);
      expect(src).not.toMatch(/\bsetInterval\s*\(|\bsetTimeout\s*\(/);
    }
    const index = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8');
    expect(index).not.toMatch(/applyAnalyticsProjectionFromEvent\(/);
  });
});
