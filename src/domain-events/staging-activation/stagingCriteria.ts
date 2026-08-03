/**
 * @module domain-events/staging-activation/stagingCriteria
 * @description Success / Failure criteria — Phase 8.6.
 */

import type {
  StagingFailureCriterion,
  StagingSuccessCriterion,
} from './stagingActivationTypes.js';

export const STAGING_SUCCESS_CRITERIA: readonly StagingSuccessCriterion[] = Object.freeze([
  Object.freeze({
    criterionId: 'de_zero_unexpected_reject',
    domain: 'domain-events',
    description: 'zero rejected inesperado',
  }),
  Object.freeze({
    criterionId: 'de_registry_ok',
    domain: 'domain-events',
    description: 'zero registry inconsistency',
  }),
  Object.freeze({
    criterionId: 'de_correlation_ok',
    domain: 'domain-events',
    description: 'zero broken correlation crítico',
  }),
  Object.freeze({
    criterionId: 'de_tenant_match',
    domain: 'domain-events',
    description: 'zero tenant mismatch',
  }),
  Object.freeze({
    criterionId: 'de_publisher_health',
    domain: 'domain-events',
    description: 'publisher Health saudável',
  }),
  Object.freeze({
    criterionId: 'c_zero_unexpected_dlq',
    domain: 'consumers',
    description: 'zero dead-letter inesperado',
  }),
  Object.freeze({
    criterionId: 'c_zero_timeout_loop',
    domain: 'consumers',
    description: 'zero timeout recorrente',
  }),
  Object.freeze({
    criterionId: 'c_zero_dup_exec',
    domain: 'consumers',
    description: 'zero duplicate execution',
  }),
  Object.freeze({
    criterionId: 'c_audit_consistent',
    domain: 'consumers',
    description: 'audit projection consistente',
  }),
  Object.freeze({
    criterionId: 'a_zero_leakage',
    domain: 'analytics',
    description: 'zero tenant leakage',
  }),
  Object.freeze({
    criterionId: 'a_zero_missing_tenant',
    domain: 'analytics',
    description: 'zero missing tenant',
  }),
  Object.freeze({
    criterionId: 'a_zero_mismatch',
    domain: 'analytics',
    description: 'zero tenant mismatch',
  }),
  Object.freeze({
    criterionId: 'a_counters_ok',
    domain: 'analytics',
    description: 'counters consistentes',
  }),
  Object.freeze({
    criterionId: 'a_health_ok',
    domain: 'analytics',
    description: 'Health saudável',
  }),
  Object.freeze({
    criterionId: 'rm_zero_blocking_drift',
    domain: 'read-models',
    description: 'zero drift bloqueante',
  }),
  Object.freeze({
    criterionId: 'rm_zero_isolation_fail',
    domain: 'read-models',
    description: 'zero isolation failure',
  }),
  Object.freeze({
    criterionId: 'rm_consistency_passing',
    domain: 'read-models',
    description: 'consistency passing',
  }),
  Object.freeze({
    criterionId: 'rm_soak_passing',
    domain: 'read-models',
    description: 'soak passing',
  }),
  Object.freeze({
    criterionId: 'rm_promotion_ready',
    domain: 'read-models',
    description: 'Promotion Readiness ready',
  }),
  Object.freeze({
    criterionId: 'rm_snapshot_preserved',
    domain: 'read-models',
    description: 'último snapshot válido preservado',
  }),
]);

export const STAGING_FAILURE_CRITERIA: readonly StagingFailureCriterion[] = Object.freeze([
  Object.freeze({
    criterionId: 'fail_tenant_leakage',
    description: 'tenant leakage',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_scope_mismatch',
    description: 'tenant scope mismatch',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_counter_drift',
    description: 'counter drift bloqueante',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_rm_inconsistent',
    description: 'Read Model inconsistente',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_health_degraded',
    description: 'Health degraded persistente',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_dup_consumer',
    description: 'consumer duplicate execution',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_unexpected_dlq',
    description: 'dead-letter inesperado',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_rollback_broken',
    description: 'falha de rollback',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_unsanitized_error',
    description: 'erro não sanitizado',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_production_detected',
    description: 'produção detectada',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_unauthorized_host',
    description: 'host não autorizado',
    requiresRollback: true,
  }),
  Object.freeze({
    criterionId: 'fail_approval_missing',
    description: 'aprovação ausente ou expirada',
    requiresRollback: true,
  }),
]);
