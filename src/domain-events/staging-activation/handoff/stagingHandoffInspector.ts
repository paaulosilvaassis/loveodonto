/**
 * @module domain-events/staging-activation/handoff/stagingHandoffInspector
 */

import { buildStagingAuthorizationHandoffReport } from './stagingHandoffReport.js';
import {
  getStagingHandoffHistory,
  __clearStagingHandoffHistoryForTest,
} from './stagingHandoffHistory.js';
import type { BuildHandoffPackageInput } from './stagingHandoffPackage.js';

export { __clearStagingHandoffHistoryForTest, getStagingHandoffHistory };

export function inspectStagingAuthorizationHandoff(
  input: BuildHandoffPackageInput = {},
) {
  const current = buildStagingAuthorizationHandoffReport(input, { recordHistory: true });
  return Object.freeze({
    current,
    history: getStagingHandoffHistory(),
    handoffStatus: current.handoffStatus,
    readiness: current.readiness,
    recommendation: current.recommendation,
    nextAllowedAction: current.nextAllowedAction,
    ownersAssigned: current.ownersAssigned,
    openBlockers: current.openBlockers,
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
    stageOneExecuted: false as const,
    inspectedAt: new Date().toISOString(),
  });
}
