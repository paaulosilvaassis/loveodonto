/**
 * @module domain-events/staging-activation/handoff/stagingResponsibilityMatrix
 */

import type { StagingHandoffRole, StagingHandoffRoleId } from './stagingHandoffTypes.js';

const ROLE_DEFS: ReadonlyArray<Omit<StagingHandoffRole, 'assignedPerson' | 'assignmentStatus'>> = [
  {
    roleId: 'architecture_owner',
    roleName: 'Architecture Owner',
    responsibilities: ['certificação CQRS', 'versão arquitetural'],
    requiredActions: ['confirmar Architecture Version'],
    approvalsAllowed: ['architecture_certification_ack'],
    approvalsForbidden: ['stage_one_execution', 'production'],
  },
  {
    roleId: 'staging_environment_owner',
    roleName: 'Staging Environment Owner',
    responsibilities: ['declarar ambiente staging', 'garantir não-produção'],
    requiredActions: ['preencher environment declaration'],
    approvalsAllowed: ['environment_declaration'],
    approvalsForbidden: ['production', 'all_tenants'],
  },
  {
    roleId: 'security_readonly_verifier',
    roleName: 'Security / Read-only Verifier',
    responsibilities: ['verificar acesso read-only', 'bloquear secrets'],
    requiredActions: ['aprovar verificação read-only'],
    approvalsAllowed: ['readonly_verification'],
    approvalsForbidden: ['tenant_expansion', 'stage_one_execution', 'flag_write'],
  },
  {
    roleId: 'tenant_owner',
    roleName: 'Tenant Owner',
    responsibilities: ['autorizar tenants piloto/controle'],
    requiredActions: ['confirmar tenant IDs explícitos'],
    approvalsAllowed: ['tenant_selection'],
    approvalsForbidden: ['all_tenants', 'wildcard'],
  },
  {
    roleId: 'business_owner',
    roleName: 'Business Owner',
    responsibilities: ['justificar piloto de negócio'],
    requiredActions: ['revisar critérios de sucesso/falha'],
    approvalsAllowed: ['business_ack'],
    approvalsForbidden: ['production', 'flag_write'],
  },
  {
    roleId: 'stage_one_approver',
    roleName: 'Stage 1 Approver',
    responsibilities: ['aprovar somente Stage 1 observability'],
    requiredActions: ['human approval Stage 1'],
    approvalsAllowed: ['stage_one_authorization', 'human_approval_stage_one'],
    approvalsForbidden: ['production', 'stage_two', 'execution_without_separate_approval'],
  },
  {
    roleId: 'execution_operator',
    roleName: 'Execution Operator',
    responsibilities: ['executar somente com Execution Approval'],
    requiredActions: ['aguardar StageOneExecutionApproval'],
    approvalsAllowed: [],
    approvalsForbidden: ['self_approve_execution', 'production'],
  },
  {
    roleId: 'rollback_operator',
    roleName: 'Rollback Operator',
    responsibilities: ['rollback ordenado Stage 1'],
    requiredActions: ['confirmar ordem OBS→AUDIT→EVENTS'],
    approvalsAllowed: ['rollback_ack'],
    approvalsForbidden: ['skip_rollback_review'],
  },
  {
    roleId: 'evidence_reviewer',
    roleName: 'Evidence Reviewer',
    responsibilities: ['revisar evidências sem alterá-las'],
    requiredActions: ['checklist de evidências'],
    approvalsAllowed: ['evidence_ack'],
    approvalsForbidden: ['mutate_evidence', 'flag_write'],
  },
];

export function buildStagingResponsibilityMatrix(
  assignments: Partial<Record<StagingHandoffRoleId, string | null>> = {},
): readonly StagingHandoffRole[] {
  return Object.freeze(
    ROLE_DEFS.map((def) => {
      const person = assignments[def.roleId]?.trim() || null;
      return Object.freeze({
        ...def,
        assignedPerson: person,
        assignmentStatus: person ? ('assigned' as const) : ('unassigned' as const),
      });
    }),
  );
}

export function countAssignedOwners(roles: readonly StagingHandoffRole[]): number {
  return roles.filter((r) => r.assignmentStatus === 'assigned').length;
}

export const REQUIRED_HANDOFF_ROLE_IDS = Object.freeze(
  ROLE_DEFS.map((r) => r.roleId),
) as readonly StagingHandoffRoleId[];
