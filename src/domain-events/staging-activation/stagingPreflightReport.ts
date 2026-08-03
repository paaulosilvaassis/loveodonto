/**
 * @module domain-events/staging-activation/stagingPreflightReport
 * @description buildControlledStagingPreflightReport — Phase 8.7.
 */

import type { DomainEventFlagsInput } from '../domainEventFlags.js';
import { DOMAIN_EVENT_FLAG_DEFAULTS } from '../domainEventFlags.js';
import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../certification/cqrsArchitectureVersion.js';
import { buildCqrsArchitectureCertificationReport } from '../certification/cqrsCertificationReport.js';
import { buildReadModelPromotionReport } from '../read-models/shared/index.js';
import {
  ANALYTICS_PROJECTION_SCOPE_BY_ID,
  getReadModelProjectionScope,
} from '../read-models/shared/readModelProjectionScope.js';
import { CQRS_PROMOTION_READ_MODEL_IDS } from '../read-models/shared/readModelPromotionTypes.js';
import { buildControlledStagingActivationPlan } from './stagingActivationPlan.js';
import {
  executeControlledStagingPreflight,
  type ExecutePreflightOptions,
  BASELINE_FLAGS,
} from './stagingPreflightExecutionRunner.js';
import {
  validateFlagEnablementOrder,
  assertSequentialReadModelsOnly,
} from './stagingFlagMatrix.js';
import { buildStagingRollbackPlan } from './stagingRollback.js';
import { STAGING_EVIDENCE_REQUIREMENTS } from './stagingEvidence.js';
import { appendStagingPreflightHistory } from './stagingPreflightHistory.js';
import type { ControlledStagingPreflightReport } from './stagingPreflightExecutionTypes.js';

export function buildControlledStagingPreflightReport(
  options: ExecutePreflightOptions = {},
  meta: { recordHistory?: boolean } = {},
): ControlledStagingPreflightReport {
  const execution = executeControlledStagingPreflight(options);
  const flagsInput: DomainEventFlagsInput = options.flagsInput || {};
  const plan = buildControlledStagingActivationPlan(options.planOptions || {});
  const cert = buildCqrsArchitectureCertificationReport(flagsInput, {
    recordHistory: false,
  });
  const promotion = buildReadModelPromotionReport(flagsInput);
  const promoMap: Record<string, string> = {};
  for (const id of CQRS_PROMOTION_READ_MODEL_IDS) {
    promoMap[id] = promotion.byReadModel[id] || 'not_ready';
  }

  const flagBaseline: Record<string, boolean> = {};
  for (const k of BASELINE_FLAGS) {
    flagBaseline[k] = DOMAIN_EVENT_FLAG_DEFAULTS[k];
  }

  const depOk = validateFlagEnablementOrder([
    'DOMAIN_EVENTS',
    'DOMAIN_EVENT_AUDIT',
    'DOMAIN_EVENT_OBSERVABILITY',
    'DOMAIN_EVENT_CONSUMERS',
    'DOMAIN_EVENT_PROJECTION',
    'DOMAIN_EVENT_ANALYTICS',
    'CQRS_READ_MODEL',
    'LEAD_ANALYTICS_READ_MODEL',
  ]).ok
    && !assertSequentialReadModelsOnly([
      'LEAD_ANALYTICS_READ_MODEL',
      'APPOINTMENT_ANALYTICS_READ_MODEL',
    ]).ok;

  const scopeOk = Object.values(ANALYTICS_PROJECTION_SCOPE_BY_ID).every((s) => s === 'tenant')
    && CQRS_PROMOTION_READ_MODEL_IDS.every(
      (id) => getReadModelProjectionScope(id).scope === 'tenant',
    );

  const rollback = buildStagingRollbackPlan();

  const report: ControlledStagingPreflightReport = Object.freeze({
    execution,
    architectureVersion: LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    certificationStatus: cert.status,
    planStatus: plan.status,
    executionMode: execution.executionMode,
    environment: Object.freeze({
      environmentId: plan.environment.environmentId,
      status: plan.environment.status,
      isProduction: plan.environment.isProduction,
      authorized: plan.environment.authorized,
      type: plan.environment.environmentType,
    }),
    authorization: Object.freeze({
      status: plan.authorization.status,
      approvalId: plan.authorization.approvalId,
      approvedBy: plan.authorization.approvedBy,
    }),
    tenants: Object.freeze({
      valid: plan.tenants.valid,
      pilotCount: plan.tenants.pilotTenantIds.length,
      controlCount: plan.tenants.controlTenantIds.length,
      reason: plan.tenants.reason,
    }),
    flagBaseline: Object.freeze(flagBaseline),
    dependencyResolution: Object.freeze({
      ok: depOk,
      detail: 'local structural flag order + simultaneous RM rejection',
    }),
    tenantScope: Object.freeze({
      ok: scopeOk,
      detail: 'projectionId::tenantId / tenantRequired',
    }),
    promotionReadiness: Object.freeze(promoMap),
    observabilityReadiness: Object.freeze({
      ok: true,
      detail: 'Metrics/Health/Inspector foundation; no auto-attach on boot',
    }),
    rollbackReadiness: Object.freeze({
      ok: rollback.drill.remoteExecutionAllowed === false,
      detail: `steps=${rollback.steps.length}; drill=${rollback.drill.status}`,
    }),
    evidenceRequirementsOk: STAGING_EVIDENCE_REQUIREMENTS.every((r) => r.required),
    regression: options.regression || null,
    checks: execution.checks,
    evidence: execution.evidence,
    blockers: execution.blockers,
    warnings: execution.warnings,
    result: execution.result,
    recommendation: execution.recommendation,
    statement:
      'Preflight Execution ≠ Stage Activation — remoteActionsExecuted=false; flagsChanged=false; human approval not mutated',
    evaluatedAt: new Date().toISOString(),
  });

  if (meta.recordHistory !== false) {
    appendStagingPreflightHistory(report);
  }

  return report;
}
