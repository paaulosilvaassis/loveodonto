/**
 * @module domain-events/consumers/domainEventConsumerTypes
 * @description Modelo estrutural de Domain Event Consumers — Phase 7.6.
 * Sem handlers de negócio.
 */

import type { DomainEvent, DomainEventTypeName } from '../domainEventTypes.js';

export type DomainEventConsumerExecutionMode = 'sync' | 'async';

export type DomainEventConsumerIdempotencyScope = 'event+consumer+version';

export type DomainEventConsumerResultStatus =
  | 'skipped'
  | 'prepared'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retry_scheduled'
  | 'dead_lettered'
  | 'rejected';

export interface DomainEventConsumerDefinition {
  consumerId: string;
  consumerName: string;
  eventTypes: readonly (DomainEventTypeName | string)[];
  version: number;
  enabled: boolean;
  priority: number;
  executionMode: DomainEventConsumerExecutionMode;
  idempotencyScope: DomainEventConsumerIdempotencyScope;
  maxAttempts: number;
  timeoutMs: number;
  source: string;
  description: string;
  /**
   * Handler estrutural — apenas testes / foundation.
   * NÃO registrar handlers de negócio nesta phase.
   */
  handle: DomainEventConsumerHandler;
}

export interface DomainEventConsumerContext {
  consumerId: string;
  eventId: string;
  eventType: string;
  tenantId: string;
  userId: string | null;
  aggregateId: string;
  aggregateType: string;
  correlationId: string;
  causationId: string | null;
  attempt: number;
  startedAt: string;
  metadata: Record<string, unknown>;
}

export type DomainEventConsumerHandler = (input: {
  event: DomainEvent;
  consumerContext: DomainEventConsumerContext;
  attempt: number;
  correlationId: string;
  causationId: string | null;
  tenantId: string;
  abortSignal: AbortSignal;
}) => void | Promise<void>;

export interface DomainEventConsumerRunResult {
  status: DomainEventConsumerResultStatus;
  consumerId: string;
  eventId: string;
  eventType: string;
  attempt: number;
  durationMs: number;
  error: string | null;
  reason?: string;
  nextAttemptAt?: string | null;
}

/** Contexto de operação composta (ex.: fechamento clínico) — Phase 7.6 helper. */
export interface DomainEventOperationContext {
  operationId: string;
  correlationId: string;
  tenantId: string;
  origin: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}
