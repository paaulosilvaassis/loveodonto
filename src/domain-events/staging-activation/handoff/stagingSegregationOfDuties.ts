/**
 * @module domain-events/staging-activation/handoff/stagingSegregationOfDuties
 */

import type { StagingHandoffRole, StagingSegregationWarning } from './stagingHandoffTypes.js';

/**
 * Avalia SoD. Nunca infere aprovação. Warnings quando mesma pessoa em papéis conflitantes.
 */
export function evaluateStagingSegregationOfDuties(
  roles: readonly StagingHandoffRole[],
): { ok: boolean; warnings: readonly StagingSegregationWarning[]; blockers: readonly string[] } {
  const warnings: StagingSegregationWarning[] = [];
  const blockers: string[] = [];

  const byPerson = new Map<string, StagingHandoffRole[]>();
  for (const r of roles) {
    if (!r.assignedPerson) continue;
    const list = byPerson.get(r.assignedPerson) || [];
    list.push(r);
    byPerson.set(r.assignedPerson, list);
  }

  for (const [person, occupied] of byPerson) {
    const ids = occupied.map((r) => r.roleId);
    if (ids.includes('stage_one_approver') && ids.includes('execution_operator')) {
      warnings.push(Object.freeze({
        code: 'SOD_APPROVER_EQUALS_EXECUTOR',
        message: `${person}: Stage 1 Approver + Execution Operator`,
        rolesInvolved: Object.freeze(['stage_one_approver', 'execution_operator'] as const),
        justificationRequired: true as const,
        independentReviewRequired: true,
      }));
    }
    if (ids.includes('business_owner') && ids.includes('stage_one_approver')) {
      warnings.push(Object.freeze({
        code: 'SOD_REQUESTER_EQUALS_APPROVER',
        message: `${person}: Business Owner + Stage 1 Approver (solicitante≠autoaprovador)`,
        rolesInvolved: Object.freeze(['business_owner', 'stage_one_approver'] as const),
        justificationRequired: true as const,
        independentReviewRequired: true,
      }));
    }
    if (ids.includes('security_readonly_verifier') && ids.includes('tenant_owner')) {
      warnings.push(Object.freeze({
        code: 'SOD_VERIFIER_TENANT_OWNER',
        message: `${person}: Read-only Verifier não pode ampliar tenants`,
        rolesInvolved: Object.freeze(['security_readonly_verifier', 'tenant_owner'] as const),
        justificationRequired: true as const,
        independentReviewRequired: true,
      }));
    }
    if (ids.includes('evidence_reviewer') && ids.includes('execution_operator')) {
      warnings.push(Object.freeze({
        code: 'SOD_EVIDENCE_EXECUTOR',
        message: `${person}: Evidence Reviewer não deve executar`,
        rolesInvolved: Object.freeze(['evidence_reviewer', 'execution_operator'] as const),
        justificationRequired: true as const,
        independentReviewRequired: false,
      }));
    }
  }

  const rollback = roles.find((r) => r.roleId === 'rollback_operator');
  if (rollback && rollback.assignmentStatus === 'unassigned') {
    // warning estrutural — blocker fica no tracker
    warnings.push(Object.freeze({
      code: 'SOD_ROLLBACK_UNASSIGNED',
      message: 'Rollback Operator deve estar definido antes da execução',
      rolesInvolved: Object.freeze(['rollback_operator'] as const),
      justificationRequired: true as const,
      independentReviewRequired: false,
    }));
  }

  // Sistema nunca aprova — regra estrutural sempre ok (não é blocker de SoD)
  void blockers;

  return Object.freeze({
    ok: true, // SoD gera warnings; não bloqueia por ausência de pessoas (isso é ownership)
    warnings: Object.freeze(warnings),
    blockers: Object.freeze(blockers),
  });
}
