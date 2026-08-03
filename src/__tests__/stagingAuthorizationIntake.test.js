/**
 * Phase 8.9 — Staging Authorization Data Intake + Final Validation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../domain-events/domainEventFlags.ts';
import {
  STAGE_ONE_AUTHORIZED_FLAGS,
  STAGE_ONE_FORBIDDEN_FLAGS,
  STAGE_ONE_ROLLBACK_FLAG_ORDER,
} from '../domain-events/staging-activation/authorization/stagingAuthorizationTypes.ts';
import {
  REQUIRED_EVIDENCE_ACK_TYPES,
  REQUIRED_RISK_IDS,
  parseStagingAuthorizationInput,
  sanitizeAuthorizationText,
  scanObjectForSensitive,
  sanitizeAttachmentMetadata,
  validateEnvironmentInput,
  validateHumanApprovalInput,
  validateTenantInput,
  validateReadonlyInput,
  validateStageOneInput,
  validateRollbackInput,
  validateEvidenceInput,
  validateRiskInput,
  validateStagingAuthorizationCrossConsistency,
  evaluateStagingAuthorizationCompleteness,
  evaluateFinalStageOneAuthorizationData,
  recommendationFromGate,
  processStagingAuthorizationIntake,
  consolidateStagingAuthorizationPackageFromInput,
  buildStagingAuthorizationIntakeReport,
  inspectStagingAuthorizationIntake,
  buildPendingStageOneExecutionApproval,
  __resetAuthInputSeqForTest,
  __clearStagingAuthorizationIntakeHistoryForTest,
} from '../domain-events/staging-activation/authorization-intake/index.ts';
import { inspectDomainEvents } from '../domain-events/observability/domainEventInspector.ts';
import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../domain-events/certification/cqrsArchitectureVersion.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const future = () => new Date(Date.now() + 7 * 86400000).toISOString();
const past = () => new Date(Date.now() - 86400000).toISOString();

function clearAll() {
  __resetAuthInputSeqForTest();
  __clearStagingAuthorizationIntakeHistoryForTest();
}

function risksAll(acceptedBy = 'risk-owner') {
  return REQUIRED_RISK_IDS.map((riskId) => ({
    riskId,
    accepted: true,
    acceptedBy,
    acceptedAt: future(),
    mitigation: `mitigation-${riskId}`,
    severity: 'high',
  }));
}

function completeInput(overrides = {}) {
  const envId = 'stg-env-1';
  const pilots = ['tenant-pilot-1'];
  const base = {
    inputSource: 'manual-form',
    submittedBy: 'submitter',
    submittedAt: future(),
    architectureVersion: LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    packageId: 'pkg-1',
    notes: 'safe notes',
    attachmentsMetadata: [{ name: 'decl.pdf', mediaType: 'application/pdf', sizeBytes: 10 }],
    environmentDeclaration: {
      environmentId: envId,
      environmentName: 'staging-lab',
      environmentType: 'staging',
      host: 'staging-example.supabase.co',
      projectRef: 'stagingrefabc',
      owner: 'owner',
      declaredBy: 'declarant',
      declaredAt: future(),
      expiresAt: future(),
      isStaging: true,
      isProduction: false,
    },
    humanApproval: {
      approvalId: 'appr-1',
      approvalScope: 'stage_one_observability',
      environmentId: envId,
      tenantIds: pilots,
      requestedBy: 'requester',
      requestedAt: future(),
      status: 'pending',
      approvedBy: '',
      approvedAt: '',
      expiresAt: '',
      riskAcknowledged: false,
      rollbackAcknowledged: false,
    },
    tenantSelection: {
      pilotTenantIds: pilots,
      controlTenantIds: ['tenant-ctrl-1'],
      excludedTenantIds: [],
      selectionReason: 'pilot',
      selectedBy: 'selector',
      selectedAt: future(),
      dataSensitivityReviewed: true,
      tenantOwnersNotified: true,
    },
    readonlyAccessDeclaration: {
      connectionId: 'conn-1',
      environmentId: envId,
      verifiedBy: 'verifier',
      verifiedAt: future(),
      verificationMethod: 'manual-checklist',
      expiresAt: future(),
      status: 'verified_readonly',
      mutationBlocked: true,
      migrationBlocked: true,
      storageWriteBlocked: true,
      secretAccessBlocked: true,
      environmentVariableWriteBlocked: true,
    },
    stageOneAuthorization: {
      stageId: 'stage-1-observability',
      authorizedFlags: [...STAGE_ONE_AUTHORIZED_FLAGS],
      forbiddenFlags: [...STAGE_ONE_FORBIDDEN_FLAGS],
      environmentId: envId,
      tenantIds: pilots,
      authorizationId: 'authz-1',
      authorizedBy: '',
      authorizedAt: '',
      expiresAt: '',
      maximumDurationHours: 72,
      successCriteria: ['metrics ok'],
      failureCriteria: ['tenant mismatch'],
      rollbackPlanId: 'stage1-rollback-observability',
      evidenceRequirements: ['diagnostics'],
      status: 'pending',
    },
    rollbackAcknowledgement: {
      rollbackPlanId: 'stage1-rollback-observability',
      reviewed: true,
      reviewedBy: 'reviewer',
      reviewedAt: future(),
      flagsToDisable: [...STAGE_ONE_ROLLBACK_FLAG_ORDER],
      maximumRollbackTimeMinutes: 15,
      status: 'acknowledged',
    },
    evidenceAcknowledgement: {
      acknowledgedTypes: [...REQUIRED_EVIDENCE_ACK_TYPES],
      reviewed: true,
      reviewedBy: 'evidence-reviewer',
      reviewedAt: future(),
      status: 'acknowledged',
    },
    riskAcknowledgements: risksAll(),
  };
  return { ...base, ...overrides };
}

describe('stagingAuthorizationIntake — parser', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('input vazio / null', () => {
    const r = parseStagingAuthorizationInput(null);
    expect(r.parseResult).toBe('invalid');
    expect(r.envelope).toBeNull();
  });

  it('submittedBy ausente → invalid', () => {
    const r = parseStagingAuthorizationInput({ inputSource: 'manual-form' });
    expect(r.parseResult).toBe('invalid');
  });

  it('input mínimo → incomplete envelope', () => {
    const r = parseStagingAuthorizationInput({
      inputSource: 'approved-json',
      submittedBy: 'alice',
    });
    expect(r.parseResult).toBe('incomplete');
    expect(r.envelope).not.toBeNull();
    expect(Object.isFrozen(r.envelope)).toBe(true);
  });

  it('input válido com seções → parsed + imutável + whitespace', () => {
    const r = parseStagingAuthorizationInput(
      completeInput({ notes: '  hello   world  ' }),
    );
    expect(r.parseResult).toBe('parsed');
    expect(r.envelope.notes).toBe('hello world');
    expect(() => {
      r.envelope.submittedBy = 'x';
    }).toThrow();
  });

  it('campos perigosos / datas inválidas', () => {
    expect(
      parseStagingAuthorizationInput({
        inputSource: 'manual-form',
        submittedBy: 'a',
        password: 'x',
      }).parseResult,
    ).toBe('invalid');
    expect(
      parseStagingAuthorizationInput({
        inputSource: 'manual-form',
        submittedBy: 'a',
        environmentDeclaration: { declaredAt: 'not-a-date' },
      }).parseResult,
    ).toBe('invalid');
  });
});

describe('stagingAuthorizationIntake — sanitizer', () => {
  it('text + secrets + clinical + attachment', () => {
    expect(sanitizeAuthorizationText('  a  b  ')).toBe('a b');
    expect(scanObjectForSensitive({ token: 'abc' }).ok).toBe(false);
    expect(scanObjectForSensitive({ notes: 'service_role key leaked' }).ok).toBe(false);
    expect(scanObjectForSensitive({ notes: 'paciente João CPF: 1' }).ok).toBe(false);
    expect(scanObjectForSensitive({ notes: 'ok' }).ok).toBe(true);
    expect(sanitizeAttachmentMetadata([{ name: 'a', content: 'x' }]).ok).toBe(false);
    expect(sanitizeAttachmentMetadata([{ name: 'a.pdf' }]).ok).toBe(true);
    expect(sanitizeAttachmentMetadata([{ name: 'a.pdf' }]).items[0].contentIncluded).toBe(
      false,
    );
  });
});

describe('stagingAuthorizationIntake — environment', () => {
  it('staging estrutural vs produção / localhost / expirado', () => {
    const ok = validateEnvironmentInput({
      host: 'stg.supabase.co',
      projectRef: 'stagingref',
      owner: 'o',
      declaredBy: 'd',
      environmentType: 'staging',
      expiresAt: future(),
    });
    expect(ok.some((x) => x.code === 'structurally_valid_unverified_remote')).toBe(true);
    expect(ok.every((x) => x.result !== 'fail')).toBe(true);

    expect(
      validateEnvironmentInput({
        host: `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
        projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
        owner: 'o',
        declaredBy: 'd',
        environmentType: 'staging',
      }).some((x) => x.result === 'fail'),
    ).toBe(true);

    expect(
      validateEnvironmentInput({
        host: '',
        projectRef: 'x',
        owner: 'o',
        declaredBy: 'd',
        environmentType: 'staging',
      }).some((x) => /host/i.test(x.message)),
    ).toBe(true);

    expect(
      validateEnvironmentInput({
        host: 'localhost',
        projectRef: 'x',
        owner: 'o',
        declaredBy: 'd',
        environmentType: 'staging',
      }).some((x) => /localhost/i.test(x.message)),
    ).toBe(true);

    expect(
      validateEnvironmentInput({
        host: 'stg.supabase.co',
        projectRef: 'stagingref',
        owner: 'o',
        declaredBy: 'd',
        environmentType: 'staging',
        expiresAt: past(),
      }).some((x) => /expirad/i.test(x.message)),
    ).toBe(true);
  });
});

describe('stagingAuthorizationIntake — approval', () => {
  it('pending / approved válido / sem approvedBy / expirado / mismatch / same requester', () => {
    const pending = validateHumanApprovalInput(
      { status: 'pending', approvalScope: 'stage_one_observability' },
      'e1',
      ['t1'],
    );
    expect(pending.some((x) => x.result === 'manual_required')).toBe(true);

    const approvedOk = validateHumanApprovalInput(
      {
        status: 'approved',
        approvalScope: 'stage_one_observability',
        approvedBy: 'boss',
        approvedAt: future(),
        expiresAt: future(),
        riskAcknowledged: true,
        rollbackAcknowledged: true,
        environmentId: 'e1',
        tenantIds: ['t1'],
        requestedBy: 'req',
      },
      'e1',
      ['t1'],
    );
    expect(approvedOk.every((x) => x.result !== 'fail')).toBe(true);

    expect(
      validateHumanApprovalInput(
        {
          status: 'approved',
          approvedBy: '',
          approvedAt: future(),
          expiresAt: future(),
          riskAcknowledged: true,
          rollbackAcknowledged: true,
        },
        null,
        [],
      ).some((x) => /approvedBy/i.test(x.message)),
    ).toBe(true);

    expect(
      validateHumanApprovalInput(
        {
          status: 'approved',
          approvedBy: 'a',
          approvedAt: future(),
          expiresAt: past(),
          riskAcknowledged: true,
          rollbackAcknowledged: true,
        },
        null,
        [],
      ).some((x) => /expirad/i.test(x.message)),
    ).toBe(true);

    expect(
      validateHumanApprovalInput(
        {
          status: 'approved',
          approvedBy: 'a',
          approvedAt: future(),
          expiresAt: future(),
          riskAcknowledged: true,
          rollbackAcknowledged: true,
          environmentId: 'other',
          tenantIds: ['x'],
        },
        'e1',
        ['t1'],
      ).some((x) => x.code === 'ENVIRONMENT_ID_MISMATCH' || x.code === 'TENANT_SCOPE_MISMATCH'),
    ).toBe(true);

    expect(
      validateHumanApprovalInput(
        {
          status: 'approved',
          approvedBy: 'same',
          requestedBy: 'same',
          approvedAt: future(),
          expiresAt: future(),
          riskAcknowledged: true,
          rollbackAcknowledged: true,
          approvalScope: 'stage_one_observability',
        },
        null,
        [],
      ).some((x) => x.code === 'SAME_REQUESTER_AND_APPROVER'),
    ).toBe(true);

    expect(
      validateHumanApprovalInput(
        { status: 'approved', approvalScope: 'production' },
        null,
        [],
      ).some((x) => x.code === 'AUTHORIZATION_SCOPE_MISMATCH'),
    ).toBe(true);
  });
});

describe('stagingAuthorizationIntake — tenants', () => {
  it('vazio / duplicado / overlap / wildcard / remote-unverified', () => {
    expect(validateTenantInput({ pilotTenantIds: [] }).some((x) => x.result === 'fail')).toBe(
      true,
    );
    expect(
      validateTenantInput({
        pilotTenantIds: ['a', 'a'],
        controlTenantIds: [],
        excludedTenantIds: [],
      }).some((x) => /duplic/i.test(x.message)),
    ).toBe(true);
    expect(
      validateTenantInput({
        pilotTenantIds: ['a'],
        controlTenantIds: ['a'],
        excludedTenantIds: [],
      }).some((x) => /overlap/i.test(x.message)),
    ).toBe(true);
    expect(
      validateTenantInput({
        pilotTenantIds: ['*'],
        controlTenantIds: [],
        excludedTenantIds: [],
      }).some((x) => /wildcard/i.test(x.message)),
    ).toBe(true);
    expect(
      validateTenantInput({
        pilotTenantIds: ['t1'],
        controlTenantIds: ['c1'],
        excludedTenantIds: [],
      }).some((x) => /remote_existence_unverified/i.test(x.message)),
    ).toBe(true);
  });
});

describe('stagingAuthorizationIntake — readonly', () => {
  it('write/migration/secrets / declaração válida / remote pending', () => {
    expect(
      validateReadonlyInput({ status: 'unverified' }, 'e1').some(
        (x) => x.result === 'manual_required',
      ),
    ).toBe(true);

    expect(
      validateReadonlyInput(
        {
          status: 'verified_readonly',
          mutationBlocked: false,
          migrationBlocked: true,
          storageWriteBlocked: true,
          secretAccessBlocked: true,
          verifiedBy: 'v',
          verificationMethod: 'm',
          expiresAt: future(),
        },
        'e1',
      ).some((x) => /mutationBlocked/i.test(x.message)),
    ).toBe(true);

    expect(
      validateReadonlyInput(
        {
          status: 'verified_readonly',
          mutationBlocked: true,
          migrationBlocked: false,
          storageWriteBlocked: true,
          secretAccessBlocked: true,
          verifiedBy: 'v',
          verificationMethod: 'm',
          expiresAt: future(),
        },
        'e1',
      ).some((x) => /migrationBlocked/i.test(x.message)),
    ).toBe(true);

    expect(
      validateReadonlyInput(
        {
          status: 'verified_readonly',
          mutationBlocked: true,
          migrationBlocked: true,
          storageWriteBlocked: true,
          secretAccessBlocked: false,
          verifiedBy: 'v',
          verificationMethod: 'm',
          expiresAt: future(),
        },
        'e1',
      ).some((x) => /secretAccessBlocked/i.test(x.message)),
    ).toBe(true);

    const ok = validateReadonlyInput(
      {
        status: 'verified_readonly',
        mutationBlocked: true,
        migrationBlocked: true,
        storageWriteBlocked: true,
        secretAccessBlocked: true,
        environmentVariableWriteBlocked: true,
        verifiedBy: 'v',
        verificationMethod: 'm',
        expiresAt: future(),
        environmentId: 'e1',
      },
      'e1',
    );
    expect(ok.every((x) => x.result !== 'fail')).toBe(true);
    expect(ok.some((x) => /declared_verified_readonly/i.test(x.message))).toBe(true);
  });
});

describe('stagingAuthorizationIntake — stage1 / rollback / evidence / risks', () => {
  it('três flags / extra / mismatch / critérios', () => {
    expect(
      validateStageOneInput(
        {
          authorizedFlags: [...STAGE_ONE_AUTHORIZED_FLAGS],
          authorizationId: 'id',
          successCriteria: ['a'],
          failureCriteria: ['b'],
          status: 'pending',
        },
        null,
        [],
      ).every((x) => x.result !== 'fail'),
    ).toBe(true);

    expect(
      validateStageOneInput(
        {
          authorizedFlags: [...STAGE_ONE_AUTHORIZED_FLAGS, 'CQRS_READ_MODEL'],
          authorizationId: 'id',
          successCriteria: ['a'],
          failureCriteria: ['b'],
        },
        null,
        [],
      ).some((x) => x.code === 'STAGE_ONE_FLAG_SCOPE_MISMATCH'),
    ).toBe(true);

    expect(
      validateStageOneInput(
        {
          authorizedFlags: [...STAGE_ONE_AUTHORIZED_FLAGS],
          authorizationId: 'id',
          environmentId: 'other',
          tenantIds: ['x'],
          successCriteria: ['a'],
          failureCriteria: ['b'],
        },
        'e1',
        ['t1'],
      ).some((x) => x.result === 'fail'),
    ).toBe(true);

    expect(
      validateStageOneInput(
        {
          authorizedFlags: [...STAGE_ONE_AUTHORIZED_FLAGS],
          authorizationId: 'id',
          successCriteria: [],
          failureCriteria: [],
        },
        null,
        [],
      ).some((x) => /Criteria/i.test(x.message)),
    ).toBe(true);
  });

  it('rollback ordem / evidência / riscos', () => {
    expect(
      validateRollbackInput({
        reviewed: true,
        reviewedBy: 'r',
        reviewedAt: future(),
        flagsToDisable: [...STAGE_ONE_ROLLBACK_FLAG_ORDER],
      }).every((x) => x.result !== 'fail'),
    ).toBe(true);
    expect(
      validateRollbackInput({
        reviewed: true,
        reviewedBy: 'r',
        reviewedAt: future(),
        flagsToDisable: [...STAGE_ONE_AUTHORIZED_FLAGS],
      }).some((x) => x.code === 'ROLLBACK_PLAN_MISMATCH'),
    ).toBe(true);
    expect(
      validateRollbackInput({ reviewed: false, reviewedBy: '', reviewedAt: '' }).some(
        (x) => x.result === 'fail',
      ),
    ).toBe(true);

    expect(
      validateEvidenceInput({
        acknowledgedTypes: [...REQUIRED_EVIDENCE_ACK_TYPES],
        reviewed: true,
        reviewedBy: 'e',
      }).every((x) => x.result !== 'fail'),
    ).toBe(true);
    expect(
      validateEvidenceInput({ acknowledgedTypes: ['environment'], reviewed: true, reviewedBy: 'e' })
        .some((x) => /faltando/i.test(x.message)),
    ).toBe(true);

    expect(validateRiskInput(risksAll()).every((x) => x.result !== 'fail')).toBe(true);
    expect(
      validateRiskInput([{ riskId: 'rejected_events', accepted: false }]).some(
        (x) => x.result === 'fail',
      ),
    ).toBe(true);
    expect(
      validateRiskInput([
        {
          riskId: 'rejected_events',
          accepted: true,
          acceptedBy: '',
          acceptedAt: future(),
          mitigation: 'm',
        },
      ]).some((x) => /acceptedBy/i.test(x.message)),
    ).toBe(true);
  });
});

describe('stagingAuthorizationIntake — cross / completeness / final gate', () => {
  it('cross mismatches', () => {
    const bad = parseStagingAuthorizationInput(
      completeInput({
        architectureVersion: 'wrong',
        humanApproval: {
          ...completeInput().humanApproval,
          environmentId: 'other',
        },
      }),
    );
    const cross = validateStagingAuthorizationCrossConsistency(bad.envelope);
    expect(cross.some((x) => x.code === 'ARCHITECTURE_VERSION_MISMATCH')).toBe(true);
    expect(cross.some((x) => x.code === 'ENVIRONMENT_ID_MISMATCH')).toBe(true);

    const tenantBad = parseStagingAuthorizationInput(
      completeInput({
        stageOneAuthorization: {
          ...completeInput().stageOneAuthorization,
          tenantIds: ['other'],
          rollbackPlanId: 'wrong-plan',
        },
      }),
    );
    const cross2 = validateStagingAuthorizationCrossConsistency(tenantBad.envelope);
    expect(cross2.some((x) => x.code === 'TENANT_SCOPE_MISMATCH')).toBe(true);
    expect(cross2.some((x) => x.code === 'ROLLBACK_PLAN_MISMATCH')).toBe(true);
  });

  it('completeness states', () => {
    expect(
      evaluateStagingAuthorizationCompleteness({
        parseResult: 'incomplete',
        envelope: null,
        validations: [],
      }),
    ).toBe('empty');

    const incomplete = processStagingAuthorizationIntake({
      inputSource: 'manual-form',
      submittedBy: 'a',
    });
    expect(['incomplete', 'empty']).toContain(incomplete.completeness);
    expect(incomplete.finalGate).toBe('blocked');

    const pending = processStagingAuthorizationIntake(completeInput());
    expect(pending.completeness).toBe('pending_human_review');

    const approved = processStagingAuthorizationIntake(
      completeInput({
        humanApproval: {
          ...completeInput().humanApproval,
          status: 'approved',
          approvedBy: 'boss',
          approvedAt: future(),
          expiresAt: future(),
          riskAcknowledged: true,
          rollbackAcknowledged: true,
        },
      }),
    );
    expect(approved.completeness).toBe('approved_data_unverified_remote');

    expect(
      evaluateStagingAuthorizationCompleteness({
        parseResult: 'invalid',
        envelope: null,
        validations: [],
      }),
    ).toBe('invalid');
  });

  it('final gate — nunca execução; máximo awaiting remote', () => {
    expect(
      evaluateFinalStageOneAuthorizationData({
        completeness: 'incomplete',
        hasFails: true,
      }),
    ).toBe('blocked');
    expect(
      evaluateFinalStageOneAuthorizationData({
        completeness: 'pending_human_review',
        hasFails: false,
      }),
    ).toBe('manual_required');
    expect(
      evaluateFinalStageOneAuthorizationData({
        completeness: 'approved_data_unverified_remote',
        hasFails: false,
        remoteVerified: false,
      }),
    ).toBe('data_complete_awaiting_remote_verification');
    expect(
      evaluateFinalStageOneAuthorizationData({
        completeness: 'approved_data_unverified_remote',
        hasFails: false,
        remoteVerified: true,
        executionApproved: false,
      }),
    ).toBe('data_verified_awaiting_execution_approval');

    const gate = evaluateFinalStageOneAuthorizationData({
      completeness: 'approved_data_unverified_remote',
      hasFails: false,
    });
    expect(gate).not.toBe('ready_for_stage_one_execution');
    expect(recommendationFromGate(gate, 'approved_data_unverified_remote')).toBe(
      'authorization_data_complete_awaiting_remote_verification',
    );
  });
});

describe('stagingAuthorizationIntake — report / inspector / consolidation / safety', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('default sem dados reais — blocked + execution pending', () => {
    const r = buildStagingAuthorizationIntakeReport(null);
    expect(r.completeness).toBe('empty');
    expect(r.finalGate).toBe('blocked');
    expect(r.recommendation).toBe('authorization_data_missing');
    expect(r.intake.executionApproval.status).toBe('pending');
    expect(r.flagsChanged).toBe(false);
    expect(r.remoteActionsExecuted).toBe(false);
    expect(buildPendingStageOneExecutionApproval(null).status).toBe('pending');
  });

  it('recommendation segura + histórico + inspector + snapshot', () => {
    const report = buildStagingAuthorizationIntakeReport(completeInput());
    expect(report.recommendation).not.toMatch(/execute|activate|enable|promote/i);
    expect(report.recommendation).toBe('authorization_data_pending_human_review');

    const snap = inspectStagingAuthorizationIntake(null);
    expect(snap.history.length).toBeGreaterThan(0);
    expect(snap.executionApprovalStatus).toBe('pending');

    const de = inspectDomainEvents();
    expect(de.stagingAuthorizationIntake).toBeDefined();
    expect(de.stagingAuthorizationIntake.finalGate).toBe('blocked');
    expect(de.stagingAuthorizationIntake.executionApprovalStatus).toBe('pending');
  });

  it('consolidation não altera flags / human package / secrets ausentes', () => {
    const c = consolidateStagingAuthorizationPackageFromInput(completeInput());
    expect(c.candidatePackage.humanApproval.status).toBe('pending');
    expect(c.flagsChanged).toBe(false);
    expect(c.remoteActionsExecuted).toBe(false);
    expect(c.remoteVerificationRequired).toBe(true);
    expect(c.explicitExecutionApprovalRequired).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/service_role|eyJhbGci|BEGIN PRIVATE/i);

    for (const [k, v] of Object.entries(DOMAIN_EVENT_FLAG_DEFAULTS)) {
      expect(v).toBe(false);
      void k;
    }
  });

  it('template JSON existe e não é aprovado', () => {
    const p = path.join(
      __dirname,
      '../../docs/playbooks/templates/CQRS_STAGE_ONE_AUTHORIZATION_INPUT_TEMPLATE.json',
    );
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(json.humanApproval.status).toBe('pending');
    expect(json.readonlyAccessDeclaration.status).toBe('unverified');
    expect(json.stageOneAuthorization.status).toBe('pending');
    expect(json.submittedBy).toBe('');
  });
});
