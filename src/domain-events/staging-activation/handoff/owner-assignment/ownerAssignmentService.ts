/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentService
 * Candidate handoff — não substitui pacote oficial; não altera approvals.
 */

import { REQUIRED_HANDOFF_ROLE_IDS } from '../stagingResponsibilityMatrix.js';
import {
  buildStagingAuthorizationHandoffPackage,
  type StagingHandoffPackage,
} from '../stagingHandoffPackage.js';
import type { StagingHandoffRoleId } from '../stagingHandoffTypes.js';
import { evaluateHandoffOwnerAssignmentCompleteness } from './ownerAssignmentCompleteness.js';
import { evaluateOwnerResponsibilityConflicts } from './ownerAssignmentConflicts.js';
import {
  validateApprovalRoleReferences,
  validateOwnerEnvironmentReference,
  validateOwnerTenantReference,
} from './ownerAssignmentEnvTenant.js';
import { parseOwnerAssignmentInput } from './ownerAssignmentParser.js';
import {
  evaluateOwnerAssignmentReadiness,
  nextActionFromOwnerReadiness,
  recommendationFromOwnerReadiness,
} from './ownerAssignmentReadinessGate.js';
import type {
  OwnerAssignmentCompleteness,
  OwnerAssignmentInputEnvelope,
  OwnerAssignmentNextAction,
  OwnerAssignmentReadiness,
  OwnerAssignmentRecommendation,
  OwnerEnvironmentValidation,
  OwnerResponsibilityConflict,
  OwnerRoleAssignment,
  OwnerTenantValidation,
} from './ownerAssignmentTypes.js';

export interface OwnerAssignmentProcessResult {
  readonly input: OwnerAssignmentInputEnvelope | null;
  readonly parseResult: string;
  readonly assignmentValidation: readonly OwnerRoleAssignment[];
  readonly responsibilityConflicts: readonly OwnerResponsibilityConflict[];
  readonly acknowledgements: readonly {
    roleId: StagingHandoffRoleId;
    assignedPerson: string | null;
    acknowledged: boolean;
  }[];
  readonly missingRoles: readonly StagingHandoffRoleId[];
  readonly candidateHandoff: StagingHandoffPackage | null;
  readonly environmentOwner: OwnerEnvironmentValidation;
  readonly tenantOwner: OwnerTenantValidation;
  readonly approvalRolesPending: number;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly completeness: OwnerAssignmentCompleteness;
  readonly readiness: OwnerAssignmentReadiness;
  readonly recommendation: OwnerAssignmentRecommendation;
  readonly nextAllowedAction: OwnerAssignmentNextAction;
  readonly handoffStatus: string;
  readonly result: 'blocked' | 'processed';
  readonly approvalsUnchanged: true;
  readonly humanApprovalStatus: 'pending';
  readonly readonlyVerificationApprovalStatus: 'pending';
  readonly stageOneAuthorizationStatus: 'pending';
  readonly stageOneExecutionApprovalStatus: 'pending';
  readonly remoteConnectionOpened: false;
  readonly remoteReadsExecuted: false;
  readonly remoteWritesExecuted: false;
  readonly flagsChanged: false;
  readonly stageOneExecuted: false;
}

function blockedMissingInput(errors: readonly string[] = ['input ausente']): OwnerAssignmentProcessResult {
  return Object.freeze({
    input: null,
    parseResult: 'empty',
    assignmentValidation: Object.freeze([]),
    responsibilityConflicts: Object.freeze([]),
    acknowledgements: Object.freeze([]),
    missingRoles: REQUIRED_HANDOFF_ROLE_IDS,
    candidateHandoff: null,
    environmentOwner: Object.freeze({
      status: 'missing' as const,
      blockers: Object.freeze(['environmentReference ausente']),
      warnings: Object.freeze([] as string[]),
    }),
    tenantOwner: Object.freeze({
      status: 'missing' as const,
      blockers: Object.freeze(['tenantReference ausente']),
      warnings: Object.freeze([] as string[]),
    }),
    approvalRolesPending: 0,
    blockers: Object.freeze([...errors, 'blocked_missing_real_owner_assignments']),
    warnings: Object.freeze([] as string[]),
    completeness: 'empty',
    readiness: 'blocked',
    recommendation: 'owner_assignment_blocked_missing_real_input',
    nextAllowedAction: 'provide_real_handoff_owner_assignments',
    handoffStatus: 'awaiting_owners',
    result: 'blocked',
    approvalsUnchanged: true as const,
    humanApprovalStatus: 'pending' as const,
    readonlyVerificationApprovalStatus: 'pending' as const,
    stageOneAuthorizationStatus: 'pending' as const,
    stageOneExecutionApprovalStatus: 'pending' as const,
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
    stageOneExecuted: false as const,
  });
}

/**
 * Consolida candidate handoff a partir de assignments reais — não inventa.
 */
export function buildCandidateHandoffFromOwnerAssignments(
  rawInput: unknown | null = null,
): OwnerAssignmentProcessResult {
  if (rawInput == null) return blockedMissingInput();

  const parsed = parseOwnerAssignmentInput(rawInput);
  if (!parsed.envelope) {
    if (parsed.parseResult === 'empty' || parsed.parseResult === 'incomplete') {
      return blockedMissingInput(parsed.errors);
    }
    return Object.freeze({
      ...blockedMissingInput(parsed.errors),
      parseResult: parsed.parseResult,
      completeness: 'invalid' as const,
      readiness: 'rejected' as const,
      recommendation: 'owner_assignment_rejected' as const,
    });
  }

  const envelope = parsed.envelope;
  if (envelope.assignments.length === 0) {
    return blockedMissingInput(['assignments vazios — forneça atribuições reais']);
  }

  const { conflicts, blockers: conflictBlockers } = evaluateOwnerResponsibilityConflicts(
    envelope.assignments,
    envelope.submittedBy,
  );

  const byRole = new Map(envelope.assignments.map((a) => [a.roleId, a]));
  const missingRoles = REQUIRED_HANDOFF_ROLE_IDS.filter((id) => {
    const a = byRole.get(id);
    return !a || !a.assignedPerson || a.status === 'missing' || a.status === 'invalid';
  });

  const envVal = validateOwnerEnvironmentReference(envelope.environmentReference);
  const tenantVal = validateOwnerTenantReference(envelope.tenantReference);
  const approvalVal = validateApprovalRoleReferences(envelope.approvalReferences);

  const completeness = evaluateHandoffOwnerAssignmentCompleteness({
    assignments: envelope.assignments,
    conflicts,
    parseEmpty: false,
    invalid: envelope.assignments.some((a) => a.status === 'invalid')
      || !approvalVal.ok,
    expired: envelope.assignments.some((a) => a.status === 'expired'),
  });

  const readiness = evaluateOwnerAssignmentReadiness({ completeness, conflicts });
  const nextAllowedAction = nextActionFromOwnerReadiness(readiness);
  const recommendation = recommendationFromOwnerReadiness(readiness);

  // Candidate structural handoff — assignments only; approvals remain pending via builder
  const roleAssignments: Partial<Record<StagingHandoffRoleId, string | null>> = {};
  for (const a of envelope.assignments) {
    if (a.assignedPerson && a.status !== 'invalid' && a.status !== 'revoked') {
      roleAssignments[a.roleId] = a.assignedPerson;
    }
  }
  const candidateHandoff = buildStagingAuthorizationHandoffPackage({
    architectureVersion: envelope.architectureVersion || undefined,
    authorizationPackageId: envelope.handoffId,
    roleAssignments,
  });

  const warnings = Object.freeze([
    ...conflicts.filter((c) => c.severity === 'warning').map((c) => `${c.code}: ${c.message}`),
    ...envVal.warnings,
    ...tenantVal.warnings,
  ]);

  const blockers = Object.freeze([
    ...conflictBlockers.filter((b) => !b.startsWith('conflito sem justificativa')
      || readiness === 'awaiting_conflict_resolution'
      || completeness === 'owners_assigned_with_warnings'),
    ...(envVal.status === 'production_rejected' ? [...envVal.blockers] : []),
    ...(!approvalVal.ok ? [...approvalVal.blockers] : []),
    ...missingRoles.map((r) => `papel ausente: ${r}`),
  ]);

  return Object.freeze({
    input: envelope,
    parseResult: parsed.parseResult,
    assignmentValidation: envelope.assignments,
    responsibilityConflicts: conflicts,
    acknowledgements: Object.freeze(
      envelope.assignments.map((a) => Object.freeze({
        roleId: a.roleId,
        assignedPerson: a.assignedPerson,
        acknowledged: a.acknowledged,
      })),
    ),
    missingRoles: Object.freeze(missingRoles),
    candidateHandoff,
    environmentOwner: envVal,
    tenantOwner: tenantVal,
    approvalRolesPending: approvalVal.pendingCount,
    blockers,
    warnings,
    completeness,
    readiness,
    recommendation,
    nextAllowedAction,
    handoffStatus: candidateHandoff.status,
    result: 'processed' as const,
    approvalsUnchanged: true as const,
    humanApprovalStatus: 'pending' as const,
    readonlyVerificationApprovalStatus: 'pending' as const,
    stageOneAuthorizationStatus: 'pending' as const,
    stageOneExecutionApprovalStatus: 'pending' as const,
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
    stageOneExecuted: false as const,
  });
}

/** Alias de processo principal. */
export function processHandoffOwnerAssignment(
  rawInput: unknown | null = null,
): OwnerAssignmentProcessResult {
  return buildCandidateHandoffFromOwnerAssignments(rawInput);
}
