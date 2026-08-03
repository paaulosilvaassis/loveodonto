/**
 * @module domain-events/consumers/domainEventConsumerDeadLetter
 * @description Dead-letter in-memory — Phase 7.6.
 * Sem persistência, fila externa, HTTP ou reprocessamento real.
 */

import type { DomainEvent } from '../domainEventTypes.js';

export interface DomainEventConsumerDeadLetterEntry {
  eventId: string;
  eventType: string;
  consumerId: string;
  attempts: number;
  lastError: string;
  failedAt: string;
  correlationId: string | null;
  causationId: string | null;
  tenantId: string;
  reason: string;
  /** Snapshot mínimo — sem payload sensível. */
  eventSnapshot: {
    eventId: string;
    eventType: string;
    aggregateId: string;
    aggregateType: string;
    tenantId: string;
  };
}

const deadLetters: DomainEventConsumerDeadLetterEntry[] = [];
const MAX_DEAD_LETTERS = 200;

export function recordDomainEventConsumerDeadLetter(input: {
  event: DomainEvent;
  consumerId: string;
  attempts: number;
  lastError: unknown;
  reason: string;
}): DomainEventConsumerDeadLetterEntry {
  const entry: DomainEventConsumerDeadLetterEntry = {
    eventId: String(input.event.eventId || ''),
    eventType: String(input.event.eventType || ''),
    consumerId: String(input.consumerId || ''),
    attempts: Math.max(0, input.attempts),
    lastError: input.lastError instanceof Error
      ? input.lastError.message
      : String(input.lastError || 'unknown'),
    failedAt: new Date().toISOString(),
    correlationId: input.event.correlationId ?? null,
    causationId: input.event.causationId ?? null,
    tenantId: String(input.event.tenantId || ''),
    reason: String(input.reason || 'exhausted'),
    eventSnapshot: {
      eventId: String(input.event.eventId || ''),
      eventType: String(input.event.eventType || ''),
      aggregateId: String(input.event.aggregateId || ''),
      aggregateType: String(input.event.aggregateType || ''),
      tenantId: String(input.event.tenantId || ''),
    },
  };
  deadLetters.push(entry);
  if (deadLetters.length > MAX_DEAD_LETTERS) deadLetters.shift();
  return entry;
}

export function getDomainEventConsumerDeadLetters(): DomainEventConsumerDeadLetterEntry[] {
  return deadLetters.map((e) => ({ ...e, eventSnapshot: { ...e.eventSnapshot } }));
}

export function getDomainEventConsumerDeadLetterCount(): number {
  return deadLetters.length;
}

export function __clearDomainEventConsumerDeadLetterForTest(): void {
  deadLetters.length = 0;
}
