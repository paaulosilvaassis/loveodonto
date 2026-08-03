/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationTypes
 * Phase 8.10 — Authorized Staging Read-only Verification Gate.
 * Authorization Data ≠ Read-only Verification ≠ Stage 1 ≠ Flags Enabled.
 */

export type ReadonlyVerificationApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'completed';

export type ReadonlyVerificationSessionMode =
  | 'local-static'
  | 'local-simulated'
  | 'authorized-staging-readonly';

export type ReadonlyVerificationResult =
  | 'not_started'
  | 'blocked'
  | 'manual_required'
  | 'running'
  | 'passed'
  | 'warning'
  | 'failed'
  | 'blocked_readonly_not_guaranteed'
  | 'failed_production_detected';

export type ReadonlyVerificationFinalGate =
  | 'blocked'
  | 'manual_required'
  | 'readonly_verified_awaiting_stage_one_execution_approval'
  | 'failed';

export type ReadonlyVerificationRecommendation =
  | 'readonly_verification_blocked_missing_authorization_data'
  | 'readonly_verification_blocked_missing_approval'
  | 'readonly_verification_blocked_capabilities_not_safe'
  | 'readonly_verification_failed'
  | 'readonly_verification_passed_awaiting_explicit_stage_one_execution_approval';

export type ReadonlyProbeStatus =
  | 'not_run'
  | 'passed'
  | 'warning'
  | 'blocked'
  | 'failed'
  | 'manual_required';

export type ReadonlyProbeId =
  | 'verify-environment-identity'
  | 'verify-non-production-host'
  | 'verify-project-reference'
  | 'verify-tenant-existence'
  | 'verify-flag-baseline-off'
  | 'verify-production-guards'
  | 'verify-host-guards'
  | 'verify-architecture-version'
  | 'verify-certification-status'
  | 'verify-inspector-availability'
  | 'verify-health-availability';

export type ReadonlyForbiddenOperation =
  | 'insert'
  | 'update'
  | 'delete'
  | 'upsert'
  | 'rpc-mutation'
  | 'migration'
  | 'seed'
  | 'storage-upload'
  | 'storage-delete'
  | 'environment-write'
  | 'flag-write'
  | 'secret-read'
  | 'tenant-create'
  | 'tenant-update';

export type ReadonlyEvidenceType =
  | 'environment-identity'
  | 'production-exclusion'
  | 'tenant-existence'
  | 'flag-baseline'
  | 'guard-verification'
  | 'architecture-version'
  | 'certification'
  | 'inspector-availability'
  | 'health-availability'
  | 'manual-required';

export interface ReadonlyVerificationCapabilities {
  readonly canReadEnvironmentIdentity: boolean;
  readonly canReadFlagResolution: boolean;
  readonly canReadTenantExistence: boolean;
  readonly canReadHealth: boolean;
  readonly canReadInspector: boolean;
  readonly canWriteDatabase: boolean;
  readonly canRunMigration: boolean;
  readonly canWriteStorage: boolean;
  readonly canChangeEnvironmentVariables: boolean;
  readonly canRevealSecrets: boolean;
  readonly readOnlyGuaranteed: boolean;
}

export interface ReadonlyVerificationApproval {
  readonly verificationApprovalId: string;
  readonly authorizationPackageId: string | null;
  readonly environmentId: string | null;
  readonly tenantIds: readonly string[];
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly expiresAt: string | null;
  readonly allowedProbes: readonly ReadonlyProbeId[];
  readonly forbiddenOperations: readonly ReadonlyForbiddenOperation[];
  readonly status: ReadonlyVerificationApprovalStatus;
}

export interface ReadonlyProbeResult {
  readonly probeId: ReadonlyProbeId | string;
  readonly status: ReadonlyProbeStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly environmentId: string | null;
  readonly tenantId: string | null;
  readonly isRemote: boolean;
  readonly readOnlyGuaranteed: boolean;
  readonly resultSanitized: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface ReadonlyVerificationEvidence {
  readonly evidenceId: string;
  readonly sessionId: string;
  readonly probeId: string;
  readonly evidenceType: ReadonlyEvidenceType;
  readonly environmentId: string | null;
  readonly tenantId: string | null;
  readonly source: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly result: ReadonlyProbeStatus;
  readonly detailsSanitized: string;
  readonly operator: string | null;
  readonly isRemote: boolean;
}

export interface ReadonlyVerificationSession {
  readonly sessionId: string;
  readonly verificationApprovalId: string | null;
  readonly authorizationPackageId: string | null;
  readonly environmentId: string | null;
  readonly tenantIds: readonly string[];
  readonly mode: ReadonlyVerificationSessionMode;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly operator: string | null;
  readonly capabilities: ReadonlyVerificationCapabilities;
  readonly probes: readonly ReadonlyProbeResult[];
  readonly evidence: readonly ReadonlyVerificationEvidence[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly result: ReadonlyVerificationResult;
  readonly remoteConnectionOpened: false;
  readonly remoteReadsExecuted: false;
  readonly remoteWritesExecuted: false;
  readonly flagsChanged: false;
  readonly simulationOnly: boolean;
}

export interface ReadonlyVerificationEntryConditions {
  readonly authorizationCompletenessOk: boolean;
  readonly humanApprovalApproved: boolean;
  readonly readonlyDeclaredVerified: boolean;
  readonly environmentStructurallyValid: boolean;
  readonly pilotTenantPresent: boolean;
  readonly stageOneStatusOk: boolean;
  readonly remoteReadonlyVerificationApproved: boolean;
  readonly allSatisfied: boolean;
  readonly blockers: readonly string[];
}
