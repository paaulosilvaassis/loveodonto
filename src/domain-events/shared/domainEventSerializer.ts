/**
 * @module domain-events/shared/domainEventSerializer
 * @description Serialização oficial de Domain Events — Phase 7.0.
 */

import { assertDomainEventValid } from './domainEventValidator.js';
import type { DomainEvent } from '../domainEventTypes.js';

export interface SerializedDomainEvent {
  format: 'love-odonto-domain-event';
  formatVersion: 1;
  event: DomainEvent;
}

export class DomainEventSerializerError extends Error {
  readonly code = 'DOMAIN_EVENT_SERIALIZER_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'DomainEventSerializerError';
  }
}

/** Serializa DomainEvent para envelope JSON-compatível. */
export function serializeDomainEvent(event: DomainEvent): string {
  assertDomainEventValid(event, { requireRegisteredType: false });
  const envelope: SerializedDomainEvent = {
    format: 'love-odonto-domain-event',
    formatVersion: 1,
    event: {
      ...event,
      payload: { ...event.payload },
      metadata: { ...event.metadata },
    },
  };
  return JSON.stringify(envelope);
}

/** Deserializa envelope → DomainEvent (valida shape). */
export function deserializeDomainEvent(raw: string): DomainEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DomainEventSerializerError('JSON inválido.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new DomainEventSerializerError('Envelope inválido.');
  }

  const envelope = parsed as Partial<SerializedDomainEvent>;
  if (envelope.format !== 'love-odonto-domain-event') {
    throw new DomainEventSerializerError('format desconhecido.');
  }
  if (envelope.formatVersion !== 1) {
    throw new DomainEventSerializerError(`formatVersion não suportada: ${envelope.formatVersion}`);
  }
  if (!envelope.event || typeof envelope.event !== 'object') {
    throw new DomainEventSerializerError('event ausente no envelope.');
  }

  const event = envelope.event as DomainEvent;
  assertDomainEventValid(event, { requireRegisteredType: false });
  return {
    ...event,
    payload: { ...(event.payload || {}) },
    metadata: { ...(event.metadata || {}) },
  };
}

/** Converte DomainEvent → plain object estável (sem envelope). */
export function domainEventToPlainObject(event: DomainEvent): Record<string, unknown> {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    tenantId: event.tenantId,
    userId: event.userId,
    timestamp: event.timestamp,
    payload: { ...event.payload },
    metadata: { ...event.metadata },
    version: event.version,
    source: event.source,
    correlationId: event.correlationId,
    causationId: event.causationId,
  };
}
