/**
 * @module domain-events/domainEventBus
 * @description Event Bus local in-memory — Phase 6.9.
 *
 * Sem fila, sem mensageria, sem websocket, sem consumidores de domínio.
 * Apenas publicação interna preparada (handlers registrados em testes / foundation).
 */

import type { DomainEvent, DomainEventPublishResult } from './domainEventTypes.js';
import { cloneDomainEvent } from './domainEventMapper.js';
import { assertDomainEventContract } from './domainEventContracts.js';

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

const handlers = new Map<string, Set<DomainEventHandler>>();
const wildcardHandlers = new Set<DomainEventHandler>();
const publishedBuffer: DomainEvent[] = [];
const MAX_BUFFER = 100;

/**
 * Registra handler para um eventType específico.
 * Foundation only — nenhum domínio registra nesta phase.
 */
export function subscribeDomainEvent(
  eventType: string,
  handler: DomainEventHandler,
): () => void {
  const key = String(eventType || '').trim();
  if (!key) return () => {};
  if (!handlers.has(key)) handlers.set(key, new Set());
  handlers.get(key)!.add(handler);
  return () => {
    handlers.get(key)?.delete(handler);
  };
}

/** Handler para qualquer evento (debug/test). */
export function subscribeAllDomainEvents(handler: DomainEventHandler): () => void {
  wildcardHandlers.add(handler);
  return () => {
    wildcardHandlers.delete(handler);
  };
}

/**
 * Publica evento no bus local.
 * Não é chamado por domínios nesta phase — apenas infraestrutura.
 */
export async function publishDomainEvent(event: DomainEvent): Promise<DomainEventPublishResult> {
  assertDomainEventContract(event, { requireRegisteredType: false });
  const cloned = cloneDomainEvent(event);

  publishedBuffer.push(cloned);
  if (publishedBuffer.length > MAX_BUFFER) publishedBuffer.shift();

  const typed = handlers.get(cloned.eventType);
  const targets = [
    ...(typed ? Array.from(typed) : []),
    ...Array.from(wildcardHandlers),
  ];

  for (const handler of targets) {
    await handler(cloned);
  }

  return {
    accepted: true,
    skipped: false,
    eventId: cloned.eventId,
  };
}

export function getPublishedDomainEventsBuffer(): DomainEvent[] {
  return publishedBuffer.map((event) => cloneDomainEvent(event));
}

export function __clearDomainEventBusForTest(): void {
  handlers.clear();
  wildcardHandlers.clear();
  publishedBuffer.length = 0;
}
