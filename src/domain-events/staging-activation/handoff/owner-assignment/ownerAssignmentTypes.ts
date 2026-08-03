/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentTypes
 * Phase 8.12 — Handoff Owner Assignment + Authorization Input Validation.
 * Owner Assignment ≠ Human Approval ≠ Read-only Auth ≠ Stage 1 ≠ Execution.
 */

import type { StagingHandoffRoleId } from '../stagingHandoffTypes.js';

export type OwnerAssignmentFieldStatus =
  | 'missing'
  | 'provided'
  | 'valid'
  | 'warning'
  | 'invalid'
  | 'revoked'
  | 'expired';

export type OwnerAssignmentCompleteness =
  | 'empty'
  | 'missing_required_owners'
  | 'owners_assigned_unacknowledged'
  | 'owners_assigned_with_warnings'
  | 'owners_complete_awaiting_authorization_data'
  | 'invalid'
  | 'expired';

export type OwnerAssignmentReadiness =
  | 'blocked'
  | 'awaiting_real_owner_input'
  | 'awaiting_acknowledgements'
  | 'awaiting_conflict_resolution'
  | 'ready_to_collect_authorization_data'
  | 'rejected'
  | 'expired';

export type OwnerAssignmentRecommendation =
  | 'owner_assignment_blocked_missing_real_input'
  | 'owner_assignment_awaiting_acknowledgements'
  | 'owner_assignment_awaiting_conflict_resolution'
  | 'owner_assignment_complete_collect_authorization_data'
  | 'owner_assignment_rejected';

export type OwnerAssignmentNextAction =
  | 'provide_real_handoff_owner_assignments'
  | 'collect_owner_acknowledgements'
  | 'resolve_responsibility_conflicts'
  | 'collect_authorization_data';

export interface OwnerRoleAssignment {
  readonly roleId: StagingHandoffRoleId;
  readonly assignedPerson: string | null;
  readonly assignedBy: string | null;
  readonly assignedAt: string | null;
  readonly contactReference: string | null;
  readonly acknowledged: boolean;
  readonly acknowledgedAt: string | null;
  readonly acknowledgementScope: string | null;
  readonly responsibilitiesAccepted: boolean;
  readonly limitationsAccepted: boolean;
  readonly notes: string | null;
  readonly justification: string | null;
  readonly status: OwnerAssignmentFieldStatus;
  readonly validUntil: string | null;
}

export interface OwnerAssignmentInputEnvelope {
  readonly assignmentInputId: string;
  readonly handoffId: string | null;
  readonly submittedBy: string;
  readonly submittedAt: string;
  readonly architectureVersion: string | null;
  readonly assignments: readonly OwnerRoleAssignment[];
  readonly environmentReference: Readonly<Record<string, unknown>> | null;
  readonly tenantReference: Readonly<Record<string, unknown>> | null;
  readonly approvalReferences: ReadonlyArray<Readonly<Record<string, unknown>>> | null;
  readonly attachmentsMetadata: readonly {
    name: string;
    mediaType: string | null;
    sizeBytes: number | null;
    contentIncluded: false;
  }[];
  readonly notes: string | null;
}

export interface OwnerResponsibilityConflict {
  readonly code: string;
  readonly message: string;
  readonly rolesInvolved: readonly StagingHandoffRoleId[];
  readonly severity: 'warning' | 'blocker';
  readonly justificationRequired: true;
  readonly independentReviewRequired: boolean;
  readonly justified: boolean;
}

export interface OwnerEnvironmentValidation {
  readonly status: 'missing' | 'declared_unverified_remote' | 'invalid' | 'production_rejected';
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface OwnerTenantValidation {
  readonly status: 'missing' | 'structurally_valid_remote_unverified' | 'invalid';
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}
