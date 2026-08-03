/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentHistory
 */

import type { OwnerAssignmentProcessResult } from './ownerAssignmentService.js';

const history: OwnerAssignmentProcessResult[] = [];
const CAP = 50;

export function appendOwnerAssignmentHistory(result: OwnerAssignmentProcessResult): void {
  history.push(result);
  while (history.length > CAP) history.shift();
}

export function getOwnerAssignmentHistory(): readonly OwnerAssignmentProcessResult[] {
  return [...history];
}

export function __clearOwnerAssignmentHistoryForTest(): void {
  history.length = 0;
}
