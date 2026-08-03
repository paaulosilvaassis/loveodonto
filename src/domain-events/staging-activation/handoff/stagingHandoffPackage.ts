/**
 * @module domain-events/staging-activation/handoff/stagingHandoffPackage
 */

import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../../certification/cqrsArchitectureVersion.js';
import { buildStagingApprovalChain } from './stagingApprovalChain.js';
import { buildStagingBlockerTracker, openBlockerCount } from './stagingBlockerTracker.js';
import { buildStagingEvidenceReadinessMatrix } from './stagingEvidenceReadiness.js';
import {
  buildStagingHumanReviewChecklist,
  humanReviewAllComplete,
} from './stagingHumanReviewChecklist.js';
import {
  buildStagingRequiredDataChecklist,
  requiredDataMissingCount,
} from './stagingRequiredDataChecklist.js';
import {
  buildStagingResponsibilityMatrix,
  countAssignedOwners,
} from './stagingResponsibilityMatrix.js';
import { evaluateStagingSegregationOfDuties } from './stagingSegregationOfDuties.js';
import type {
  StagingApprovalChainStep,
  StagingEvidenceReadinessItem,
  StagingHandoffBlocker,
  StagingHandoffNextAction,
  StagingHandoffRole,
  StagingHandoffRoleId,
  StagingHandoffStatus,
  StagingHumanReviewItem,
  StagingRequiredDataItem,
  StagingSegregationWarning,
} from './stagingHandoffTypes.js';

let handoffSeq = 0;

export interface StagingHandoffPackage {
  readonly handoffId: string;
  readonly architectureVersion: string;
  readonly certificationId: string | null;
  readonly activationPlanId: string | null;
  readonly preflightExecutionId: string | null;
  readonly authorizationPackageId: string | null;
  readonly authorizationIntakeId: string | null;
  readonly readonlyVerificationId: string | null;
  readonly status: StagingHandoffStatus;
  readonly owners: readonly StagingHandoffRole[];
  readonly responsibilities: readonly StagingHandoffRole[];
  readonly requiredData: readonly StagingRequiredDataItem[];
  readonly requiredApprovals: readonly StagingApprovalChainStep[];
  readonly requiredEvidence: readonly StagingEvidenceReadinessItem[];
  readonly currentBlockers: readonly StagingHandoffBlocker[];
  readonly warnings: readonly string[];
  readonly segregationWarnings: readonly StagingSegregationWarning[];
  readonly humanReview: readonly StagingHumanReviewItem[];
  readonly nextAllowedAction: StagingHandoffNextAction;
  readonly forbiddenActions: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string | null;
  readonly remoteConnectionOpened: false;
  readonly remoteReadsExecuted: false;
  readonly remoteWritesExecuted: false;
  readonly flagsChanged: false;
  readonly stageOneExecuted: false;
}

export interface BuildHandoffPackageInput {
  architectureVersion?: string;
  certificationId?: string | null;
  activationPlanId?: string | null;
  preflightExecutionId?: string | null;
  authorizationPackageId?: string | null;
  authorizationIntakeId?: string | null;
  readonlyVerificationId?: string | null;
  roleAssignments?: Partial<Record<StagingHandoffRoleId, string | null>>;
  requiredDataOverrides?: Parameters<typeof buildStagingRequiredDataChecklist>[0];
  approvalChain?: Parameters<typeof buildStagingApprovalChain>[0];
  evidenceOverrides?: Parameters<typeof buildStagingEvidenceReadinessMatrix>[0];
  blockerOverrides?: Parameters<typeof buildStagingBlockerTracker>[0];
  humanReviews?: Parameters<typeof buildStagingHumanReviewChecklist>[0];
  forcedStatus?: StagingHandoffStatus;
  expiresAt?: string | null;
}

export function deriveHandoffNextAction(args: {
  assignedOwners: number;
  missingData: number;
  humanReviewComplete: boolean;
  openBlockers: number;
  readonlyApprovalReady?: boolean;
}): StagingHandoffNextAction {
  if (args.assignedOwners === 0) return 'assign_handoff_owners';
  if (args.missingData > 0 || args.openBlockers > 0) return 'collect_external_authorization_data';
  if (!args.humanReviewComplete) return 'perform_human_review';
  return 'request_authorized_readonly_verification';
}

export function deriveHandoffStatus(args: {
  assignedOwners: number;
  missingData: number;
  humanReviewComplete: boolean;
  openBlockers: number;
  forcedStatus?: StagingHandoffStatus;
  expired?: boolean;
  rejected?: boolean;
}): StagingHandoffStatus {
  if (args.forcedStatus === 'rejected' || args.rejected) return 'rejected';
  if (args.forcedStatus === 'expired' || args.expired) return 'expired';
  if (args.forcedStatus === 'completed') return 'completed';
  if (args.assignedOwners === 0) return 'awaiting_owners';
  if (args.missingData > 0 || args.openBlockers > 0) {
    return args.assignedOwners < 9 ? 'incomplete' : 'awaiting_data';
  }
  if (!args.humanReviewComplete) return 'awaiting_approvals';
  return 'ready_to_request_readonly_verification';
}

const FORBIDDEN = Object.freeze([
  'execute_stage_one',
  'change_flags',
  'connect_remotely_without_approval',
  'ready_for_stage_one',
  'authorized',
  'activated',
  'promoted',
] as const);

/**
 * Constrói Handoff Package imutável. Sem inventar owners/dados/aprovadores.
 */
export function buildStagingAuthorizationHandoffPackage(
  input: BuildHandoffPackageInput = {},
): StagingHandoffPackage {
  handoffSeq += 1;
  const now = new Date().toISOString();
  const arch = input.architectureVersion || LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION;

  const owners = buildStagingResponsibilityMatrix(input.roleAssignments || {});
  const sod = evaluateStagingSegregationOfDuties(owners);
  const requiredData = buildStagingRequiredDataChecklist(input.requiredDataOverrides || {});
  const requiredApprovals = buildStagingApprovalChain(input.approvalChain || {});
  const requiredEvidence = buildStagingEvidenceReadinessMatrix(input.evidenceOverrides || {});
  const currentBlockers = buildStagingBlockerTracker(input.blockerOverrides || {});
  const humanReview = buildStagingHumanReviewChecklist(input.humanReviews || {});

  const assignedOwners = countAssignedOwners(owners);
  const missingData = requiredDataMissingCount(requiredData);
  const openBlockers = openBlockerCount(currentBlockers);
  const reviewComplete = humanReviewAllComplete(humanReview);
  const expired = Boolean(input.expiresAt && Date.parse(input.expiresAt) < Date.now());

  const status = deriveHandoffStatus({
    assignedOwners,
    missingData,
    humanReviewComplete: reviewComplete,
    openBlockers,
    forcedStatus: input.forcedStatus,
    expired,
    rejected: input.forcedStatus === 'rejected',
  });

  const nextAllowedAction = deriveHandoffNextAction({
    assignedOwners,
    missingData,
    humanReviewComplete: reviewComplete,
    openBlockers,
  });

  const warnings = [
    ...sod.warnings.map((w) => `${w.code}: ${w.message}`),
    ...(arch !== LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION
      ? [`ARCHITECTURE_VERSION_MISMATCH: ${arch}`]
      : []),
  ];

  return Object.freeze({
    handoffId: `handoff-${handoffSeq}`,
    architectureVersion: arch,
    certificationId: input.certificationId ?? null,
    activationPlanId: input.activationPlanId ?? null,
    preflightExecutionId: input.preflightExecutionId ?? null,
    authorizationPackageId: input.authorizationPackageId ?? null,
    authorizationIntakeId: input.authorizationIntakeId ?? null,
    readonlyVerificationId: input.readonlyVerificationId ?? null,
    status,
    owners,
    responsibilities: owners,
    requiredData,
    requiredApprovals,
    requiredEvidence,
    currentBlockers,
    warnings: Object.freeze(warnings),
    segregationWarnings: sod.warnings,
    humanReview,
    nextAllowedAction,
    forbiddenActions: FORBIDDEN,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt ?? null,
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
    stageOneExecuted: false as const,
  });
}

export function __resetHandoffSeqForTest(): void {
  handoffSeq = 0;
}
