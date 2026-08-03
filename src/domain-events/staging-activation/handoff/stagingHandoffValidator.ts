/**
 * @module domain-events/staging-activation/handoff/stagingHandoffValidator
 * Valida sem alterar estados.
 */

import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../../certification/cqrsArchitectureVersion.js';
import { approvalChainHasSkip } from './stagingApprovalChain.js';
import { REQUIRED_HANDOFF_ROLE_IDS } from './stagingResponsibilityMatrix.js';
import type { StagingHandoffPackage } from './stagingHandoffPackage.js';

export interface StagingHandoffValidation {
  readonly ok: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export function validateStagingAuthorizationHandoff(
  pkg: StagingHandoffPackage,
): StagingHandoffValidation {
  const blockers: string[] = [];
  const warnings: string[] = [...pkg.warnings];

  if (pkg.architectureVersion !== LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION) {
    blockers.push('Architecture Version inválida — exige recertificação');
  }

  for (const roleId of REQUIRED_HANDOFF_ROLE_IDS) {
    if (!pkg.owners.some((o) => o.roleId === roleId)) {
      blockers.push(`papel obrigatório ausente: ${roleId}`);
    }
  }

  if (approvalChainHasSkip(pkg.requiredApprovals)) {
    blockers.push('approval chain com etapa pulada ou referência inválida');
  }

  if (pkg.expiresAt && Date.parse(pkg.expiresAt) < Date.now()) {
    blockers.push('handoff expirado');
  }

  // Escopo Stage 1 / produção — structural assertions via forbidden actions
  if (!pkg.forbiddenActions.includes('execute_stage_one')) {
    blockers.push('forbiddenActions incompleto');
  }

  // Open critical blockers
  for (const b of pkg.currentBlockers) {
    if ((b.status === 'open' || b.status === 'waiting_external_input') && b.severity === 'critical') {
      warnings.push(`blocker open: ${b.blockerId}`);
    }
  }

  // Evidence: collected sem remote/human quando requerido = inválido
  for (const e of pkg.requiredEvidence) {
    if (e.currentStatus === 'collected' && (e.requiresRemote || e.requiresHuman)) {
      blockers.push(`evidence collected inválida: ${e.evidenceType}`);
    }
  }

  return Object.freeze({
    ok: blockers.length === 0,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
  });
}
