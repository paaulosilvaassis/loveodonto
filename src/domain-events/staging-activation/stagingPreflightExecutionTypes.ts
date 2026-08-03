/**
 * @module domain-events/staging-activation/stagingPreflightExecutionTypes
 * @description Preflight Execution Contract — Phase 8.7.
 * Sem ativação remota. Sem flip de flags.
 */

import type { StagingAuthStatus, StagingCheckResult } from './stagingActivationTypes.js';

export type StagingPreflightExecutionMode =
  | 'local-static'
  | 'local-simulated'
  | 'authorized-staging-readonly';

export type StagingPreflightResult =
  | 'not_started'
  | 'running'
  | 'passed'
  | 'warning'
  | 'blocked'
  | 'failed';

export type StagingPreflightRecommendation =
  | 'preflight_passed_awaiting_stage_activation_authorization'
  | 'preflight_blocked_awaiting_environment'
  | 'preflight_blocked_awaiting_human_approval'
  | 'preflight_blocked_awaiting_tenant_selection'
  | 'preflight_failed';

export type StagingPreflightEvidenceType =
  | 'static-analysis'
  | 'contract'
  | 'test'
  | 'inspection'
  | 'flag-resolution'
  | 'manual-required';

export interface StagingPreflightExecutionCheck {
  readonly checkId: string;
  readonly category: string;
  readonly result: StagingCheckResult;
  readonly blocking: boolean;
  readonly message: string;
  readonly evidenceSource: string;
  readonly execution: 'local' | 'remote-readonly' | 'none';
  readonly actionRequired: string | null;
}

export interface StagingPreflightExecutionEvidence {
  readonly evidenceId: string;
  readonly executionId: string;
  readonly checkId: string;
  readonly environmentId: string | null;
  readonly type: StagingPreflightEvidenceType;
  readonly source: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly result: 'pass' | 'fail' | 'warn' | 'pending' | 'manual-required';
  readonly detailsSanitized: string;
  readonly operator: string | null;
  readonly isRemote: false;
}

export interface StagingRegressionEvidenceInput {
  readonly testFiles: number;
  readonly passed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly durationMs: number;
  readonly previousPassed: number;
  readonly skipJustification: string;
}

export interface ControlledStagingPreflightExecution {
  readonly executionId: string;
  readonly planId: string;
  readonly architectureVersion: string;
  readonly environmentId: string;
  readonly executionMode: StagingPreflightExecutionMode;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly operator: string;
  readonly authorizationStatus: StagingAuthStatus;
  readonly environmentStatus: string;
  readonly tenantSelectionStatus: string;
  readonly checks: readonly StagingPreflightExecutionCheck[];
  readonly evidence: readonly StagingPreflightExecutionEvidence[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly result: StagingPreflightResult;
  readonly recommendation: StagingPreflightRecommendation;
  readonly remoteActionsExecuted: false;
  readonly flagsChanged: false;
}

export interface ControlledStagingPreflightReport {
  readonly execution: ControlledStagingPreflightExecution;
  readonly architectureVersion: string;
  readonly certificationStatus: string;
  readonly planStatus: string;
  readonly executionMode: StagingPreflightExecutionMode;
  readonly environment: Readonly<Record<string, unknown>>;
  readonly authorization: Readonly<Record<string, unknown>>;
  readonly tenants: Readonly<Record<string, unknown>>;
  readonly flagBaseline: Readonly<Record<string, boolean>>;
  readonly dependencyResolution: Readonly<{ ok: boolean; detail: string }>;
  readonly tenantScope: Readonly<{ ok: boolean; detail: string }>;
  readonly promotionReadiness: Readonly<Record<string, string>>;
  readonly observabilityReadiness: Readonly<{ ok: boolean; detail: string }>;
  readonly rollbackReadiness: Readonly<{ ok: boolean; detail: string }>;
  readonly evidenceRequirementsOk: boolean;
  readonly regression: StagingRegressionEvidenceInput | null;
  readonly checks: readonly StagingPreflightExecutionCheck[];
  readonly evidence: readonly StagingPreflightExecutionEvidence[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly result: StagingPreflightResult;
  readonly recommendation: StagingPreflightRecommendation;
  readonly statement: string;
  readonly evaluatedAt: string;
}

export const PREFLIGHT_ALLOWED_EXECUTION_MODES = Object.freeze([
  'local-static',
  'local-simulated',
  'authorized-staging-readonly',
] as const);
