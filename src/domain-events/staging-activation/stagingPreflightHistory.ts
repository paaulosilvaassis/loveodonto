/**
 * @module domain-events/staging-activation/stagingPreflightHistory
 * @description Histórico in-memory do preflight — Phase 8.7.
 */

import type { ControlledStagingPreflightReport } from './stagingPreflightExecutionTypes.js';

const history: ControlledStagingPreflightReport[] = [];
const CAP = 50;

export function appendStagingPreflightHistory(
  report: ControlledStagingPreflightReport,
): void {
  history.push(report);
  while (history.length > CAP) history.shift();
}

export function getStagingPreflightHistory(): ControlledStagingPreflightReport[] {
  return [...history];
}

export function __clearStagingPreflightHistoryForTest(): void {
  history.length = 0;
}
