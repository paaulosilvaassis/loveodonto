/**
 * @module domain-events/shared/domainEventFacade
 * @description Fachada única de publicação de Domain Events — Phase 7.4.
 *
 * Domínios publicam apenas via esta API (nunca diretamente no Publisher).
 * Reutiliza Toolkit (publisher, validator, serializer, correlation, audit)
 * e Observability (metrics/trace/timeline) de forma transparente.
 */

import {
  isDomainEventAuditEnabled,
  isDomainEventObservabilityEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import { buildDomainEvent, type BuildDomainEventInput } from '../domainEventMapper.js';
import type { DomainEvent, DomainEventPublishResult } from '../domainEventTypes.js';
import {
  attachDomainEventObservability,
  isDomainEventObservabilityAttached,
} from '../observability/attachDomainEventObservability.js';
import { recordDomainEventMetricFromAuditStatus } from '../observability/domainEventMetrics.js';
import { recordDomainEventTrace } from '../observability/domainEventTrace.js';
import { appendDomainEventTimeline } from '../observability/domainEventTimeline.js';
import {
  publishDomainEventViaToolkit,
  type DomainEventPublishOptions,
} from './domainEventPublisher.js';

export type DomainEventFacadePublishOptions = DomainEventPublishOptions;

function ensureObservabilityAttached(flagsInput: DomainEventFlagsInput): void {
  if (!isDomainEventObservabilityEnabled(flagsInput)) return;
  if (isDomainEventObservabilityAttached()) return;
  attachDomainEventObservability(flagsInput);
}

/**
 * Alimenta observability quando AUDIT está off (hooks de audit não disparam).
 * Com AUDIT+OBSERVABILITY, o attach via hooks já cobre — evita double-count.
 */
function feedObservabilityDirect(
  input: BuildDomainEventInput | DomainEvent,
  result: DomainEventPublishResult,
  flagsInput: DomainEventFlagsInput,
): void {
  if (!isDomainEventObservabilityEnabled(flagsInput)) return;
  if (isDomainEventAuditEnabled(flagsInput)) return;

  const status = result.accepted
    ? 'published'
    : result.skipped
      ? 'skipped'
      : 'rejected';
  recordDomainEventMetricFromAuditStatus(status, result.reason);

  const eventType =
    ('eventType' in input && input.eventType) ||
    ('type' in (input as object) ? String((input as { type?: string }).type || '') : '') ||
    'unknown';
  const aggregateId = 'aggregateId' in input ? String(input.aggregateId || '') : '';
  const tenantId = 'tenantId' in input ? String(input.tenantId || '') : '';
  const correlationId =
    'correlationId' in input && input.correlationId
      ? String(input.correlationId)
      : null;
  const causationId =
    'causationId' in input ? (input.causationId ?? null) : null;
  const aggregateType =
    'aggregateType' in input && input.aggregateType
      ? String(input.aggregateType)
      : 'appointment';

  const trace = recordDomainEventTrace({
    eventId: result.eventId,
    eventType: String(eventType),
    aggregateType,
    aggregateId,
    tenantId,
    correlationId,
    causationId,
    status,
    reason: result.reason,
  });
  appendDomainEventTimeline(trace);
}

/**
 * API canônica de publicação para todos os domínios.
 * Defaults: enableDedup=true, requireRegisteredType=true.
 */
export async function publishViaDomainEventFacade(
  input: BuildDomainEventInput | DomainEvent,
  options: DomainEventFacadePublishOptions = {},
): Promise<DomainEventPublishResult> {
  const flagsInput = options.flagsInput ?? {};
  ensureObservabilityAttached(flagsInput);

  const result = await publishDomainEventViaToolkit(input, {
    enableDedup: true,
    requireRegisteredType: true,
    ...options,
    flagsInput,
  });

  feedObservabilityDirect(input, result, flagsInput);
  return result;
}

/**
 * Constrói evento normalizado (exposto para testes / pré-validação).
 * Domínios normalmente passam BuildDomainEventInput direto ao publish.
 */
export function prepareDomainEventViaFacade(input: BuildDomainEventInput): DomainEvent {
  return buildDomainEvent(input);
}

/** Alias semântico — mesma API. */
export const publishDomainEvent = publishViaDomainEventFacade;
