/**
 * Phase 7.7 — First Consumer Pilot (Event Audit Projection).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDomainEventFlags,
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  isDomainEventProjectionEnabled,
  DomainEventFlagsValidationError,
} from '../domain-events/domainEventFlags.ts';
import { publishViaDomainEventFacade } from '../domain-events/shared/domainEventFacade.ts';
import { __clearDomainEventBusForTest } from '../domain-events/domainEventBus.ts';
import { __clearDomainEventDedupForTest } from '../domain-events/shared/domainEventDeduplication.ts';
import {
  attachEventAuditProjection,
  detachEventAuditProjection,
  isEventAuditProjectionAttached,
} from '../domain-events/consumers/attachEventAuditProjection.ts';
import {
  EVENT_AUDIT_PROJECTION_CONSUMER_ID,
  EVENT_AUDIT_PROJECTION_EVENT_TYPES,
} from '../domain-events/consumers/eventAuditProjectionConsumer.ts';
import {
  getEventAuditProjection,
  getEventAuditProjectionCount,
  setEventAuditProjectionCap,
  __clearEventAuditProjectionForTest,
} from '../domain-events/consumers/eventAuditProjectionStore.ts';
import {
  __clearDomainEventConsumerRegistryForTest,
  getRegisteredDomainEventConsumerCount,
} from '../domain-events/consumers/domainEventConsumerRegistry.ts';
import {
  __clearDomainEventConsumerIdempotencyForTest,
} from '../domain-events/consumers/domainEventConsumerRunner.ts';
import {
  __clearDomainEventConsumerMetricsForTest,
  getDomainEventConsumerMetrics,
} from '../domain-events/consumers/domainEventConsumerMetrics.ts';
import {
  __clearDomainEventConsumerAuditForTest,
  getDomainEventConsumerAuditLog,
} from '../domain-events/consumers/domainEventConsumerAudit.ts';
import { getDomainEventConsumerHealth } from '../domain-events/consumers/domainEventConsumerHealth.ts';
import {
  inspectDomainEvents,
  inspectEventAuditProjection,
  inspectEventAuditProjectionByType,
} from '../domain-events/observability/domainEventInspector.ts';
import {
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
  DOMAIN_EVENTS_FLAGS_RESOLVED,
} from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
const PUBLISH_ON = { flagsInput: FLAGS_ON };

function clearAll() {
  detachEventAuditProjection();
  __clearEventAuditProjectionForTest();
  __clearDomainEventConsumerRegistryForTest();
  __clearDomainEventConsumerIdempotencyForTest();
  __clearDomainEventConsumerMetricsForTest();
  __clearDomainEventConsumerAuditForTest();
  __clearDomainEventBusForTest();
  __clearDomainEventDedupForTest();
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe('eventAuditProjection — flags / guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearAll();
  });

  it('contrato OFF + default false', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_PROJECTION).toBe('false');
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_PROJECTION).toBe(false);
    expect(isDomainEventProjectionEnabled()).toBe(false);
  });

  it('PROJECTION exige DOMAIN_EVENTS e DOMAIN_EVENT_CONSUMERS', () => {
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: false, DOMAIN_EVENT_PROJECTION: true },
    })).toThrow(DomainEventFlagsValidationError);
    expect(() => getDomainEventFlags({
      overrides: {
        DOMAIN_EVENTS: true,
        DOMAIN_EVENT_CONSUMERS: false,
        DOMAIN_EVENT_PROJECTION: true,
      },
    })).toThrow(/PROJECTION/);
  });

  it('production locked inclui PROJECTION', () => {
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('DOMAIN_EVENT_PROJECTION');
  });

  it('PROD trava PROJECTION', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      expect(getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED }).DOMAIN_EVENT_PROJECTION)
        .toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });
});

describe('eventAuditProjection — pilot consumer', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('flags OFF — attach no-op e publish não projeta', async () => {
    attachEventAuditProjection();
    expect(isEventAuditProjectionAttached()).toBe(false);
    await publishViaDomainEventFacade({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-off',
      tenantId: TENANT,
      payload: { leadId: 'lead-off' },
    });
    await flush();
    expect(getEventAuditProjectionCount()).toBe(0);
  });

  it('consome LEAD_CREATED', async () => {
    attachEventAuditProjection(FLAGS_ON);
    expect(isEventAuditProjectionAttached()).toBe(true);
    expect(getRegisteredDomainEventConsumerCount()).toBe(1);

    const result = await publishViaDomainEventFacade({
      eventType: 'LEAD_CREATED',
      eventId: 'de-proj-lead-1',
      aggregateId: 'lead-1',
      tenantId: TENANT,
      correlationId: 'corr-lead-1',
      payload: { leadId: 'lead-1', tenantId: TENANT },
    }, PUBLISH_ON);
    expect(result.accepted).toBe(true);
    await flush();

    const rows = inspectEventAuditProjectionByType('LEAD_CREATED');
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toBe('de-proj-lead-1');
    expect(rows[0].aggregateType).toBe('lead');
    expect(rows[0].correlationId).toBe('corr-lead-1');
    expect(rows[0].consumer).toBe(EVENT_AUDIT_PROJECTION_CONSUMER_ID);
    expect(rows[0].status).toBe('projected');
    expect(rows[0].publisher).toBe('crm');
  });

  it('consome APPOINTMENT_CREATED', async () => {
    attachEventAuditProjection(FLAGS_ON);
    await publishViaDomainEventFacade({
      eventType: 'APPOINTMENT_CREATED',
      eventId: 'de-proj-appt-1',
      aggregateId: 'appt-1',
      tenantId: TENANT,
      correlationId: 'corr-appt-1',
      payload: { appointmentId: 'appt-1', tenantId: TENANT },
    }, PUBLISH_ON);
    await flush();
    expect(inspectEventAuditProjectionByType('APPOINTMENT_CREATED')).toHaveLength(1);
  });

  it('consome RECEIVABLE_CREATED', async () => {
    attachEventAuditProjection(FLAGS_ON);
    await publishViaDomainEventFacade({
      eventType: 'RECEIVABLE_CREATED',
      eventId: 'de-proj-recv-1',
      aggregateId: 'recv-1',
      tenantId: TENANT,
      correlationId: 'corr-recv-1',
      payload: { receivableId: 'recv-1', tenantId: TENANT },
    }, PUBLISH_ON);
    await flush();
    expect(inspectEventAuditProjectionByType('RECEIVABLE_CREATED')).toHaveLength(1);
  });

  it('projection cap respeitado', async () => {
    attachEventAuditProjection(FLAGS_ON);
    setEventAuditProjectionCap(3);
    for (let i = 0; i < 5; i += 1) {
      await publishViaDomainEventFacade({
        eventType: 'LEAD_UPDATED',
        eventId: `de-proj-cap-${i}`,
        aggregateId: `lead-cap-${i}`,
        tenantId: TENANT,
        payload: { leadId: `lead-cap-${i}` },
      }, PUBLISH_ON);
      await flush();
    }
    expect(getEventAuditProjectionCount()).toBe(3);
    const ids = getEventAuditProjection().map((r) => r.eventId);
    expect(ids).toEqual(['de-proj-cap-2', 'de-proj-cap-3', 'de-proj-cap-4']);
  });

  it('inspector expõe auditProjection', async () => {
    attachEventAuditProjection(FLAGS_ON);
    await publishViaDomainEventFacade({
      eventType: 'TASK_CREATED',
      eventId: 'de-proj-task-1',
      aggregateId: 'task-1',
      tenantId: TENANT,
      payload: { taskId: 'task-1' },
    }, PUBLISH_ON);
    await flush();
    const snap = inspectDomainEvents();
    expect(snap.auditProjectionCount).toBe(1);
    expect(snap.auditProjection[0].eventType).toBe('TASK_CREATED');
    expect(inspectEventAuditProjection()).toHaveLength(1);
  });

  it('observability health inclui audit_projection', async () => {
    attachEventAuditProjection(FLAGS_ON);
    const health = getDomainEventConsumerHealth();
    const proj = health.components.find((c) => c.component === 'audit_projection');
    expect(proj?.status).toBe('healthy');
    expect(getDomainEventConsumerMetrics().totalConsumerSucceeded).toBeGreaterThanOrEqual(0);
  });

  it('audit de consumer quando flag ON', async () => {
    attachEventAuditProjection(FLAGS_ON);
    await publishViaDomainEventFacade({
      eventType: 'FOLLOW_UP_CREATED',
      eventId: 'de-proj-fup-1',
      aggregateId: 'fup-1',
      tenantId: TENANT,
      payload: { followUpId: 'fup-1' },
    }, PUBLISH_ON);
    await flush();
    expect(getDomainEventConsumerAuditLog().some(
      (a) => a.consumerId === EVENT_AUDIT_PROJECTION_CONSUMER_ID && a.status === 'succeeded',
    )).toBe(true);
  });

  it('isolamento — falha de outro consumer não impede projection', async () => {
    attachEventAuditProjection(FLAGS_ON);
    const { registerDomainEventConsumer } = await import(
      '../domain-events/consumers/domainEventConsumerRegistry.ts'
    );
    registerDomainEventConsumer({
      consumerId: 'fail-pilot-neighbor',
      consumerName: 'Fail Neighbor',
      eventTypes: ['LEAD_CREATED'],
      version: 1,
      enabled: true,
      priority: 100,
      executionMode: 'async',
      idempotencyScope: 'event+consumer+version',
      maxAttempts: 1,
      timeoutMs: 50,
      source: 'test',
      description: 'failing structural neighbor',
      handle: async () => {
        throw new Error('neighbor boom');
      },
    });
    await publishViaDomainEventFacade({
      eventType: 'LEAD_CREATED',
      eventId: 'de-proj-iso-1',
      aggregateId: 'lead-iso',
      tenantId: TENANT,
      payload: { leadId: 'lead-iso' },
    }, {
      flagsInput: {
        overrides: {
          ...DOMAIN_EVENTS_FLAGS_RESOLVED,
          DOMAIN_EVENT_CONSUMER_RETRY: false,
        },
      },
    });
    await flush();
    expect(inspectEventAuditProjectionByType('LEAD_CREATED').length).toBeGreaterThanOrEqual(1);
  });

  it('ausência de side-effects / domínio intocado', () => {
    expect(EVENT_AUDIT_PROJECTION_EVENT_TYPES).toContain('LEAD_CREATED');
    expect(EVENT_AUDIT_PROJECTION_EVENT_TYPES).toContain('APPOINTMENT_CREATED');
    expect(EVENT_AUDIT_PROJECTION_EVENT_TYPES).toContain('RECEIVABLE_CREATED');

    const consumerSrc = fs.readFileSync(
      path.join(__dirname, '../domain-events/consumers/eventAuditProjectionConsumer.ts'),
      'utf8',
    );
    expect(consumerSrc).not.toMatch(/whatsapp|sendMessage|createTask|updateLead|supabase/i);
    expect(consumerSrc).toMatch(/appendEventAuditProjection/);

    for (const file of [
      'crmService.js',
      'appointmentService.js',
      'receivablesService.js',
      'crmLeadDomainEventPublisher.js',
      'financialDomainEventPublisher.js',
      'agendaAppointmentDomainEventPublisher.js',
    ]) {
      const src = fs.readFileSync(path.join(__dirname, '../services', file), 'utf8');
      expect(src).not.toMatch(/attachEventAuditProjection|eventAuditProjection|EventAuditProjection/);
    }
  });

  it('attach não é auto no boot — registry limpo sem attach', () => {
    expect(getRegisteredDomainEventConsumerCount()).toBe(0);
    expect(isEventAuditProjectionAttached()).toBe(false);
  });
});
