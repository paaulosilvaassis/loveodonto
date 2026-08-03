/**
 * @module domain-events/shared/domainEventCorrelation
 * @description Correlation / causation IDs — Phase 7.0 Toolkit.
 * Sem alterar consumidores atuais.
 */

import type { DomainEvent } from '../domainEventTypes.js';

export interface DomainEventCorrelationContext {
  correlationId: string;
  causationId: string | null;
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDomainEventCorrelationId(seed?: string): string {
  const base = String(seed || '').trim();
  if (base) return base;
  return createId('de-corr');
}

export function createDomainEventCausationId(seed?: string | null): string | null {
  if (seed === null || seed === undefined) return null;
  const base = String(seed).trim();
  if (!base) return null;
  return base;
}

/**
 * Resolve correlation/causation a partir de contexto parcial + evento pai opcional.
 */
export function resolveDomainEventCorrelation(input: {
  correlationId?: string;
  causationId?: string | null;
  parentEvent?: Pick<DomainEvent, 'eventId' | 'correlationId'> | null;
  seed?: string;
} = {}): DomainEventCorrelationContext {
  const parent = input.parentEvent ?? null;
  const correlationId = createDomainEventCorrelationId(
    input.correlationId || parent?.correlationId || input.seed,
  );
  const causationId = createDomainEventCausationId(
    input.causationId !== undefined
      ? input.causationId
      : (parent?.eventId ?? null),
  );
  return { correlationId, causationId };
}

/** Propaga correlation do evento origem; causation = eventId do pai. */
export function propagateDomainEventCorrelation(
  parent: Pick<DomainEvent, 'eventId' | 'correlationId'>,
  overrides: { correlationId?: string; causationId?: string | null } = {},
): DomainEventCorrelationContext {
  return resolveDomainEventCorrelation({
    parentEvent: parent,
    correlationId: overrides.correlationId,
    causationId: overrides.causationId,
  });
}

/** Anexa correlation/causation a um DomainEvent (imutável). */
export function withDomainEventCorrelation(
  event: DomainEvent,
  context: DomainEventCorrelationContext,
): DomainEvent {
  return {
    ...event,
    correlationId: context.correlationId,
    causationId: context.causationId,
    metadata: {
      ...event.metadata,
      correlationPropagatedAt: new Date().toISOString(),
    },
  };
}
