/**
 * @module domain-events/staging-activation/handoff/stagingApprovalChain
 */

import type { StagingApprovalChainStep } from './stagingHandoffTypes.js';

const CHAIN = Object.freeze([
  { stepId: 'architecture_certification', stepName: 'Architecture Certification', order: 1 },
  { stepId: 'staging_environment_declaration', stepName: 'Staging Environment Declaration', order: 2 },
  { stepId: 'human_approval', stepName: 'Human Approval', order: 3 },
  { stepId: 'tenant_authorization', stepName: 'Tenant Authorization', order: 4 },
  { stepId: 'readonly_access_declaration', stepName: 'Read-only Access Declaration', order: 5 },
  { stepId: 'readonly_verification_approval', stepName: 'Read-only Verification Approval', order: 6 },
  { stepId: 'remote_readonly_verification', stepName: 'Remote Read-only Verification', order: 7 },
  { stepId: 'stage_one_authorization', stepName: 'Stage 1 Authorization', order: 8 },
  { stepId: 'stage_one_execution_approval', stepName: 'Stage 1 Execution Approval', order: 9 },
] as const);

export interface ApprovalChainInput {
  /** Índices/ids marcados como satisfeitos estruturalmente (não inventa). */
  satisfiedStepIds?: readonly string[];
  expiredStepIds?: readonly string[];
  mismatchStepIds?: readonly string[];
  skippedStepIds?: readonly string[];
}

/**
 * Cadeia obrigatória — nenhuma etapa pode ser pulada.
 * Default: todos pending.
 */
export function buildStagingApprovalChain(
  input: ApprovalChainInput = {},
): readonly StagingApprovalChainStep[] {
  const satisfied = new Set(input.satisfiedStepIds || []);
  const expired = new Set(input.expiredStepIds || []);
  const mismatch = new Set(input.mismatchStepIds || []);
  const skipped = new Set(input.skippedStepIds || []);

  const steps: StagingApprovalChainStep[] = [];
  for (let i = 0; i < CHAIN.length; i += 1) {
    const def = CHAIN[i];
    const prev = i > 0 ? CHAIN[i - 1] : null;
    let status: StagingApprovalChainStep['status'] = 'pending';
    let blocker: string | null = null;

    if (skipped.has(def.stepId)) {
      status = 'skipped_invalid';
      blocker = 'etapa pulada — cadeia inválida';
    } else if (expired.has(def.stepId)) {
      status = 'expired';
      blocker = 'aprovação expirada invalida etapas posteriores';
    } else if (mismatch.has(def.stepId)) {
      status = 'mismatch';
      blocker = 'environment/tenant/architecture mismatch';
    } else if (satisfied.has(def.stepId)) {
      status = 'satisfied_structural';
    }

    // Se anterior não satisfeito e atual satisfeito sem skip explícito → invalidar
    if (
      prev
      && satisfied.has(def.stepId)
      && !satisfied.has(prev.stepId)
      && !expired.has(def.stepId)
      && !mismatch.has(def.stepId)
    ) {
      status = 'skipped_invalid';
      blocker = `referência inválida: ${prev.stepId} não satisfeito`;
    }

    steps.push(Object.freeze({
      stepId: def.stepId,
      stepName: def.stepName,
      order: def.order,
      previousStepId: prev?.stepId ?? null,
      status,
      referencesPrevious: Boolean(prev),
      blocker,
    }));
  }

  return Object.freeze(steps);
}

export function approvalChainHasSkip(steps: readonly StagingApprovalChainStep[]): boolean {
  return steps.some((s) => s.status === 'skipped_invalid');
}

export function approvalChainPendingCount(steps: readonly StagingApprovalChainStep[]): number {
  return steps.filter((s) => s.status === 'pending').length;
}

export const STAGING_APPROVAL_CHAIN_STEP_IDS = Object.freeze(CHAIN.map((c) => c.stepId));
