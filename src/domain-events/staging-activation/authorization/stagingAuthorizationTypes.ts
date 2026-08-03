/**
 * @module domain-events/staging-activation/authorization/stagingAuthorizationTypes
 * @description Tipos do Authorization Package — Phase 8.8.
 * Architecture Certification ≠ Staging Auth ≠ Preflight ≠ Stage 1 ≠ Production.
 */

import type { DomainEventFlagKey } from '../../domainEventFlags.js';

export type StagingAuthorizationPackageStatus =
  | 'draft'
  | 'incomplete'
  | 'pending_review'
  | 'approved_for_preflight_readonly'
  | 'approved_for_stage_one'
  | 'rejected'
  | 'expired'
  | 'revoked';

export type StagingAuthFormStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked';

export type StagingReadonlyStatus =
  | 'unverified'
  | 'verified_readonly'
  | 'rejected'
  | 'expired';

export type StageOneAuthStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'completed';

export type StageOneReadinessStatus =
  | 'blocked'
  | 'manual_required'
  | 'ready_for_explicit_stage_one_execution';

export type StagingAuthorizationRecommendation =
  | 'authorization_package_incomplete'
  | 'authorization_package_pending_human_review'
  | 'stage_one_ready_awaiting_explicit_execution_command'
  | 'authorization_rejected'
  | 'authorization_expired';

export const STAGE_ONE_AUTHORIZED_FLAGS = Object.freeze([
  'DOMAIN_EVENTS',
  'DOMAIN_EVENT_AUDIT',
  'DOMAIN_EVENT_OBSERVABILITY',
] as const satisfies readonly DomainEventFlagKey[]);

export const STAGE_ONE_FORBIDDEN_FLAGS = Object.freeze([
  'DOMAIN_EVENT_CONSUMERS',
  'DOMAIN_EVENT_PROJECTION',
  'DOMAIN_EVENT_ANALYTICS',
  'CQRS_READ_MODEL',
  'CQRS_READ_MODEL_SOAK',
  'CQRS_READ_MODEL_CONSISTENCY',
  'LEAD_ANALYTICS_READ_MODEL',
  'APPOINTMENT_ANALYTICS_READ_MODEL',
  'FINANCIAL_ANALYTICS_READ_MODEL',
] as const satisfies readonly DomainEventFlagKey[]);

export const STAGE_ONE_ROLLBACK_FLAG_ORDER = Object.freeze([
  'DOMAIN_EVENT_OBSERVABILITY',
  'DOMAIN_EVENT_AUDIT',
  'DOMAIN_EVENTS',
] as const satisfies readonly DomainEventFlagKey[]);

export interface StagingEnvironmentDeclaration {
  readonly environmentId: string | null;
  readonly environmentName: string | null;
  readonly environmentType: 'staging' | 'unknown' | 'production' | null;
  readonly host: string | null;
  readonly projectRef: string | null;
  readonly owner: string | null;
  readonly declaredAt: string | null;
  readonly declaredBy: string | null;
  readonly isProduction: boolean;
  readonly isStaging: boolean;
  readonly dataClassification: string | null;
  readonly allowedOperations: readonly string[];
  readonly forbiddenOperations: readonly string[];
  readonly expiresAt: string | null;
  readonly complete: boolean;
  readonly blockers: readonly string[];
}

export interface StagingHumanApprovalForm {
  readonly approvalId: string;
  readonly approvalScope: 'stage_one_observability';
  readonly environmentId: string | null;
  readonly tenantIds: readonly string[];
  readonly requestedBy: string | null;
  readonly requestedAt: string;
  readonly status: StagingAuthFormStatus;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly reason: string | null;
  readonly riskAcknowledged: boolean;
  readonly rollbackAcknowledged: boolean;
}

export interface StagingTenantSelectionForm {
  readonly pilotTenantIds: readonly string[];
  readonly controlTenantIds: readonly string[];
  readonly excludedTenantIds: readonly string[];
  readonly selectionReason: string | null;
  readonly selectedBy: string | null;
  readonly selectedAt: string | null;
  readonly dataSensitivityReviewed: boolean;
  readonly tenantOwnersNotified: boolean;
  readonly valid: boolean;
  readonly blockers: readonly string[];
}

export interface StagingReadonlyAccessDeclaration {
  readonly connectionId: string | null;
  readonly environmentId: string | null;
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
  readonly readOperations: readonly string[];
  readonly writeOperations: readonly string[];
  readonly mutationBlocked: boolean;
  readonly migrationBlocked: boolean;
  readonly storageWriteBlocked: boolean;
  readonly secretAccessBlocked: boolean;
  readonly verificationMethod: string | null;
  readonly expiresAt: string | null;
  readonly status: StagingReadonlyStatus;
}

export interface StageOneAuthorization {
  readonly stageId: 'stage-1-observability';
  readonly stageName: 'Controlled Staging Stage 1 — Observability';
  readonly authorizedFlags: typeof STAGE_ONE_AUTHORIZED_FLAGS;
  readonly forbiddenFlags: typeof STAGE_ONE_FORBIDDEN_FLAGS;
  readonly environmentId: string | null;
  readonly tenantIds: readonly string[];
  readonly authorizationId: string;
  readonly authorizedBy: string | null;
  readonly authorizedAt: string | null;
  readonly expiresAt: string | null;
  readonly maximumDurationHours: number;
  readonly successCriteria: readonly string[];
  readonly failureCriteria: readonly string[];
  readonly rollbackPlanId: string;
  readonly evidenceRequirements: readonly string[];
  readonly status: StageOneAuthStatus;
}

export interface StagingRollbackAcknowledgement {
  readonly rollbackPlanId: string;
  readonly reviewed: boolean;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly flagsToDisable: typeof STAGE_ONE_ROLLBACK_FLAG_ORDER;
  readonly maximumRollbackTimeMinutes: number;
  readonly dataImpact: 'none_operational';
  readonly indexedDbImpact: 'preserved';
  readonly supabaseImpact: 'untouched';
  readonly evidencePreservation: true;
  readonly status: 'pending' | 'acknowledged' | 'rejected';
}

export interface StagingEvidenceAcknowledgement {
  readonly acknowledgedTypes: readonly string[];
  readonly reviewed: boolean;
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly fabricatedEvidenceForbidden: true;
  readonly status: 'pending' | 'acknowledged';
}

export interface StagingRiskItem {
  readonly riskId: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly mitigation: string;
  readonly accepted: boolean;
  readonly acceptedBy: string | null;
  readonly acceptedAt: string | null;
}

export interface StagingRiskAcknowledgement {
  readonly risks: readonly StagingRiskItem[];
  readonly allAccepted: boolean;
  readonly status: 'pending' | 'acknowledged';
}

export interface StagingAuthorizationPackage {
  readonly packageId: string;
  readonly architectureVersion: string;
  readonly planId: string | null;
  readonly preflightExecutionId: string | null;
  readonly environmentDeclaration: StagingEnvironmentDeclaration;
  readonly humanApproval: StagingHumanApprovalForm;
  readonly tenantSelection: StagingTenantSelectionForm;
  readonly readonlyAccessDeclaration: StagingReadonlyAccessDeclaration;
  readonly stageOneAuthorization: StageOneAuthorization;
  readonly rollbackAcknowledgement: StagingRollbackAcknowledgement;
  readonly evidenceAcknowledgement: StagingEvidenceAcknowledgement;
  readonly riskAcknowledgement: StagingRiskAcknowledgement;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly status: StagingAuthorizationPackageStatus;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface StageOneReadinessGateResult {
  readonly status: StageOneReadinessStatus;
  readonly checks: readonly Readonly<{
    checkId: string;
    result: 'pass' | 'fail' | 'manual_required';
    message: string;
  }>[];
  readonly blockers: readonly string[];
  readonly flagsChanged: false;
  readonly remoteActionsExecuted: false;
}

export interface StageOneExecutionCommandResult {
  readonly commandId: string;
  readonly dryRun: boolean;
  readonly authorized: false;
  readonly code: 'dry_run_ok' | 'not_authorized_in_phase_8_8';
  readonly message: string;
  readonly flagsChanged: false;
  readonly remoteActionsExecuted: false;
  readonly mutations: false;
}
