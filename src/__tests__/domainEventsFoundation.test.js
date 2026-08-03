/**
 * Phase 6.9 — Domain Events Foundation (estrutural).
 * Zero adoção de domínio; flags OFF = no-op.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN_EVENT_MODEL_VERSION,
} from '../domain-events/domainEventTypes.ts';
import {
  DOMAIN_EVENT_REGISTRY,
  getDomainEventRegistryEntry,
  isRegisteredDomainEventType,
  listDomainEventNames,
  listDomainEventRegistry,
} from '../domain-events/domainEventRegistry.ts';
import {
  assertDomainEventContract,
  DomainEventContractError,
  validateDomainEventContract,
} from '../domain-events/domainEventContracts.ts';
import {
  buildDomainEvent,
  cloneDomainEvent,
  mapDomainEventToAuditSnapshot,
} from '../domain-events/domainEventMapper.ts';
import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  getDomainEventFlags,
  isDomainEventAuditEnabled,
  isDomainEventsEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../domain-events/domainEventFlags.ts';
import {
  __clearDomainEventAuditForTest,
  createDomainEventAuditEntry,
  getDomainEventAuditLog,
} from '../domain-events/domainEventAudit.ts';
import {
  __clearDomainEventBusForTest,
  getPublishedDomainEventsBuffer,
  publishDomainEvent,
  subscribeAllDomainEvents,
  subscribeDomainEvent,
} from '../domain-events/domainEventBus.ts';
import {
  canDispatchDomainEvents,
  dispatchDomainEvent,
} from '../domain-events/domainEventDispatcher.ts';
import {
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
  DOMAIN_EVENTS_FLAGS_RESOLVED,
} from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOMAIN_EVENTS_DIR = path.resolve(__dirname, '../domain-events');

const EXPECTED_FILES = [
  'domainEventAudit.ts',
  'domainEventBus.ts',
  'domainEventContracts.ts',
  'domainEventDispatcher.ts',
  'domainEventFlags.ts',
  'domainEventMapper.ts',
  'domainEventRegistry.ts',
  'domainEventTypes.ts',
  'index.ts',
].sort();

describe('domainEventsFoundation — estrutura', () => {
  it('possui arquivos foundation obrigatórios', () => {
    const files = readdirSync(DOMAIN_EVENTS_DIR).filter((f) => f.endsWith('.ts')).sort();
    for (const file of EXPECTED_FILES) {
      expect(files).toContain(file);
    }
  });
});

describe('domainEventsFoundation — Event DTO', () => {
  it('buildDomainEvent preenche DTO canônico', () => {
    const event = buildDomainEvent({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-1',
      tenantId: TENANT,
      userId: 'user-1',
      payload: { name: 'Lead' },
      correlationId: 'corr-1',
    });
    expect(event.eventId).toBeTruthy();
    expect(event.eventType).toBe('LEAD_CREATED');
    expect(event.aggregateType).toBe('lead');
    expect(event.aggregateId).toBe('lead-1');
    expect(event.tenantId).toBe(TENANT);
    expect(event.userId).toBe('user-1');
    expect(event.timestamp).toBeTruthy();
    expect(event.payload).toEqual({ name: 'Lead' });
    expect(event.metadata).toEqual({});
    expect(event.version).toBe(DOMAIN_EVENT_MODEL_VERSION);
    expect(event.source).toBe('crm');
    expect(event.correlationId).toBe('corr-1');
    expect(event.causationId).toBeNull();
  });

  it('cloneDomainEvent não compartilha payload', () => {
    const event = buildDomainEvent({
      eventType: 'TASK_CREATED',
      aggregateId: 'task-1',
      tenantId: TENANT,
    });
    const cloned = cloneDomainEvent(event);
    cloned.payload.mutated = true;
    expect(event.payload.mutated).toBeUndefined();
  });

  it('mapDomainEventToAuditSnapshot extrai campos canônicos', () => {
    const event = buildDomainEvent({
      eventType: 'PAYMENT_RECEIVED',
      aggregateId: 'pay-1',
      tenantId: TENANT,
    });
    const snap = mapDomainEventToAuditSnapshot(event);
    expect(snap.eventType).toBe('PAYMENT_RECEIVED');
    expect(snap.tenantId).toBe(TENANT);
    expect(snap.aggregateId).toBe('pay-1');
  });
});

describe('domainEventsFoundation — Registry', () => {
  it('catálogo contém eventos oficiais', () => {
    const names = listDomainEventNames();
    expect(names).toContain('LEAD_CREATED');
    expect(names).toContain('LEAD_MOVED');
    expect(names).toContain('TASK_COMPLETED');
    expect(names).toContain('FOLLOW_UP_COMPLETED');
    expect(names).toContain('TASK_DELETED');
    expect(names).toContain('CRM_TIMELINE_EVENT_CREATED');
    expect(names).toContain('APPOINTMENT_CONFIRMED');
    expect(names).toContain('APPOINTMENT_UPDATED');
    expect(names).toContain('APPOINTMENT_CANCELLED');
    expect(names).toContain('APPOINTMENT_RESCHEDULED');
    expect(names).toContain('APPOINTMENT_STATUS_CHANGED');
    expect(names).toContain('PAYMENT_FAILED');
    expect(names).toContain('TENANT_CREATED');
    expect(DOMAIN_EVENT_REGISTRY.length).toBe(33);
  });

  it('getDomainEventRegistryEntry retorna metadados', () => {
    const entry = getDomainEventRegistryEntry('LEAD_MOVED');
    expect(entry?.aggregate).toBe('lead');
    expect(entry?.expectedOrigin).toBe('crm');
    expect(entry?.expectedDestinations).toContain('activity-stream');
  });

  it('isRegisteredDomainEventType', () => {
    expect(isRegisteredDomainEventType('BUDGET_CREATED')).toBe(true);
    expect(isRegisteredDomainEventType('UNKNOWN_EVENT')).toBe(false);
  });

  it('listDomainEventRegistry clona entradas', () => {
    const list = listDomainEventRegistry();
    list[0].description = 'mutated';
    expect(DOMAIN_EVENT_REGISTRY[0].description).not.toBe('mutated');
  });
});

describe('domainEventsFoundation — Contracts', () => {
  it('validateDomainEventContract rejeita incompleto', () => {
    const result = validateDomainEventContract({ eventType: 'LEAD_CREATED' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('assertDomainEventContract lança DomainEventContractError', () => {
    expect(() => assertDomainEventContract(null)).toThrow(DomainEventContractError);
  });

  it('requireRegisteredType rejeita tipo desconhecido', () => {
    const event = buildDomainEvent({
      eventType: 'CUSTOM_FUTURE',
      aggregateId: 'x',
      tenantId: TENANT,
      aggregateType: 'system',
      source: 'system',
    });
    const result = validateDomainEventContract(event, { requireRegisteredType: true });
    expect(result.valid).toBe(false);
  });
});

describe('domainEventsFoundation — Flags e Production Guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('contrato vitest mantém flags OFF', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENTS).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_AUDIT).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_OBSERVABILITY).toBe('false');
  });

  it('defaults OFF', () => {
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENTS).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_AUDIT).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_OBSERVABILITY).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_CONSUMERS).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_CONSUMER_AUDIT).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_CONSUMER_RETRY).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_PROJECTION).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_ANALYTICS).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.LEAD_ANALYTICS_READ_MODEL).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.APPOINTMENT_ANALYTICS_READ_MODEL).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.FINANCIAL_ANALYTICS_READ_MODEL).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL_SOAK).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL_CONSISTENCY).toBe(false);
    expect(isDomainEventsEnabled()).toBe(false);
    expect(isDomainEventAuditEnabled()).toBe(false);
  });

  it('DOMAIN_EVENT_AUDIT exige DOMAIN_EVENTS', () => {
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: false, DOMAIN_EVENT_AUDIT: true },
    })).toThrow(/DOMAIN_EVENT_AUDIT/);
  });

  it('DOMAIN_EVENT_OBSERVABILITY exige DOMAIN_EVENTS', () => {
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: false, DOMAIN_EVENT_OBSERVABILITY: true },
    })).toThrow(/DOMAIN_EVENT_OBSERVABILITY/);
  });

  it('build PROD trava flags', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED });
      expect(flags.DOMAIN_EVENTS).toBe(false);
      expect(flags.DOMAIN_EVENT_AUDIT).toBe(false);
      expect(flags.DOMAIN_EVENT_OBSERVABILITY).toBe(false);
      expect(flags.DOMAIN_EVENT_CONSUMERS).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host Supabase produção bloqueia flags', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED });
    expect(flags.DOMAIN_EVENTS).toBe(false);
  });

  it('production locked keys cobrem flags Domain Events', () => {
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toEqual([
      'DOMAIN_EVENTS',
      'DOMAIN_EVENT_AUDIT',
      'DOMAIN_EVENT_OBSERVABILITY',
      'DOMAIN_EVENT_CONSUMERS',
      'DOMAIN_EVENT_CONSUMER_AUDIT',
      'DOMAIN_EVENT_CONSUMER_RETRY',
      'DOMAIN_EVENT_PROJECTION',
      'DOMAIN_EVENT_ANALYTICS',
      'LEAD_ANALYTICS_READ_MODEL',
      'CQRS_READ_MODEL',
      'APPOINTMENT_ANALYTICS_READ_MODEL',
      'FINANCIAL_ANALYTICS_READ_MODEL',
      'CQRS_READ_MODEL_SOAK',
      'CQRS_READ_MODEL_CONSISTENCY',
    ]);
  });

  it('DOMAIN_EVENT_CONSUMERS exige DOMAIN_EVENTS', () => {
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: false, DOMAIN_EVENT_CONSUMERS: true },
    })).toThrow(/DOMAIN_EVENT_CONSUMERS/);
  });
});

describe('domainEventsFoundation — Event Bus', () => {
  beforeEach(() => {
    __clearDomainEventBusForTest();
  });

  afterEach(() => {
    __clearDomainEventBusForTest();
  });

  it('publishDomainEvent notifica subscribers tipados e wildcard', async () => {
    const typed = vi.fn();
    const all = vi.fn();
    subscribeDomainEvent('LEAD_CREATED', typed);
    subscribeAllDomainEvents(all);
    const event = buildDomainEvent({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-bus',
      tenantId: TENANT,
    });
    const result = await publishDomainEvent(event);
    expect(result.accepted).toBe(true);
    expect(typed).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(1);
    expect(getPublishedDomainEventsBuffer()).toHaveLength(1);
  });

  it('unsubscribe remove handler', async () => {
    const handler = vi.fn();
    const unsub = subscribeDomainEvent('TASK_CREATED', handler);
    unsub();
    await publishDomainEvent(buildDomainEvent({
      eventType: 'TASK_CREATED',
      aggregateId: 't1',
      tenantId: TENANT,
    }));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('domainEventsFoundation — Dispatcher', () => {
  beforeEach(() => {
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
  });

  afterEach(() => {
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
  });

  it('flags OFF — dispatch skipped sem publicar', async () => {
    const handler = vi.fn();
    subscribeAllDomainEvents(handler);
    const result = await dispatchDomainEvent({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-off',
      tenantId: TENANT,
    });
    expect(result.skipped).toBe(true);
    expect(result.accepted).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(getPublishedDomainEventsBuffer()).toHaveLength(0);
    expect(canDispatchDomainEvents()).toBe(false);
  });

  it('flags ON — dispatch publica no bus', async () => {
    const handler = vi.fn();
    subscribeDomainEvent('LEAD_CREATED', handler);
    const result = await dispatchDomainEvent(
      {
        eventType: 'LEAD_CREATED',
        aggregateId: 'lead-on',
        tenantId: TENANT,
        payload: { name: 'On' },
      },
      { flagsInput: { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED } },
    );
    expect(result.accepted).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.eventId).toBeTruthy();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('audit ON registra prepared + published', async () => {
    await dispatchDomainEvent(
      {
        eventType: 'PAYMENT_RECEIVED',
        aggregateId: 'pay-1',
        tenantId: TENANT,
      },
      { flagsInput: { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED } },
    );
    const log = getDomainEventAuditLog();
    expect(log.some((e) => e.status === 'prepared')).toBe(true);
    expect(log.some((e) => e.status === 'published')).toBe(true);
  });

  it('createDomainEventAuditEntry funciona isolado', () => {
    createDomainEventAuditEntry({
      eventType: 'USER_CREATED',
      tenantId: TENANT,
      status: 'skipped',
      reason: 'test',
    });
    expect(getDomainEventAuditLog()).toHaveLength(1);
  });
});
