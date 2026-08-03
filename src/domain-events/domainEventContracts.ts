/**
 * @module domain-events/domainEventContracts
 * @description Contratos de validação do Domain Event DTO — Phase 6.9.
 */

import type { DomainEvent } from './domainEventTypes.js';
import { isRegisteredDomainEventType } from './domainEventRegistry.js';

export class DomainEventContractError extends Error {
  readonly code = 'DOMAIN_EVENT_CONTRACT_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'DomainEventContractError';
  }
}

export interface DomainEventContractResult {
  valid: boolean;
  errors: string[];
}

function requireNonEmptyString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${field} é obrigatório (string não vazia).`);
  }
}

function requireObject(value: unknown, field: string, errors: string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${field} deve ser um objeto.`);
  }
}

/**
 * Valida shape do DomainEvent sem side-effects.
 * `requireRegisteredType` opcional — foundation aceita tipos futuros com warning estrutural.
 */
export function validateDomainEventContract(
  event: Partial<DomainEvent> | null | undefined,
  options: { requireRegisteredType?: boolean } = {},
): DomainEventContractResult {
  const errors: string[] = [];
  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['DomainEvent é obrigatório.'] };
  }

  requireNonEmptyString(event.eventId, 'eventId', errors);
  requireNonEmptyString(event.eventType, 'eventType', errors);
  requireNonEmptyString(event.aggregateType, 'aggregateType', errors);
  requireNonEmptyString(event.aggregateId, 'aggregateId', errors);
  requireNonEmptyString(event.tenantId, 'tenantId', errors);
  requireNonEmptyString(event.timestamp, 'timestamp', errors);
  requireNonEmptyString(event.source, 'source', errors);
  requireNonEmptyString(event.correlationId, 'correlationId', errors);
  requireObject(event.payload, 'payload', errors);
  requireObject(event.metadata, 'metadata', errors);

  if (event.userId !== null && event.userId !== undefined && typeof event.userId !== 'string') {
    errors.push('userId deve ser string ou null.');
  }
  if (
    event.causationId !== null
    && event.causationId !== undefined
    && typeof event.causationId !== 'string'
  ) {
    errors.push('causationId deve ser string ou null.');
  }
  if (typeof event.version !== 'number' || !Number.isFinite(event.version) || event.version < 1) {
    errors.push('version deve ser number >= 1.');
  }

  if (
    options.requireRegisteredType
    && event.eventType
    && !isRegisteredDomainEventType(String(event.eventType))
  ) {
    errors.push(`eventType "${event.eventType}" não está no registry.`);
  }

  return { valid: errors.length === 0, errors };
}

export function assertDomainEventContract(
  event: Partial<DomainEvent> | null | undefined,
  options: { requireRegisteredType?: boolean } = {},
): asserts event is DomainEvent {
  const result = validateDomainEventContract(event, options);
  if (!result.valid) {
    throw new DomainEventContractError(result.errors.join(' '));
  }
}
