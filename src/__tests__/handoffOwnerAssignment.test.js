/**
 * Phase 8.12 — Handoff Owner Assignment + Authorization Input Validation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../domain-events/domainEventFlags.ts';
import { REQUIRED_HANDOFF_ROLE_IDS } from '../domain-events/staging-activation/handoff/stagingResponsibilityMatrix.ts';
import {
  parseOwnerAssignmentInput,
  evaluateOwnerResponsibilityConflicts,
  validateOwnerEnvironmentReference,
  validateOwnerTenantReference,
  evaluateHandoffOwnerAssignmentCompleteness,
  evaluateOwnerAssignmentReadiness,
  buildCandidateHandoffFromOwnerAssignments,
  buildHandoffOwnerAssignmentReport,
  inspectStagingHandoffOwnerAssignments,
  __resetOwnerAssignmentInputSeqForTest,
  __clearOwnerAssignmentHistoryForTest,
} from '../domain-events/staging-activation/handoff/owner-assignment/index.ts';
import { inspectDomainEvents } from '../domain-events/observability/domainEventInspector.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const future = () => new Date(Date.now() + 7 * 86400000).toISOString();

function clearAll() {
  __resetOwnerAssignmentInputSeqForTest();
  __clearOwnerAssignmentHistoryForTest();
}

function role(roleId, person, opts = {}) {
  return {
    roleId,
    assignedPerson: person,
    assignedBy: opts.assignedBy || 'coordinator',
    assignedAt: opts.assignedAt || future(),
    contactReference: opts.contactReference || null,
    acknowledged: opts.acknowledged === true,
    acknowledgedAt: opts.acknowledged ? future() : null,
    acknowledgementScope: opts.acknowledged ? 'handoff-owner' : null,
    responsibilitiesAccepted: opts.acknowledged === true,
    limitationsAccepted: opts.acknowledged === true,
    notes: opts.notes || null,
    justification: opts.justification || null,
    validUntil: opts.validUntil || null,
  };
}

function completeAssignments(opts = {}) {
  const people = {
    architecture_owner: 'Person-A',
    staging_environment_owner: 'Person-B',
    security_readonly_verifier: 'Person-C',
    tenant_owner: 'Person-D',
    business_owner: 'Person-E',
    stage_one_approver: 'Person-F',
    execution_operator: 'Person-G',
    rollback_operator: 'Person-H',
    evidence_reviewer: 'Person-I',
    ...opts.people,
  };
  return REQUIRED_HANDOFF_ROLE_IDS.map((id) =>
    role(id, people[id], {
      acknowledged: opts.acknowledged !== false,
      justification: opts.justifications?.[id],
    }),
  );
}

describe('ownerAssignment — input', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('vazio / submittedBy ausente / role inválido / imutável', () => {
    expect(parseOwnerAssignmentInput(null).parseResult).toBe('empty');
    expect(
      parseOwnerAssignmentInput({ assignments: [] }).parseResult,
    ).toBe('invalid');
    expect(
      parseOwnerAssignmentInput({
        submittedBy: 'coord',
        assignments: [{ roleId: 'not_a_role', assignedPerson: 'x', assignedBy: 'y', assignedAt: future() }],
      }).parseResult,
    ).toBe('invalid');

    const ok = parseOwnerAssignmentInput({
      submittedBy: 'coord',
      assignments: [role('architecture_owner', 'Person-A')],
    });
    expect(ok.parseResult).toBe('parsed');
    expect(Object.isFrozen(ok.envelope)).toBe(true);
  });

  it('identity técnica / wildcard inválidos', () => {
    const r = parseOwnerAssignmentInput({
      submittedBy: 'coord',
      assignments: [role('architecture_owner', 'system')],
    });
    expect(r.envelope.assignments[0].status).toBe('invalid');
  });
});

describe('ownerAssignment — conflicts / env / tenants', () => {
  it('approver=executor / verifier=executor / rollback ausente', () => {
    const conflict = evaluateOwnerResponsibilityConflicts([
      role('stage_one_approver', 'Same'),
      role('execution_operator', 'Same'),
      role('security_readonly_verifier', 'Same'),
      role('evidence_reviewer', 'Same'),
    ], 'Same');
    expect(conflict.conflicts.some((c) => c.code === 'APPROVER_EQUALS_EXECUTOR')).toBe(true);
    expect(conflict.conflicts.some((c) => c.code === 'VERIFIER_EQUALS_EXECUTOR')).toBe(true);
    expect(conflict.conflicts.some((c) => c.code === 'REVIEWER_EQUALS_EXECUTOR')).toBe(true);
    expect(conflict.conflicts.some((c) => c.code === 'APPROVER_EQUALS_SUBMITTER')).toBe(true);
    expect(conflict.blockers.some((b) => /Rollback/i.test(b))).toBe(true);

    const justified = evaluateOwnerResponsibilityConflicts([
      role('stage_one_approver', 'Same', { justification: 'temporary dual-hat' }),
      role('execution_operator', 'Same', { justification: 'temporary dual-hat' }),
      role('rollback_operator', 'Other'),
    ]);
    expect(
      justified.conflicts.find((c) => c.code === 'APPROVER_EQUALS_EXECUTOR')?.justified,
    ).toBe(true);
  });

  it('environment staging vs produção; tenants', () => {
    expect(validateOwnerEnvironmentReference(null).status).toBe('missing');
    expect(
      validateOwnerEnvironmentReference({
        host: 'stg.example.supabase.co',
        projectRef: 'stagingref',
        environmentOwner: 'Bob',
        declaredBy: 'Bob',
        environmentType: 'staging',
        isProduction: false,
        expiresAt: future(),
      }).status,
    ).toBe('declared_unverified_remote');
    expect(
      validateOwnerEnvironmentReference({
        host: `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
        projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
        environmentOwner: 'x',
        declaredBy: 'y',
      }).status,
    ).toBe('production_rejected');

    expect(validateOwnerTenantReference(null).status).toBe('missing');
    expect(
      validateOwnerTenantReference({
        pilotTenantIds: ['t1'],
        controlTenantIds: ['c1'],
        excludedTenantIds: [],
        tenantOwner: 'Dave',
        selectedBy: 'Dave',
      }).status,
    ).toBe('structurally_valid_remote_unverified');
    expect(
      validateOwnerTenantReference({
        pilotTenantIds: ['*'],
        tenantOwner: 'Dave',
      }).status,
    ).toBe('invalid');
  });
});

describe('ownerAssignment — completeness / gate / service / safety', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('empty / missing / unacknowledged / complete', () => {
    expect(
      evaluateHandoffOwnerAssignmentCompleteness({
        assignments: [],
        conflicts: [],
        parseEmpty: true,
      }),
    ).toBe('empty');

    const partial = parseOwnerAssignmentInput({
      submittedBy: 'coord',
      assignments: [role('architecture_owner', 'Person-A')],
    });
    const conf = evaluateOwnerResponsibilityConflicts(partial.envelope.assignments);
    expect(
      evaluateHandoffOwnerAssignmentCompleteness({
        assignments: partial.envelope.assignments,
        conflicts: conf.conflicts,
      }),
    ).toBe('missing_required_owners');

    const unack = parseOwnerAssignmentInput({
      submittedBy: 'coord',
      assignments: completeAssignments({ acknowledged: false }),
    });
    const conf2 = evaluateOwnerResponsibilityConflicts(unack.envelope.assignments);
    expect(
      evaluateHandoffOwnerAssignmentCompleteness({
        assignments: unack.envelope.assignments,
        conflicts: conf2.conflicts,
      }),
    ).toBe('owners_assigned_unacknowledged');

    const full = parseOwnerAssignmentInput({
      submittedBy: 'coord',
      assignments: completeAssignments({ acknowledged: true }),
    });
    const conf3 = evaluateOwnerResponsibilityConflicts(full.envelope.assignments);
    expect(
      evaluateHandoffOwnerAssignmentCompleteness({
        assignments: full.envelope.assignments,
        conflicts: conf3.conflicts,
      }),
    ).toBe('owners_complete_awaiting_authorization_data');

    expect(
      evaluateOwnerAssignmentReadiness({
        completeness: 'owners_complete_awaiting_authorization_data',
        conflicts: [],
      }),
    ).toBe('ready_to_collect_authorization_data');
    expect(
      evaluateOwnerAssignmentReadiness({
        completeness: 'empty',
        conflicts: [],
      }),
    ).not.toMatch(/stage_one|approved|readonly_verification/);
  });

  it('sem dados reais = blocked', () => {
    const r = buildCandidateHandoffFromOwnerAssignments(null);
    expect(r.result).toBe('blocked');
    expect(r.handoffStatus).toBe('awaiting_owners');
    expect(r.nextAllowedAction).toBe('provide_real_handoff_owner_assignments');
    expect(r.recommendation).toBe('owner_assignment_blocked_missing_real_input');
    expect(r.humanApprovalStatus).toBe('pending');
    expect(r.stageOneExecutionApprovalStatus).toBe('pending');
    expect(r.approvalsUnchanged).toBe(true);
    expect(r.remoteConnectionOpened).toBe(false);
    expect(r.flagsChanged).toBe(false);
    expect(r.stageOneExecuted).toBe(false);
  });

  it('completo → collect authorization data; approvals intactas', () => {
    const r = buildCandidateHandoffFromOwnerAssignments({
      submittedBy: 'coord',
      assignments: completeAssignments({ acknowledged: true }),
    });
    expect(r.result).toBe('processed');
    expect(r.completeness).toBe('owners_complete_awaiting_authorization_data');
    expect(r.readiness).toBe('ready_to_collect_authorization_data');
    expect(r.nextAllowedAction).toBe('collect_authorization_data');
    expect(r.candidateHandoff).not.toBeNull();
    expect(r.humanApprovalStatus).toBe('pending');
    expect(r.readonlyVerificationApprovalStatus).toBe('pending');
    expect(r.stageOneAuthorizationStatus).toBe('pending');
    expect(r.stageOneExecutionApprovalStatus).toBe('pending');
  });

  it('conflito sem justificativa → awaiting conflict resolution', () => {
    const r = buildCandidateHandoffFromOwnerAssignments({
      submittedBy: 'coord',
      assignments: completeAssignments({
        acknowledged: true,
        people: {
          stage_one_approver: 'Dual',
          execution_operator: 'Dual',
        },
      }),
    });
    expect(r.completeness).toBe('owners_assigned_with_warnings');
    expect(r.readiness).toBe('awaiting_conflict_resolution');
    expect(r.recommendation).toBe('owner_assignment_awaiting_conflict_resolution');
  });

  it('report / inspector / snapshot / template / flags', () => {
    const report = buildHandoffOwnerAssignmentReport(null);
    expect(report.result).toBe('blocked');
    expect(report.recommendation).toBe('owner_assignment_blocked_missing_real_input');
    expect(report.recommendation).not.toMatch(/stage_one|activate|enable|promote/i);

    const snap = inspectStagingHandoffOwnerAssignments(null);
    expect(snap.history.length).toBeGreaterThan(0);
    expect(snap.approvalsUnchanged).toBe(true);

    const de = inspectDomainEvents();
    expect(de.stagingHandoffOwnerAssignments.result).toBe('blocked');
    expect(de.stagingHandoffOwnerAssignments.nextAllowedAction).toBe(
      'provide_real_handoff_owner_assignments',
    );
    expect(de.stagingHandoffOwnerAssignments.flagsChanged).toBe(false);

    for (const v of Object.values(DOMAIN_EVENT_FLAG_DEFAULTS)) expect(v).toBe(false);

    const tpl = path.join(
      __dirname,
      '../../docs/playbooks/templates/CQRS_STAGING_HANDOFF_OWNER_ASSIGNMENT_TEMPLATE.json',
    );
    const json = JSON.parse(fs.readFileSync(tpl, 'utf8'));
    expect(json.submittedBy).toBe('');
    expect(json.assignments.every((a) => a.assignedPerson === '')).toBe(true);
    expect(json.assignments.every((a) => a.acknowledged === false)).toBe(true);
  });
});
