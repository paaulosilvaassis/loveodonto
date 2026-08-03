/**
 * @module domain-events/staging-activation/handoff/stagingHandoffTypes
 * Phase 8.11 — Staging Authorization Handoff + Evidence Readiness.
 * Technical Readiness ≠ Authorization Data ≠ Human Approval ≠ Remote Verification ≠ Stage 1.
 */

export type StagingHandoffStatus =
  | 'draft'
  | 'incomplete'
  | 'awaiting_owners'
  | 'awaiting_data'
  | 'awaiting_approvals'
  | 'awaiting_readonly_verification'
  | 'ready_to_request_readonly_verification'
  | 'rejected'
  | 'expired'
  | 'completed';

export type StagingHandoffReadiness =
  | 'blocked'
  | 'awaiting_external_input'
  | 'awaiting_human_review'
  | 'ready_to_request_readonly_verification'
  | 'rejected'
  | 'expired';

export type StagingHandoffRecommendation =
  | 'handoff_incomplete_awaiting_owner_assignment'
  | 'handoff_awaiting_required_authorization_data'
  | 'handoff_awaiting_human_review'
  | 'handoff_ready_to_request_authorized_readonly_verification'
  | 'handoff_rejected'
  | 'handoff_expired';

export type StagingHandoffNextAction =
  | 'assign_handoff_owners'
  | 'collect_external_authorization_data'
  | 'perform_human_review'
  | 'request_authorized_readonly_verification';

export type StagingHandoffRoleId =
  | 'architecture_owner'
  | 'staging_environment_owner'
  | 'security_readonly_verifier'
  | 'tenant_owner'
  | 'business_owner'
  | 'stage_one_approver'
  | 'execution_operator'
  | 'rollback_operator'
  | 'evidence_reviewer';

export type StagingAssignmentStatus = 'unassigned' | 'assigned' | 'pending_confirmation';

export type StagingChecklistItemStatus =
  | 'missing'
  | 'provided'
  | 'validated'
  | 'rejected'
  | 'expired';

export type StagingEvidenceReadinessStatus =
  | 'missing'
  | 'prepared'
  | 'manual_required'
  | 'remote_required'
  | 'collected'
  | 'validated'
  | 'rejected'
  | 'expired';

export type StagingBlockerStatus =
  | 'open'
  | 'waiting_external_input'
  | 'under_review'
  | 'resolved'
  | 'rejected'
  | 'expired';

export type StagingBlockerId =
  | 'MISSING_STAGING_ENVIRONMENT'
  | 'MISSING_ENVIRONMENT_OWNER'
  | 'MISSING_HUMAN_APPROVAL'
  | 'MISSING_PILOT_TENANTS'
  | 'READONLY_ACCESS_UNVERIFIED'
  | 'MISSING_READONLY_VERIFICATION_APPROVAL'
  | 'REMOTE_VERIFICATION_NOT_PERFORMED'
  | 'MISSING_STAGE_ONE_AUTHORIZATION'
  | 'MISSING_EXECUTION_APPROVAL'
  | 'ROLLBACK_NOT_HUMAN_REVIEWED'
  | 'RISKS_NOT_HUMAN_ACCEPTED';

export interface StagingHandoffRole {
  readonly roleId: StagingHandoffRoleId;
  readonly roleName: string;
  readonly responsibilities: readonly string[];
  readonly requiredActions: readonly string[];
  readonly approvalsAllowed: readonly string[];
  readonly approvalsForbidden: readonly string[];
  readonly assignedPerson: string | null;
  readonly assignmentStatus: StagingAssignmentStatus;
}

export interface StagingRequiredDataItem {
  readonly itemId: string;
  readonly category: string;
  readonly description: string;
  readonly required: boolean;
  readonly sourceContract: string;
  readonly status: StagingChecklistItemStatus;
  readonly providedBy: string | null;
  readonly providedAt: string | null;
  readonly validationResult: string | null;
  readonly blockerWhenMissing: StagingBlockerId | null;
}

export interface StagingApprovalChainStep {
  readonly stepId: string;
  readonly stepName: string;
  readonly order: number;
  readonly previousStepId: string | null;
  readonly status: 'pending' | 'satisfied_structural' | 'satisfied' | 'skipped_invalid' | 'expired' | 'mismatch';
  readonly referencesPrevious: boolean;
  readonly blocker: string | null;
}

export interface StagingEvidenceReadinessItem {
  readonly evidenceType: string;
  readonly requiredFor: string;
  readonly source: string;
  readonly collectionMode: 'local' | 'human' | 'remote';
  readonly requiresRemote: boolean;
  readonly requiresHuman: boolean;
  readonly currentStatus: StagingEvidenceReadinessStatus;
  readonly blocker: string | null;
  readonly sanitizationPolicy: string;
}

export interface StagingHandoffBlocker {
  readonly blockerId: StagingBlockerId;
  readonly category: string;
  readonly description: string;
  readonly severity: 'critical' | 'high' | 'medium';
  readonly ownerRole: StagingHandoffRoleId;
  readonly resolutionRequired: string;
  readonly status: StagingBlockerStatus;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly resolutionEvidence: string | null;
}

export interface StagingHumanReviewItem {
  readonly itemId: string;
  readonly description: string;
  readonly reviewed: boolean;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly notes: string | null;
}

export interface StagingSegregationWarning {
  readonly code: string;
  readonly message: string;
  readonly rolesInvolved: readonly StagingHandoffRoleId[];
  readonly justificationRequired: true;
  readonly independentReviewRequired: boolean;
}
