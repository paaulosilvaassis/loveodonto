/**
 * @module domain-events/domainEventMapper
 * @description Factory/normalização de DomainEvent — Phase 6.9.
 * Sem side-effects de publicação.
 */

import { getDomainEventRegistryEntry } from './domainEventRegistry.js';
import { assertDomainEventContract } from './domainEventContracts.js';
import type {
  DomainEvent,
  DomainEventAggregateType,
  DomainEventSource,
  DomainEventTypeName,
} from './domainEventTypes.js';
import { DOMAIN_EVENT_MODEL_VERSION } from './domainEventTypes.js';

export interface BuildDomainEventInput {
  eventType: DomainEventTypeName | string;
  aggregateId: string;
  tenantId: string;
  userId?: string | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  source?: DomainEventSource | string;
  aggregateType?: DomainEventAggregateType | string;
  version?: number;
  correlationId?: string;
  causationId?: string | null;
  eventId?: string;
  timestamp?: string;
}

function createEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `de-${crypto.randomUUID()}`;
  }
  return `de-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constrói DomainEvent normalizado a partir do input + registry (quando conhecido).
 */
export function buildDomainEvent(input: BuildDomainEventInput): DomainEvent {
  const registry = getDomainEventRegistryEntry(input.eventType);
  const eventId = String(input.eventId || createEventId()).trim();
  const event: DomainEvent = {
    eventId,
    eventType: String(input.eventType || '').trim(),
    aggregateType: String(
      input.aggregateType || registry?.aggregate || 'system',
    ).trim(),
    aggregateId: String(input.aggregateId || '').trim(),
    tenantId: String(input.tenantId || '').trim(),
    userId: input.userId == null ? null : String(input.userId).trim() || null,
    timestamp: String(input.timestamp || new Date().toISOString()).trim(),
    payload: input.payload && typeof input.payload === 'object' ? { ...input.payload } : {},
    metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {},
    version: input.version ?? registry?.version ?? DOMAIN_EVENT_MODEL_VERSION,
    source: String(input.source || registry?.expectedOrigin || 'unknown').trim(),
    correlationId: String(input.correlationId || eventId).trim(),
    causationId: input.causationId == null ? null : String(input.causationId).trim() || null,
  };

  assertDomainEventContract(event);
  return event;
}

/** Clona evento sem mutar o original. */
export function cloneDomainEvent(event: DomainEvent): DomainEvent {
  return {
    ...event,
    payload: { ...event.payload },
    metadata: { ...event.metadata },
  };
}

/** Extrai campos canônicos para compare/audit. */
export function mapDomainEventToAuditSnapshot(event: DomainEvent): Record<string, unknown> {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    tenantId: event.tenantId,
    userId: event.userId,
    timestamp: event.timestamp,
    version: event.version,
    source: event.source,
    correlationId: event.correlationId,
    causationId: event.causationId,
  };
}
