/**
 * @module domain-events/read-models/analyticsReadModelRefresh
 * @description Refresh explícito Appointment / Financial — Phase 8.3 tenant-scoped.
 */

import {
  isAppointmentAnalyticsReadModelEnabled,
  isFinancialAnalyticsReadModelEnabled,
  type DomainEventFlagsInput,
} from '../domainEventFlags.js';
import { getAnalyticsProjection } from '../projections/analyticsProjectionStore.js';
import type {
  AppointmentCounterState,
  FinancialCounterState,
} from '../projections/analyticsProjectionTypes.js';
import {
  attachAppointmentAnalyticsReadModel,
  attachFinancialAnalyticsReadModel,
} from './attachAnalyticsReadModels.js';
import { buildReadModelSnapshotExplicit } from './shared/readModelBuilder.js';
import { requireReadModelTenantId } from './shared/readModelTenant.js';
import { APPOINTMENT_ANALYTICS_READ_MODEL_ID } from './appointmentAnalytics.js';
import { FINANCIAL_ANALYTICS_READ_MODEL_ID } from './financialAnalytics.js';
import type { ReadModelSnapshotEnvelope } from './shared/readModelTypes.js';
import type { AppointmentAnalyticsEnvelopePayload } from './appointmentAnalytics.js';
import type { FinancialAnalyticsEnvelopePayload } from './financialAnalytics.js';

export function refreshAppointmentAnalyticsReadModel(
  flagsInput: DomainEventFlagsInput = {},
  options: { now?: string; tenantId?: string | null } = {},
) {
  if (!isAppointmentAnalyticsReadModelEnabled(flagsInput)) {
    return { built: false, skipped: true, reason: 'APPOINTMENT_ANALYTICS_READ_MODEL=false', snapshot: null };
  }
  attachAppointmentAnalyticsReadModel(flagsInput);
  let tenantId: string;
  try {
    tenantId = requireReadModelTenantId(options.tenantId, { allowTestFallback: false });
  } catch (err) {
    return {
      built: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
      snapshot: null,
    };
  }
  const projection = getAnalyticsProjection('appointment-counter', tenantId);
  if (!projection || projection.tenantId !== tenantId) {
    return {
      built: false,
      skipped: true,
      reason: 'appointment-counter unavailable for tenant',
      snapshot: null,
    };
  }
  const result = buildReadModelSnapshotExplicit({
    readModelId: APPOINTMENT_ANALYTICS_READ_MODEL_ID,
    tenantId,
    now: options.now,
    useCache: false,
    flagsInput,
    projectionSnapshots: {
      appointment: {
        counters: projection.counters as AppointmentCounterState,
        version: projection.version,
      },
    },
  });
  return {
    ...result,
    indicators: result.snapshot
      ? (result.snapshot as ReadModelSnapshotEnvelope<AppointmentAnalyticsEnvelopePayload>)
        .payload.indicators
      : null,
  };
}

export function refreshFinancialAnalyticsReadModel(
  flagsInput: DomainEventFlagsInput = {},
  options: { now?: string; tenantId?: string | null } = {},
) {
  if (!isFinancialAnalyticsReadModelEnabled(flagsInput)) {
    return { built: false, skipped: true, reason: 'FINANCIAL_ANALYTICS_READ_MODEL=false', snapshot: null };
  }
  attachFinancialAnalyticsReadModel(flagsInput);
  let tenantId: string;
  try {
    tenantId = requireReadModelTenantId(options.tenantId, { allowTestFallback: false });
  } catch (err) {
    return {
      built: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
      snapshot: null,
    };
  }
  const projection = getAnalyticsProjection('financial-counter', tenantId);
  if (!projection || projection.tenantId !== tenantId) {
    return {
      built: false,
      skipped: true,
      reason: 'financial-counter unavailable for tenant',
      snapshot: null,
    };
  }
  const result = buildReadModelSnapshotExplicit({
    readModelId: FINANCIAL_ANALYTICS_READ_MODEL_ID,
    tenantId,
    now: options.now,
    useCache: false,
    flagsInput,
    projectionSnapshots: {
      financial: {
        counters: projection.counters as FinancialCounterState,
        version: projection.version,
      },
    },
  });
  return {
    ...result,
    indicators: result.snapshot
      ? (result.snapshot as ReadModelSnapshotEnvelope<FinancialAnalyticsEnvelopePayload>)
        .payload.indicators
      : null,
  };
}
