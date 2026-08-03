/**
 * @module domain-events/staging-activation/stagingSoakPlan
 * @description Soak Plan 48–72h — Phase 8.6. Sem scheduler/cron/worker.
 */

import type { StagingSoakPlanContract } from './stagingActivationTypes.js';

export function buildStagingSoakPlan(): StagingSoakPlanContract {
  return Object.freeze({
    recommendedDurationHoursMin: 48,
    recommendedDurationHoursMax: 72,
    windows: Object.freeze([
      Object.freeze({
        windowId: 'w-preflight',
        stageId: 'preflight' as const,
        description: 'Janela preflight',
        order: 0,
      }),
      Object.freeze({
        windowId: 'w-observability',
        stageId: 'observability' as const,
        description: 'Observability only',
        order: 1,
      }),
      Object.freeze({
        windowId: 'w-audit',
        stageId: 'audit_projection' as const,
        description: 'Audit projection',
        order: 2,
      }),
      Object.freeze({
        windowId: 'w-analytics',
        stageId: 'analytics_projection' as const,
        description: 'Analytics projection',
        order: 3,
      }),
      Object.freeze({
        windowId: 'w-lead',
        stageId: 'lead_read_model' as const,
        description: 'Lead Read Model',
        order: 4,
      }),
      Object.freeze({
        windowId: 'w-appointment',
        stageId: 'appointment_read_model' as const,
        description: 'Appointment Read Model',
        order: 5,
      }),
      Object.freeze({
        windowId: 'w-financial',
        stageId: 'financial_read_model' as const,
        description: 'Financial Read Model',
        order: 6,
      }),
      Object.freeze({
        windowId: 'w-rollback',
        stageId: 'rollback_drill' as const,
        description: 'Rollback drill',
        order: 7,
      }),
      Object.freeze({
        windowId: 'w-review',
        stageId: 'final_review' as const,
        description: 'Review final',
        order: 8,
      }),
    ]),
    schedulerAllowed: false,
    backgroundWorkerAllowed: false,
    multiTenant: Object.freeze({
      pilotSlots: Object.freeze(['pilot-a', 'pilot-b'] as const),
      controlSlot: 'control' as const,
      requireIsolation: true as const,
      inventRealTenantIds: false as const,
    }),
  });
}
