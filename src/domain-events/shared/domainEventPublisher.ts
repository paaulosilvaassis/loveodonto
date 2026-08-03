/**
 * @module domain-events/shared/domainEventPublisher
 * @description Publisher oficial do Domain Event Toolkit — Phase 7.0.
 *
 * Regras:
 * - Flags OFF → no-op (skipped)
 * - Nenhum domínio integrado nesta phase
 * - Sem publicação "real" externa (só bus local via dispatcher, se flags ON em testes)
 * - Dedup / retry / audit hooks preparados (opt-in)
 */

import {
  isDomainEventAuditEnabled,
  isDomainEventsEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import { publishDomainEvent } from '../domainEventBus.js';
import { buildDomainEvent, type BuildDomainEventInput } from '../domainEventMapper.js';
import type { DomainEvent, DomainEventPublishResult } from '../domainEventTypes.js';
import { resolveDomainEventCorrelation } from './domainEventCorrelation.js';
import {
  buildDomainEventDedupKey,
  markDomainEventDeduplicated,
  shouldSkipDuplicateDomainEvent,
} from './domainEventDeduplication.js';
import { emitDomainEventAuditHook } from './domainEventAuditHooks.js';
import { validateDomainEvent } from './domainEventValidator.js';
import {
  evaluateDomainEventRetry,
  type DomainEventRetryPolicy,
} from './domainEventRetry.js';

export interface DomainEventPublishOptions {
  flagsInput?: DomainEventFlagsInput;
  /** Opt-in deduplicação in-memory. Default false (não ativada). */
  enableDedup?: boolean;
  /** Opt-in: exige eventType registrado. Default true no publisher toolkit. */
  requireRegisteredType?: boolean;
  /** Política de retry (contrato apenas — sem reexecução real). */
  retryPolicy?: DomainEventRetryPolicy;
  parentEvent?: Pick<DomainEvent, 'eventId' | 'correlationId'> | null;
}

function noopSkipped(reason: string): DomainEventPublishResult {
  return {
    accepted: false,
    skipped: true,
    reason,
    eventId: null,
  };
}

/**
 * API pública do Toolkit para publicação futura por domínios.
 * Com DOMAIN_EVENTS=false: no-op imediato.
 */
export async function publishDomainEventViaToolkit(
  input: BuildDomainEventInput | DomainEvent,
  options: DomainEventPublishOptions = {},
): Promise<DomainEventPublishResult> {
  const flagsInput = options.flagsInput ?? {};

  if (!isDomainEventsEnabled(flagsInput)) {
    return noopSkipped('DOMAIN_EVENTS=false');
  }

  const correlation = resolveDomainEventCorrelation({
    correlationId: 'correlationId' in input ? input.correlationId : undefined,
    causationId: 'causationId' in input ? input.causationId : undefined,
    parentEvent: options.parentEvent,
    seed: 'aggregateId' in input ? String(input.aggregateId || '') : undefined,
  });

  let event: DomainEvent;
  try {
    if (
      input
      && typeof input === 'object'
      && 'eventId' in input
      && input.eventId
      && 'payload' in input
      && 'metadata' in input
      && 'version' in input
    ) {
      event = {
        ...(input as DomainEvent),
        correlationId: (input as DomainEvent).correlationId || correlation.correlationId,
        causationId: (input as DomainEvent).causationId ?? correlation.causationId,
      };
    } else {
      event = buildDomainEvent({
        ...(input as BuildDomainEventInput),
        correlationId: (input as BuildDomainEventInput).correlationId || correlation.correlationId,
        causationId: (input as BuildDomainEventInput).causationId ?? correlation.causationId,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isDomainEventAuditEnabled(flagsInput)) {
      emitDomainEventAuditHook({
        eventType: String((input as BuildDomainEventInput).eventType || 'unknown'),
        tenantId: String((input as BuildDomainEventInput).tenantId || ''),
        status: 'rejected',
        reason: message,
      });
    }
    // Contrato retry: registra estado sem reexecutar
    evaluateDomainEventRetry(1, err, options.retryPolicy);
    return {
      accepted: false,
      skipped: false,
      reason: message,
      eventId: null,
    };
  }

  const validation = validateDomainEvent(event, {
    requireRegisteredType: options.requireRegisteredType !== false,
  });
  if (!validation.valid) {
    if (isDomainEventAuditEnabled(flagsInput)) {
      emitDomainEventAuditHook({
        event,
        status: 'rejected',
        reason: validation.errors.join(' '),
      });
    }
    return {
      accepted: false,
      skipped: false,
      reason: validation.errors.join(' '),
      eventId: event.eventId,
    };
  }

  if (options.enableDedup) {
    const dedupKey = buildDomainEventDedupKey(event);
    if (shouldSkipDuplicateDomainEvent(dedupKey)) {
      if (isDomainEventAuditEnabled(flagsInput)) {
        emitDomainEventAuditHook({
          event,
          status: 'skipped',
          reason: 'deduplicated',
          includeSnapshot: true,
        });
      }
      return {
        accepted: false,
        skipped: true,
        reason: 'deduplicated',
        eventId: event.eventId,
      };
    }
  }

  if (isDomainEventAuditEnabled(flagsInput)) {
    emitDomainEventAuditHook({
      event,
      status: 'prepared',
      includeSnapshot: true,
    });
  }

  const result = await publishDomainEvent(event);

  if (options.enableDedup && result.accepted) {
    markDomainEventDeduplicated(buildDomainEventDedupKey(event));
  }

  if (isDomainEventAuditEnabled(flagsInput)) {
    emitDomainEventAuditHook({
      event,
      status: result.accepted ? 'published' : (result.skipped ? 'skipped' : 'rejected'),
      reason: result.reason,
      includeSnapshot: true,
    });
  }

  if (!result.accepted && !result.skipped) {
    evaluateDomainEventRetry(1, result.reason, options.retryPolicy);
  }

  return result;
}

/** Alias semântico para adoção futura. */
export const publishDomainEventPrepared = publishDomainEventViaToolkit;

export function canPublishDomainEvents(flagsInput: DomainEventFlagsInput = {}): boolean {
  return isDomainEventsEnabled(flagsInput);
}
