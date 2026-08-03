/**
 * @module domain-events/staging-activation/stagingRollback
 * @description Rollback Plan ordenado — Phase 8.6.
 * Sem execução remota.
 */

import type { DomainEventFlagKey } from '../domainEventFlags.js';
import type {
  StagingRollbackPlanContract,
  StagingRollbackStep,
} from './stagingActivationTypes.js';

/** Ordem reversa oficial de desligamento. */
export const STAGING_ROLLBACK_FLAG_ORDER = Object.freeze([
  'FINANCIAL_ANALYTICS_READ_MODEL',
  'APPOINTMENT_ANALYTICS_READ_MODEL',
  'LEAD_ANALYTICS_READ_MODEL',
  'CQRS_READ_MODEL_SOAK',
  'CQRS_READ_MODEL_CONSISTENCY',
  'CQRS_READ_MODEL',
  'DOMAIN_EVENT_ANALYTICS',
  'DOMAIN_EVENT_PROJECTION',
  'DOMAIN_EVENT_CONSUMER_AUDIT',
  'DOMAIN_EVENT_CONSUMERS',
  'DOMAIN_EVENT_OBSERVABILITY',
  'DOMAIN_EVENT_AUDIT',
  'DOMAIN_EVENTS',
] as const satisfies readonly DomainEventFlagKey[]);

export function buildStagingRollbackPlan(): StagingRollbackPlanContract {
  const steps: StagingRollbackStep[] = STAGING_ROLLBACK_FLAG_ORDER.map((flag, i) =>
    Object.freeze({
      order: i + 1,
      flag,
      action: 'set_false' as const,
    }),
  );
  return Object.freeze({
    steps: Object.freeze(steps),
    requiresMigration: false,
    requiresRebuild: false,
    preservesOperationalData: true,
    preservesIndexedDb: true,
    preservesSupabase: true,
    preservesEvidence: true,
    drill: Object.freeze({
      drillId: 'rollback-drill-planned',
      status: 'planned_not_executed' as const,
      remoteExecutionAllowed: false,
      notes:
        'Phase 8.6 — drill contract only; execução remota proibida nesta phase',
    }),
  });
}
