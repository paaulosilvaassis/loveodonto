/**
 * Phase 7.6 — Domain Event Consumer Foundation.
 * Estrutural: sem handlers de negócio, sem auto-wiring no Event Bus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDomainEventFlags,
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  isDomainEventConsumersEnabled,
  DomainEventFlagsValidationError,
} from '../domain-events/domainEventFlags.ts';
import { buildDomainEvent } from '../domain-events/domainEventMapper.ts';
import {
  validateDomainEventConsumerDefinition,
  DomainEventConsumerContractError,
  assertDomainEventConsumerDefinition,
} from '../domain-events/consumers/domainEventConsumerContracts.ts';
import {
  registerDomainEventConsumer,
  listDomainEventConsumers,
  getRegisteredDomainEventConsumerCount,
  DomainEventConsumerRegistryError,
  __clearDomainEventConsumerRegistryForTest,
} from '../domain-events/consumers/domainEventConsumerRegistry.ts';
import {
  buildDomainEventConsumerContext,
  createDomainEventOperationContext,
  deriveDomainEventConsumerContext,
} from '../domain-events/consumers/domainEventConsumerContext.ts';
import {
  runDomainEventConsumer,
  __clearDomainEventConsumerIdempotencyForTest,
} from '../domain-events/consumers/domainEventConsumerRunner.ts';
import {
  dispatchDomainEventToConsumers,
  DOMAIN_EVENT_CONSUMER_AUTO_WIRING,
} from '../domain-events/consumers/domainEventConsumerDispatcher.ts';
import {
  evaluateDomainEventConsumerRetry,
} from '../domain-events/consumers/domainEventConsumerRetry.ts';
import {
  getDomainEventConsumerDeadLetters,
  __clearDomainEventConsumerDeadLetterForTest,
} from '../domain-events/consumers/domainEventConsumerDeadLetter.ts';
import {
  getDomainEventConsumerAuditLog,
  __clearDomainEventConsumerAuditForTest,
} from '../domain-events/consumers/domainEventConsumerAudit.ts';
import {
  getDomainEventConsumerMetrics,
  __clearDomainEventConsumerMetricsForTest,
} from '../domain-events/consumers/domainEventConsumerMetrics.ts';
import { getDomainEventConsumerHealth } from '../domain-events/consumers/domainEventConsumerHealth.ts';
import { diagnoseDomainEventFlags } from '../domain-events/observability/domainEventDiagnostics.ts';
import {
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
  DOMAIN_EVENTS_FLAGS_RESOLVED,
} from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
const CONSUMERS_DIR = path.join(__dirname, '../domain-events/consumers');

function sampleEvent(overrides = {}) {
  return buildDomainEvent({
    eventType: 'LEAD_CREATED',
    aggregateId: 'lead-consumer-1',
    tenantId: TENANT,
    correlationId: 'de-corr-consumer-1',
    causationId: null,
    payload: { leadId: 'lead-consumer-1', tenantId: TENANT },
    ...overrides,
  });
}

function structuralConsumer(partial = {}) {
  return {
    consumerId: 'test-consumer-a',
    consumerName: 'Test Consumer A',
    eventTypes: ['LEAD_CREATED'],
    version: 1,
    enabled: true,
    priority: 10,
    executionMode: 'async',
    idempotencyScope: 'event+consumer+version',
    maxAttempts: 3,
    timeoutMs: 200,
    source: 'test',
    description: 'Structural test consumer — no business side-effects',
    handle: async () => {},
    ...partial,
  };
}

function clearAll() {
  __clearDomainEventConsumerRegistryForTest();
  __clearDomainEventConsumerIdempotencyForTest();
  __clearDomainEventConsumerDeadLetterForTest();
  __clearDomainEventConsumerAuditForTest();
  __clearDomainEventConsumerMetricsForTest();
}

describe('domainEventConsumers — estrutura', () => {
  it('pasta consumers contém arquivos Phase 7.6', () => {
    const files = fs.readdirSync(CONSUMERS_DIR);
    for (const f of [
      'domainEventConsumerTypes.ts',
      'domainEventConsumerRegistry.ts',
      'domainEventConsumerContracts.ts',
      'domainEventConsumerContext.ts',
      'domainEventConsumerRunner.ts',
      'domainEventConsumerDispatcher.ts',
      'domainEventConsumerRetry.ts',
      'domainEventConsumerDeadLetter.ts',
      'domainEventConsumerAudit.ts',
      'domainEventConsumerHealth.ts',
      'index.ts',
    ]) {
      expect(files).toContain(f);
    }
  });
});

describe('domainEventConsumers — flags / production guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearAll();
  });

  it('contrato vitest mantém consumer flags OFF', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_CONSUMERS).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_CONSUMER_AUDIT).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_CONSUMER_RETRY).toBe('false');
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENT_CONSUMERS).toBe(false);
    expect(isDomainEventConsumersEnabled()).toBe(false);
  });

  it('CONSUMERS / AUDIT / RETRY exigem dependências', () => {
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: false, DOMAIN_EVENT_CONSUMERS: true },
    })).toThrow(DomainEventFlagsValidationError);
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: true, DOMAIN_EVENT_CONSUMERS: false, DOMAIN_EVENT_CONSUMER_AUDIT: true },
    })).toThrow(/CONSUMER_AUDIT/);
    expect(() => getDomainEventFlags({
      overrides: { DOMAIN_EVENTS: true, DOMAIN_EVENT_CONSUMERS: false, DOMAIN_EVENT_CONSUMER_RETRY: true },
    })).toThrow(/CONSUMER_RETRY/);
  });

  it('production locked inclui consumer flags', () => {
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('DOMAIN_EVENT_CONSUMERS');
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('DOMAIN_EVENT_CONSUMER_AUDIT');
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('DOMAIN_EVENT_CONSUMER_RETRY');
  });

  it('PROD trava consumer flags', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED });
      expect(flags.DOMAIN_EVENT_CONSUMERS).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('diagnostics detecta flags conflitantes de consumers', () => {
    const issues = diagnoseDomainEventFlags({
      DOMAIN_EVENTS: true,
      DOMAIN_EVENT_AUDIT: false,
      DOMAIN_EVENT_OBSERVABILITY: false,
      DOMAIN_EVENT_CONSUMERS: false,
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
});

describe('domainEventConsumers — contracts / registry', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('registry vazio por padrão', () => {
    expect(getRegisteredDomainEventConsumerCount()).toBe(0);
    expect(listDomainEventConsumers()).toHaveLength(0);
  });

  it('contrato inválido rejeitado', () => {
    const result = validateDomainEventConsumerDefinition({
      consumerId: '',
      eventTypes: ['NOT_REAL'],
      version: 0,
    });
    expect(result.valid).toBe(false);
    expect(() => assertDomainEventConsumerDefinition({
      consumerId: 'x',
      consumerName: 'x',
      eventTypes: ['NOT_REAL'],
      version: 1,
      enabled: true,
      priority: 1,
      executionMode: 'sync',
      idempotencyScope: 'event+consumer+version',
      maxAttempts: 1,
      timeoutMs: 10,
      source: 't',
      description: 't',
      handle: () => {},
    })).toThrow(DomainEventConsumerContractError);
  });

  it('registra consumer de teste e rejeita id duplicado', () => {
    registerDomainEventConsumer(structuralConsumer());
    expect(getRegisteredDomainEventConsumerCount()).toBe(1);
    expect(() => registerDomainEventConsumer(structuralConsumer())).toThrow(
      DomainEventConsumerRegistryError,
    );
  });

  it('rejeita event types inválidos no registry', () => {
    expect(() => registerDomainEventConsumer(structuralConsumer({
      eventTypes: ['WHATSAPP_SENT'],
    }))).toThrow(/não registrado/);
  });

  it('ordena por prioridade', () => {
    registerDomainEventConsumer(structuralConsumer({
      consumerId: 'low',
      priority: 1,
    }));
    registerDomainEventConsumer(structuralConsumer({
      consumerId: 'high',
      priority: 100,
      handle: async () => {},
    }));
    const list = listDomainEventConsumers();
    expect(list[0].consumerId).toBe('high');
    expect(list[1].consumerId).toBe('low');
  });
});

describe('domainEventConsumers — context / operation helper', () => {
  it('preserva correlation e causation do evento', () => {
    const event = sampleEvent({ causationId: 'parent-1' });
    const ctx = buildDomainEventConsumerContext({
      consumer: structuralConsumer(),
      event,
      attempt: 0,
    });
    expect(ctx.correlationId).toBe('de-corr-consumer-1');
    expect(ctx.causationId).toBe('parent-1');
    expect(ctx.aggregateId).toBe('lead-consumer-1');
  });

  it('createDomainEventOperationContext + derive para operações compostas', () => {
    const op = createDomainEventOperationContext({
      tenantId: TENANT,
      origin: 'clinical_close',
    });
    expect(op.correlationId).toMatch(/^de-corr-/);
    const derived = deriveDomainEventConsumerContext(op, { causationId: 'evt-parent' });
    expect(derived.correlationId).toBe(op.correlationId);
    expect(derived.causationId).toBe('evt-parent');
    expect(derived.correlationId).not.toBe(derived.causationId);
  });
});

describe('domainEventConsumers — runner / dispatcher', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('flags OFF = skipped no-op', async () => {
    const result = await runDomainEventConsumer({
      consumer: structuralConsumer(),
      event: sampleEvent(),
    });
    expect(result.status).toBe('skipped');
    expect(result.reason).toMatch(/DOMAIN_EVENT_CONSUMERS=false/);
  });

  it('runner success', async () => {
    const handled = vi.fn();
    const result = await runDomainEventConsumer({
      consumer: structuralConsumer({ handle: handled }),
      event: sampleEvent(),
      flagsInput: FLAGS_ON,
    });
    expect(result.status).toBe('succeeded');
    expect(handled).toHaveBeenCalledOnce();
  });

  it('runner failure + retry desativado → dead_lettered', async () => {
    const result = await runDomainEventConsumer({
      consumer: structuralConsumer({
        handle: async () => {
          throw new Error('boom');
        },
        maxAttempts: 1,
      }),
      event: sampleEvent({ eventId: 'de-fail-1' }),
      flagsInput: {
        overrides: {
          ...DOMAIN_EVENTS_FLAGS_RESOLVED,
          DOMAIN_EVENT_CONSUMER_RETRY: false,
        },
      },
    });
    expect(result.status).toBe('dead_lettered');
    expect(getDomainEventConsumerDeadLetters().length).toBe(1);
  });

  it('retry preparado quando flag ON', async () => {
    const evalRetry = evaluateDomainEventConsumerRetry({
      attempt: 0,
      maxAttempts: 3,
      error: new Error('TIMEOUT: x'),
      retryEnabled: true,
    });
    expect(evalRetry.shouldRetry).toBe(true);
    expect(evalRetry.nextAttemptAt).toBeTruthy();

    const result = await runDomainEventConsumer({
      consumer: structuralConsumer({
        handle: async () => {
          throw new Error('TIMEOUT: slow');
        },
        maxAttempts: 3,
      }),
      event: sampleEvent({ eventId: 'de-retry-1' }),
      flagsInput: FLAGS_ON,
    });
    expect(result.status).toBe('retry_scheduled');
  });

  it('timeout isola falha', async () => {
    const result = await runDomainEventConsumer({
      consumer: structuralConsumer({
        timeoutMs: 20,
        maxAttempts: 1,
        handle: async () => {
          await new Promise((r) => setTimeout(r, 80));
        },
      }),
      event: sampleEvent({ eventId: 'de-timeout-1' }),
      flagsInput: {
        overrides: {
          ...DOMAIN_EVENTS_FLAGS_RESOLVED,
          DOMAIN_EVENT_CONSUMER_RETRY: false,
        },
      },
    });
    expect(result.status).toBe('dead_lettered');
    expect(String(result.error || '')).toMatch(/TIMEOUT/i);
  });

  it('idempotência / duplicidade', async () => {
    const event = sampleEvent({ eventId: 'de-idem-1' });
    const consumer = structuralConsumer({ consumerId: 'idem-c' });
    const first = await runDomainEventConsumer({ consumer, event, flagsInput: FLAGS_ON });
    const second = await runDomainEventConsumer({ consumer, event, flagsInput: FLAGS_ON });
    expect(first.status).toBe('succeeded');
    expect(second.status).toBe('skipped');
    expect(second.reason).toMatch(/duplicate/);
    expect(getDomainEventConsumerMetrics().totalConsumerDuplicates).toBe(1);
  });

  it('isolamento entre consumers no dispatcher', async () => {
    registerDomainEventConsumer(structuralConsumer({
      consumerId: 'ok-c',
      priority: 20,
      handle: async () => {},
    }));
    registerDomainEventConsumer(structuralConsumer({
      consumerId: 'fail-c',
      priority: 10,
      maxAttempts: 1,
      handle: async () => {
        throw new Error('isolated fail');
      },
    }));
    const dispatch = await dispatchDomainEventToConsumers(sampleEvent({ eventId: 'de-iso-1' }), {
      overrides: {
        ...DOMAIN_EVENTS_FLAGS_RESOLVED,
        DOMAIN_EVENT_CONSUMER_RETRY: false,
      },
    });
    expect(dispatch.skipped).toBe(false);
    expect(dispatch.results).toHaveLength(2);
    expect(dispatch.results.some((r) => r.status === 'succeeded')).toBe(true);
    expect(dispatch.results.some((r) => r.status === 'dead_lettered' || r.status === 'failed')).toBe(true);
  });

  it('dispatcher flags OFF skipped', async () => {
    registerDomainEventConsumer(structuralConsumer());
    const dispatch = await dispatchDomainEventToConsumers(sampleEvent());
    expect(dispatch.skipped).toBe(true);
  });

  it('audit registra quando flag ON', async () => {
    await runDomainEventConsumer({
      consumer: structuralConsumer({ consumerId: 'audit-c' }),
      event: sampleEvent({ eventId: 'de-audit-1' }),
      flagsInput: FLAGS_ON,
    });
    expect(getDomainEventConsumerAuditLog().some((a) => a.consumerId === 'audit-c')).toBe(true);
  });

  it('health idle com flags OFF', () => {
    const health = getDomainEventConsumerHealth();
    expect(health.overall).toBe('idle');
    expect(health.autoWiring).toBe(false);
    expect(health.components.map((c) => c.component)).toEqual([
      'consumer_registry',
      'dispatcher',
      'runner',
      'retry',
      'dead_letter',
      'audit',
      'audit_projection',
    ]);
  });
});

describe('domainEventConsumers — ausência de auto-wiring e business handlers', () => {
  it('DOMAIN_EVENT_CONSUMER_AUTO_WIRING é false', () => {
    expect(DOMAIN_EVENT_CONSUMER_AUTO_WIRING).toBe(false);
  });

  it('dispatcher não importa Event Bus / subscribe', () => {
    const src = fs.readFileSync(
      path.join(CONSUMERS_DIR, 'domainEventConsumerDispatcher.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/subscribeDomainEvent|subscribeAllDomainEvents|domainEventBus/);
    expect(src).toMatch(/DOMAIN_EVENT_CONSUMER_AUTO_WIRING = false/);
  });

  it('nenhum consumer funcional de domínio registrado no boot', () => {
    expect(getRegisteredDomainEventConsumerCount()).toBe(0);
  });

  it('CRM / Agenda / Financeiro não importam consumers', () => {
    const services = [
      'crmLeadDomainEventPublisher.js',
      'crmActivityDomainEventPublisher.js',
      'crmFollowUpDomainEventPublisher.js',
      'crmTaskDomainEventPublisher.js',
      'financialDomainEventPublisher.js',
      'agendaAppointmentDomainEventPublisher.js',
      'crmService.js',
      'appointmentService.js',
    ];
    for (const file of services) {
      const src = fs.readFileSync(path.join(__dirname, '../services', file), 'utf8');
      expect(src).not.toMatch(/domain-events\/consumers|dispatchDomainEventToConsumers|registerDomainEventConsumer/);
    }
  });

  it('facade/publisher não disparam consumers', () => {
    const facade = fs.readFileSync(
      path.join(__dirname, '../domain-events/shared/domainEventFacade.ts'),
      'utf8',
    );
    const publisher = fs.readFileSync(
      path.join(__dirname, '../domain-events/shared/domainEventPublisher.ts'),
      'utf8',
    );
    expect(facade).not.toMatch(/dispatchDomainEventToConsumers|consumers\//);
    expect(publisher).not.toMatch(/dispatchDomainEventToConsumers|consumers\//);
  });
});
