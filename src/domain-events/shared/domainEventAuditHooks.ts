/**
 * @module domain-events/shared/domainEventAuditHooks
 * @description Pontos de extensão de auditoria — Phase 7.0.
 * Sem persistência. Sem integração com banco.
 */

import {
  createDomainEventAuditEntry,
  type DomainEventAuditRecord,
  type DomainEventAuditStatus,
} from '../domainEventAudit.js';
import type { DomainEvent } from '../domainEventTypes.js';

export type DomainEventAuditHook = (record: DomainEventAuditRecord) => void;

const hooks = new Set<DomainEventAuditHook>();

export function registerDomainEventAuditHook(hook: DomainEventAuditHook): () => void {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

function notifyHooks(record: DomainEventAuditRecord): void {
  for (const hook of hooks) {
    try {
      hook(record);
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[DOMAIN_EVENT_AUDIT_HOOK_ERROR]', err);
      }
    }
  }
}

/**
 * Emite audit entry + notifica hooks registrados.
 * Sem persistência.
 */
export function emitDomainEventAuditHook(input: {
  event?: DomainEvent | null;
  eventType?: string;
  tenantId?: string;
  status: DomainEventAuditStatus;
  reason?: string;
  includeSnapshot?: boolean;
}): DomainEventAuditRecord {
  const record = createDomainEventAuditEntry(input);
  notifyHooks(record);
  return record;
}

export function __clearDomainEventAuditHooksForTest(): void {
  hooks.clear();
}
