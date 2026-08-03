/**
 * @module domain-events/staging-activation/authorization/stagingAuthorizationReport
 */

import type { DomainEventFlagsInput } from '../../domainEventFlags.js';
import {
  buildStagingAuthorizationPackage,
  type BuildAuthorizationPackageOptions,
} from './stagingAuthorizationPackage.js';
import { evaluateStageOneReadiness } from './stageOneReadinessGate.js';
import { appendStagingAuthorizationHistory } from './stagingAuthorizationHistory.js';
import type {
  StagingAuthorizationRecommendation,
  StagingAuthorizationPackage,
  StageOneReadinessGateResult,
} from './stagingAuthorizationTypes.js';

export interface ControlledStagingAuthorizationReport {
  readonly package: StagingAuthorizationPackage;
  readonly packageStatus: StagingAuthorizationPackage['status'];
  readonly environment: StagingAuthorizationPackage['environmentDeclaration'];
  readonly humanApproval: StagingAuthorizationPackage['humanApproval'];
  readonly tenants: StagingAuthorizationPackage['tenantSelection'];
  readonly readonlyAccess: StagingAuthorizationPackage['readonlyAccessDeclaration'];
  readonly stageOne: StagingAuthorizationPackage['stageOneAuthorization'];
  readonly rollback: StagingAuthorizationPackage['rollbackAcknowledgement'];
  readonly evidence: StagingAuthorizationPackage['evidenceAcknowledgement'];
  readonly risks: StagingAuthorizationPackage['riskAcknowledgement'];
  readonly readiness: StageOneReadinessGateResult;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly recommendation: StagingAuthorizationRecommendation;
  readonly statement: string;
  readonly evaluatedAt: string;
  readonly flagsChanged: false;
  readonly remoteActionsExecuted: false;
}

function recommendationFor(
  pkg: StagingAuthorizationPackage,
  readiness: StageOneReadinessGateResult,
): StagingAuthorizationRecommendation {
  if (pkg.status === 'rejected') return 'authorization_rejected';
  if (pkg.status === 'expired' || pkg.humanApproval.status === 'expired') {
    return 'authorization_expired';
  }
  if (readiness.status === 'ready_for_explicit_stage_one_execution') {
    return 'stage_one_ready_awaiting_explicit_execution_command';
  }
  if (pkg.status === 'pending_review') {
    return 'authorization_package_pending_human_review';
  }
  return 'authorization_package_incomplete';
}

export function buildStagingAuthorizationPackageReport(
  options: BuildAuthorizationPackageOptions = {},
  flagsInput: DomainEventFlagsInput = {},
  meta: { recordHistory?: boolean; regressionGreen?: boolean } = {},
): ControlledStagingAuthorizationReport {
  const pkg = buildStagingAuthorizationPackage(options);
  const readiness = evaluateStageOneReadiness(pkg, flagsInput, {
    regressionGreen: meta.regressionGreen,
  });
  const recommendation = recommendationFor(pkg, readiness);

  const report: ControlledStagingAuthorizationReport = Object.freeze({
    package: pkg,
    packageStatus: pkg.status,
    environment: pkg.environmentDeclaration,
    humanApproval: pkg.humanApproval,
    tenants: pkg.tenantSelection,
    readonlyAccess: pkg.readonlyAccessDeclaration,
    stageOne: pkg.stageOneAuthorization,
    rollback: pkg.rollbackAcknowledgement,
    evidence: pkg.evidenceAcknowledgement,
    risks: pkg.riskAcknowledgement,
    readiness,
    blockers: Object.freeze([...new Set([...pkg.blockers, ...readiness.blockers])]),
    warnings: pkg.warnings,
    recommendation,
    statement:
      'Authorization Package ≠ Stage Execution — dry-run only in Phase 8.8; human approval not mutated; flags unchanged',
    evaluatedAt: new Date().toISOString(),
    flagsChanged: false,
    remoteActionsExecuted: false,
  });

  if (meta.recordHistory !== false) {
    appendStagingAuthorizationHistory(report);
  }

  return report;
}
