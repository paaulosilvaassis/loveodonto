/**
 * @module domain-events/domainEventDispatcher
 * @description Dispatcher de Domain Events — Phase 6.9.
 *
 * Gate por feature flags. Com DOMAIN_EVENTS=false: no-op (skipped).
 * Nenhum domínio chama o dispatcher nesta phase.
 */

import {
  getDomainEventFlags,
  isDomainEventAuditEnabled,
  isDomainEventsEnabled,
  type DomainEventFlagsInput,
} from './domainEventFlags.js';
import { createDomainEventAuditEntry } from './domainEventAudit.js';
import { publishDomainEvent } from './domainEventBus.js';
import { buildDomainEvent, type BuildDomainEventInput } from './domainEventMapper.js';
import { validateDomainEventContract } from './domainEventContracts.js';
import { isRegisteredDomainEventType } from './domainEventRegistry.js';
import type { DomainEvent, DomainEventPublishResult } from './domainEventTypes.js';

export interface DispatchDomainEventOptions {
  flagsInput?: DomainEventFlagsInput;
  /** Se true, rejeita tipos fora do registry. Default false (foundation permissiva). */
  requireRegisteredType?: boolean;
}

function isCompleteDomainEvent(input: BuildDomainEventInput | DomainEvent): input is DomainEvent {
  return Boolean(
    input
    && typeof input === 'object'
    && 'eventId' in input
    && input.eventId
    && 'correlationId' in input
    && input.correlationId
    && 'payload' in input
    && 'metadata' in input
    && 'version' in input,
  );
}

/**
 * Prepara e (se flags ON) publica DomainEvent no bus local.
 * Flags OFF → skipped, zero publicação no bus.
 */
export async function dispatchDomainEvent(
  input: BuildDomainEventInput | DomainEvent,
  options: DispatchDomainEventOptions = {},
): Promise<DomainEventPublishResult> {
  const flagsInput = options.flagsInput ?? {};
  const auditOn = isDomainEventAuditEnabled(flagsInput);

  if (!isDomainEventsEnabled(flagsInput)) {
    return {
      accepted: false,
      skipped: true,
      reason: 'DOMAIN_EVENTS=false',
      eventId: null,
    };
  }

  let event: DomainEvent;
  try {
    if (isCompleteDomainEvent(input)) {
      const contract = validateDomainEventContract(input, {
        requireRegisteredType: options.requireRegisteredType,
      });
      if (!contract.valid) {
        if (auditOn) {
          createDomainEventAuditEntry({
            eventType: String(input.eventType || 'unknown'),
            tenantId: String(input.tenantId || ''),
            status: 'rejected',
            reason: contract.errors.join(' '),
          });
        }
        return {
          accepted: false,
          skipped: false,
          reason: contract.errors.join(' '),
          eventId: null,
        };
      }
      event = input;
    } else {
      event = buildDomainEvent(input);
      if (options.requireRegisteredType && !isRegisteredDomainEventType(event.eventType)) {
        if (auditOn) {
          createDomainEventAuditEntry({
            event,
            status: 'rejected',
            reason: `eventType "${event.eventType}" não está no registry.`,
          });
        }
        return {
          accepted: false,
          skipped: false,
          reason: `eventType "${event.eventType}" não está no registry.`,
          eventId: event.eventId,
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (auditOn) {
      createDomainEventAuditEntry({
        eventType: String((input as BuildDomainEventInput).eventType || 'unknown'),
        tenantId: String((input as BuildDomainEventInput).tenantId || ''),
        status: 'rejected',
        reason: message,
      });
    }
    return {
      accepted: false,
      skipped: false,
      reason: message,
      eventId: null,
    };
  }

  if (auditOn) {
    createDomainEventAuditEntry({
      event,
      status: 'prepared',
      includeSnapshot: true,
    });
  }

  const result = await publishDomainEvent(event);

  if (auditOn) {
    createDomainEventAuditEntry({
      event,
      status: result.accepted ? 'published' : 'rejected',
      reason: result.reason,
      includeSnapshot: true,
    });
  }

  return result;
}

/** Helper: confirma se dispatch está habilitado pelas flags. */
export function canDispatchDomainEvents(flagsInput: DomainEventFlagsInput = {}): boolean {
  return getDomainEventFlags(flagsInput).DOMAIN_EVENTS;
}
