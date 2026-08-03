/**
 * @module domain-events/consumers/domainEventConsumerContext
 * @description Contexto de execução + helper de operações compostas — Phase 7.6.
 */

import { createDomainEventCorrelationId } from '../shared/domainEventCorrelation.js';
import type { DomainEvent } from '../domainEventTypes.js';
import type {
  DomainEventConsumerContext,
  DomainEventConsumerDefinition,
  DomainEventOperationContext,
} from './domainEventConsumerTypes.js';

function sanitizeMetadata(input?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== 'object') return out;
  const skip = new Set([
    'notes', 'description', 'body', 'message', 'text', 'content',
    'anamnese', 'prontuario', 'patient', 'token', 'password', 'secret',
  ]);
  for (const [k, v] of Object.entries(input)) {
    if (skip.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) continue;
    if (typeof v === 'string' && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…`;
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Monta contexto oficial de consumer.
 * Preserva correlationId/causationId do evento — não gera correlation nova.
 */
export function buildDomainEventConsumerContext(input: {
  consumer: DomainEventConsumerDefinition;
  event: DomainEvent;
  attempt: number;
  metadata?: Record<string, unknown>;
}): DomainEventConsumerContext {
  const { consumer, event, attempt } = input;
  return {
    consumerId: consumer.consumerId,
    eventId: String(event.eventId || ''),
    eventType: String(event.eventType || ''),
    tenantId: String(event.tenantId || ''),
    userId: event.userId ?? null,
    aggregateId: String(event.aggregateId || ''),
    aggregateType: String(event.aggregateType || ''),
    correlationId: String(event.correlationId || ''),
    causationId: event.causationId ?? null,
    attempt: Math.max(0, attempt),
    startedAt: new Date().toISOString(),
    metadata: sanitizeMetadata(input.metadata),
  };
}

/**
 * Helper estrutural para operações compostas (ex.: fechamento clínico).
 * Futuro: task + follow-up compartilham o mesmo correlationId.
 * NÃO altera patientFlow/CRM nesta phase — apenas infraestrutura.
 */
export function createDomainEventOperationContext(input: {
  tenantId: string;
  origin: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}): DomainEventOperationContext {
  const correlationId = String(input.correlationId || '').trim()
    || createDomainEventCorrelationId();
  const operationId = `de-op-${correlationId.replace(/^de-corr-/, '')}`;
  return {
    operationId,
    correlationId,
    tenantId: String(input.tenantId || '').trim(),
    origin: String(input.origin || 'unknown').trim(),
    createdAt: new Date().toISOString(),
    metadata: sanitizeMetadata(input.metadata),
  };
}

/**
 * Deriva meta de publicação/consumo a partir da operação composta.
 * correlation preservada; causation = eventId consumido quando informado.
 */
export function deriveDomainEventConsumerContext(
  operation: DomainEventOperationContext,
  overrides: {
    causationId?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): {
  correlationId: string;
  causationId: string | null;
  tenantId: string;
  operationId: string;
  metadata: Record<string, unknown>;
} {
  return {
    correlationId: operation.correlationId,
    causationId: overrides.causationId === undefined
      ? null
      : (overrides.causationId == null ? null : String(overrides.causationId).trim() || null),
    tenantId: operation.tenantId,
    operationId: operation.operationId,
    metadata: {
      ...operation.metadata,
      ...sanitizeMetadata(overrides.metadata),
      origin: operation.origin,
    },
  };
}
