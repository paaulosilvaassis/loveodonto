/**
 * @module domain-events/staging-activation/authorization-intake/stageOneExecutionApproval
 */

import type { StageOneExecutionApproval } from './stagingAuthorizationIntakeTypes.js';

export function buildPendingStageOneExecutionApproval(
  authorizationPackageId: string | null = null,
): StageOneExecutionApproval {
  return Object.freeze({
    executionApprovalId: `exec-approval-pending-${Date.now()}`,
    authorizationPackageId,
    approvedBy: null,
    approvedAt: null,
    expiresAt: null,
    environmentId: null,
    tenantIds: Object.freeze([] as string[]),
    allowedAction: 'controlled_stage_one_observability',
    dryRunRequired: true,
    maximumDurationHours: 72,
    status: 'pending',
  });
}
