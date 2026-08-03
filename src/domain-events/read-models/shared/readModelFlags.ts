/**
 * @module domain-events/read-models/shared/readModelFlags
 * @description Helpers de flags CQRS Read Model — Phase 8.0.
 * Flag canônica vive em domainEventFlags (CQRS_READ_MODEL).
 */

import {
  isCqrsReadModelEnabled,
  type DomainEventFlagsInput,
} from '../../domainEventFlags.js';

export function assertCqrsReadModelEnabled(flagsInput: DomainEventFlagsInput = {}): boolean {
  return isCqrsReadModelEnabled(flagsInput);
}

export function cqrsReadModelNoopReason(flagsInput: DomainEventFlagsInput = {}): string | null {
  if (isCqrsReadModelEnabled(flagsInput)) return null;
  return 'CQRS_READ_MODEL=false';
}
