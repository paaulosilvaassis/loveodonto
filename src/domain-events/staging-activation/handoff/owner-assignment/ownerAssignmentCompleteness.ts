/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentCompleteness
 */

import { REQUIRED_HANDOFF_ROLE_IDS } from '../stagingResponsibilityMatrix.js';
import type {
  OwnerAssignmentCompleteness,
  OwnerResponsibilityConflict,
  OwnerRoleAssignment,
} from './ownerAssignmentTypes.js';

export function evaluateHandoffOwnerAssignmentCompleteness(args: {
  assignments: readonly OwnerRoleAssignment[];
  conflicts: readonly OwnerResponsibilityConflict[];
  parseEmpty?: boolean;
  invalid?: boolean;
  expired?: boolean;
}): OwnerAssignmentCompleteness {
  if (args.expired) return 'expired';
  if (args.invalid) return 'invalid';
  if (args.parseEmpty || args.assignments.length === 0) return 'empty';

  const byRole = new Map(args.assignments.map((a) => [a.roleId, a]));
  const missing = REQUIRED_HANDOFF_ROLE_IDS.filter((id) => {
    const a = byRole.get(id);
    return !a || a.status === 'missing' || !a.assignedPerson || a.status === 'invalid';
  });
  if (missing.length) return 'missing_required_owners';

  if (args.assignments.some((a) => a.status === 'expired' || a.status === 'revoked')) {
    return args.assignments.every((a) => a.status === 'expired') ? 'expired' : 'invalid';
  }

  const blockers = args.conflicts.filter((c) => c.severity === 'blocker');
  if (blockers.length) return 'missing_required_owners';

  const warnUnresolved = args.conflicts.filter(
    (c) => c.severity === 'warning' && !c.justified,
  );
  if (warnUnresolved.length) return 'owners_assigned_with_warnings';

  const unacked = REQUIRED_HANDOFF_ROLE_IDS.some((id) => {
    const a = byRole.get(id)!;
    return !a.acknowledged
      || !a.responsibilitiesAccepted
      || !a.limitationsAccepted;
  });
  if (unacked) return 'owners_assigned_unacknowledged';

  const hasApprover = Boolean(byRole.get('stage_one_approver')?.assignedPerson);
  const hasRollback = Boolean(byRole.get('rollback_operator')?.assignedPerson);
  if (hasApprover && hasRollback) {
    return 'owners_complete_awaiting_authorization_data';
  }
  return 'missing_required_owners';
}
