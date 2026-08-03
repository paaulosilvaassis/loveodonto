/**
 * Phase 8.10 — Authorized Staging Read-only Verification Gate.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../domain-events/domainEventFlags.ts';
import {
  ALLOWED_READONLY_PROBES,
  FORBIDDEN_READONLY_OPERATIONS,
  assertProbeAllowlist,
  isAllowedReadonlyProbe,
  buildPendingReadonlyVerificationApproval,
  buildReadonlyVerificationApproval,
  validateReadonlyVerificationApproval,
  buildSafeReadonlyCapabilities,
  validateReadonlyCapabilities,
  runAuthorizedStagingReadonlyVerification,
  buildAuthorizedStagingReadonlyVerificationReport,
  inspectStagingReadonlyVerification,
  evaluateReadonlyVerificationCompletionGate,
  evaluateReadonlyVerificationEntryConditions,
  runSequentialLocalProbes,
  runLocalFlagBaselineProbe,
  runLocalTenantExistenceProbe,
  __resetReadonlyVerificationApprovalSeqForTest,
  __resetReadonlyVerificationSessionSeqForTest,
  __resetReadonlyVerificationEvidenceSeqForTest,
  __clearReadonlyVerificationHistoryForTest,
} from '../domain-events/staging-activation/readonly-verification/index.ts';
import { inspectDomainEvents } from '../domain-events/observability/domainEventInspector.ts';

const future = () => new Date(Date.now() + 7 * 86400000).toISOString();
const past = () => new Date(Date.now() - 86400000).toISOString();

function clearAll() {
  __resetReadonlyVerificationApprovalSeqForTest();
  __resetReadonlyVerificationSessionSeqForTest();
  __resetReadonlyVerificationEvidenceSeqForTest();
  __clearReadonlyVerificationHistoryForTest();
}

describe('readonlyVerification — approval', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('pending default / approved válido / expired / revoked / mismatch', () => {
    expect(buildPendingReadonlyVerificationApproval().status).toBe('pending');
    expect(buildReadonlyVerificationApproval({ status: 'approved' }).status).toBe('pending');

    const ok = buildReadonlyVerificationApproval({
      status: 'approved',
      approvedBy: 'ops-lead',
      approvedAt: future(),
      expiresAt: future(),
      environmentId: 'stg-1',
      tenantIds: ['t1'],
      packageEnvironmentId: 'stg-1',
      packageTenantIds: ['t1'],
    });
    expect(ok.status).toBe('approved');
    expect(validateReadonlyVerificationApproval(ok, 'stg-1', ['t1']).ok).toBe(true);

    expect(
      buildReadonlyVerificationApproval({
        status: 'approved',
        approvedBy: 'a',
        approvedAt: future(),
        expiresAt: past(),
      }).status,
    ).toBe('expired');

    expect(buildReadonlyVerificationApproval({ status: 'revoked' }).status).toBe('revoked');

    expect(
      validateReadonlyVerificationApproval(
        buildReadonlyVerificationApproval({
          status: 'approved',
          approvedBy: 'a',
          approvedAt: future(),
          expiresAt: future(),
          environmentId: 'other',
          tenantIds: ['t1'],
        }),
        'stg-1',
        ['t1'],
      ).ok,
    ).toBe(false);

    expect(
      validateReadonlyVerificationApproval(
        buildReadonlyVerificationApproval({
          status: 'approved',
          approvedBy: 'a',
          approvedAt: future(),
          expiresAt: future(),
          environmentId: 'stg-1',
          tenantIds: ['x'],
        }),
        'stg-1',
        ['t1'],
      ).ok,
    ).toBe(false);
  });
});

describe('readonlyVerification — capabilities', () => {
  it('safe vs writes / secrets / not guaranteed', () => {
    const safe = buildSafeReadonlyCapabilities();
    expect(validateReadonlyCapabilities(safe).ok).toBe(true);
    expect(safe.readOnlyGuaranteed).toBe(true);

    expect(
      validateReadonlyCapabilities(buildSafeReadonlyCapabilities({ canWriteDatabase: true })).ok,
    ).toBe(false);
    expect(
      validateReadonlyCapabilities(buildSafeReadonlyCapabilities({ canRunMigration: true })).ok,
    ).toBe(false);
    expect(
      validateReadonlyCapabilities(buildSafeReadonlyCapabilities({ canWriteStorage: true })).ok,
    ).toBe(false);
    expect(
      validateReadonlyCapabilities(
        buildSafeReadonlyCapabilities({ canChangeEnvironmentVariables: true }),
      ).ok,
    ).toBe(false);
    expect(
      validateReadonlyCapabilities(buildSafeReadonlyCapabilities({ canRevealSecrets: true })).ok,
    ).toBe(false);
    expect(
      validateReadonlyCapabilities(
        buildSafeReadonlyCapabilities({ readOnlyGuaranteed: false }),
      ).ok,
    ).toBe(false);
  });
});

describe('readonlyVerification — probe registry', () => {
  it('permitidos / desconhecido / mutation / sequencial fail-fast', () => {
    for (const p of ALLOWED_READONLY_PROBES) expect(isAllowedReadonlyProbe(p)).toBe(true);
    expect(assertProbeAllowlist(['verify-environment-identity']).ok).toBe(true);
    expect(assertProbeAllowlist(['unknown-probe']).ok).toBe(false);
    expect(FORBIDDEN_READONLY_OPERATIONS).toContain('migration');
    expect(assertProbeAllowlist(['insert']).ok).toBe(false);

    const seq = runSequentialLocalProbes(
      ['verify-environment-identity', 'verify-flag-baseline-off'],
      {
        environmentId: 'e',
        host: `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
        projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
        environmentType: 'staging',
      },
    );
    expect(seq.productionDetected).toBe(true);
    expect(seq.probes.length).toBe(1);
    expect(seq.probes[0].status).toBe('failed');
  });
});

describe('readonlyVerification — environment / tenants / flags', () => {
  it('staging válido vs produção / identidade ausente', () => {
    const ok = runSequentialLocalProbes(['verify-environment-identity', 'verify-non-production-host', 'verify-project-reference'], {
      environmentId: 'stg',
      host: 'stg.example.supabase.co',
      projectRef: 'stagingref',
      environmentType: 'staging',
      isStaging: true,
      isProduction: false,
    });
    expect(ok.probes.every((p) => p.status === 'passed')).toBe(true);

    expect(
      runSequentialLocalProbes(['verify-environment-identity'], {
        environmentId: null,
        host: null,
        projectRef: null,
      }).probes[0].status,
    ).toBe('failed');
  });

  it('tenants piloto / wildcard / fora approval / inexistente', () => {
    expect(
      runLocalTenantExistenceProbe({
        pilotTenantIds: ['t1'],
        approvedTenantIds: ['t1'],
        knownTenantIds: ['t1'],
        simulationOnly: true,
      }).status,
    ).toBe('passed');
    expect(runLocalTenantExistenceProbe({ pilotTenantIds: ['*'] }).status).toBe('failed');
    expect(
      runLocalTenantExistenceProbe({
        pilotTenantIds: ['t1'],
        approvedTenantIds: ['other'],
      }).status,
    ).toBe('failed');
    expect(
      runLocalTenantExistenceProbe({
        pilotTenantIds: ['t1'],
        approvedTenantIds: ['t1'],
        knownTenantIds: [],
        simulationOnly: true,
      }).status,
    ).toBe('failed');
  });

  it('flags OFF / uma ON / sem alteração', () => {
    expect(runLocalFlagBaselineProbe({}).status).toBe('passed');
    expect(
      runLocalFlagBaselineProbe({ flagSnapshot: { DOMAIN_EVENTS: true } }).status,
    ).toBe('failed');
    for (const v of Object.values(DOMAIN_EVENT_FLAG_DEFAULTS)) expect(v).toBe(false);
  });
});

describe('readonlyVerification — runner / gate / evidence / safety', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('sem dados = blocked', () => {
    const r = runAuthorizedStagingReadonlyVerification();
    expect(r.result).toBe('blocked');
    expect(r.finalGate).toBe('blocked');
    expect(r.recommendation).toBe(
      'readonly_verification_blocked_missing_authorization_data',
    );
    expect(r.remoteConnectionOpened).toBe(false);
    expect(r.remoteReadsExecuted).toBe(false);
    expect(r.remoteWritesExecuted).toBe(false);
    expect(r.flagsChanged).toBe(false);
    expect(r.executionApprovalStillPending).toBe(true);
    expect(r.stageOneBlocked).toBe(true);
    expect(r.session.probes.length).toBe(0);
  });

  it('approval ausente = blocked', () => {
    const entry = evaluateReadonlyVerificationEntryConditions({
      authorizationCompleteness: 'approved_data_unverified_remote',
      humanApprovalStatus: 'approved',
      readonlyRemoteStatus: 'declared_verified_readonly',
      environmentStructurallyValid: true,
      pilotTenantIds: ['t1'],
      stageOneAuthorizationStatus: 'pending',
      verificationApproval: buildPendingReadonlyVerificationApproval(),
    });
    expect(entry.allSatisfied).toBe(false);
    expect(entry.blockers.some((b) => /approval/i.test(b))).toBe(true);
  });

  it('capability insegura = blocked_readonly_not_guaranteed', () => {
    const r = runAuthorizedStagingReadonlyVerification({
      mode: 'local-simulated',
      capabilities: { canWriteDatabase: true },
      localContext: {
        environmentId: 'e',
        host: 'stg.supabase.co',
        projectRef: 'stref',
        environmentType: 'staging',
        pilotTenantIds: ['t1'],
      },
    });
    expect(r.result).toBe('blocked_readonly_not_guaranteed');
    expect(r.recommendation).toBe(
      'readonly_verification_blocked_capabilities_not_safe',
    );
  });

  it('local simulation — simulationOnly; gate nunca verified real', () => {
    const approval = buildReadonlyVerificationApproval({
      status: 'approved',
      approvedBy: 'ops',
      approvedAt: future(),
      expiresAt: future(),
      environmentId: 'stg-sim',
      tenantIds: ['t1'],
      packageEnvironmentId: 'stg-sim',
      packageTenantIds: ['t1'],
    });
    const r = runAuthorizedStagingReadonlyVerification({
      mode: 'local-simulated',
      verificationApproval: approval,
      operator: 'tester',
      localContext: {
        environmentId: 'stg-sim',
        host: 'staging-lab.supabase.co',
        projectRef: 'staginglab123',
        environmentType: 'staging',
        isStaging: true,
        isProduction: false,
        pilotTenantIds: ['t1'],
        approvedTenantIds: ['t1'],
        knownTenantIds: ['t1'],
      },
    });
    expect(r.session.simulationOnly).toBe(true);
    expect(r.session.remoteConnectionOpened).toBe(false);
    expect(r.finalGate).not.toBe(
      'readonly_verified_awaiting_stage_one_execution_approval',
    );
    expect(['manual_required', 'blocked', 'failed'].includes(r.finalGate)).toBe(true);
    expect(r.session.evidence.every((e) => e.isRemote === false)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/service_role|BEGIN PRIVATE|eyJhbGci/i);
  });

  it('produção = failed; zero writes; attemptRemote bloqueado', () => {
    const r = runAuthorizedStagingReadonlyVerification({
      mode: 'local-simulated',
      verificationApproval: buildReadonlyVerificationApproval({
        status: 'approved',
        approvedBy: 'a',
        approvedAt: future(),
        expiresAt: future(),
        environmentId: 'bad',
        tenantIds: ['t1'],
        packageEnvironmentId: 'bad',
        packageTenantIds: ['t1'],
      }),
      localContext: {
        environmentId: 'bad',
        host: `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
        projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
        environmentType: 'staging',
        pilotTenantIds: ['t1'],
        approvedTenantIds: ['t1'],
      },
    });
    expect(r.result).toBe('failed_production_detected');
    expect(r.remoteWritesExecuted).toBe(false);

    const remoteAttempt = runAuthorizedStagingReadonlyVerification({
      attemptRemote: true,
      mode: 'local-simulated',
    });
    expect(remoteAttempt.result).toBe('blocked');
    expect(remoteAttempt.remoteConnectionOpened).toBe(false);
  });

  it('final gate nunca ativa flags / report / inspector', () => {
    expect(
      evaluateReadonlyVerificationCompletionGate({ result: 'blocked' }),
    ).toBe('blocked');
    expect(
      evaluateReadonlyVerificationCompletionGate({
        result: 'passed',
        simulationOnly: false,
      }),
    ).toBe('readonly_verified_awaiting_stage_one_execution_approval');
    expect(
      evaluateReadonlyVerificationCompletionGate({
        result: 'passed',
        simulationOnly: true,
      }),
    ).toBe('manual_required');

    const report = buildAuthorizedStagingReadonlyVerificationReport();
    expect(report.recommendation).not.toMatch(/activate|enable|promote|execute_stage/i);
    expect(report.result).toBe('blocked');

    const snap = inspectStagingReadonlyVerification();
    expect(snap.history.length).toBeGreaterThan(0);
    expect(snap.flagsChanged).toBe(false);

    const de = inspectDomainEvents();
    expect(de.stagingReadonlyVerification.result).toBe('blocked');
    expect(de.stagingReadonlyVerification.remoteConnectionOpened).toBe(false);
    expect(de.stagingReadonlyVerification.flagsChanged).toBe(false);
  });

  it('authorized-staging-readonly sem connector remoto = blocked', () => {
    const r = runAuthorizedStagingReadonlyVerification({
      mode: 'authorized-staging-readonly',
      verificationApproval: buildReadonlyVerificationApproval({
        status: 'approved',
        approvedBy: 'a',
        approvedAt: future(),
        expiresAt: future(),
        environmentId: 'stg',
        tenantIds: ['t1'],
      }),
    });
    expect(r.result).toBe('blocked');
    expect(r.remoteConnectionOpened).toBe(false);
  });
});
