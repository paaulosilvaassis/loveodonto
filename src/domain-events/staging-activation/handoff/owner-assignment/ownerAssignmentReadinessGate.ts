/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentReadinessGate
 */

import type {
  OwnerAssignmentCompleteness,
  OwnerAssignmentNextAction,
  OwnerAssignmentReadiness,
  OwnerAssignmentRecommendation,
  OwnerResponsibilityConflict,
} from './ownerAssignmentTypes.js';

export function evaluateOwnerAssignmentReadiness(args: {
  completeness: OwnerAssignmentCompleteness;
  conflicts: readonly OwnerResponsibilityConflict[];
}): OwnerAssignmentReadiness {
  // Nunca ready_for_readonly_verification / ready_for_stage_one / approved
  if (args.completeness === 'expired') return 'expired';
  if (args.completeness === 'invalid') return 'rejected';
  if (args.completeness === 'empty' || args.completeness === 'missing_required_owners') {
    return args.completeness === 'empty' ? 'blocked' : 'awaiting_real_owner_input';
  }
  if (args.completeness === 'owners_assigned_with_warnings') {
    const unresolved = args.conflicts.some((c) => c.severity === 'warning' && !c.justified);
    if (unresolved) return 'awaiting_conflict_resolution';
  }
  if (args.completeness === 'owners_assigned_unacknowledged') {
    return 'awaiting_acknowledgements';
  }
  if (args.completeness === 'owners_complete_awaiting_authorization_data') {
    return 'ready_to_collect_authorization_data';
  }
  return 'awaiting_real_owner_input';
}

export function nextActionFromOwnerReadiness(
  readiness: OwnerAssignmentReadiness,
): OwnerAssignmentNextAction {
  switch (readiness) {
    case 'awaiting_acknowledgements':
      return 'collect_owner_acknowledgements';
    case 'awaiting_conflict_resolution':
      return 'resolve_responsibility_conflicts';
    case 'ready_to_collect_authorization_data':
      return 'collect_authorization_data';
    default:
      return 'provide_real_handoff_owner_assignments';
  }
}

export function recommendationFromOwnerReadiness(
  readiness: OwnerAssignmentReadiness,
): OwnerAssignmentRecommendation {
  if (readiness === 'rejected') return 'owner_assignment_rejected';
  if (readiness === 'awaiting_acknowledgements') {
    return 'owner_assignment_awaiting_acknowledgements';
  }
  if (readiness === 'awaiting_conflict_resolution') {
    return 'owner_assignment_awaiting_conflict_resolution';
  }
  if (readiness === 'ready_to_collect_authorization_data') {
    return 'owner_assignment_complete_collect_authorization_data';
  }
  return 'owner_assignment_blocked_missing_real_input';
}
