/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentInspector
 */

import { buildHandoffOwnerAssignmentReport } from './ownerAssignmentReport.js';
import {
  getOwnerAssignmentHistory,
  __clearOwnerAssignmentHistoryForTest,
} from './ownerAssignmentHistory.js';

export { __clearOwnerAssignmentHistoryForTest, getOwnerAssignmentHistory };

export function inspectStagingHandoffOwnerAssignments(rawInput: unknown | null = null) {
  const current = buildHandoffOwnerAssignmentReport(rawInput, { recordHistory: true });
  return Object.freeze({
    current,
    history: getOwnerAssignmentHistory(),
    result: current.result,
    handoffStatus: current.handoffStatus,
    completeness: current.completeness,
    readiness: current.readiness,
    recommendation: current.recommendation,
    nextAllowedAction: current.nextAllowedAction,
    ownersAssigned: current.ownersAssigned,
    ownersMissing: current.ownersMissing,
    approvalsUnchanged: true as const,
    remoteConnectionOpened: false as const,
    flagsChanged: false as const,
    stageOneExecuted: false as const,
    inspectedAt: new Date().toISOString(),
  });
}
