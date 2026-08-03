/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationInspector
 */

import { buildAuthorizedStagingReadonlyVerificationReport } from './readonlyVerificationReport.js';
import {
  getReadonlyVerificationHistory,
  __clearReadonlyVerificationHistoryForTest,
} from './readonlyVerificationHistory.js';
import type { ReadonlyVerificationRunnerInput } from './readonlyVerificationRunner.js';

export { __clearReadonlyVerificationHistoryForTest, getReadonlyVerificationHistory };

export function inspectStagingReadonlyVerification(
  input: ReadonlyVerificationRunnerInput = {},
) {
  const current = buildAuthorizedStagingReadonlyVerificationReport(input, {
    recordHistory: true,
  });
  return Object.freeze({
    current,
    history: getReadonlyVerificationHistory(),
    result: current.result,
    finalGate: current.finalGate,
    recommendation: current.recommendation,
    simulationOnly: current.simulationOnly,
    executionApprovalStillPending: true as const,
    stageOneBlocked: true as const,
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
    inspectedAt: new Date().toISOString(),
  });
}
