/**
 * @module domain-events/read-models/appointmentAnalytics
 * @description Appointment Analytics Read Model — Phase 8.1.
 * Somente appointment-counter. Sem domínio operacional.
 */

import {
  DEFAULT_READ_MODEL_CACHE_POLICY,
  DEFAULT_READ_MODEL_SNAPSHOT_POLICY,
  freezeReadModelSnapshot,
  type ReadModelDefinition,
} from './shared/index.js';
import type { AppointmentCounterState } from '../projections/analyticsProjectionTypes.js';

export const APPOINTMENT_ANALYTICS_READ_MODEL_ID = 'appointment-analytics';

export interface AppointmentAnalyticsIndicators {
  readonly totalAppointmentsCreated: number;
  readonly totalAppointmentsCancelled: number;
  readonly totalAppointmentsRescheduled: number;
  readonly totalAppointmentsConfirmed: number;
  readonly totalStatusChanges: number;
  readonly totalUpdated: number;
}

export interface AppointmentAnalyticsEnvelopePayload {
  readonly indicators: AppointmentAnalyticsIndicators;
}

export function buildAppointmentAnalyticsIndicators(
  counters: AppointmentCounterState,
): AppointmentAnalyticsIndicators {
  return Object.freeze({
    totalAppointmentsCreated: counters.appointmentsCreated,
    totalAppointmentsCancelled: counters.appointmentsCancelled,
    totalAppointmentsRescheduled: counters.appointmentsRescheduled,
    totalAppointmentsConfirmed: counters.appointmentsConfirmed,
    totalStatusChanges: counters.appointmentsStatusChanged,
    totalUpdated: counters.appointmentsUpdated,
  });
}

export function createAppointmentAnalyticsReadModelDefinition(): ReadModelDefinition<AppointmentAnalyticsEnvelopePayload> {
  return {
    readModelId: APPOINTMENT_ANALYTICS_READ_MODEL_ID,
    readModelName: 'Appointment Analytics',
    version: 1,
    projectionSources: ['appointment-counter'],
    builder: ({ previous, projectionSnapshots, tenantId, now }) => {
      const appt = projectionSnapshots.appointment as {
        counters?: AppointmentCounterState;
        version?: number;
      } | undefined;
      const counters = appt?.counters || {
        appointmentsCreated: 0,
        appointmentsConfirmed: 0,
        appointmentsUpdated: 0,
        appointmentsCancelled: 0,
        appointmentsRescheduled: 0,
        appointmentsStatusChanged: 0,
      };
      const indicators = buildAppointmentAnalyticsIndicators(counters);
      return freezeReadModelSnapshot({
        readModelId: APPOINTMENT_ANALYTICS_READ_MODEL_ID,
        version: (previous?.version || 0) + 1,
        builtAt: now || new Date().toISOString(),
        tenantId: String(tenantId || ''),
        sourceProjectionIds: ['appointment-counter'],
        sourceVersions: { 'appointment-counter': Number(appt?.version || 0) },
        lifecycleState: 'ready',
        payload: { indicators },
      });
    },
    lifecycle: { initialState: 'idle', autoRebuild: false },
    cachePolicy: { ...DEFAULT_READ_MODEL_CACHE_POLICY },
    snapshotPolicy: { ...DEFAULT_READ_MODEL_SNAPSHOT_POLICY },
    flagKey: 'APPOINTMENT_ANALYTICS_READ_MODEL',
    description: 'Appointment analytics from appointment-counter projection only.',
  };
}
