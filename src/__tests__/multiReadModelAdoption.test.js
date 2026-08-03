/**
 * Phase 8.1 — Multi Read Model Adoption.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAnalyticsProjectionFromEvent,
  __clearAnalyticsProjectionStoreForTest,
  __clearAnalyticsProjectionMetricsForTest,
} from '../domain-events/projections/index.ts';
import {
  attachAnalyticsReadModels,
  attachLeadAnalyticsReadModel,
  detachAllAnalyticsReadModels,
  getRegisteredReadModelCount,
  getReadModelDefinition,
  getReadModelFoundationHealth,
  getReadModelHealthById,
  getReadModelMetricsById,
  getReadModelLifecycleState,
  inspectReadModelFoundation,
  refreshLeadAnalyticsReadModel,
  refreshAppointmentAnalyticsReadModel,
  refreshFinancialAnalyticsReadModel,
  createLeadAnalyticsReadModelDefinition,
  __clearAnalyticsReadModelAttachForTest,
  __clearReadModelRegistryForTest,
  __clearReadModelBuilderStateForTest,
  __clearReadModelLifecycleForTest,
  __clearReadModelFoundationMetricsForTest,
  __clearReadModelCacheForTest,
  __clearLeadAnalyticsStoreForTest,
  __clearLeadAnalyticsMetricsForTest,
  buildReadModelSnapshotExplicit,
  setReadModelLifecycleState,
} from '../domain-events/read-models/index.ts';
import { inspectDomainEvents } from '../domain-events/observability/domainEventInspector.ts';
import { DOMAIN_EVENTS_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const TENANT_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
const NOW = '2026-07-13T19:00:00.000Z';

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
}

function project(eventType, eventId, tenantId = TENANT_A) {
  return applyAnalyticsProjectionFromEvent({
    eventId,
    eventType,
    tenantId,
    timestamp: NOW,
  }, FLAGS_ON);
}

describe('multiReadModelAdoption — lead migration', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('Lead adere ao contrato compartilhado e preserva indicadores', () => {
    const def = createLeadAnalyticsReadModelDefinition();
    expect(def.readModelId).toBe('lead-analytics');
    expect(def.projectionSources).toEqual(['crm-counter']);
    expect(def.lifecycle.autoRebuild).toBe(false);

    project('LEAD_CREATED', 'm-l1');
    project('LEAD_MOVED', 'm-l2');
    const result = refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT_A });
    expect(result.built).toBe(true);
    expect(result.snapshot.indicators.totalLeads).toBe(1);
    expect(result.snapshot.indicators.totalConverted).toBe(1);
    expect(result.snapshot.indicators.totalLost).toBe(0);
    expect(result.snapshot.tenantId).toBe(TENANT_A);
    expect(getReadModelDefinition('lead-analytics')).toBeTruthy();
  });

  it('tenant isolation — tenants não misturam', () => {
    attachLeadAnalyticsReadModel(FLAGS_ON);
    const buildA = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
      projectionSnapshots: {
        crm: { counters: { leadsCreated: 1, leadsUpdated: 0, leadsMoved: 0 }, version: 1, updatedAt: NOW },
      },
    });
    const buildB = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      tenantId: TENANT_B,
      flagsInput: FLAGS_ON,
      useCache: false,
      now: NOW,
      projectionSnapshots: {
        crm: { counters: { leadsCreated: 2, leadsUpdated: 1, leadsMoved: 0 }, version: 2, updatedAt: NOW },
      },
    });
    expect(buildA.built).toBe(true);
    expect(buildB.built).toBe(true);
    expect(buildA.snapshot.payload.indicators.totalLeads).toBe(1);
    expect(buildB.snapshot.payload.indicators.totalLeads).toBe(2);
    expect(buildA.snapshot.tenantId).toBe(TENANT_A);
    expect(buildB.snapshot.tenantId).toBe(TENANT_B);
  });
});

describe('multiReadModelAdoption — appointment + financial', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('Appointment Analytics a partir de appointment-counter', () => {
    project('APPOINTMENT_CREATED', 'm-a1');
    project('APPOINTMENT_CANCELLED', 'm-a2');
    project('APPOINTMENT_RESCHEDULED', 'm-a3');
    project('APPOINTMENT_CONFIRMED', 'm-a4');
    project('APPOINTMENT_STATUS_CHANGED', 'm-a5');
    project('APPOINTMENT_UPDATED', 'm-a6');
    const result = refreshAppointmentAnalyticsReadModel(FLAGS_ON, {
      now: NOW,
      tenantId: TENANT_A,
    });
    expect(result.built).toBe(true);
    expect(result.indicators.totalAppointmentsCreated).toBe(1);
    expect(result.indicators.totalAppointmentsCancelled).toBe(1);
    expect(result.indicators.totalAppointmentsRescheduled).toBe(1);
    expect(result.indicators.totalAppointmentsConfirmed).toBe(1);
    expect(result.indicators.totalStatusChanges).toBe(1);
    expect(result.indicators.totalUpdated).toBe(1);
  });

  it('Financial Analytics a partir de financial-counter (sem valores monetários)', () => {
    project('RECEIVABLE_CREATED', 'm-f1');
    project('RECEIVABLE_UPDATED', 'm-f2');
    project('PAYABLE_CREATED', 'm-f3');
    project('PAYMENT_RECEIVED', 'm-f4');
    const result = refreshFinancialAnalyticsReadModel(FLAGS_ON, {
      now: NOW,
      tenantId: TENANT_A,
    });
    expect(result.built).toBe(true);
    expect(result.indicators.totalReceivablesCreated).toBe(1);
    expect(result.indicators.totalReceivablesUpdated).toBe(1);
    expect(result.indicators.totalPayablesCreated).toBe(1);
    expect(result.indicators.totalPaymentsReceived).toBe(1);
    expect(JSON.stringify(result.indicators)).not.toMatch(/amount|valor|currency|BRL/i);
  });
});

describe('multiReadModelAdoption — foundation wiring', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('attach opt-in idempotente e registry vazio no boot', () => {
    expect(getRegisteredReadModelCount()).toBe(0);
    attachAnalyticsReadModels(FLAGS_ON);
    expect(getRegisteredReadModelCount()).toBe(3);
    attachAnalyticsReadModels(FLAGS_ON);
    expect(getRegisteredReadModelCount()).toBe(3);
    attachLeadAnalyticsReadModel(FLAGS_ON);
    expect(getRegisteredReadModelCount()).toBe(3);
  });

  it('lifecycle independente — falha isolada', () => {
    attachAnalyticsReadModels(FLAGS_ON);
    setReadModelLifecycleState('lead-analytics', 'ready', TENANT_A);
    setReadModelLifecycleState('financial-analytics', 'building', TENANT_A);
    setReadModelLifecycleState('financial-analytics', 'degraded', TENANT_A);
    expect(getReadModelLifecycleState('lead-analytics', TENANT_A)).toBe('ready');
    expect(getReadModelLifecycleState('financial-analytics', TENANT_A)).toBe('degraded');
    expect(getReadModelHealthById('lead-analytics', FLAGS_ON, TENANT_A).status).toBe('healthy');
    expect(getReadModelHealthById('financial-analytics', FLAGS_ON, TENANT_A).status).toBe('degraded');
  });

  it('metrics segmentadas + inspector unificado', () => {
    project('LEAD_CREATED', 'm-met-1');
    refreshLeadAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT_A });
    project('APPOINTMENT_CREATED', 'm-met-2');
    refreshAppointmentAnalyticsReadModel(FLAGS_ON, { now: NOW, tenantId: TENANT_A });

    expect(getReadModelMetricsById('lead-analytics').builds).toBeGreaterThanOrEqual(1);
    expect(getReadModelMetricsById('appointment-analytics').builds).toBeGreaterThanOrEqual(1);
    const snap = inspectReadModelFoundation(FLAGS_ON);
    expect(snap.byReadModel.length).toBeGreaterThanOrEqual(2);
    expect(inspectDomainEvents().cqrsReadModelFoundation.registryCount).toBeGreaterThanOrEqual(2);
    expect(getReadModelFoundationHealth(FLAGS_ON).byReadModel.length).toBeGreaterThanOrEqual(2);
  });

  it('flags OFF no-op + tenant obrigatório', () => {
    project('LEAD_CREATED', 'm-off-1');
    expect(refreshLeadAnalyticsReadModel().skipped).toBe(true);
    attachAnalyticsReadModels(FLAGS_ON);
    const missingTenant = buildReadModelSnapshotExplicit({
      readModelId: 'lead-analytics',
      flagsInput: FLAGS_ON,
      projectionSnapshots: { crm: { counters: { leadsCreated: 1, leadsUpdated: 0, leadsMoved: 0 }, version: 1 } },
    });
    expect(missingTenant.skipped).toBe(true);
    expect(missingTenant.reason).toMatch(/tenantId/);
  });

  it('ausência de HTTP/UI/Repository/domínio operacional', () => {
    for (const file of [
      'attachAnalyticsReadModels.ts',
      'appointmentAnalytics.ts',
      'financialAnalytics.ts',
      'analyticsReadModelRefresh.ts',
      'leadAnalyticsDefinition.ts',
    ]) {
      const src = fs.readFileSync(path.join(__dirname, '../domain-events/read-models', file), 'utf8');
      expect(src).not.toMatch(/from ['"][^'"]*repositories\//);
      expect(src).not.toMatch(/express|fastify|http\.createServer|jsx|react/i);
      expect(src).not.toMatch(/from ['"].*services\//);
    }
  });
});
