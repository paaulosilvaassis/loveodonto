/**
 * @module domain-events/observability/attachDomainEventObservability
 * @description Liga observabilidade aos audit hooks — Phase 7.3.
 * Opt-in. Sem HTTP. Sem alteração de publishers de domínio.
 */

import { registerDomainEventAuditHook, type DomainEventAuditHook } from '../shared/domainEventAuditHooks.js';
import type { DomainEventAuditRecord } from '../domainEventAudit.js';
import { isDomainEventObservabilityEnabled, type DomainEventFlagsInput } from '../domainEventFlags.js';
import { recordDomainEventMetricFromAuditStatus } from './domainEventMetrics.js';
import { recordDomainEventTrace } from './domainEventTrace.js';
import { appendDomainEventTimeline } from './domainEventTimeline.js';

function causationFromRecord(record: DomainEventAuditRecord): string | null {
  if ('causationId' in record && record.causationId !== undefined) {
    return record.causationId ?? null;
  }
  const snap = record.snapshot;
  if (snap && typeof snap.causationId === 'string') return snap.causationId;
  if (snap && snap.causationId === null) return null;
  return null;
}

const observabilityHook: DomainEventAuditHook = (record) => {
  recordDomainEventMetricFromAuditStatus(record.status, record.reason);
  const trace = recordDomainEventTrace({
    eventId: record.eventId,
    eventType: record.eventType,
    aggregateType: record.aggregateType,
    aggregateId: record.aggregateId,
    tenantId: record.tenantId,
    correlationId: record.correlationId,
    causationId: causationFromRecord(record),
    status: record.status,
    reason: record.reason,
    timestamp: record.timestamp,
  });
  appendDomainEventTimeline(trace);
};

let detach: (() => void) | null = null;

/**
 * Anexa observabilidade ao pipeline de audit hooks.
 * No-op se DOMAIN_EVENT_OBSERVABILITY estiver off (ou produção locked).
 * Idempotente: re-attach substitui o hook anterior.
 */
export function attachDomainEventObservability(
  flagsInput: DomainEventFlagsInput = {},
): () => void {
  if (detach) {
    detach();
    detach = null;
  }
  if (!isDomainEventObservabilityEnabled(flagsInput)) {
    return () => {};
  }
  detach = registerDomainEventAuditHook(observabilityHook);
  return () => {
    if (detach) {
      detach();
      detach = null;
    }
  };
}

export function detachDomainEventObservability(): void {
  if (detach) {
    detach();
    detach = null;
  }
}

export function isDomainEventObservabilityAttached(): boolean {
  return detach != null;
}
