/**
 * @module domain-events/consumers/domainEventConsumerRegistry
 * @description Registry oficial de consumers — Phase 7.6.
 * Vazio por padrão. Sem handlers de negócio. Sem auto-start.
 */

import { assertDomainEventConsumerDefinition } from './domainEventConsumerContracts.js';
import type { DomainEventConsumerDefinition } from './domainEventConsumerTypes.js';

const consumers = new Map<string, DomainEventConsumerDefinition>();

export class DomainEventConsumerRegistryError extends Error {
  readonly code = 'DOMAIN_EVENT_CONSUMER_REGISTRY_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'DomainEventConsumerRegistryError';
  }
}

/**
 * Registra consumer estrutural (testes / foundation).
 * Não executa no boot. Não registra handlers de negócio nesta phase.
 */
export function registerDomainEventConsumer(
  definition: DomainEventConsumerDefinition,
): () => void {
  assertDomainEventConsumerDefinition(definition);
  const id = String(definition.consumerId).trim();
  if (consumers.has(id)) {
    throw new DomainEventConsumerRegistryError(`consumerId duplicado: ${id}`);
  }
  consumers.set(id, {
    ...definition,
    consumerId: id,
    eventTypes: [...definition.eventTypes],
  });
  return () => {
    consumers.delete(id);
  };
}

export function unregisterDomainEventConsumer(consumerId: string): boolean {
  return consumers.delete(String(consumerId || '').trim());
}

export function getDomainEventConsumer(consumerId: string): DomainEventConsumerDefinition | null {
  return consumers.get(String(consumerId || '').trim()) ?? null;
}

export function listDomainEventConsumers(): DomainEventConsumerDefinition[] {
  return [...consumers.values()]
    .map((c) => ({ ...c, eventTypes: [...c.eventTypes] }))
    .sort((a, b) => b.priority - a.priority || a.consumerId.localeCompare(b.consumerId));
}

export function listDomainEventConsumersForEventType(
  eventType: string,
): DomainEventConsumerDefinition[] {
  const key = String(eventType || '').trim();
  return listDomainEventConsumers().filter(
    (c) => c.enabled && c.eventTypes.includes(key),
  );
}

export function getRegisteredDomainEventConsumerCount(): number {
  return consumers.size;
}

export function __clearDomainEventConsumerRegistryForTest(): void {
  consumers.clear();
}
