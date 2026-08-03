/**
 * @module domain-events/consumers/domainEventConsumerRunner
 * @description Runner isolado de consumers — Phase 7.6.
 * Sem efeitos de negócio. Timeout não afeta publishers.
 */

import {
  isDomainEventConsumerAuditEnabled,
  isDomainEventConsumerRetryEnabled,
  isDomainEventConsumersEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import type { DomainEvent } from '../domainEventTypes.js';
import { assertDomainEventConsumerDefinition } from './domainEventConsumerContracts.js';
import { buildDomainEventConsumerContext } from './domainEventConsumerContext.js';
import { recordDomainEventConsumerAudit } from './domainEventConsumerAudit.js';
import { recordDomainEventConsumerDeadLetter } from './domainEventConsumerDeadLetter.js';
import { evaluateDomainEventConsumerRetry } from './domainEventConsumerRetry.js';
import type {
  DomainEventConsumerDefinition,
  DomainEventConsumerRunResult,
} from './domainEventConsumerTypes.js';
import {
  recordConsumerDispatchMetric,
  recordConsumerDuplicateMetric,
  recordConsumerFailedMetric,
  recordConsumerRetryMetric,
  recordConsumerSkippedMetric,
  recordConsumerSucceededMetric,
  recordConsumerDeadLetterMetric,
} from './domainEventConsumerMetrics.js';

const idempotencyKeys = new Set<string>();

export function buildDomainEventConsumerIdempotencyKey(
  eventId: string,
  consumerId: string,
  version: number,
): string {
  return `${String(eventId)}::${String(consumerId)}::v${Number(version) || 1}`;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('TIMEOUT: aborted'));
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error('TIMEOUT: consumer exceeded timeoutMs'));
    }, timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('TIMEOUT: aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Executa um consumer estrutural isolado.
 */
export async function runDomainEventConsumer(input: {
  consumer: DomainEventConsumerDefinition;
  event: DomainEvent;
  attempt?: number;
  flagsInput?: DomainEventFlagsInput;
}): Promise<DomainEventConsumerRunResult> {
  const flagsInput = input.flagsInput ?? {};
  const attempt = Math.max(0, input.attempt ?? 0);
  const started = Date.now();
  const startedAt = new Date().toISOString();

  recordConsumerDispatchMetric();

  if (!isDomainEventConsumersEnabled(flagsInput)) {
    recordConsumerSkippedMetric();
    return {
      status: 'skipped',
      consumerId: input.consumer?.consumerId || '',
      eventId: String(input.event.eventId || ''),
      eventType: String(input.event.eventType || ''),
      attempt,
      durationMs: 0,
      error: null,
      reason: 'DOMAIN_EVENT_CONSUMERS=false',
    };
  }

  try {
    assertDomainEventConsumerDefinition(input.consumer);
  } catch (err) {
    recordConsumerFailedMetric();
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'rejected',
      consumerId: String(input.consumer?.consumerId || ''),
      eventId: String(input.event.eventId || ''),
      eventType: String(input.event.eventType || ''),
      attempt,
      durationMs: Date.now() - started,
      error: message,
      reason: 'contract invalid',
    };
  }

  const consumer = input.consumer;
  if (!consumer.enabled) {
    recordConsumerSkippedMetric();
    return {
      status: 'skipped',
      consumerId: consumer.consumerId,
      eventId: String(input.event.eventId || ''),
      eventType: String(input.event.eventType || ''),
      attempt,
      durationMs: 0,
      error: null,
      reason: 'consumer disabled',
    };
  }

  const idemKey = buildDomainEventConsumerIdempotencyKey(
    String(input.event.eventId || ''),
    consumer.consumerId,
    consumer.version,
  );
  if (idempotencyKeys.has(idemKey)) {
    recordConsumerDuplicateMetric();
    const result: DomainEventConsumerRunResult = {
      status: 'skipped',
      consumerId: consumer.consumerId,
      eventId: String(input.event.eventId || ''),
      eventType: String(input.event.eventType || ''),
      attempt,
      durationMs: Date.now() - started,
      error: null,
      reason: 'duplicate consumer execution',
    };
    maybeAudit(result, input.event, startedAt, flagsInput);
    return result;
  }

  const context = buildDomainEventConsumerContext({
    consumer,
    event: input.event,
    attempt,
  });

  const controller = new AbortController();
  try {
    await withTimeout(
      Promise.resolve(
        consumer.handle({
          event: input.event,
          consumerContext: context,
          attempt,
          correlationId: context.correlationId,
          causationId: context.causationId,
          tenantId: context.tenantId,
          abortSignal: controller.signal,
        }),
      ),
      consumer.timeoutMs,
      controller.signal,
    );
    idempotencyKeys.add(idemKey);
    recordConsumerSucceededMetric();
    const result: DomainEventConsumerRunResult = {
      status: 'succeeded',
      consumerId: consumer.consumerId,
      eventId: context.eventId,
      eventType: context.eventType,
      attempt,
      durationMs: Date.now() - started,
      error: null,
    };
    maybeAudit(result, input.event, startedAt, flagsInput);
    return result;
  } catch (err) {
    controller.abort();
    const message = err instanceof Error ? err.message : String(err);
    const retryEval = evaluateDomainEventConsumerRetry({
      attempt,
      maxAttempts: consumer.maxAttempts,
      error: err,
      retryEnabled: isDomainEventConsumerRetryEnabled(flagsInput),
    });

    if (retryEval.shouldRetry) {
      recordConsumerRetryMetric();
      recordConsumerFailedMetric();
      const result: DomainEventConsumerRunResult = {
        status: 'retry_scheduled',
        consumerId: consumer.consumerId,
        eventId: context.eventId,
        eventType: context.eventType,
        attempt,
        durationMs: Date.now() - started,
        error: message,
        reason: retryEval.reason,
        nextAttemptAt: retryEval.nextAttemptAt,
      };
      maybeAudit(result, input.event, startedAt, flagsInput);
      return result;
    }

    if (retryEval.exhausted) {
      recordDomainEventConsumerDeadLetter({
        event: input.event,
        consumerId: consumer.consumerId,
        attempts: attempt + 1,
        lastError: err,
        reason: retryEval.reason,
      });
      recordConsumerDeadLetterMetric();
      recordConsumerFailedMetric();
      const result: DomainEventConsumerRunResult = {
        status: 'dead_lettered',
        consumerId: consumer.consumerId,
        eventId: context.eventId,
        eventType: context.eventType,
        attempt,
        durationMs: Date.now() - started,
        error: message,
        reason: retryEval.reason,
      };
      maybeAudit(result, input.event, startedAt, flagsInput);
      return result;
    }

    recordConsumerFailedMetric();
    const result: DomainEventConsumerRunResult = {
      status: 'failed',
      consumerId: consumer.consumerId,
      eventId: context.eventId,
      eventType: context.eventType,
      attempt,
      durationMs: Date.now() - started,
      error: message,
      reason: retryEval.reason,
    };
    maybeAudit(result, input.event, startedAt, flagsInput);
    return result;
  }
}

function maybeAudit(
  result: DomainEventConsumerRunResult,
  event: DomainEvent,
  startedAt: string,
  flagsInput: DomainEventFlagsInput,
): void {
  if (!isDomainEventConsumerAuditEnabled(flagsInput)) return;
  recordDomainEventConsumerAudit({
    consumerId: result.consumerId,
    eventId: result.eventId,
    eventType: result.eventType,
    status: result.status,
    attempt: result.attempt,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: result.durationMs,
    error: result.error,
    correlationId: event.correlationId ?? null,
    causationId: event.causationId ?? null,
    tenantId: String(event.tenantId || ''),
    reason: result.reason,
  });
}

export function __clearDomainEventConsumerIdempotencyForTest(): void {
  idempotencyKeys.clear();
}
