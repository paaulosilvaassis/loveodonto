/**
 * @module domain-events/staging-activation/authorization/stagingAuthorizationPackage
 * Monta o pacote oficial. Default: incomplete. Sem inventar aprovação.
 */

import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../../certification/cqrsArchitectureVersion.js';
import type {
  StagingAuthorizationPackage,
  StagingAuthorizationPackageStatus,
} from './stagingAuthorizationTypes.js';
import {
  buildEmptyStagingEnvironmentDeclaration,
  buildStagingEnvironmentDeclaration,
  type StagingEnvironmentDeclarationInput,
} from './stagingEnvironmentDeclaration.js';
import {
  buildPendingStagingHumanApprovalForm,
  buildStagingHumanApprovalForm,
  type StagingHumanApprovalFormInput,
} from './stagingHumanApproval.js';
import {
  buildEmptyStagingTenantSelectionForm,
  buildStagingTenantSelectionForm,
  type StagingTenantSelectionFormInput,
} from './stagingTenantSelection.js';
import {
  buildUnverifiedReadonlyAccessDeclaration,
  buildStagingReadonlyAccessDeclaration,
  type StagingReadonlyAccessInput,
} from './stagingReadonlyAccessDeclaration.js';
import {
  buildPendingStageOneAuthorization,
  buildStageOneAuthorization,
  type StageOneAuthorizationInput,
} from './stageOneAuthorization.js';
import { buildStagingRollbackAcknowledgement } from './stagingRollbackAcknowledgement.js';
import { buildStagingEvidenceAcknowledgement } from './stagingEvidenceAcknowledgement.js';
import { buildStagingRiskAcknowledgement } from './stagingRiskAcknowledgement.js';
import { validateStagingAuthorizationPackage } from './stagingAuthorizationValidator.js';

let pkgSeq = 0;

export interface BuildAuthorizationPackageOptions {
  planId?: string | null;
  preflightExecutionId?: string | null;
  environment?: StagingEnvironmentDeclarationInput;
  humanApproval?: StagingHumanApprovalFormInput;
  tenants?: StagingTenantSelectionFormInput;
  readonlyAccess?: StagingReadonlyAccessInput;
  stageOne?: StageOneAuthorizationInput;
  rollback?: { reviewed?: boolean; reviewedBy?: string | null; reviewedAt?: string | null };
  evidence?: { reviewed?: boolean; reviewedBy?: string | null; reviewedAt?: string | null };
  risks?: Parameters<typeof buildStagingRiskAcknowledgement>[0];
  expiresAt?: string | null;
  /** Força status rejected/expired/revoked em testes. */
  forcedStatus?: StagingAuthorizationPackageStatus;
}

function deriveStatus(
  pkg: Omit<StagingAuthorizationPackage, 'status' | 'blockers' | 'warnings'>,
  forced?: StagingAuthorizationPackageStatus,
): { status: StagingAuthorizationPackageStatus; blockers: string[]; warnings: string[] } {
  if (forced === 'rejected' || forced === 'revoked' || forced === 'expired') {
    return { status: forced, blockers: [`forced ${forced}`], warnings: [] };
  }

  const draftPkg = {
    ...pkg,
    status: 'incomplete' as const,
    blockers: Object.freeze([]) as readonly string[],
    warnings: Object.freeze([]) as readonly string[],
  } as StagingAuthorizationPackage;

  const validation = validateStagingAuthorizationPackage(draftPkg);
  const blockers = [...validation.blockers];
  const warnings: string[] = [];

  if (pkg.humanApproval.status === 'pending') {
    warnings.push('human approval pending');
  }
  if (pkg.readonlyAccessDeclaration.status === 'unverified') {
    warnings.push('read-only unverified');
  }

  // Never auto-produce approved_for_stage_one
  if (forced === 'approved_for_stage_one') {
    return {
      status: 'incomplete',
      blockers: [...blockers, 'approved_for_stage_one não pode ser produzido automaticamente'],
      warnings,
    };
  }

  if (pkg.humanApproval.status === 'rejected' || pkg.stageOneAuthorization.status === 'rejected') {
    return { status: 'rejected', blockers, warnings };
  }

  if (validation.ok && forced === 'approved_for_preflight_readonly') {
    return { status: 'approved_for_preflight_readonly', blockers: [], warnings };
  }

  // All parts filled but awaiting human? pending_review if structure mostly present
  const hasAnyDeclaration = Boolean(
    pkg.environmentDeclaration.environmentId
    || pkg.humanApproval.requestedBy
    || pkg.tenantSelection.pilotTenantIds.length,
  );
  if (!hasAnyDeclaration) {
    return { status: 'incomplete', blockers, warnings };
  }
  if (!validation.ok) {
    return {
      status: blockers.length > 5 ? 'incomplete' : 'pending_review',
      blockers,
      warnings,
    };
  }

  // Completo estruturalmente — ainda assim Phase 8.8 default path never returns approved_for_stage_one
  return { status: 'pending_review', blockers: [], warnings };
}

export function buildStagingAuthorizationPackage(
  options: BuildAuthorizationPackageOptions = {},
): StagingAuthorizationPackage {
  pkgSeq += 1;
  const environmentDeclaration = options.environment
    ? buildStagingEnvironmentDeclaration(options.environment)
    : buildEmptyStagingEnvironmentDeclaration();
  const humanApproval = options.humanApproval
    ? buildStagingHumanApprovalForm(options.humanApproval)
    : buildPendingStagingHumanApprovalForm();
  const tenantSelection = options.tenants
    ? buildStagingTenantSelectionForm({
      ...options.tenants,
      allowedTenantIds:
          options.tenants.allowedTenantIds
          ?? (environmentDeclaration.environmentId ? undefined : options.tenants.allowedTenantIds),
    })
    : buildEmptyStagingTenantSelectionForm();
  const readonlyAccessDeclaration = options.readonlyAccess
    ? buildStagingReadonlyAccessDeclaration(options.readonlyAccess)
    : buildUnverifiedReadonlyAccessDeclaration();
  const stageOneAuthorization = options.stageOne
    ? buildStageOneAuthorization(options.stageOne)
    : buildPendingStageOneAuthorization();
  const rollbackAcknowledgement = buildStagingRollbackAcknowledgement(options.rollback || {});
  const evidenceAcknowledgement = buildStagingEvidenceAcknowledgement(options.evidence || {});
  const riskAcknowledgement = buildStagingRiskAcknowledgement(options.risks || {});

  const base = {
    packageId: `auth-pkg-${LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION}-${pkgSeq}`,
    architectureVersion: LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    planId: options.planId ?? null,
    preflightExecutionId: options.preflightExecutionId ?? null,
    environmentDeclaration,
    humanApproval,
    tenantSelection,
    readonlyAccessDeclaration,
    stageOneAuthorization,
    rollbackAcknowledgement,
    evidenceAcknowledgement,
    riskAcknowledgement,
    createdAt: new Date().toISOString(),
    expiresAt: options.expiresAt ?? null,
  };

  const derived = deriveStatus(base as never, options.forcedStatus);

  return Object.freeze({
    ...base,
    status: derived.status,
    blockers: Object.freeze(derived.blockers),
    warnings: Object.freeze(derived.warnings),
  });
}

export function __resetAuthPackageSeqForTest(): void {
  pkgSeq = 0;
}
