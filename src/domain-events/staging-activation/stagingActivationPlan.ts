/**
 * @module domain-events/staging-activation/stagingActivationPlan
 * @description Activation Plan Model — Phase 8.6.
 * Default status: pending_authorization. Sem ativação remota.
 */

import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../certification/cqrsArchitectureVersion.js';
import type {
  ControlledStagingActivationPlan,
  StagingPlanStatus,
} from './stagingActivationTypes.js';
import {
  buildDefaultBlockedStagingEnvironment,
  buildStagingEnvironmentContract,
  type StagingEnvironmentInput,
} from './stagingEnvironmentContract.js';
import {
  buildPendingStagingAuthorization,
  buildStagingHumanAuthorization,
  type StagingAuthorizationInput,
} from './stagingHumanAuthorization.js';
import {
  buildEmptyStructuralTenantSelection,
  buildStagingTenantSelection,
  type StagingTenantSelectionInput,
} from './stagingTenantSelection.js';
import { STAGING_ACTIVATION_STAGES } from './stagingFlagMatrix.js';
import { buildStagingRollbackPlan } from './stagingRollback.js';
import { STAGING_EVIDENCE_REQUIREMENTS } from './stagingEvidence.js';
import {
  STAGING_FAILURE_CRITERIA,
  STAGING_SUCCESS_CRITERIA,
} from './stagingCriteria.js';
import { isAuthorizationUsable } from './stagingHumanAuthorization.js';

let planSeq = 0;

export interface BuildStagingPlanOptions {
  environment?: StagingEnvironmentInput;
  authorization?: StagingAuthorizationInput;
  tenants?: StagingTenantSelectionInput;
  /** Apenas testes estruturais com local-simulated. */
  allowReadyForStructuralTest?: boolean;
  forcedStatus?: StagingPlanStatus;
}

function deriveStatus(
  options: BuildStagingPlanOptions,
  envAuthorized: boolean,
  authUsable: boolean,
): StagingPlanStatus {
  if (options.forcedStatus) {
    // Cap: não permitir running/completed nesta phase via builder padrão
    const forbidden: StagingPlanStatus[] = [
      'running',
      'completed',
      'paused',
      'rolling_back',
      'rolled_back',
    ];
    if (forbidden.includes(options.forcedStatus)) {
      return 'pending_authorization';
    }
    if (
      options.forcedStatus === 'ready'
      && options.allowReadyForStructuralTest
      && envAuthorized
    ) {
      return 'ready';
    }
    if (options.forcedStatus === 'authorized' && authUsable && envAuthorized) {
      return 'authorized';
    }
    return options.forcedStatus === 'draft'
      ? 'draft'
      : 'pending_authorization';
  }
  if (options.allowReadyForStructuralTest && envAuthorized && authUsable) {
    return 'ready';
  }
  return 'pending_authorization';
}

export function buildControlledStagingActivationPlan(
  options: BuildStagingPlanOptions = {},
): ControlledStagingActivationPlan {
  planSeq += 1;
  const environment = options.environment
    ? buildStagingEnvironmentContract(options.environment)
    : buildDefaultBlockedStagingEnvironment();

  const authorization = options.authorization
    ? buildStagingHumanAuthorization({
      ...options.authorization,
      environmentId:
          options.authorization.environmentId ?? environment.environmentId,
    })
    : buildPendingStagingAuthorization();

  const tenants = options.tenants
    ? buildStagingTenantSelection({
      ...options.tenants,
      allowedTenantIds:
          options.tenants.allowedTenantIds
          ?? environment.allowedTenantIds,
    })
    : buildEmptyStructuralTenantSelection();

  const authUsable = isAuthorizationUsable(authorization);
  const status = deriveStatus(
    options,
    environment.status === 'ok' && environment.authorized,
    authUsable,
  );

  return Object.freeze({
    planId: `staging-plan-${LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION}-${planSeq}`,
    architectureVersion: LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    environment,
    authorization,
    tenants,
    stages: STAGING_ACTIVATION_STAGES,
    currentStage: 'preflight',
    status,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    rollbackPlan: buildStagingRollbackPlan(),
    evidenceRequirements: STAGING_EVIDENCE_REQUIREMENTS,
    successCriteria: STAGING_SUCCESS_CRITERIA,
    failureCriteria: STAGING_FAILURE_CRITERIA,
    humanApprovalRequired: true,
    autoPromotionAllowed: false,
  });
}

export function __resetStagingPlanSeqForTest(): void {
  planSeq = 0;
}
