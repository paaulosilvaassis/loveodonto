/**
 * Phase 8.11 — Staging Authorization Handoff + Evidence Readiness.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAIN_EVENT_FLAG_DEFAULTS } from '../domain-events/domainEventFlags.ts';
import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../domain-events/certification/cqrsArchitectureVersion.ts';
import {
  buildStagingAuthorizationHandoffPackage,
  buildStagingAuthorizationHandoffReport,
  inspectStagingAuthorizationHandoff,
  buildStagingResponsibilityMatrix,
  evaluateStagingSegregationOfDuties,
  buildStagingRequiredDataChecklist,
  requiredDataMissingCount,
  buildStagingApprovalChain,
  approvalChainHasSkip,
  buildStagingEvidenceReadinessMatrix,
  buildStagingBlockerTracker,
  openBlockerCount,
  INITIAL_HANDOFF_BLOCKER_IDS,
  buildStagingHumanReviewChecklist,
  humanReviewAllComplete,
  evaluateStagingAuthorizationHandoffReadiness,
  recommendationFromHandoffReadiness,
  validateStagingAuthorizationHandoff,
  __resetHandoffSeqForTest,
  __clearStagingHandoffHistoryForTest,
} from '../domain-events/staging-activation/handoff/index.ts';
import { inspectDomainEvents } from '../domain-events/observability/domainEventInspector.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function clearAll() {
  __resetHandoffSeqForTest();
  __clearStagingHandoffHistoryForTest();
}

const allRoles = {
  architecture_owner: 'Alice Arch',
  staging_environment_owner: 'Bob Env',
  security_readonly_verifier: 'Carol Sec',
  tenant_owner: 'Dave Tenant',
  business_owner: 'Eve Biz',
  stage_one_approver: 'Frank Appr',
  execution_operator: 'Grace Exec',
  rollback_operator: 'Heidi Rb',
  evidence_reviewer: 'Ivan Ev',
};

describe('stagingHandoff — package', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('vazio/incompleto/imutável/expiração/arch inválida', () => {
    const pkg = buildStagingAuthorizationHandoffPackage();
    expect(['incomplete', 'awaiting_owners']).toContain(pkg.status);
    expect(pkg.nextAllowedAction).toBe('assign_handoff_owners');
    expect(Object.isFrozen(pkg)).toBe(true);
    expect(pkg.remoteConnectionOpened).toBe(false);
    expect(pkg.flagsChanged).toBe(false);
    expect(pkg.stageOneExecuted).toBe(false);
    expect(pkg.forbiddenActions).toContain('execute_stage_one');

    expect(
      buildStagingAuthorizationHandoffPackage({
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }).status,
    ).toBe('expired');

    const badArch = buildStagingAuthorizationHandoffPackage({
      architectureVersion: 'wrong',
    });
    expect(validateStagingAuthorizationHandoff(badArch).ok).toBe(false);
  });
});

describe('stagingHandoff — responsibilities / SoD', () => {
  it('roles ausentes / assignment / mesma pessoa / rollback', () => {
    const empty = buildStagingResponsibilityMatrix();
    expect(empty.every((r) => r.assignedPerson === null)).toBe(true);
    expect(empty.every((r) => r.assignmentStatus === 'unassigned')).toBe(true);

    const assigned = buildStagingResponsibilityMatrix(allRoles);
    expect(assigned.every((r) => r.assignmentStatus === 'assigned')).toBe(true);

    const sod = evaluateStagingSegregationOfDuties(
      buildStagingResponsibilityMatrix({
        stage_one_approver: 'Same',
        execution_operator: 'Same',
        business_owner: 'Same',
      }),
    );
    expect(sod.warnings.some((w) => w.code === 'SOD_APPROVER_EQUALS_EXECUTOR')).toBe(true);
    expect(sod.warnings.some((w) => w.code === 'SOD_REQUESTER_EQUALS_APPROVER')).toBe(true);

    const rb = evaluateStagingSegregationOfDuties(buildStagingResponsibilityMatrix());
    expect(rb.warnings.some((w) => w.code === 'SOD_ROLLBACK_UNASSIGNED')).toBe(true);
  });
});

describe('stagingHandoff — required data / chain / evidence / blockers / review', () => {
  it('checklist missing; chain skip; evidence; blockers; review', () => {
    const data = buildStagingRequiredDataChecklist();
    expect(requiredDataMissingCount(data)).toBeGreaterThan(0);
    expect(data.every((i) => i.status === 'missing' || !i.required || i.status === 'missing')).toBe(
      true,
    );

    const chain = buildStagingApprovalChain();
    expect(chain).toHaveLength(9);
    expect(chain[0].stepId).toBe('architecture_certification');
    expect(approvalChainHasSkip(chain)).toBe(false);

    const skipped = buildStagingApprovalChain({
      satisfiedStepIds: ['human_approval'],
    });
    expect(approvalChainHasSkip(skipped)).toBe(true);

    const mismatch = buildStagingApprovalChain({
      mismatchStepIds: ['tenant_authorization'],
    });
    expect(mismatch.find((s) => s.stepId === 'tenant_authorization')?.status).toBe('mismatch');

    const ev = buildStagingEvidenceReadinessMatrix();
    expect(ev.some((e) => e.currentStatus === 'prepared')).toBe(true);
    expect(ev.some((e) => e.currentStatus === 'manual_required')).toBe(true);
    expect(ev.some((e) => e.currentStatus === 'remote_required')).toBe(true);

    const invalidCollected = buildStagingAuthorizationHandoffPackage({
      evidenceOverrides: { environment: 'collected' },
    });
    expect(validateStagingAuthorizationHandoff(invalidCollected).blockers.some((b) => /collected inválida/i.test(b))).toBe(true);

    const blockers = buildStagingBlockerTracker();
    expect(blockers.map((b) => b.blockerId)).toEqual([...INITIAL_HANDOFF_BLOCKER_IDS]);
    expect(openBlockerCount(blockers)).toBe(11);
    expect(
      buildStagingBlockerTracker({
        MISSING_HUMAN_APPROVAL: { status: 'resolved', resolutionEvidence: null },
      }).find((b) => b.blockerId === 'MISSING_HUMAN_APPROVAL')?.status,
    ).toBe('open');

    const review = buildStagingHumanReviewChecklist();
    expect(review.every((r) => r.reviewed === false)).toBe(true);
    expect(humanReviewAllComplete(review)).toBe(false);
    const partial = buildStagingHumanReviewChecklist({
      'hr-1': { reviewed: true, reviewedBy: 'rev', reviewedAt: new Date().toISOString() },
    });
    expect(partial[0].reviewed).toBe(true);
    expect(humanReviewAllComplete(partial)).toBe(false);
  });
});

describe('stagingHandoff — readiness / report / inspector / safety', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('gates e next action; nunca Stage 1 ready', () => {
    const empty = buildStagingAuthorizationHandoffPackage();
    expect(evaluateStagingAuthorizationHandoffReadiness(empty)).toBe('awaiting_external_input');
    expect(recommendationFromHandoffReadiness('awaiting_external_input', empty)).toBe(
      'handoff_incomplete_awaiting_owner_assignment',
    );

    const ownersOnly = buildStagingAuthorizationHandoffPackage({
      roleAssignments: allRoles,
    });
    expect(ownersOnly.nextAllowedAction).toBe('collect_external_authorization_data');
    expect(evaluateStagingAuthorizationHandoffReadiness(ownersOnly)).toBe(
      'awaiting_external_input',
    );

    expect(ownersOnly.status).not.toMatch(/ready_for_stage_one|authorized|activated|promoted/);
    expect(ownersOnly.forbiddenActions).toContain('change_flags');
  });

  it('report / inspector / snapshot / template JSON', () => {
    const report = buildStagingAuthorizationHandoffReport();
    expect(report.recommendation).toBe('handoff_incomplete_awaiting_owner_assignment');
    expect(report.recommendation).not.toMatch(/stage_one|activate|enable|promote/i);
    expect(report.nextAllowedAction).toBe('assign_handoff_owners');
    expect(report.remoteConnectionOpened).toBe(false);
    expect(report.flagsChanged).toBe(false);

    const snap = inspectStagingAuthorizationHandoff();
    expect(snap.history.length).toBeGreaterThan(0);
    expect(snap.stageOneExecuted).toBe(false);

    const de = inspectDomainEvents();
    expect(de.stagingAuthorizationHandoff.handoffStatus).toMatch(/awaiting_owners|incomplete/);
    expect(de.stagingAuthorizationHandoff.nextAllowedAction).toBe('assign_handoff_owners');
    expect(de.stagingAuthorizationHandoff.flagsChanged).toBe(false);
    expect(de.stagingAuthorizationHandoff.stageOneExecuted).toBe(false);

    for (const v of Object.values(DOMAIN_EVENT_FLAG_DEFAULTS)) expect(v).toBe(false);

    const tpl = path.join(
      __dirname,
      '../../docs/playbooks/templates/CQRS_STAGING_AUTHORIZATION_HANDOFF_TEMPLATE.json',
    );
    const json = JSON.parse(fs.readFileSync(tpl, 'utf8'));
    expect(json.nextAllowedAction).toBe('assign_handoff_owners');
    expect(json.flags.DOMAIN_EVENTS).toBe(false);
    expect(json.remoteConnectionOpened).toBe(false);
    expect(Object.values(json.roleAssignments).every((v) => v === null)).toBe(true);
  });

  it('recomendações rejected/expired; arch version ref', () => {
    expect(LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION).toBeTruthy();
    const rej = buildStagingAuthorizationHandoffPackage({ forcedStatus: 'rejected' });
    expect(evaluateStagingAuthorizationHandoffReadiness(rej)).toBe('rejected');
    expect(recommendationFromHandoffReadiness('rejected', rej)).toBe('handoff_rejected');

    const exp = buildStagingAuthorizationHandoffPackage({
      expiresAt: new Date(Date.now() - 5000).toISOString(),
    });
    expect(evaluateStagingAuthorizationHandoffReadiness(exp)).toBe('expired');
  });
});
