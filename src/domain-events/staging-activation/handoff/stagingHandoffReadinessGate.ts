/**
 * @module domain-events/staging-activation/handoff/stagingHandoffReadinessGate
 */

import { openBlockerCount } from './stagingBlockerTracker.js';
import { humanReviewAllComplete } from './stagingHumanReviewChecklist.js';
import { requiredDataMissingCount } from './stagingRequiredDataChecklist.js';
import { countAssignedOwners } from './stagingResponsibilityMatrix.js';
import type { StagingHandoffPackage } from './stagingHandoffPackage.js';
import type {
  StagingHandoffReadiness,
  StagingHandoffRecommendation,
} from './stagingHandoffTypes.js';
import { validateStagingAuthorizationHandoff } from './stagingHandoffValidator.js';

export function evaluateStagingAuthorizationHandoffReadiness(
  pkg: StagingHandoffPackage,
): StagingHandoffReadiness {
  if (pkg.status === 'rejected') return 'rejected';
  if (pkg.status === 'expired') return 'expired';

  const validation = validateStagingAuthorizationHandoff(pkg);
  if (validation.blockers.some((b) => /expirad/i.test(b))) return 'expired';

  const assigned = countAssignedOwners(pkg.owners);
  const missing = requiredDataMissingCount(pkg.requiredData);
  const open = openBlockerCount(pkg.currentBlockers);
  const reviewOk = humanReviewAllComplete(pkg.humanReview);

  if (assigned === 0 || missing > 0 || open > 0) {
    return 'awaiting_external_input';
  }
  if (!reviewOk) return 'awaiting_human_review';

  // Nunca ready_to_execute_stage_one
  if (
    pkg.status === 'ready_to_request_readonly_verification'
    && validation.ok
    && reviewOk
  ) {
    return 'ready_to_request_readonly_verification';
  }

  return 'awaiting_human_review';
}

export function recommendationFromHandoffReadiness(
  readiness: StagingHandoffReadiness,
  pkg: StagingHandoffPackage,
): StagingHandoffRecommendation {
  if (readiness === 'rejected' || pkg.status === 'rejected') return 'handoff_rejected';
  if (readiness === 'expired' || pkg.status === 'expired') return 'handoff_expired';
  if (countAssignedOwners(pkg.owners) === 0) {
    return 'handoff_incomplete_awaiting_owner_assignment';
  }
  if (readiness === 'awaiting_external_input') {
    return 'handoff_awaiting_required_authorization_data';
  }
  if (readiness === 'awaiting_human_review') {
    return 'handoff_awaiting_human_review';
  }
  if (readiness === 'ready_to_request_readonly_verification') {
    return 'handoff_ready_to_request_authorized_readonly_verification';
  }
  return 'handoff_awaiting_required_authorization_data';
}
