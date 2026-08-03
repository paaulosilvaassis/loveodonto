/**
 * @module domain-events/projections/analyticsProjectionRegistry
 * @description Registry estrutural evento → reducer → projection — Phase 8.3.
 * Todos os counters oficiais: scope=tenant, tenantRequired=true. Sem auto-execução.
 */

import type {
  AnalyticsProjectionDefinition,
  AnalyticsProjectionId,
  AnalyticsProjectionRegistryEntry,
} from './analyticsProjectionTypes.js';

function entry(
  eventType: string,
  projectionId: AnalyticsProjectionId,
  reducerId: string,
  description: string,
): AnalyticsProjectionRegistryEntry {
  return Object.freeze({
    eventType,
    projectionId,
    reducerId,
    description,
    scope: 'tenant',
    tenantRequired: true,
    version: 1,
  });
}

/** Catálogo oficial — não executa reducers. */
export const ANALYTICS_PROJECTION_REGISTRY: readonly AnalyticsProjectionRegistryEntry[] = Object.freeze([
  entry('LEAD_CREATED', 'crm-counter', 'reduceCrmCounter', 'Lead → CrmCounter'),
  entry('LEAD_UPDATED', 'crm-counter', 'reduceCrmCounter', 'Lead update → CrmCounter'),
  entry('LEAD_MOVED', 'crm-counter', 'reduceCrmCounter', 'Lead move → CrmCounter'),
  entry('FOLLOW_UP_CREATED', 'crm-counter', 'reduceCrmCounter', 'Follow-up → CrmCounter'),
  entry('FOLLOW_UP_UPDATED', 'crm-counter', 'reduceCrmCounter', 'Follow-up update → CrmCounter'),
  entry('FOLLOW_UP_COMPLETED', 'crm-counter', 'reduceCrmCounter', 'Follow-up complete → CrmCounter'),
  entry('FOLLOW_UP_CANCELLED', 'crm-counter', 'reduceCrmCounter', 'Follow-up cancel → CrmCounter'),
  entry('FOLLOW_UP_RESCHEDULED', 'crm-counter', 'reduceCrmCounter', 'Follow-up reschedule → CrmCounter'),
  entry('TASK_CREATED', 'crm-counter', 'reduceCrmCounter', 'Task → CrmCounter'),
  entry('TASK_UPDATED', 'crm-counter', 'reduceCrmCounter', 'Task update → CrmCounter'),
  entry('TASK_COMPLETED', 'crm-counter', 'reduceCrmCounter', 'Task complete → CrmCounter'),
  entry('TASK_DELETED', 'crm-counter', 'reduceCrmCounter', 'Task delete → CrmCounter'),
  entry('CRM_TIMELINE_EVENT_CREATED', 'crm-counter', 'reduceCrmCounter', 'Timeline → CrmCounter'),
  entry('APPOINTMENT_CREATED', 'appointment-counter', 'reduceAppointmentCounter', 'Appointment → AppointmentCounter'),
  entry('APPOINTMENT_CONFIRMED', 'appointment-counter', 'reduceAppointmentCounter', 'Confirm → AppointmentCounter'),
  entry('APPOINTMENT_UPDATED', 'appointment-counter', 'reduceAppointmentCounter', 'Update → AppointmentCounter'),
  entry('APPOINTMENT_CANCELLED', 'appointment-counter', 'reduceAppointmentCounter', 'Cancel → AppointmentCounter'),
  entry('APPOINTMENT_RESCHEDULED', 'appointment-counter', 'reduceAppointmentCounter', 'Reschedule → AppointmentCounter'),
  entry('APPOINTMENT_STATUS_CHANGED', 'appointment-counter', 'reduceAppointmentCounter', 'Status → AppointmentCounter'),
  entry('RECEIVABLE_CREATED', 'financial-counter', 'reduceFinancialCounter', 'Receivable → FinancialCounter'),
  entry('RECEIVABLE_UPDATED', 'financial-counter', 'reduceFinancialCounter', 'Receivable update → FinancialCounter'),
  entry('PAYABLE_CREATED', 'financial-counter', 'reduceFinancialCounter', 'Payable → FinancialCounter'),
  entry('PAYABLE_UPDATED', 'financial-counter', 'reduceFinancialCounter', 'Payable update → FinancialCounter'),
  entry('PAYABLE_DELETED', 'financial-counter', 'reduceFinancialCounter', 'Payable delete → FinancialCounter'),
  entry('FINANCING_CREATED', 'financial-counter', 'reduceFinancialCounter', 'Financing → FinancialCounter'),
  entry('FINANCING_UPDATED', 'financial-counter', 'reduceFinancialCounter', 'Financing update → FinancialCounter'),
  entry('PAYMENT_RECEIVED', 'financial-counter', 'reduceFinancialCounter', 'Payment → FinancialCounter'),
]);

const byEventType = new Map<string, AnalyticsProjectionRegistryEntry[]>();
for (const item of ANALYTICS_PROJECTION_REGISTRY) {
  const list = byEventType.get(item.eventType) || [];
  list.push(item);
  byEventType.set(item.eventType, list);
}

const DEFINITIONS: Record<AnalyticsProjectionId, AnalyticsProjectionDefinition> = Object.freeze({
  'crm-counter': Object.freeze({
    projectionId: 'crm-counter',
    scope: 'tenant',
    tenantRequired: true,
    supportedEventTypes: Object.freeze(
      ANALYTICS_PROJECTION_REGISTRY.filter((e) => e.projectionId === 'crm-counter').map((e) => e.eventType),
    ),
    reducerId: 'reduceCrmCounter',
    version: 1,
  }),
  'appointment-counter': Object.freeze({
    projectionId: 'appointment-counter',
    scope: 'tenant',
    tenantRequired: true,
    supportedEventTypes: Object.freeze(
      ANALYTICS_PROJECTION_REGISTRY.filter((e) => e.projectionId === 'appointment-counter').map((e) => e.eventType),
    ),
    reducerId: 'reduceAppointmentCounter',
    version: 1,
  }),
  'financial-counter': Object.freeze({
    projectionId: 'financial-counter',
    scope: 'tenant',
    tenantRequired: true,
    supportedEventTypes: Object.freeze(
      ANALYTICS_PROJECTION_REGISTRY.filter((e) => e.projectionId === 'financial-counter').map((e) => e.eventType),
    ),
    reducerId: 'reduceFinancialCounter',
    version: 1,
  }),
}) as Record<AnalyticsProjectionId, AnalyticsProjectionDefinition>;

export function listAnalyticsProjectionRegistry(): readonly AnalyticsProjectionRegistryEntry[] {
  return ANALYTICS_PROJECTION_REGISTRY;
}

export function getAnalyticsProjectionRegistryEntriesForEvent(
  eventType: string,
): AnalyticsProjectionRegistryEntry[] {
  return [...(byEventType.get(String(eventType || '').trim()) || [])];
}

export function listRegisteredAnalyticsProjectionIds(): AnalyticsProjectionId[] {
  return Array.from(new Set(ANALYTICS_PROJECTION_REGISTRY.map((e) => e.projectionId)));
}

export function hasAnalyticsProjectionForEvent(eventType: string): boolean {
  return getAnalyticsProjectionRegistryEntriesForEvent(eventType).length > 0;
}

export function getAnalyticsProjectionDefinition(
  projectionId: AnalyticsProjectionId,
): AnalyticsProjectionDefinition {
  return DEFINITIONS[projectionId];
}

export function listAnalyticsProjectionDefinitions(): AnalyticsProjectionDefinition[] {
  return listRegisteredAnalyticsProjectionIds().map((id) => DEFINITIONS[id]);
}
