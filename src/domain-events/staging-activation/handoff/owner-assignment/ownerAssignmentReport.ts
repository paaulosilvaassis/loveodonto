/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentReport
 */

import { appendOwnerAssignmentHistory } from './ownerAssignmentHistory.js';
import {
  buildCandidateHandoffFromOwnerAssignments,
  type OwnerAssignmentProcessResult,
} from './ownerAssignmentService.js';

export interface HandoffOwnerAssignmentReport {
  readonly process: OwnerAssignmentProcessResult;
  readonly result: string;
  readonly handoffStatus: string;
  readonly completeness: string;
  readonly readiness: string;
  readonly recommendation: string;
  readonly nextAllowedAction: string;
  readonly ownersAssigned: number;
  readonly ownersMissing: number;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly statement: string;
  readonly evaluatedAt: string;
  readonly approvalsUnchanged: true;
  readonly remoteConnectionOpened: false;
  readonly flagsChanged: false;
  readonly stageOneExecuted: false;
}

export function buildHandoffOwnerAssignmentReport(
  rawInput: unknown | null = null,
  meta: { recordHistory?: boolean } = {},
): HandoffOwnerAssignmentReport {
  const process = buildCandidateHandoffFromOwnerAssignments(rawInput);
  const assigned = process.assignmentValidation.filter(
    (a) => a.assignedPerson && a.status !== 'missing' && a.status !== 'invalid',
  ).length;
  const report: HandoffOwnerAssignmentReport = Object.freeze({
    process,
    result: process.result,
    handoffStatus: process.handoffStatus,
    completeness: process.completeness,
    readiness: process.readiness,
    recommendation: process.recommendation,
    nextAllowedAction: process.nextAllowedAction,
    ownersAssigned: assigned,
    ownersMissing: process.missingRoles.length,
    blockers: process.blockers,
    warnings: process.warnings,
    statement:
      'Owner Assignment ≠ Human Approval ≠ Read-only ≠ Stage 1 ≠ Execution — approvals unchanged; no remote',
    evaluatedAt: new Date().toISOString(),
    approvalsUnchanged: true as const,
    remoteConnectionOpened: false as const,
    flagsChanged: false as const,
    stageOneExecuted: false as const,
  });
  if (meta.recordHistory !== false) {
    appendOwnerAssignmentHistory(process);
  }
  return report;
}
