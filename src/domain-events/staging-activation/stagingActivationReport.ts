/**
 * @module domain-events/staging-activation/stagingActivationReport
 * @description buildControlledStagingActivationPlanReport — Phase 8.6.
 */

import type { DomainEventFlagsInput } from '../domainEventFlags.js';
import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../certification/cqrsArchitectureVersion.js';
import { buildCqrsArchitectureCertificationReport } from '../certification/cqrsCertificationReport.js';
import {
  buildControlledStagingActivationPlan,
  type BuildStagingPlanOptions,
} from './stagingActivationPlan.js';
import { runStagingPreflightChecks } from './stagingPreflight.js';
import { evaluateStagingActivationGuards } from './stagingActivationGuards.js';
import { STAGING_FLAG_MATRIX, STAGING_ACTIVATION_STAGES } from './stagingFlagMatrix.js';
import { buildStagingSoakPlan } from './stagingSoakPlan.js';
import { appendStagingPlanHistory } from './stagingActivationHistory.js';
import type {
  ControlledStagingActivationPlanReport,
  StagingPlanRecommendation,
} from './stagingActivationTypes.js';

/**
 * Relatório oficial. Nunca recomenda activate/promote/enable.
 * Fase 8.6: plano default pending_authorization.
 */
export function buildControlledStagingActivationPlanReport(
  flagsInput: DomainEventFlagsInput = {},
  planOptions: BuildStagingPlanOptions = {},
  options: { recordHistory?: boolean } = {},
): ControlledStagingActivationPlanReport {
  const plan = buildControlledStagingActivationPlan(planOptions);
  const cert = buildCqrsArchitectureCertificationReport(flagsInput, {
    recordHistory: false,
  });
  const preflight = runStagingPreflightChecks(plan, flagsInput);
  const guards = evaluateStagingActivationGuards(plan);
  const soakPlan = buildStagingSoakPlan();

  const blockers = Object.freeze([
    ...new Set([
      ...guards.blockers,
      ...preflight.filter((c) => c.result === 'fail').map((c) => `${c.checkId}: ${c.message}`),
    ]),
  ]);

  const warnings = Object.freeze([
    ...new Set(
      [
        ...preflight
          .filter((c) => c.result === 'warning' || c.result === 'manual-required')
          .map((c) => `${c.checkId}: ${c.message}`),
        plan.authorization.status === 'pending'
          ? 'human_authorization: pending'
          : null,
        plan.environment.status === 'blocked'
          ? 'environment: blocked / awaiting authorization'
          : null,
      ].filter(Boolean) as string[],
    ),
  ]);

  const finalRecommendation: StagingPlanRecommendation = plan.environment.isProduction
    ? 'blocked_production_or_unauthorized_host'
    : 'staging_plan_ready_awaiting_explicit_authorization';

  const report: ControlledStagingActivationPlanReport = Object.freeze({
    plan,
    certificationStatus: cert.status,
    architectureVersion: LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    environmentStatus: plan.environment.status,
    humanApprovalStatus: plan.authorization.status,
    tenantSelection: plan.tenants,
    flagMatrix: STAGING_FLAG_MATRIX,
    activationStages: STAGING_ACTIVATION_STAGES,
    preflightChecks: preflight,
    successCriteria: plan.successCriteria,
    failureCriteria: plan.failureCriteria,
    soakPlan,
    rollbackPlan: plan.rollbackPlan,
    evidenceRequirements: plan.evidenceRequirements,
    blockers,
    warnings,
    recommendation: finalRecommendation,
    statement:
      'Controlled Staging Plan ≠ Remote Activation — autorização explícita + human approval obrigatórios; autoPromotionAllowed=false',
    evaluatedAt: new Date().toISOString(),
  });

  if (options.recordHistory !== false) {
    appendStagingPlanHistory(report);
  }

  return report;
}
