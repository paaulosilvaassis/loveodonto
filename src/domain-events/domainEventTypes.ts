/**
 * @module domain-events/domainEventTypes
 * @description Domain Event Model — Phase 6.9 foundation (estrutural).
 */

export type DomainEventAggregateType =
  | 'lead'
  | 'follow_up'
  | 'task'
  | 'appointment'
  | 'patient'
  | 'budget'
  | 'contract'
  | 'receivable'
  | 'payable'
  | 'financing'
  | 'payment'
  | 'user'
  | 'tenant'
  | 'system';

export type DomainEventSource =
  | 'crm'
  | 'agenda'
  | 'financial'
  | 'collaborators'
  | 'clinic-profile'
  | 'platform'
  | 'system'
  | 'unknown';

export type DomainEventTypeName =
  | 'LEAD_CREATED'
  | 'LEAD_UPDATED'
  | 'LEAD_MOVED'
  | 'FOLLOW_UP_CREATED'
  | 'FOLLOW_UP_UPDATED'
  | 'FOLLOW_UP_COMPLETED'
  | 'FOLLOW_UP_CANCELLED'
  | 'FOLLOW_UP_RESCHEDULED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_COMPLETED'
  | 'TASK_DELETED'
  | 'CRM_TIMELINE_EVENT_CREATED'
  | 'APPOINTMENT_CREATED'
  | 'APPOINTMENT_CONFIRMED'
  | 'APPOINTMENT_UPDATED'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_RESCHEDULED'
  | 'APPOINTMENT_STATUS_CHANGED'
  | 'PATIENT_CREATED'
  | 'BUDGET_CREATED'
  | 'CONTRACT_SIGNED'
  | 'RECEIVABLE_CREATED'
  | 'RECEIVABLE_UPDATED'
  | 'PAYABLE_CREATED'
  | 'PAYABLE_UPDATED'
  | 'PAYABLE_DELETED'
  | 'FINANCING_CREATED'
  | 'FINANCING_UPDATED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_FAILED'
  | 'USER_CREATED'
  | 'TENANT_CREATED';

/** DTO único de Domain Event — Love Odonto V3. */
export interface DomainEvent {
  eventId: string;
  eventType: DomainEventTypeName | string;
  aggregateType: DomainEventAggregateType | string;
  aggregateId: string;
  tenantId: string;
  userId: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  version: number;
  source: DomainEventSource | string;
  correlationId: string;
  causationId: string | null;
}

export interface DomainEventRegistryEntry {
  name: DomainEventTypeName;
  aggregate: DomainEventAggregateType;
  version: number;
  description: string;
  /** Domínio/origem prevista (ainda não integrado). */
  expectedOrigin: DomainEventSource;
  /** Destinos previstos (ainda sem consumidores). */
  expectedDestinations: readonly string[];
}

export interface DomainEventPublishResult {
  accepted: boolean;
  skipped: boolean;
  reason?: string;
  eventId: string | null;
}

export const DOMAIN_EVENT_MODEL_VERSION = 1;
