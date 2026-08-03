/**
 * @module domain-events/consumers/eventAuditProjectionConsumer
 * @description Consumer piloto — Event Audit Projection — Phase 7.7.
 * Única responsabilidade: projeção in-memory. Zero side-effects de negócio.
 */

import type { DomainEventConsumerDefinition } from './domainEventConsumerTypes.js';
import { appendEventAuditProjection } from './eventAuditProjectionStore.js';

export const EVENT_AUDIT_PROJECTION_CONSUMER_ID = 'event-audit-projection';

/** Eventos já publicados (CRM Wave A/B, Financial, Agenda) — sem novos tipos. */
export const EVENT_AUDIT_PROJECTION_EVENT_TYPES = [
  'LEAD_CREATED',
  'LEAD_UPDATED',
  'LEAD_MOVED',
  'FOLLOW_UP_CREATED',
  'FOLLOW_UP_UPDATED',
  'FOLLOW_UP_COMPLETED',
  'FOLLOW_UP_CANCELLED',
  'FOLLOW_UP_RESCHEDULED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_DELETED',
  'CRM_TIMELINE_EVENT_CREATED',
  'RECEIVABLE_CREATED',
  'RECEIVABLE_UPDATED',
  'PAYABLE_CREATED',
  'PAYABLE_UPDATED',
  'PAYABLE_DELETED',
  'FINANCING_CREATED',
  'FINANCING_UPDATED',
  'PAYMENT_RECEIVED',
  'APPOINTMENT_CREATED',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_UPDATED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_STATUS_CHANGED',
] as const;

/**
 * Definição estrutural do consumer piloto.
 * handle apenas escreve projeção imutável em memória.
 */
export function createEventAuditProjectionConsumerDefinition(): DomainEventConsumerDefinition {
  return {
    consumerId: EVENT_AUDIT_PROJECTION_CONSUMER_ID,
    consumerName: 'EventAuditProjectionConsumer',
    eventTypes: [...EVENT_AUDIT_PROJECTION_EVENT_TYPES],
    version: 1,
    enabled: true,
    priority: 0,
    executionMode: 'async',
    idempotencyScope: 'event+consumer+version',
    maxAttempts: 1,
    timeoutMs: 500,
    source: 'domain-events/consumers',
    description:
      'Pilot consumer — in-memory audit projection only. No business side-effects.',
    handle: async ({ event, consumerContext }) => {
      appendEventAuditProjection({
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        correlationId: event.correlationId ?? null,
        causationId: event.causationId ?? null,
        tenantId: event.tenantId,
        timestamp: event.timestamp,
        publisher: String(event.source || 'unknown'),
        consumer: consumerContext.consumerId,
      });
    },
  };
}
