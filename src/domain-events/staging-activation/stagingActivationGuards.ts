/**
 * @module domain-events/staging-activation/stagingActivationGuards
 * @description Activation Guards — Phase 8.6.
 * Impedem ativação insegura. Não executam flags.
 */

import type { DomainEventFlagKey } from '../domainEventFlags.js';
import type { ControlledStagingActivationPlan } from './stagingActivationTypes.js';
import { isAuthorizationUsable } from './stagingHumanAuthorization.js';
import {
  RECOMMENDED_READ_MODEL_FLAG_ORDER,
  assertSequentialReadModelsOnly,
  validateFlagEnablementOrder,
} from './stagingFlagMatrix.js';

export interface StagingActivationGuardResult {
  readonly ok: boolean;
  readonly blockers: readonly string[];
}

export function evaluateStagingActivationGuards(
  plan: ControlledStagingActivationPlan,
  proposedFlags?: readonly DomainEventFlagKey[],
): StagingActivationGuardResult {
  const blockers: string[] = [];

  if (plan.environment.isProduction || plan.environment.environmentType === 'production') {
    blockers.push('ativação em produção proibida');
  }
  if (plan.environment.status !== 'ok' || !plan.environment.authorized) {
    blockers.push('ambiente não autorizado');
  }
  if (plan.authorization.status === 'pending') {
    blockers.push('autorização humana pending');
  }
  if (plan.authorization.status === 'expired' || plan.authorization.status === 'revoked') {
    blockers.push(`autorização ${plan.authorization.status}`);
  }
  if (plan.authorization.status === 'rejected') {
    blockers.push('autorização rejected');
  }
  if (
    plan.authorization.status === 'approved'
    && !isAuthorizationUsable(plan.authorization)
  ) {
    blockers.push('aprovação ausente ou expirada');
  }
  if (!plan.tenants.valid) {
    blockers.push(plan.tenants.reason || 'tenants inválidos');
  }
  if (plan.rollbackPlan.steps.length === 0) {
    blockers.push('plano sem rollback');
  }
  if (plan.evidenceRequirements.length === 0) {
    blockers.push('plano sem evidence requirements');
  }
  if (plan.autoPromotionAllowed !== false) {
    blockers.push('autoPromotionAllowed deve ser false');
  }
  if (!plan.humanApprovalRequired) {
    blockers.push('humanApprovalRequired deve ser true');
  }

  if (
    (plan.status === 'running' || plan.status === 'completed' || plan.status === 'authorized')
    && plan.environment.environmentType !== 'local-simulated'
  ) {
    blockers.push(
      `status ${plan.status} não permitido sem ambiente local-simulated autorizado`,
    );
  }

  if (proposedFlags && proposedFlags.length > 0) {
    const order = validateFlagEnablementOrder(proposedFlags);
    if (!order.ok) blockers.push(order.reason || 'ordem de flags inválida');
    const seq = assertSequentialReadModelsOnly(proposedFlags);
    if (!seq.ok) blockers.push(seq.reason || 'RMs simultâneos');
  }

  return Object.freeze({
    ok: blockers.length === 0,
    blockers: Object.freeze([...blockers]),
  });
}

export function guardRejectsSimultaneousReadModels(
  batch: readonly DomainEventFlagKey[],
): boolean {
  return !assertSequentialReadModelsOnly(batch).ok;
}

export function recommendedReadModelOrder(): readonly DomainEventFlagKey[] {
  return RECOMMENDED_READ_MODEL_FLAG_ORDER;
}
