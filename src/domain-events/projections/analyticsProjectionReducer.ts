/**
 * @module domain-events/projections/analyticsProjectionReducer
 * @description Reducers puros — tenant-scoped — Phase 8.3.
 * Não consultam store / Repository. Não publicam eventos. Não mutam o Domain Event.
 */

import type {
  AnalyticsProjectionId,
  AnalyticsProjectionReducerFn,
  AnalyticsProjectionSnapshot,
  AppointmentCounterState,
  CrmCounterState,
  FinancialCounterState,
} from './analyticsProjectionTypes.js';
import { requireAnalyticsProjectionTenantId } from './analyticsProjectionScope.js';

function emptyCrm(): CrmCounterState {
  return Object.freeze({
    leadsCreated: 0,
    leadsUpdated: 0,
    leadsMoved: 0,
    followUpsCreated: 0,
    followUpsUpdated: 0,
    followUpsCompleted: 0,
    followUpsCancelled: 0,
    followUpsRescheduled: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
    tasksCompleted: 0,
    tasksDeleted: 0,
    timelineEventsCreated: 0,
  });
}

function emptyAppointment(): AppointmentCounterState {
  return Object.freeze({
    appointmentsCreated: 0,
    appointmentsConfirmed: 0,
    appointmentsUpdated: 0,
    appointmentsCancelled: 0,
    appointmentsRescheduled: 0,
    appointmentsStatusChanged: 0,
  });
}

function emptyFinancial(): FinancialCounterState {
  return Object.freeze({
    receivablesCreated: 0,
    receivablesUpdated: 0,
    payablesCreated: 0,
    payablesUpdated: 0,
    payablesDeleted: 0,
    financingsCreated: 0,
    financingsUpdated: 0,
    paymentsReceived: 0,
  });
}

export function createEmptyAnalyticsProjection(
  projectionId: AnalyticsProjectionId,
  tenantId: string,
  at = new Date().toISOString(),
): AnalyticsProjectionSnapshot {
  const tid = requireAnalyticsProjectionTenantId(tenantId);
  const counters =
    projectionId === 'crm-counter'
      ? emptyCrm()
      : projectionId === 'appointment-counter'
        ? emptyAppointment()
        : emptyFinancial();

  return Object.freeze({
    projectionId,
    tenantId: tid,
    scope: 'tenant',
    version: 0,
    counters,
    createdAt: at,
    updatedAt: at,
    sourceEventCount: 0,
    lastEventId: null,
    lastEventType: null,
    lastCorrelationId: null,
  });
}

function bump(
  current: AnalyticsProjectionSnapshot,
  event: {
    eventId: string;
    eventType: string;
    tenantId: string;
    timestamp?: string;
    correlationId?: string | null;
  },
  nextCounters: AnalyticsProjectionSnapshot['counters'],
): AnalyticsProjectionSnapshot {
  const tid = requireAnalyticsProjectionTenantId(event.tenantId);
  if (tid !== current.tenantId) {
    // Isolamento: nunca aplicar evento de outro tenant nesta projection
    return current;
  }
  return Object.freeze({
    projectionId: current.projectionId,
    tenantId: current.tenantId,
    scope: 'tenant' as const,
    version: current.version + 1,
    counters: Object.freeze({ ...nextCounters }),
    createdAt: current.createdAt,
    updatedAt: String(event.timestamp || new Date().toISOString()),
    sourceEventCount: current.sourceEventCount + 1,
    lastEventId: event.eventId,
    lastEventType: event.eventType,
    lastCorrelationId:
      event.correlationId == null ? current.lastCorrelationId : String(event.correlationId),
  });
}

const CRM_FIELD_BY_EVENT: Record<string, keyof CrmCounterState> = {
  LEAD_CREATED: 'leadsCreated',
  LEAD_UPDATED: 'leadsUpdated',
  LEAD_MOVED: 'leadsMoved',
  FOLLOW_UP_CREATED: 'followUpsCreated',
  FOLLOW_UP_UPDATED: 'followUpsUpdated',
  FOLLOW_UP_COMPLETED: 'followUpsCompleted',
  FOLLOW_UP_CANCELLED: 'followUpsCancelled',
  FOLLOW_UP_RESCHEDULED: 'followUpsRescheduled',
  TASK_CREATED: 'tasksCreated',
  TASK_UPDATED: 'tasksUpdated',
  TASK_COMPLETED: 'tasksCompleted',
  TASK_DELETED: 'tasksDeleted',
  CRM_TIMELINE_EVENT_CREATED: 'timelineEventsCreated',
};

const APPOINTMENT_FIELD_BY_EVENT: Record<string, keyof AppointmentCounterState> = {
  APPOINTMENT_CREATED: 'appointmentsCreated',
  APPOINTMENT_CONFIRMED: 'appointmentsConfirmed',
  APPOINTMENT_UPDATED: 'appointmentsUpdated',
  APPOINTMENT_CANCELLED: 'appointmentsCancelled',
  APPOINTMENT_RESCHEDULED: 'appointmentsRescheduled',
  APPOINTMENT_STATUS_CHANGED: 'appointmentsStatusChanged',
};

const FINANCIAL_FIELD_BY_EVENT: Record<string, keyof FinancialCounterState> = {
  RECEIVABLE_CREATED: 'receivablesCreated',
  RECEIVABLE_UPDATED: 'receivablesUpdated',
  PAYABLE_CREATED: 'payablesCreated',
  PAYABLE_UPDATED: 'payablesUpdated',
  PAYABLE_DELETED: 'payablesDeleted',
  FINANCING_CREATED: 'financingsCreated',
  FINANCING_UPDATED: 'financingsUpdated',
  PAYMENT_RECEIVED: 'paymentsReceived',
};

export const reduceCrmCounter: AnalyticsProjectionReducerFn = (current, event) => {
  const field = CRM_FIELD_BY_EVENT[event.eventType];
  if (!field) return current;
  const counters = current.counters as CrmCounterState;
  return bump(current, event, { ...counters, [field]: counters[field] + 1 });
};

export const reduceAppointmentCounter: AnalyticsProjectionReducerFn = (current, event) => {
  const field = APPOINTMENT_FIELD_BY_EVENT[event.eventType];
  if (!field) return current;
  const counters = current.counters as AppointmentCounterState;
  return bump(current, event, { ...counters, [field]: counters[field] + 1 });
};

export const reduceFinancialCounter: AnalyticsProjectionReducerFn = (current, event) => {
  const field = FINANCIAL_FIELD_BY_EVENT[event.eventType];
  if (!field) return current;
  const counters = current.counters as FinancialCounterState;
  return bump(current, event, { ...counters, [field]: counters[field] + 1 });
};

export const ANALYTICS_PROJECTION_REDUCERS: Record<
  AnalyticsProjectionId,
  AnalyticsProjectionReducerFn
> = {
  'crm-counter': reduceCrmCounter,
  'appointment-counter': reduceAppointmentCounter,
  'financial-counter': reduceFinancialCounter,
};

export function getAnalyticsProjectionReducer(
  projectionId: AnalyticsProjectionId,
): AnalyticsProjectionReducerFn {
  return ANALYTICS_PROJECTION_REDUCERS[projectionId];
}
