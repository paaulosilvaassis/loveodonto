/**
 * @module domain-events/consumers/domainEventConsumerAudit
 * @description Auditoria in-memory de consumers — Phase 7.6.
 */

import type { DomainEventConsumerResultStatus } from './domainEventConsumerTypes.js';

export interface DomainEventConsumerAuditRecord {
  consumerId: string;
  eventId: string;
  eventType: string;
  status: DomainEventConsumerResultStatus;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  error: string | null;
  correlationId: string | null;
  causationId: string | null;
  tenantId: string;
  reason?: string;
}

const auditLog: DomainEventConsumerAuditRecord[] = [];
const MAX_AUDIT = 300;

export function recordDomainEventConsumerAudit(
  entry: DomainEventConsumerAuditRecord,
): DomainEventConsumerAuditRecord {
  auditLog.push({ ...entry });
  if (auditLog.length > MAX_AUDIT) auditLog.shift();
  if (import.meta.env?.DEV) {
    console.debug('[DOMAIN_EVENT_CONSUMER_AUDIT]', {
      consumerId: entry.consumerId,
      eventType: entry.eventType,
      status: entry.status,
      attempt: entry.attempt,
    });
  }
  return entry;
}

export function getDomainEventConsumerAuditLog(): DomainEventConsumerAuditRecord[] {
  return auditLog.map((e) => ({ ...e }));
}

export function __clearDomainEventConsumerAuditForTest(): void {
  auditLog.length = 0;
}
