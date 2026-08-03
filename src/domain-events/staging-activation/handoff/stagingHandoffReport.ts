/**
 * @module domain-events/staging-activation/handoff/stagingHandoffReport
 */

import {
  buildStagingAuthorizationHandoffPackage,
  type BuildHandoffPackageInput,
  type StagingHandoffPackage,
} from './stagingHandoffPackage.js';
import { appendStagingHandoffHistory } from './stagingHandoffHistory.js';
import {
  evaluateStagingAuthorizationHandoffReadiness,
  recommendationFromHandoffReadiness,
} from './stagingHandoffReadinessGate.js';
import { validateStagingAuthorizationHandoff } from './stagingHandoffValidator.js';
import type {
  StagingHandoffReadiness,
  StagingHandoffRecommendation,
} from './stagingHandoffTypes.js';

export interface StagingAuthorizationHandoffReport {
  readonly package: StagingHandoffPackage;
  readonly handoffStatus: string;
  readonly readiness: StagingHandoffReadiness;
  readonly recommendation: StagingHandoffRecommendation;
  readonly nextAllowedAction: string;
  readonly forbiddenActions: readonly string[];
  readonly ownersAssigned: number;
  readonly openBlockers: number;
  readonly segregationWarningCount: number;
  readonly validationOk: boolean;
  readonly validationBlockers: readonly string[];
  readonly statement: string;
  readonly evaluatedAt: string;
  readonly remoteConnectionOpened: false;
  readonly remoteReadsExecuted: false;
  readonly remoteWritesExecuted: false;
  readonly flagsChanged: false;
  readonly stageOneExecuted: false;
}

export function buildStagingAuthorizationHandoffReport(
  input: BuildHandoffPackageInput = {},
  meta: { recordHistory?: boolean } = {},
): StagingAuthorizationHandoffReport {
  const pkg = buildStagingAuthorizationHandoffPackage(input);
  const validation = validateStagingAuthorizationHandoff(pkg);
  const readiness = evaluateStagingAuthorizationHandoffReadiness(pkg);
  const recommendation = recommendationFromHandoffReadiness(readiness, pkg);

  const report: StagingAuthorizationHandoffReport = Object.freeze({
    package: pkg,
    handoffStatus: pkg.status,
    readiness,
    recommendation,
    nextAllowedAction: pkg.nextAllowedAction,
    forbiddenActions: pkg.forbiddenActions,
    ownersAssigned: pkg.owners.filter((o) => o.assignmentStatus === 'assigned').length,
    openBlockers: pkg.currentBlockers.filter(
      (b) => b.status === 'open' || b.status === 'waiting_external_input',
    ).length,
    segregationWarningCount: pkg.segregationWarnings.length,
    validationOk: validation.ok,
    validationBlockers: validation.blockers,
    statement:
      'Technical Readiness ≠ Authorization Data ≠ Human Approval ≠ Remote Verification ≠ Stage 1 — nextAction never execute_stage_one',
    evaluatedAt: new Date().toISOString(),
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
    stageOneExecuted: false as const,
  });

  if (meta.recordHistory !== false) {
    appendStagingHandoffHistory(report);
  }
  return report;
}
