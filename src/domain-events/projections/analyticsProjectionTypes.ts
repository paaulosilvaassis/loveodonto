/**
 * @module domain-events/projections/analyticsProjectionTypes
 * @description Tipos estruturais de Analytics Projections — Phase 8.3 tenant-scoped.
 * Sem persistência. Sem side-effects de domínio.
 */

export type AnalyticsProjectionId =
  | 'crm-counter'
  | 'appointment-counter'
  | 'financial-counter';

export type AnalyticsProjectionScopeKind = 'tenant';

export type AnalyticsProjectionHealthStatus =
  | 'idle'
  | 'ready'
  | 'healthy'
  | 'degraded';

export interface CrmCounterState {
  readonly leadsCreated: number;
  readonly leadsUpdated: number;
  readonly leadsMoved: number;
  readonly followUpsCreated: number;
  readonly followUpsUpdated: number;
  readonly followUpsCompleted: number;
  readonly followUpsCancelled: number;
  readonly followUpsRescheduled: number;
  readonly tasksCreated: number;
  readonly tasksUpdated: number;
  readonly tasksCompleted: number;
  readonly tasksDeleted: number;
  readonly timelineEventsCreated: number;
}

export interface AppointmentCounterState {
  readonly appointmentsCreated: number;
  readonly appointmentsConfirmed: number;
  readonly appointmentsUpdated: number;
  readonly appointmentsCancelled: number;
  readonly appointmentsRescheduled: number;
  readonly appointmentsStatusChanged: number;
}

export interface FinancialCounterState {
  readonly receivablesCreated: number;
  readonly receivablesUpdated: number;
  readonly payablesCreated: number;
  readonly payablesUpdated: number;
  readonly payablesDeleted: number;
  readonly financingsCreated: number;
  readonly financingsUpdated: number;
  readonly paymentsReceived: number;
}

export type AnalyticsProjectionCounters =
  | CrmCounterState
  | AppointmentCounterState
  | FinancialCounterState;

export interface AnalyticsProjectionSnapshot {
  readonly projectionId: AnalyticsProjectionId;
  readonly tenantId: string;
  readonly scope: AnalyticsProjectionScopeKind;
  readonly version: number;
  readonly counters: AnalyticsProjectionCounters;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sourceEventCount: number;
  readonly lastEventId: string | null;
  readonly lastEventType: string | null;
  readonly lastCorrelationId: string | null;
}

export interface AnalyticsProjectionApplyResult {
  readonly applied: boolean;
  readonly skipped: boolean;
  readonly rejected: boolean;
  readonly reason?: string;
  readonly code?:
    | 'MISSING_TENANT_SCOPE'
    | 'INVALID_TENANT_SCOPE'
    | 'TENANT_SCOPE_MISMATCH'
    | 'NO_MAPPING'
    | 'FLAGS_OFF'
    | 'NO_CHANGE'
    | string;
  readonly projectionIds: AnalyticsProjectionId[];
  readonly snapshots: AnalyticsProjectionSnapshot[];
  readonly tenantId: string | null;
}

export type AnalyticsProjectionReducerFn = (
  current: AnalyticsProjectionSnapshot,
  event: {
    eventId: string;
    eventType: string;
    tenantId: string;
    timestamp?: string;
    correlationId?: string | null;
  },
) => AnalyticsProjectionSnapshot;

/** Entrada legada evento → projection (compat). */
export interface AnalyticsProjectionRegistryEntry {
  readonly eventType: string;
  readonly projectionId: AnalyticsProjectionId;
  readonly reducerId: string;
  readonly description: string;
  readonly scope: AnalyticsProjectionScopeKind;
  readonly tenantRequired: true;
  readonly version: number;
}

/** Definição oficial por projectionId — Phase 8.3. */
export interface AnalyticsProjectionDefinition {
  readonly projectionId: AnalyticsProjectionId;
  readonly scope: AnalyticsProjectionScopeKind;
  readonly tenantRequired: true;
  readonly supportedEventTypes: readonly string[];
  readonly reducerId: string;
  readonly version: number;
}
