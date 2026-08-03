/**
 * @module domain-events/consumers/eventAuditProjectionStore
 * @description Projeção in-memory imutável — Phase 7.7 Event Audit Projection.
 * Sem persistência. Sem side-effects de negócio.
 */

export interface EventAuditProjectionRecord {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly correlationId: string | null;
  readonly causationId: string | null;
  readonly tenantId: string;
  readonly timestamp: string;
  readonly publisher: string;
  readonly consumer: string;
  readonly status: 'projected';
  readonly projectedAt: string;
}

export const EVENT_AUDIT_PROJECTION_DEFAULT_CAP = 1000;

let maxCap = EVENT_AUDIT_PROJECTION_DEFAULT_CAP;
const projection: EventAuditProjectionRecord[] = [];

export function setEventAuditProjectionCap(cap: number): void {
  maxCap = Math.max(1, Math.floor(cap) || EVENT_AUDIT_PROJECTION_DEFAULT_CAP);
  while (projection.length > maxCap) projection.shift();
}

export function getEventAuditProjectionCap(): number {
  return maxCap;
}

export function appendEventAuditProjection(
  record: Omit<EventAuditProjectionRecord, 'status' | 'projectedAt'> & {
    status?: 'projected';
    projectedAt?: string;
  },
): EventAuditProjectionRecord {
  const entry: EventAuditProjectionRecord = Object.freeze({
    eventId: String(record.eventId || ''),
    eventType: String(record.eventType || ''),
    aggregateType: String(record.aggregateType || ''),
    aggregateId: String(record.aggregateId || ''),
    correlationId: record.correlationId ?? null,
    causationId: record.causationId ?? null,
    tenantId: String(record.tenantId || ''),
    timestamp: String(record.timestamp || new Date().toISOString()),
    publisher: String(record.publisher || 'unknown'),
    consumer: String(record.consumer || 'EventAuditProjectionConsumer'),
    status: 'projected',
    projectedAt: record.projectedAt || new Date().toISOString(),
  });
  projection.push(entry);
  if (projection.length > maxCap) projection.shift();
  return entry;
}

export function getEventAuditProjection(): readonly EventAuditProjectionRecord[] {
  return projection.map((r) => ({ ...r }));
}

export function getEventAuditProjectionCount(): number {
  return projection.length;
}

export function findEventAuditProjectionByEventType(
  eventType: string,
): EventAuditProjectionRecord[] {
  const key = String(eventType || '').trim();
  return projection.filter((r) => r.eventType === key).map((r) => ({ ...r }));
}

export function findEventAuditProjectionByCorrelation(
  correlationId: string,
): EventAuditProjectionRecord[] {
  const key = String(correlationId || '').trim();
  return projection.filter((r) => r.correlationId === key).map((r) => ({ ...r }));
}

export function findEventAuditProjectionByAggregate(
  aggregateType: string,
  aggregateId: string,
): EventAuditProjectionRecord[] {
  const type = String(aggregateType || '').trim();
  const id = String(aggregateId || '').trim();
  return projection
    .filter((r) => (!type || r.aggregateType === type) && (!id || r.aggregateId === id))
    .map((r) => ({ ...r }));
}

export function __clearEventAuditProjectionForTest(): void {
  projection.length = 0;
  maxCap = EVENT_AUDIT_PROJECTION_DEFAULT_CAP;
}
