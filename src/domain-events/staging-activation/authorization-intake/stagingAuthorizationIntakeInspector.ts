/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationIntakeInspector
 */

import { buildStagingAuthorizationIntakeReport } from './stagingAuthorizationIntakeReport.js';
import {
  getStagingAuthorizationIntakeHistory,
  __clearStagingAuthorizationIntakeHistoryForTest,
} from './stagingAuthorizationIntakeHistory.js';

export { __clearStagingAuthorizationIntakeHistoryForTest, getStagingAuthorizationIntakeHistory };

export function inspectStagingAuthorizationIntake(rawInput: unknown | null = null) {
  const current = buildStagingAuthorizationIntakeReport(rawInput, { recordHistory: true });
  return Object.freeze({
    current,
    history: getStagingAuthorizationIntakeHistory(),
    completeness: current.completeness,
    finalGate: current.finalGate,
    recommendation: current.recommendation,
    executionApprovalStatus: current.intake.executionApproval.status,
    flagsChanged: false as const,
    remoteActionsExecuted: false as const,
    inspectedAt: new Date().toISOString(),
  });
}
