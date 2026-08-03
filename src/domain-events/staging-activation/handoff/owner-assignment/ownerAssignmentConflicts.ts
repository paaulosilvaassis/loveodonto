/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentConflicts
 */

import type { StagingHandoffRoleId } from '../stagingHandoffTypes.js';
import type {
  OwnerResponsibilityConflict,
  OwnerRoleAssignment,
} from './ownerAssignmentTypes.js';

function personFor(
  assignments: readonly OwnerRoleAssignment[],
  roleId: StagingHandoffRoleId,
): string | null {
  return assignments.find((a) => a.roleId === roleId && a.status !== 'missing')?.assignedPerson
    ?? null;
}

function assignmentFor(
  assignments: readonly OwnerRoleAssignment[],
  roleId: StagingHandoffRoleId,
): OwnerRoleAssignment | undefined {
  return assignments.find((a) => a.roleId === roleId);
}

/**
 * Conflitos: warning por padrão; blockers para Rollback/Stage1 Approver ausentes.
 */
export function evaluateOwnerResponsibilityConflicts(
  assignments: readonly OwnerRoleAssignment[],
  submittedBy: string | null = null,
): { conflicts: readonly OwnerResponsibilityConflict[]; blockers: readonly string[] } {
  const conflicts: OwnerResponsibilityConflict[] = [];
  const blockers: string[] = [];

  const approver = personFor(assignments, 'stage_one_approver');
  const executor = personFor(assignments, 'execution_operator');
  const verifier = personFor(assignments, 'security_readonly_verifier');
  const reviewer = personFor(assignments, 'evidence_reviewer');
  const envOwner = personFor(assignments, 'staging_environment_owner');
  const tenantOwner = personFor(assignments, 'tenant_owner');
  const rollback = personFor(assignments, 'rollback_operator');

  const addWarn = (
    code: string,
    message: string,
    roles: StagingHandoffRoleId[],
    justified: boolean,
    independent = true,
  ) => {
    conflicts.push(Object.freeze({
      code,
      message,
      rolesInvolved: Object.freeze(roles),
      severity: 'warning' as const,
      justificationRequired: true as const,
      independentReviewRequired: independent,
      justified,
    }));
  };

  if (approver && executor && approver === executor) {
    const a = assignmentFor(assignments, 'stage_one_approver');
    addWarn(
      'APPROVER_EQUALS_EXECUTOR',
      'Stage 1 Approver igual ao Execution Operator',
      ['stage_one_approver', 'execution_operator'],
      Boolean(a?.justification),
    );
  }
  if (approver && submittedBy && approver === submittedBy.trim()) {
    const a = assignmentFor(assignments, 'stage_one_approver');
    addWarn(
      'APPROVER_EQUALS_SUBMITTER',
      'Stage 1 Approver igual ao solicitante',
      ['stage_one_approver'],
      Boolean(a?.justification),
    );
  }
  if (verifier && executor && verifier === executor) {
    const a = assignmentFor(assignments, 'security_readonly_verifier');
    addWarn(
      'VERIFIER_EQUALS_EXECUTOR',
      'Read-only Verifier igual ao Execution Operator',
      ['security_readonly_verifier', 'execution_operator'],
      Boolean(a?.justification),
    );
  }
  if (reviewer && executor && reviewer === executor) {
    const a = assignmentFor(assignments, 'evidence_reviewer');
    addWarn(
      'REVIEWER_EQUALS_EXECUTOR',
      'Evidence Reviewer igual ao Execution Operator',
      ['evidence_reviewer', 'execution_operator'],
      Boolean(a?.justification),
      false,
    );
  }

  // mesma pessoa em múltiplos papéis críticos
  const critical: StagingHandoffRoleId[] = [
    'stage_one_approver',
    'execution_operator',
    'security_readonly_verifier',
    'rollback_operator',
  ];
  const byPerson = new Map<string, StagingHandoffRoleId[]>();
  for (const role of critical) {
    const p = personFor(assignments, role);
    if (!p) continue;
    const list = byPerson.get(p) || [];
    list.push(role);
    byPerson.set(p, list);
  }
  for (const [person, roles] of byPerson) {
    if (roles.length >= 2) {
      const a = assignmentFor(assignments, roles[0]);
      addWarn(
        'MULTI_CRITICAL_ROLES',
        `${person} ocupa múltiplos papéis críticos`,
        roles,
        Boolean(a?.justification),
      );
    }
  }

  if (!rollback) {
    blockers.push('Rollback Operator ausente');
    conflicts.push(Object.freeze({
      code: 'ROLLBACK_OPERATOR_MISSING',
      message: 'Rollback Operator ausente',
      rolesInvolved: Object.freeze(['rollback_operator'] as const),
      severity: 'blocker' as const,
      justificationRequired: true as const,
      independentReviewRequired: false,
      justified: false,
    }));
  }
  if (!approver) {
    blockers.push('Stage 1 Approver ausente');
    conflicts.push(Object.freeze({
      code: 'STAGE_ONE_APPROVER_MISSING',
      message: 'Stage 1 Approver ausente',
      rolesInvolved: Object.freeze(['stage_one_approver'] as const),
      severity: 'blocker' as const,
      justificationRequired: true as const,
      independentReviewRequired: false,
      justified: false,
    }));
  }
  if (!envOwner) blockers.push('Environment Owner ausente');
  if (!tenantOwner) blockers.push('Tenant Owner ausente');

  // conflitos warning sem justificativa → awaiting conflict resolution (não blocker hard salvo política)
  const unjustified = conflicts.filter(
    (c) => c.severity === 'warning' && c.justificationRequired && !c.justified,
  );

  return Object.freeze({
    conflicts: Object.freeze(conflicts),
    blockers: Object.freeze([
      ...blockers,
      ...unjustified.map((c) => `conflito sem justificativa: ${c.code}`),
    ]),
  });
}
