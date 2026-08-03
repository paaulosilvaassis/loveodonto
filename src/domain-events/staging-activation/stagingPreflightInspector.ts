/**
 * @module domain-events/staging-activation/stagingPreflightInspector
 * @description Inspector preflight — Phase 8.7. Sem HTTP/UI/persistência.
 */

import {
  buildControlledStagingPreflightReport,
} from './stagingPreflightReport.js';
import {
  getStagingPreflightHistory,
  __clearStagingPreflightHistoryForTest,
} from './stagingPreflightHistory.js';
import type { ExecutePreflightOptions } from './stagingPreflightExecutionRunner.js';
import type { ControlledStagingPreflightReport } from './stagingPreflightExecutionTypes.js';

export { __clearStagingPreflightHistoryForTest, getStagingPreflightHistory };

export interface StagingPreflightInspectorSnapshot {
  readonly current: ControlledStagingPreflightReport;
  readonly history: ControlledStagingPreflightReport[];
  readonly result: string;
  readonly recommendation: string;
  readonly authorizationStatus: string;
  readonly remoteActionsExecuted: false;
  readonly flagsChanged: false;
  readonly inspectedAt: string;
}

export function inspectControlledStagingPreflight(
  options: ExecutePreflightOptions = {},
): StagingPreflightInspectorSnapshot {
  const current = buildControlledStagingPreflightReport(options, {
    recordHistory: true,
  });
  return Object.freeze({
    current,
    history: getStagingPreflightHistory(),
    result: current.result,
    recommendation: current.recommendation,
    authorizationStatus: current.authorization.status as string,
    remoteActionsExecuted: false,
    flagsChanged: false,
    inspectedAt: new Date().toISOString(),
  });
}
