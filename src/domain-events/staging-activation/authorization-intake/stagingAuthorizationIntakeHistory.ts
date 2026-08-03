/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationIntakeHistory
 */

import type { StagingAuthorizationIntakeReport } from './stagingAuthorizationIntakeReport.js';

const history: StagingAuthorizationIntakeReport[] = [];
const CAP = 50;

export function appendStagingAuthorizationIntakeHistory(
  report: StagingAuthorizationIntakeReport,
): void {
  history.push(report);
  while (history.length > CAP) history.shift();
}

export function getStagingAuthorizationIntakeHistory(): StagingAuthorizationIntakeReport[] {
  return [...history];
}

export function __clearStagingAuthorizationIntakeHistoryForTest(): void {
  history.length = 0;
}
