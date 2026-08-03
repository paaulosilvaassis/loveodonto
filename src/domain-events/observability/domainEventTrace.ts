/**
 * @module domain-events/observability/domainEventTrace
 * @description Trace in-memory por correlation/causation/aggregate — Phase 7.3.
 * Sem UI. Sem armazenamento permanente.
 */

export interface DomainEventTraceEntry {
  traceId: string;
  eventId: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  tenantId: string;
  correlationId: string | null;
  causationId: string | null;
  status: string;
  reason?: string;
  timestamp: string;
}

const traces: DomainEventTraceEntry[] = [];
const MAX_TRACES = 500;

function createTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `det-${crypto.randomUUID()}`;
  }
  return `det-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recordDomainEventTrace(input: {
  eventId?: string | null;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  tenantId?: string;
  correlationId?: string | null;
  causationId?: string | null;
  status: string;
  reason?: string;
  timestamp?: string;
}): DomainEventTraceEntry {
  const entry: DomainEventTraceEntry = {
    traceId: createTraceId(),
    eventId: input.eventId ?? null,
    eventType: String(input.eventType || 'unknown'),
    aggregateType: String(input.aggregateType || ''),
    aggregateId: String(input.aggregateId || ''),
    tenantId: String(input.tenantId || ''),
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
    status: String(input.status || ''),
    reason: input.reason,
    timestamp: input.timestamp || new Date().toISOString(),
  };
  traces.push(entry);
  if (traces.length > MAX_TRACES) traces.shift();
  return entry;
}

export function getDomainEventTraces(): DomainEventTraceEntry[] {
  return traces.map((t) => ({ ...t }));
}

export function findDomainEventTracesByCorrelation(correlationId: string): DomainEventTraceEntry[] {
  const key = String(correlationId || '').trim();
  if (!key) return [];
  return traces.filter((t) => t.correlationId === key).map((t) => ({ ...t }));
}

export function findDomainEventTracesByAggregate(
  aggregateType: string,
  aggregateId: string,
): DomainEventTraceEntry[] {
  const type = String(aggregateType || '').trim();
  const id = String(aggregateId || '').trim();
  return traces
    .filter((t) => (!type || t.aggregateType === type) && (!id || t.aggregateId === id))
    .map((t) => ({ ...t }));
}

export function findDomainEventTracesByEventType(eventType: string): DomainEventTraceEntry[] {
  const key = String(eventType || '').trim();
  return traces.filter((t) => t.eventType === key).map((t) => ({ ...t }));
}

export function findDomainEventTracesByTenant(tenantId: string): DomainEventTraceEntry[] {
  const key = String(tenantId || '').trim();
  return traces.filter((t) => t.tenantId === key).map((t) => ({ ...t }));
}

export function __clearDomainEventTracesForTest(): void {
  traces.length = 0;
}
