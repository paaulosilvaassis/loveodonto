/**
 * @module domain-events/shared/domainEventValidator
 * @description Validação estrita do Domain Event Toolkit — Phase 7.0.
 * Reutiliza contracts da foundation; rejeita inválidos só na infraestrutura.
 */

import {
  assertDomainEventContract,
  DomainEventContractError,
  validateDomainEventContract,
  type DomainEventContractResult,
} from '../domainEventContracts.js';
import { isRegisteredDomainEventType } from '../domainEventRegistry.js';
import type { DomainEvent } from '../domainEventTypes.js';

export type { DomainEventContractResult };

export interface DomainEventValidationOptions {
  /** Toolkit default: exige eventType no registry. */
  requireRegisteredType?: boolean;
  /** Exige causationId não-nulo (opcional; default false). */
  requireCausationId?: boolean;
}

/**
 * Validação oficial do Toolkit (schema + campos obrigatórios + registry).
 */
export function validateDomainEvent(
  event: Partial<DomainEvent> | null | undefined,
  options: DomainEventValidationOptions = {},
): DomainEventContractResult {
  const requireRegisteredType = options.requireRegisteredType !== false;
  const result = validateDomainEventContract(event, { requireRegisteredType });

  if (!result.valid) return result;

  const errors = [...result.errors];

  if (requireRegisteredType && event?.eventType && !isRegisteredDomainEventType(String(event.eventType))) {
    errors.push(`eventType "${event.eventType}" não está no registry.`);
  }

  if (options.requireCausationId) {
    if (event?.causationId == null || String(event.causationId).trim() === '') {
      errors.push('causationId é obrigatório neste contexto.');
    }
  }

  // Campos já cobertos pelo contract; reafirma checklist Phase 7.0 explicitamente.
  const checklist = [
    'eventType',
    'aggregateType',
    'aggregateId',
    'tenantId',
    'version',
    'correlationId',
  ] as const;
  for (const field of checklist) {
    if (event && !(field in event)) {
      errors.push(`${field} ausente no schema.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function assertDomainEventValid(
  event: Partial<DomainEvent> | null | undefined,
  options: DomainEventValidationOptions = {},
): asserts event is DomainEvent {
  const result = validateDomainEvent(event, options);
  if (!result.valid) {
    throw new DomainEventContractError(result.errors.join(' '));
  }
  assertDomainEventContract(event, {
    requireRegisteredType: options.requireRegisteredType !== false,
  });
}
