/**
 * @module domain-events/shared/domainEventDeduplication
 * @description Deduplicação in-memory de Domain Events — Phase 7.0.
 * Sem persistência. Sem ativação automática no publisher (opt-in).
 */

import type { DomainEvent } from '../domainEventTypes.js';

const TTL_MS = 5 * 60 * 1000;
const seenKeys = new Map<string, number>();

export function buildDomainEventDedupKey(event: Pick<DomainEvent, 'eventType' | 'tenantId' | 'aggregateId' | 'eventId'>): string {
  return [
    String(event.eventType || '').trim(),
    String(event.tenantId || '').trim(),
    String(event.aggregateId || '').trim(),
    String(event.eventId || '').trim(),
  ].join(':');
}

export function buildDomainEventDedupKeyFromParts(
  eventType: string,
  tenantId: string,
  aggregateId: string,
  eventId: string,
): string {
  return buildDomainEventDedupKey({ eventType, tenantId, aggregateId, eventId });
}

export function shouldSkipDuplicateDomainEvent(dedupKey: string): boolean {
  const key = String(dedupKey || '').trim();
  if (!key) return false;
  const seenAt = seenKeys.get(key);
  if (!seenAt) return false;
  if (Date.now() - seenAt > TTL_MS) {
    seenKeys.delete(key);
    return false;
  }
  return true;
}

export function markDomainEventDeduplicated(dedupKey: string): void {
  const key = String(dedupKey || '').trim();
  if (!key) return;
  seenKeys.set(key, Date.now());
}

/** Opt-in: verifica e marca. Retorna true se deve pular (duplicata). */
export function consumeDomainEventDedup(event: DomainEvent): boolean {
  const key = buildDomainEventDedupKey(event);
  if (shouldSkipDuplicateDomainEvent(key)) return true;
  markDomainEventDeduplicated(key);
  return false;
}

export function __clearDomainEventDedupForTest(): void {
  seenKeys.clear();
}
