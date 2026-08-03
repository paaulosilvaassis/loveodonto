/**
 * @module domain-events/domainEventAudit
 * @description Auditoria in-memory de Domain Events — Phase 6.9.
 * Sem persistência. Somente infraestrutura.
 */

import type { DomainEvent } from './domainEventTypes.js';
import { mapDomainEventToAuditSnapshot } from './domainEventMapper.js';

export type DomainEventAuditStatus = 'published' | 'skipped' | 'rejected' | 'prepared';

export interface DomainEventAuditRecord {
  eventId: string | null;
  eventType: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string | null;
  causationId: string | null;
  status: DomainEventAuditStatus;
  reason?: string;
  timestamp: string;
  snapshot?: Record<string, unknown>;
}

const auditLog: DomainEventAuditRecord[] = [];
const MAX_AUDIT_ENTRIES = 200;

export function recordDomainEventAudit(entry: DomainEventAuditRecord): DomainEventAuditRecord {
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_ENTRIES) auditLog.shift();
  if (import.meta.env?.DEV) {
    console.debug('[DOMAIN_EVENT_AUDIT]', entry);
  }
  return entry;
}

export function createDomainEventAuditEntry(input: {
  event?: DomainEvent | null;
  eventType?: string;
  tenantId?: string;
  status: DomainEventAuditStatus;
  reason?: string;
  includeSnapshot?: boolean;
}): DomainEventAuditRecord {
  const event = input.event ?? null;
  return recordDomainEventAudit({
    eventId: event?.eventId ?? null,
    eventType: event?.eventType || input.eventType || 'unknown',
    tenantId: event?.tenantId || input.tenantId || '',
    aggregateType: event?.aggregateType || '',
    aggregateId: event?.aggregateId || '',
    correlationId: event?.correlationId ?? null,
    causationId: event?.causationId ?? null,
    status: input.status,
    reason: input.reason,
    timestamp: new Date().toISOString(),
    snapshot: input.includeSnapshot && event
      ? mapDomainEventToAuditSnapshot(event)
      : undefined,
  });
}

export function getDomainEventAuditLog(): DomainEventAuditRecord[] {
  return [...auditLog];
}

export function __clearDomainEventAuditForTest(): void {
  auditLog.length = 0;
}
