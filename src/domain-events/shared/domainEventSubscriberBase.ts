/**
 * @module domain-events/shared/domainEventSubscriberBase
 * @description Base para futuros subscribers — Phase 7.0.
 * Nenhum domínio registra subscribers nesta phase.
 */

import {
  subscribeAllDomainEvents,
  subscribeDomainEvent,
  type DomainEventHandler,
} from '../domainEventBus.js';
import type { DomainEvent, DomainEventTypeName } from '../domainEventTypes.js';

export interface DomainEventSubscriberRegistration {
  eventTypes: readonly (DomainEventTypeName | string)[];
  handler: DomainEventHandler;
  /** Se true, escuta todos os eventos (ignora eventTypes). */
  wildcard?: boolean;
}

export interface DomainEventSubscriberHandle {
  unsubscribe: () => void;
}

/**
 * Registra handler tipado — infraestrutura apenas.
 * Domínios NÃO devem chamar isto até Phase 7.x de adoção/consumo.
 */
export function registerDomainEventSubscriber(
  registration: DomainEventSubscriberRegistration,
): DomainEventSubscriberHandle {
  const unsubs: Array<() => void> = [];

  if (registration.wildcard) {
    unsubs.push(subscribeAllDomainEvents(registration.handler));
  } else {
    for (const eventType of registration.eventTypes) {
      unsubs.push(subscribeDomainEvent(String(eventType), registration.handler));
    }
  }

  return {
    unsubscribe: () => {
      for (const unsub of unsubs) unsub();
    },
  };
}

/**
 * Classe base opcional para subscribers futuros.
 * Sem side-effects até `start()` — e start não é chamado por domínios nesta phase.
 */
export abstract class DomainEventSubscriberBase {
  private handle: DomainEventSubscriberHandle | null = null;

  protected abstract eventTypes(): readonly (DomainEventTypeName | string)[];

  protected abstract handleEvent(event: DomainEvent): void | Promise<void>;

  protected wildcard(): boolean {
    return false;
  }

  start(): void {
    if (this.handle) return;
    this.handle = registerDomainEventSubscriber({
      eventTypes: this.eventTypes(),
      wildcard: this.wildcard(),
      handler: (event) => this.handleEvent(event),
    });
  }

  stop(): void {
    this.handle?.unsubscribe();
    this.handle = null;
  }
}
