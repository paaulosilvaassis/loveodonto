/**
 * @module domain-events/consumers/domainEventConsumerDispatcher
 * @description Dispatcher explícito de consumers — Phase 7.6.
 *
 * NÃO auto-wire no Event Bus.
 * NÃO modificar publishers.
 * Despacho apenas explícito (testes / futuro opt-in).
 */

import {
  isDomainEventConsumersEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import type { DomainEvent } from '../domainEventTypes.js';
import {
  getRegisteredDomainEventConsumerCount,
  listDomainEventConsumersForEventType,
} from './domainEventConsumerRegistry.js';
import { runDomainEventConsumer } from './domainEventConsumerRunner.js';
import { setActiveConsumersMetric } from './domainEventConsumerMetrics.js';
import type { DomainEventConsumerRunResult } from './domainEventConsumerTypes.js';

export interface DomainEventConsumerDispatchResult {
  skipped: boolean;
  reason?: string;
  eventId: string;
  eventType: string;
  results: DomainEventConsumerRunResult[];
}

/**
 * Despacha consumers registrados para um evento.
 * Isolamento: falha de um consumer não impede os demais.
 * Não altera retorno do publisher (API separada).
 */
export async function dispatchDomainEventToConsumers(
  event: DomainEvent,
  flagsInput: DomainEventFlagsInput = {},
): Promise<DomainEventConsumerDispatchResult> {
  setActiveConsumersMetric(getRegisteredDomainEventConsumerCount());

  if (!isDomainEventConsumersEnabled(flagsInput)) {
    return {
      skipped: true,
      reason: 'DOMAIN_EVENT_CONSUMERS=false',
      eventId: String(event?.eventId || ''),
      eventType: String(event?.eventType || ''),
      results: [],
    };
  }

  const consumers = listDomainEventConsumersForEventType(String(event.eventType || ''));
  if (consumers.length === 0) {
    return {
      skipped: true,
      reason: 'no matching consumers',
      eventId: String(event.eventId || ''),
      eventType: String(event.eventType || ''),
      results: [],
    };
  }

  const results: DomainEventConsumerRunResult[] = [];
  for (const consumer of consumers) {
    try {
      // eslint-disable-next-line no-await-in-loop -- isolamento sequencial por prioridade
      const result = await runDomainEventConsumer({
        consumer,
        event,
        flagsInput,
      });
      results.push(result);
    } catch (err) {
      results.push({
        status: 'failed',
        consumerId: consumer.consumerId,
        eventId: String(event.eventId || ''),
        eventType: String(event.eventType || ''),
        attempt: 0,
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
        reason: 'dispatcher isolation catch',
      });
    }
  }

  return {
    skipped: false,
    eventId: String(event.eventId || ''),
    eventType: String(event.eventType || ''),
    results,
  };
}

/**
 * Garantia estrutural: esta foundation NÃO se conecta ao Event Bus.
 * Testes assertam ausência de subscribe* neste módulo.
 */
export const DOMAIN_EVENT_CONSUMER_AUTO_WIRING = false as const;
