/**
 * @module domain-events/consumers/attachEventAuditProjection
 * @description Opt-in wiring do consumer piloto — Phase 7.7.
 *
 * NÃO auto-wire no boot.
 * NÃO modifica publishers de domínio.
 * Quando flags ON: registra consumer + subscribe no Event Bus → dispatch explícito.
 */

import { subscribeAllDomainEvents } from '../domainEventBus.js';
import {
  isDomainEventProjectionEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import type { DomainEvent } from '../domainEventTypes.js';
import {
  getDomainEventConsumer,
  registerDomainEventConsumer,
  unregisterDomainEventConsumer,
} from './domainEventConsumerRegistry.js';
import { dispatchDomainEventToConsumers } from './domainEventConsumerDispatcher.js';
import {
  createEventAuditProjectionConsumerDefinition,
  EVENT_AUDIT_PROJECTION_CONSUMER_ID,
} from './eventAuditProjectionConsumer.js';

let detachBus: (() => void) | null = null;
let detachRegistry: (() => void) | null = null;
let attachedFlags: DomainEventFlagsInput = {};

/**
 * Anexa o EventAuditProjectionConsumer de forma opt-in.
 * No-op se DOMAIN_EVENT_PROJECTION estiver off.
 */
export function attachEventAuditProjection(
  flagsInput: DomainEventFlagsInput = {},
): () => void {
  detachEventAuditProjection();
  attachedFlags = flagsInput;

  if (!isDomainEventProjectionEnabled(flagsInput)) {
    return () => {};
  }

  if (!getDomainEventConsumer(EVENT_AUDIT_PROJECTION_CONSUMER_ID)) {
    detachRegistry = registerDomainEventConsumer(
      createEventAuditProjectionConsumerDefinition(),
    );
  }

  detachBus = subscribeAllDomainEvents(async (event: DomainEvent) => {
    try {
      await dispatchDomainEventToConsumers(event, attachedFlags);
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[EVENT_AUDIT_PROJECTION_DISPATCH_ERROR]', err);
      }
    }
  });

  return () => {
    detachEventAuditProjection();
  };
}

export function detachEventAuditProjection(): void {
  if (detachBus) {
    detachBus();
    detachBus = null;
  }
  if (detachRegistry) {
    detachRegistry();
    detachRegistry = null;
  } else {
    unregisterDomainEventConsumer(EVENT_AUDIT_PROJECTION_CONSUMER_ID);
  }
  attachedFlags = {};
}

export function isEventAuditProjectionAttached(): boolean {
  return detachBus != null;
}
