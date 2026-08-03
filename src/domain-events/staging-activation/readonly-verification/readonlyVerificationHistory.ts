/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationHistory
 */

import type { ReadonlyVerificationRunnerResult } from './readonlyVerificationRunner.js';

const history: ReadonlyVerificationRunnerResult[] = [];
const CAP = 50;

export function appendReadonlyVerificationHistory(
  result: ReadonlyVerificationRunnerResult,
): void {
  history.push(result);
  while (history.length > CAP) history.shift();
}

export function getReadonlyVerificationHistory(): readonly ReadonlyVerificationRunnerResult[] {
  return [...history];
}

export function __clearReadonlyVerificationHistoryForTest(): void {
  history.length = 0;
}
