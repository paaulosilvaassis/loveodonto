/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationIntakeTypes
 * Phase 8.9 — Data Intake types. Complete data ≠ Human Approval ≠ Execution ≠ Activation.
 */

export type StagingAuthorizationInputSource =
  | 'manual-form'
  | 'approved-json'
  | 'approved-document'
  | 'local-config';

export type StagingAuthorizationParseResult = 'parsed' | 'invalid' | 'incomplete';

export type StagingAuthorizationCompleteness =
  | 'empty'
  | 'incomplete'
  | 'structurally_complete'
  | 'pending_human_review'
  | 'approved_data_unverified_remote'
  | 'invalid'
  | 'expired'
  | 'revoked';

export type StagingAuthorizationFinalGate =
  | 'blocked'
  | 'manual_required'
  | 'data_complete_awaiting_remote_verification'
  | 'data_verified_awaiting_execution_approval'
  | 'ready_for_phase_8_10_planning';

export type StagingAuthorizationIntakeRecommendation =
  | 'authorization_data_missing'
  | 'authorization_data_invalid'
  | 'authorization_data_incomplete'
  | 'authorization_data_pending_human_review'
  | 'authorization_data_complete_awaiting_remote_verification'
  | 'authorization_data_verified_awaiting_explicit_execution_approval';

export type StagingAuthorizationDiagCode =
  | 'SENSITIVE_AUTHORIZATION_INPUT'
  | 'UNSUPPORTED_AUTHORIZATION_FIELD'
  | 'UNSAFE_ATTACHMENT_METADATA'
  | 'SAME_REQUESTER_AND_APPROVER'
  | 'ENVIRONMENT_ID_MISMATCH'
  | 'TENANT_SCOPE_MISMATCH'
  | 'AUTHORIZATION_SCOPE_MISMATCH'
  | 'ROLLBACK_PLAN_MISMATCH'
  | 'ARCHITECTURE_VERSION_MISMATCH'
  | 'EXPIRED_AUTHORIZATION_CHAIN'
  | 'STAGE_ONE_FLAG_SCOPE_MISMATCH';

export type StageOneExecutionApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked';

export interface StagingAuthorizationAttachmentMeta {
  readonly name: string;
  readonly mediaType: string | null;
  readonly sizeBytes: number | null;
  /** Nunca conteúdo — só metadata. */
  readonly contentIncluded: false;
}

export interface StagingAuthorizationInputEnvelope {
  readonly inputId: string;
  readonly inputSource: StagingAuthorizationInputSource;
  readonly submittedBy: string;
  readonly submittedAt: string;
  readonly architectureVersion: string | null;
  readonly packageId: string | null;
  readonly environmentDeclaration: Readonly<Record<string, unknown>> | null;
  readonly humanApproval: Readonly<Record<string, unknown>> | null;
  readonly tenantSelection: Readonly<Record<string, unknown>> | null;
  readonly readonlyAccessDeclaration: Readonly<Record<string, unknown>> | null;
  readonly stageOneAuthorization: Readonly<Record<string, unknown>> | null;
  readonly rollbackAcknowledgement: Readonly<Record<string, unknown>> | null;
  readonly evidenceAcknowledgement: Readonly<Record<string, unknown>> | null;
  readonly riskAcknowledgements: ReadonlyArray<Readonly<Record<string, unknown>>> | null;
  readonly attachmentsMetadata: readonly StagingAuthorizationAttachmentMeta[];
  readonly notes: string | null;
}

export interface StageOneExecutionApproval {
  readonly executionApprovalId: string;
  readonly authorizationPackageId: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly expiresAt: string | null;
  readonly environmentId: string | null;
  readonly tenantIds: readonly string[];
  readonly allowedAction: 'controlled_stage_one_observability';
  readonly dryRunRequired: true;
  readonly maximumDurationHours: number;
  readonly status: StageOneExecutionApprovalStatus;
}

export interface StagingAuthorizationFieldValidation {
  readonly section: string;
  readonly result: 'pass' | 'fail' | 'warning' | 'manual_required';
  readonly code: string | null;
  readonly message: string;
}

export interface StagingAuthorizationIntakeResult {
  readonly input: StagingAuthorizationInputEnvelope | null;
  readonly parseResult: StagingAuthorizationParseResult;
  readonly diagnostics: readonly StagingAuthorizationDiagCode[];
  readonly fieldValidations: readonly StagingAuthorizationFieldValidation[];
  readonly completeness: StagingAuthorizationCompleteness;
  readonly finalGate: StagingAuthorizationFinalGate;
  readonly recommendation: StagingAuthorizationIntakeRecommendation;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly remoteVerificationRequired: true;
  readonly explicitExecutionApprovalRequired: true;
  readonly executionApproval: StageOneExecutionApproval;
  readonly flagsChanged: false;
  readonly remoteActionsExecuted: false;
  readonly environmentRemoteStatus: 'structurally_valid_unverified_remote' | 'invalid' | 'missing';
  readonly readonlyRemoteStatus: 'declared_verified_readonly' | 'unverified' | 'invalid' | 'missing';
}
