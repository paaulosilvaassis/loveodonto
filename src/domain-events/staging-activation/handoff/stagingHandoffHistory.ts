/**
 * @module domain-events/staging-activation/handoff/stagingHandoffHistory
 */

import type { StagingAuthorizationHandoffReport } from './stagingHandoffReport.js';

const history: StagingAuthorizationHandoffReport[] = [];
const CAP = 50;

export function appendStagingHandoffHistory(report: StagingAuthorizationHandoffReport): void {
  history.push(report);
  while (history.length > CAP) history.shift();
}

export function getStagingHandoffHistory(): readonly StagingAuthorizationHandoffReport[] {
  return [...history];
}

export function __clearStagingHandoffHistoryForTest(): void {
  history.length = 0;
}
