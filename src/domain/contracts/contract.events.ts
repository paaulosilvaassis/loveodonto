/**
 * @module domain/contracts/contract.events
 * @description Eventos tipados + factory pura — sem publish / bus (Phase 10.2).
 */

import type { TenantId } from './contract.ids.js';
import type { ContractAggregateType } from './contract.constants.js';
import type { ContractAuditActor } from './audit/contract-audit.types.js';

export const CONTRACT_DOMAIN_EVENT_TYPES = [
  'contract.created',
  'contract.updated',
  'contract.ready_for_review',
  'contract.approval_requested',
  'contract.approved',
  'contract.version_created',
  'contract.version_locked',
  'contract.pdf_requested',
  'contract.pdf_generated',
  'contract.pdf_failed',
  'contract.sent_for_signature',
  'contract.partially_signed',
  'contract.signed',
  'contract.declined',
  'contract.expired',
  'contract.cancelled',
  'contract.superseded',
  'contract.terminated',
  'contract.addendum_created',
  'contract.signer.invited',
  'contract.signer.viewed',
  'contract.signer.authenticated',
  'contract.signer.signed',
  'contract.signer.declined',
  'contract.signer.expired',
  'contract.attachment.added',
  'contract.attachment.removed',
  'contract.downloaded',
  'contract.integration.budget_linked',
  'contract.integration.financial_activated',
  'contract.integration.prontuario_registered',
  'contract.integration.failed',
  'contract.package_created',
  'contract.package_completed',
  'contract.signature_envelope.created',
  'contract.signature_envelope.ready',
  'contract.signature_envelope.sent',
  'contract.signature_envelope.in_progress',
  'contract.signature_envelope.completed',
  'contract.signature_envelope.declined',
  'contract.signature_envelope.expired',
  'contract.signature_envelope.cancelled',
  'contract.signature_envelope.failed',
  'contract.signer.added',
  'contract.signer.delivered',
  'contract.signer.challenge_requested',
  'contract.signer.terms_accepted',
  'contract.signer.cancelled',
  'contract.signing_completion.validation_started',
  'contract.signing_completion.validated',
  'contract.signing_completion.failed',
  'contract.signed_effects_prepared',
  'contract.signed_reconciliation_required',
  'contract.ledger.entry_appended',
  'contract.ledger.chain_invalid',
] as const;

export type ContractDomainEventType = (typeof CONTRACT_DOMAIN_EVENT_TYPES)[number];

export interface ContractDomainEvent<TPayload = unknown> {
  eventId: string;
  tenantId: TenantId;
  aggregateId: string;
  aggregateType: ContractAggregateType;
  eventType: ContractDomainEventType;
  eventVersion: number;
  actor?: ContractAuditActor;
  correlationId?: string;
  causationId?: string;
  occurredAt: string;
  payload: TPayload;
}

let eventSeq = 0;

function nextEventId(): string {
  eventSeq += 1;
  return `cde_${Date.now().toString(36)}_${eventSeq.toString(36)}`;
}

/**
 * Factory pura — não publica no bus, não aciona financeiro/prontuário.
 */
export function createContractDomainEvent<TPayload = unknown>(
  input: Omit<ContractDomainEvent<TPayload>, 'eventId' | 'eventVersion' | 'occurredAt'> & {
    eventId?: string;
    eventVersion?: number;
    occurredAt?: string;
  },
): ContractDomainEvent<TPayload> {
  if (!String(input.tenantId || '').trim()) {
    throw new Error('TENANT_REQUIRED');
  }
  if (!String(input.aggregateId || '').trim()) {
    throw new Error('INVALID_INPUT:aggregateId');
  }
  if (!(CONTRACT_DOMAIN_EVENT_TYPES as readonly string[]).includes(input.eventType)) {
    throw new Error('INVALID_INPUT:eventType');
  }

  return {
    eventId: input.eventId || nextEventId(),
    tenantId: input.tenantId,
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? 1,
    actor: input.actor,
    correlationId: input.correlationId,
    causationId: input.causationId,
    occurredAt: input.occurredAt || new Date().toISOString(),
    payload: input.payload,
  };
}

export function isContractDomainEventType(value: unknown): value is ContractDomainEventType {
  return typeof value === 'string'
    && (CONTRACT_DOMAIN_EVENT_TYPES as readonly string[]).includes(value);
}
