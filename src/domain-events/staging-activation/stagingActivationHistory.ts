/**
 * @module domain-events/staging-activation/stagingActivationHistory
 * @description Histórico in-memory do plano — Phase 8.6.
 */

import type { ControlledStagingActivationPlanReport } from './stagingActivationTypes.js';

const history: ControlledStagingActivationPlanReport[] = [];
const CAP = 50;

export function appendStagingPlanHistory(
  report: ControlledStagingActivationPlanReport,
): void {
  history.push(report);
  while (history.length > CAP) history.shift();
}

export function getStagingPlanHistory(): ControlledStagingActivationPlanReport[] {
  return [...history];
}

export function __clearStagingPlanHistoryForTest(): void {
  history.length = 0;
}
