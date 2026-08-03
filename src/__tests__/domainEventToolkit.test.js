/**
 * Phase 7.0 — Domain Event Toolkit + Publisher Foundation.
 * Isolado: nenhum domínio publica/consome.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDomainEventFlags,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../domain-events/domainEventFlags.ts';
import { buildDomainEvent } from '../domain-events/domainEventMapper.ts';
import {
  __clearDomainEventBusForTest,
  getPublishedDomainEventsBuffer,
  subscribeDomainEvent,
} from '../domain-events/domainEventBus.ts';
import {
  __clearDomainEventAuditForTest,
  getDomainEventAuditLog,
} from '../domain-events/domainEventAudit.ts';
import {
  validateDomainEvent,
  assertDomainEventValid,
} from '../domain-events/shared/domainEventValidator.ts';
import { DomainEventContractError } from '../domain-events/domainEventContracts.ts';
import {
  serializeDomainEvent,
  deserializeDomainEvent,
  domainEventToPlainObject,
  DomainEventSerializerError,
} from '../domain-events/shared/domainEventSerializer.ts';
import {
  createDomainEventCorrelationId,
  resolveDomainEventCorrelation,
  propagateDomainEventCorrelation,
  withDomainEventCorrelation,
} from '../domain-events/shared/domainEventCorrelation.ts';
import {
  DOMAIN_EVENT_RETRY_POLICY_DEFAULT,
  computeDomainEventRetryDelay,
  evaluateDomainEventRetry,
  runWithDomainEventRetryContract,
} from '../domain-events/shared/domainEventRetry.ts';
import {
  __clearDomainEventDedupForTest,
  buildDomainEventDedupKey,
  consumeDomainEventDedup,
  shouldSkipDuplicateDomainEvent,
  markDomainEventDeduplicated,
} from '../domain-events/shared/domainEventDeduplication.ts';
import {
  registerDomainEventSubscriber,
  DomainEventSubscriberBase,
} from '../domain-events/shared/domainEventSubscriberBase.ts';
import {
  __clearDomainEventAuditHooksForTest,
  emitDomainEventAuditHook,
  registerDomainEventAuditHook,
} from '../domain-events/shared/domainEventAuditHooks.ts';
import {
  publishDomainEventViaToolkit,
  canPublishDomainEvents,
} from '../domain-events/shared/domainEventPublisher.ts';
import {
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
  DOMAIN_EVENTS_FLAGS_RESOLVED,
} from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED_DIR = path.resolve(__dirname, '../domain-events/shared');

const EXPECTED_SHARED = [
  'domainEventAuditHooks.ts',
  'domainEventCorrelation.ts',
  'domainEventDeduplication.ts',
  'domainEventPublisher.ts',
  'domainEventRetry.ts',
  'domainEventSerializer.ts',
  'domainEventSubscriberBase.ts',
  'domainEventValidator.ts',
  'index.ts',
].sort();

describe('domainEventToolkit — estrutura', () => {
  it('possui arquivos shared obrigatórios', () => {
    const files = readdirSync(SHARED_DIR).filter((f) => f.endsWith('.ts')).sort();
    for (const file of EXPECTED_SHARED) {
      expect(files).toContain(file);
    }
  });
});

describe('domainEventToolkit — Flags e Production Guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('contrato vitest mantém DOMAIN_EVENTS OFF', () => {
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENTS).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_AUDIT).toBe('false');
    expect(DOMAIN_EVENT_TEST_FLAG_CONTRACT.VITE_DOMAIN_EVENT_OBSERVABILITY).toBe('false');
  });

  it('defaults OFF — publisher desabilitado', () => {
    expect(canPublishDomainEvents()).toBe(false);
    expect(getDomainEventFlags().DOMAIN_EVENTS).toBe(false);
  });

  it('PROD trava flags', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED });
      expect(flags.DOMAIN_EVENTS).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd === true ? true : false;
    }
  });

  it('host production bloqueia', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    expect(getDomainEventFlags({ overrides: DOMAIN_EVENTS_FLAGS_RESOLVED }).DOMAIN_EVENTS).toBe(false);
  });

  it('production locked keys', () => {
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('DOMAIN_EVENTS');
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('DOMAIN_EVENT_AUDIT');
  });
});

describe('domainEventToolkit — Validator', () => {
  it('aceita evento registrado completo', () => {
    const event = buildDomainEvent({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-1',
      tenantId: TENANT,
    });
    expect(validateDomainEvent(event).valid).toBe(true);
  });

  it('rejeita eventType não registrado (default toolkit)', () => {
    const event = buildDomainEvent({
      eventType: 'CUSTOM_X',
      aggregateId: 'x',
      tenantId: TENANT,
      aggregateType: 'system',
      source: 'system',
    });
    const result = validateDomainEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /registry/i.test(e))).toBe(true);
  });

  it('assertDomainEventValid lança DomainEventContractError', () => {
    expect(() => assertDomainEventValid(null)).toThrow(DomainEventContractError);
  });

  it('valida correlationId / version / aggregateId', () => {
    const result = validateDomainEvent({
      eventId: 'e1',
      eventType: 'LEAD_CREATED',
      aggregateType: 'lead',
      aggregateId: '',
      tenantId: TENANT,
      userId: null,
      timestamp: new Date().toISOString(),
      payload: {},
      metadata: {},
      version: 0,
      source: 'crm',
      correlationId: '',
      causationId: null,
    });
    expect(result.valid).toBe(false);
  });
});

describe('domainEventToolkit — Serializer', () => {
  it('round-trip serialize/deserialize', () => {
    const event = buildDomainEvent({
      eventType: 'PAYMENT_RECEIVED',
      aggregateId: 'pay-1',
      tenantId: TENANT,
      payload: { amount: 100 },
    });
    const raw = serializeDomainEvent(event);
    const restored = deserializeDomainEvent(raw);
    expect(restored.eventId).toBe(event.eventId);
    expect(restored.payload.amount).toBe(100);
    expect(restored.eventType).toBe('PAYMENT_RECEIVED');
  });

  it('domainEventToPlainObject', () => {
    const event = buildDomainEvent({
      eventType: 'TASK_CREATED',
      aggregateId: 't1',
      tenantId: TENANT,
    });
    const plain = domainEventToPlainObject(event);
    expect(plain.tenantId).toBe(TENANT);
    expect(plain.eventType).toBe('TASK_CREATED');
  });

  it('JSON inválido lança DomainEventSerializerError', () => {
    expect(() => deserializeDomainEvent('{')).toThrow(DomainEventSerializerError);
  });
});

describe('domainEventToolkit — Correlation', () => {
  it('createDomainEventCorrelationId com seed', () => {
    expect(createDomainEventCorrelationId('seed-1')).toBe('seed-1');
    expect(createDomainEventCorrelationId()).toMatch(/^de-corr-/);
  });

  it('propagateDomainEventCorrelation usa parent', () => {
    const parent = buildDomainEvent({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-p',
      tenantId: TENANT,
      correlationId: 'corr-parent',
    });
    const ctx = propagateDomainEventCorrelation(parent);
    expect(ctx.correlationId).toBe('corr-parent');
    expect(ctx.causationId).toBe(parent.eventId);
  });

  it('withDomainEventCorrelation anexa metadata', () => {
    const event = buildDomainEvent({
      eventType: 'LEAD_UPDATED',
      aggregateId: 'lead-u',
      tenantId: TENANT,
    });
    const ctx = resolveDomainEventCorrelation({ seed: 'c1' });
    const next = withDomainEventCorrelation(event, ctx);
    expect(next.correlationId).toBe('c1');
    expect(next.metadata.correlationPropagatedAt).toBeTruthy();
  });
});

describe('domainEventToolkit — Retry', () => {
  it('computeDomainEventRetryDelay exponencial', () => {
    expect(computeDomainEventRetryDelay(0)).toBe(DOMAIN_EVENT_RETRY_POLICY_DEFAULT.baseDelayMs);
    expect(computeDomainEventRetryDelay(1)).toBe(200);
    expect(computeDomainEventRetryDelay(10)).toBe(DOMAIN_EVENT_RETRY_POLICY_DEFAULT.maxDelayMs);
  });

  it('evaluateDomainEventRetry marca exhausted', () => {
    const state = evaluateDomainEventRetry(3, new Error('fail'));
    expect(state.exhausted).toBe(true);
    expect(state.lastError).toBe('fail');
  });

  it('runWithDomainEventRetryContract não re-tenta de fato', async () => {
    let calls = 0;
    const { result, state } = await runWithDomainEventRetryContract(async () => {
      calls += 1;
      throw new Error('boom');
    });
    expect(calls).toBe(1);
    expect(result).toBeNull();
    expect(state.attempt).toBe(1);
  });
});

describe('domainEventToolkit — Deduplication', () => {
  beforeEach(() => {
    __clearDomainEventDedupForTest();
  });

  it('consumeDomainEventDedup marca e detecta duplicata', () => {
    const event = buildDomainEvent({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-d',
      tenantId: TENANT,
      eventId: 'fixed-id-1',
    });
    expect(consumeDomainEventDedup(event)).toBe(false);
    expect(consumeDomainEventDedup(event)).toBe(true);
    expect(shouldSkipDuplicateDomainEvent(buildDomainEventDedupKey(event))).toBe(true);
  });

  it('markDomainEventDeduplicated', () => {
    const key = 'LEAD_CREATED:t:a:e';
    markDomainEventDeduplicated(key);
    expect(shouldSkipDuplicateDomainEvent(key)).toBe(true);
  });
});

describe('domainEventToolkit — Audit Hooks', () => {
  beforeEach(() => {
    __clearDomainEventAuditForTest();
    __clearDomainEventAuditHooksForTest();
  });

  afterEach(() => {
    __clearDomainEventAuditHooksForTest();
    __clearDomainEventAuditForTest();
  });

  it('registerDomainEventAuditHook recebe emit', () => {
    const seen = [];
    registerDomainEventAuditHook((record) => {
      seen.push(record.status);
    });
    emitDomainEventAuditHook({
      eventType: 'USER_CREATED',
      tenantId: TENANT,
      status: 'prepared',
    });
    expect(seen).toEqual(['prepared']);
    expect(getDomainEventAuditLog()).toHaveLength(1);
  });
});

describe('domainEventToolkit — Subscriber Base', () => {
  beforeEach(() => {
    __clearDomainEventBusForTest();
  });

  afterEach(() => {
    __clearDomainEventBusForTest();
  });

  it('registerDomainEventSubscriber + unsubscribe', async () => {
    const handler = vi.fn();
    const handle = registerDomainEventSubscriber({
      eventTypes: ['LEAD_CREATED'],
      handler,
    });
    const { publishDomainEvent } = await import('../domain-events/domainEventBus.ts');
    await publishDomainEvent(buildDomainEvent({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-s',
      tenantId: TENANT,
    }));
    expect(handler).toHaveBeenCalledTimes(1);
    handle.unsubscribe();
  });

  it('DomainEventSubscriberBase start/stop', async () => {
    const received = [];
    class TestSub extends DomainEventSubscriberBase {
      eventTypes() {
        return ['TASK_CREATED'];
      }
      handleEvent(event) {
        received.push(event.eventType);
      }
    }
    const sub = new TestSub();
    sub.start();
    const { publishDomainEvent } = await import('../domain-events/domainEventBus.ts');
    await publishDomainEvent(buildDomainEvent({
      eventType: 'TASK_CREATED',
      aggregateId: 'task-s',
      tenantId: TENANT,
    }));
    expect(received).toEqual(['TASK_CREATED']);
    sub.stop();
  });
});

describe('domainEventToolkit — Publisher', () => {
  beforeEach(() => {
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
    __clearDomainEventAuditHooksForTest();
    __clearDomainEventDedupForTest();
  });

  afterEach(() => {
    __clearDomainEventBusForTest();
    __clearDomainEventAuditForTest();
    __clearDomainEventAuditHooksForTest();
    __clearDomainEventDedupForTest();
  });

  it('flags OFF — no-op skipped', async () => {
    const handler = vi.fn();
    subscribeDomainEvent('LEAD_CREATED', handler);
    const result = await publishDomainEventViaToolkit({
      eventType: 'LEAD_CREATED',
      aggregateId: 'lead-off',
      tenantId: TENANT,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('DOMAIN_EVENTS=false');
    expect(handler).not.toHaveBeenCalled();
    expect(getPublishedDomainEventsBuffer()).toHaveLength(0);
  });

  it('flags ON — publica no bus local', async () => {
    const handler = vi.fn();
    subscribeDomainEvent('LEAD_CREATED', handler);
    const result = await publishDomainEventViaToolkit(
      {
        eventType: 'LEAD_CREATED',
        aggregateId: 'lead-on',
        tenantId: TENANT,
        payload: { name: 'X' },
      },
      { flagsInput: { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED } },
    );
    expect(result.accepted).toBe(true);
    expect(result.eventId).toBeTruthy();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejeita tipo não registrado', async () => {
    const result = await publishDomainEventViaToolkit(
      {
        eventType: 'NOT_IN_REGISTRY',
        aggregateId: 'x',
        tenantId: TENANT,
        aggregateType: 'system',
        source: 'system',
      },
      { flagsInput: { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED } },
    );
    expect(result.accepted).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.reason).toMatch(/registry/i);
  });

  it('dedup opt-in pula segunda publicação', async () => {
    const flags = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
    const input = {
      eventType: 'LEAD_MOVED',
      aggregateId: 'lead-dedup',
      tenantId: TENANT,
      eventId: 'evt-dedup-fixed',
    };
    const first = await publishDomainEventViaToolkit(input, { flagsInput: flags, enableDedup: true });
    expect(first.accepted).toBe(true);
    const second = await publishDomainEventViaToolkit(input, { flagsInput: flags, enableDedup: true });
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('deduplicated');
  });

  it('audit hooks notificados no publish', async () => {
    const statuses = [];
    registerDomainEventAuditHook((r) => statuses.push(r.status));
    await publishDomainEventViaToolkit(
      {
        eventType: 'PAYMENT_RECEIVED',
        aggregateId: 'pay-h',
        tenantId: TENANT,
      },
      { flagsInput: { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED } },
    );
    expect(statuses).toContain('prepared');
    expect(statuses).toContain('published');
  });
});
