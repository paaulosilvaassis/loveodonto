/**
 * @module domain-events/consumers/domainEventConsumerContracts
 * @description Validação estrutural de consumers — Phase 7.6.
 */

import { isRegisteredDomainEventType } from '../domainEventRegistry.js';
import type { DomainEventConsumerDefinition } from './domainEventConsumerTypes.js';

export class DomainEventConsumerContractError extends Error {
  readonly code = 'DOMAIN_EVENT_CONSUMER_CONTRACT_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'DomainEventConsumerContractError';
  }
}

export interface DomainEventConsumerContractResult {
  valid: boolean;
  errors: string[];
}

export function validateDomainEventConsumerDefinition(
  def: Partial<DomainEventConsumerDefinition> | null | undefined,
): DomainEventConsumerContractResult {
  const errors: string[] = [];
  if (!def || typeof def !== 'object') {
    return { valid: false, errors: ['Definição de consumer ausente.'] };
  }
  if (!String(def.consumerId || '').trim()) {
    errors.push('consumerId é obrigatório.');
  }
  if (!String(def.consumerName || '').trim()) {
    errors.push('consumerName é obrigatório.');
  }
  if (!Array.isArray(def.eventTypes) || def.eventTypes.length === 0) {
    errors.push('eventTypes deve ser array não vazio.');
  } else {
    for (const type of def.eventTypes) {
      const name = String(type || '').trim();
      if (!name) {
        errors.push('eventType vazio na definição.');
        continue;
      }
      if (!isRegisteredDomainEventType(name)) {
        errors.push(`eventType não registrado no Domain Event Registry: ${name}`);
      }
    }
  }
  if (typeof def.version !== 'number' || !Number.isFinite(def.version) || def.version < 1) {
    errors.push('version deve ser número >= 1.');
  }
  if (typeof def.handle !== 'function') {
    errors.push('handle estrutural é obrigatório.');
  }
  if (typeof def.priority !== 'number' || !Number.isFinite(def.priority)) {
    errors.push('priority deve ser número.');
  }
  if (typeof def.maxAttempts !== 'number' || def.maxAttempts < 1) {
    errors.push('maxAttempts deve ser >= 1.');
  }
  if (typeof def.timeoutMs !== 'number' || def.timeoutMs < 1) {
    errors.push('timeoutMs deve ser >= 1.');
  }
  return { valid: errors.length === 0, errors };
}

export function assertDomainEventConsumerDefinition(
  def: Partial<DomainEventConsumerDefinition>,
): asserts def is DomainEventConsumerDefinition {
  const result = validateDomainEventConsumerDefinition(def);
  if (!result.valid) {
    throw new DomainEventConsumerContractError(result.errors.join(' '));
  }
}
