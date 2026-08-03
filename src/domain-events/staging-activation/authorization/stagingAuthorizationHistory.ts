/**
 * @module domain-events/staging-activation/authorization/stagingAuthorizationHistory
 */

import type { ControlledStagingAuthorizationReport } from './stagingAuthorizationReport.js';

const history: ControlledStagingAuthorizationReport[] = [];
const CAP = 50;

export function appendStagingAuthorizationHistory(
  report: ControlledStagingAuthorizationReport,
): void {
  history.push(report);
  while (history.length > CAP) history.shift();
}

export function getStagingAuthorizationHistory(): ControlledStagingAuthorizationReport[] {
  return [...history];
}

export function __clearStagingAuthorizationHistoryForTest(): void {
  history.length = 0;
}
