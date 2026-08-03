/**
 * @module domain-events/staging-activation/stagingActivationTypes
 * @description Contratos Phase 8.6 — Controlled Staging Activation Plan.
 * Nenhuma ativação remota. autoPromotionAllowed sempre false.
 */

import type { DomainEventFlagKey } from '../domainEventFlags.js';

export type StagingPlanStatus =
  | 'draft'
  | 'pending_authorization'
  | 'authorized'
  | 'ready'
  | 'running'
  | 'paused'
  | 'rolling_back'
  | 'rolled_back'
  | 'failed'
  | 'completed';

export type StagingAuthStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'revoked';

export type StagingCheckResult = 'pass' | 'warning' | 'fail' | 'manual-required';

export type StagingPlanRecommendation =
  | 'staging_plan_ready_awaiting_explicit_authorization'
  | 'blocked_awaiting_environment_and_human_authorization'
  | 'blocked_production_or_unauthorized_host'
  | 'not_applicable';

export type StagingActivationStageId =
  | 'preflight'
  | 'observability'
  | 'audit_projection'
  | 'analytics_projection'
  | 'cqrs_foundation'
  | 'lead_read_model'
  | 'appointment_read_model'
  | 'financial_read_model'
  | 'rollback_drill'
  | 'final_review';

export type StagingEvidenceType =
  | 'preflight'
  | 'flag-resolution'
  | 'event-observability'
  | 'consumer'
  | 'projection'
  | 'read-model'
  | 'soak'
  | 'consistency'
  | 'drift'
  | 'tenant-isolation'
  | 'rollback'
  | 'manual-review';

export interface StagingEnvironmentContract {
  readonly environmentId: string;
  readonly environmentName: string;
  readonly environmentType: 'staging' | 'local-simulated' | 'production' | 'unknown';
  readonly host: string | null;
  readonly projectRef: string | null;
  readonly isProduction: boolean;
  readonly isStaging: boolean;
  readonly authorized: boolean;
  readonly authorizedBy: string | null;
  readonly authorizedAt: string | null;
  readonly allowedTenantIds: readonly string[];
  readonly expiresAt: string | null;
  readonly notes: string;
  readonly status: 'ok' | 'blocked';
}

export interface StagingHumanAuthorizationContract {
  readonly approvalId: string;
  readonly approvalType: 'controlled_staging_activation';
  readonly scope: readonly string[];
  readonly environmentId: string | null;
  readonly tenantIds: readonly string[];
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly status: StagingAuthStatus;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly expiresAt: string | null;
  readonly notes: string;
}

export interface StagingTenantSelectionContract {
  readonly pilotTenantIds: readonly string[];
  readonly controlTenantIds: readonly string[];
  readonly excludedTenantIds: readonly string[];
  readonly valid: boolean;
  readonly reason: string | null;
}

export interface StagingFlagMatrixRow {
  readonly flag: DomainEventFlagKey;
  readonly dependencies: readonly DomainEventFlagKey[];
  readonly allowedEnvironments: readonly ('staging' | 'local-simulated')[];
  readonly preconditions: readonly string[];
  readonly expectedEffect: string;
  readonly requiredMetrics: readonly string[];
  readonly rollbackAction: string;
  readonly stageId: StagingActivationStageId;
  readonly defaultValue: false;
}

export interface StagingActivationStage {
  readonly stageId: StagingActivationStageId;
  readonly order: number;
  readonly flagsToEnable: readonly DomainEventFlagKey[];
  readonly description: string;
  readonly requiresPriorStage: StagingActivationStageId | null;
}

export interface StagingPreflightCheck {
  readonly checkId: string;
  readonly result: StagingCheckResult;
  readonly blocking: boolean;
  readonly message: string;
}

export interface StagingSuccessCriterion {
  readonly criterionId: string;
  readonly domain: 'domain-events' | 'consumers' | 'analytics' | 'read-models';
  readonly description: string;
}

export interface StagingFailureCriterion {
  readonly criterionId: string;
  readonly description: string;
  readonly requiresRollback: true;
}

export interface StagingSoakWindow {
  readonly windowId: string;
  readonly stageId: StagingActivationStageId;
  readonly description: string;
  readonly order: number;
}

export interface StagingSoakPlanContract {
  readonly recommendedDurationHoursMin: 48;
  readonly recommendedDurationHoursMax: 72;
  readonly windows: readonly StagingSoakWindow[];
  readonly schedulerAllowed: false;
  readonly backgroundWorkerAllowed: false;
  readonly multiTenant: Readonly<{
    pilotSlots: readonly ['pilot-a', 'pilot-b'];
    controlSlot: 'control';
    requireIsolation: true;
    inventRealTenantIds: false;
  }>;
}

export interface StagingEvidenceRequirement {
  readonly type: StagingEvidenceType;
  readonly required: boolean;
  readonly description: string;
}

export interface StagingEvidenceRecord {
  readonly evidenceId: string;
  readonly planId: string;
  readonly stageId: StagingActivationStageId;
  readonly environmentId: string | null;
  readonly tenantId: string | null;
  readonly type: StagingEvidenceType;
  readonly source: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly result: 'pending' | 'pass' | 'fail' | 'warn' | 'manual-required';
  readonly metrics: Readonly<Record<string, number | string | boolean>> | null;
  readonly health: string | null;
  readonly drifts: number | null;
  readonly errorsSanitized: readonly string[];
  readonly operator: string | null;
}

export interface StagingRollbackStep {
  readonly order: number;
  readonly flag: DomainEventFlagKey;
  readonly action: 'set_false';
}

export interface StagingRollbackPlanContract {
  readonly steps: readonly StagingRollbackStep[];
  readonly requiresMigration: false;
  readonly requiresRebuild: false;
  readonly preservesOperationalData: true;
  readonly preservesIndexedDb: true;
  readonly preservesSupabase: true;
  readonly preservesEvidence: true;
  readonly drill: Readonly<{
    drillId: string;
    status: 'planned_not_executed';
    remoteExecutionAllowed: false;
    notes: string;
  }>;
}

export interface ControlledStagingActivationPlan {
  readonly planId: string;
  readonly architectureVersion: string;
  readonly environment: StagingEnvironmentContract;
  readonly authorization: StagingHumanAuthorizationContract;
  readonly tenants: StagingTenantSelectionContract;
  readonly stages: readonly StagingActivationStage[];
  readonly currentStage: StagingActivationStageId | null;
  readonly status: StagingPlanStatus;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly rollbackPlan: StagingRollbackPlanContract;
  readonly evidenceRequirements: readonly StagingEvidenceRequirement[];
  readonly successCriteria: readonly StagingSuccessCriterion[];
  readonly failureCriteria: readonly StagingFailureCriterion[];
  readonly humanApprovalRequired: true;
  readonly autoPromotionAllowed: false;
}

export interface ControlledStagingActivationPlanReport {
  readonly plan: ControlledStagingActivationPlan;
  readonly certificationStatus: string;
  readonly architectureVersion: string;
  readonly environmentStatus: string;
  readonly humanApprovalStatus: StagingAuthStatus;
  readonly tenantSelection: StagingTenantSelectionContract;
  readonly flagMatrix: readonly StagingFlagMatrixRow[];
  readonly activationStages: readonly StagingActivationStage[];
  readonly preflightChecks: readonly StagingPreflightCheck[];
  readonly successCriteria: readonly StagingSuccessCriterion[];
  readonly failureCriteria: readonly StagingFailureCriterion[];
  readonly soakPlan: StagingSoakPlanContract;
  readonly rollbackPlan: StagingRollbackPlanContract;
  readonly evidenceRequirements: readonly StagingEvidenceRequirement[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly recommendation: StagingPlanRecommendation;
  readonly statement: string;
  readonly evaluatedAt: string;
}
