/**
 * @module domain-events/staging-activation/authorization/stagingRollbackAcknowledgement
 */

import type { StagingRollbackAcknowledgement } from './stagingAuthorizationTypes.js';
import { STAGE_ONE_ROLLBACK_FLAG_ORDER } from './stagingAuthorizationTypes.js';

export interface StagingRollbackAckInput {
  reviewed?: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export function buildStagingRollbackAcknowledgement(
  input: StagingRollbackAckInput = {},
): StagingRollbackAcknowledgement {
  const reviewed = Boolean(input.reviewed && input.reviewedBy && input.reviewedAt);
  return Object.freeze({
    rollbackPlanId: 'stage1-rollback-observability',
    reviewed,
    reviewedBy: reviewed ? (input.reviewedBy || null) : null,
    reviewedAt: reviewed ? (input.reviewedAt || null) : null,
    flagsToDisable: STAGE_ONE_ROLLBACK_FLAG_ORDER,
    maximumRollbackTimeMinutes: 15,
    dataImpact: 'none_operational',
    indexedDbImpact: 'preserved',
    supabaseImpact: 'untouched',
    evidencePreservation: true,
    status: reviewed ? 'acknowledged' : 'pending',
  });
}
