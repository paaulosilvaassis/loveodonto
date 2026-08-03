/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationReport
 */

import { processStagingAuthorizationIntake } from '../authorization-intake/stagingAuthorizationIntakeService.js';
import { appendReadonlyVerificationHistory } from './readonlyVerificationHistory.js';
import {
  runAuthorizedStagingReadonlyVerification,
  type ReadonlyVerificationRunnerInput,
  type ReadonlyVerificationRunnerResult,
} from './readonlyVerificationRunner.js';

export interface AuthorizedStagingReadonlyVerificationReport {
  readonly runner: ReadonlyVerificationRunnerResult;
  readonly intakeCompleteness: string;
  readonly verificationApprovalStatus: string;
  readonly environmentId: string | null;
  readonly tenantIds: readonly string[];
  readonly capabilitiesReadOnlyGuaranteed: boolean;
  readonly probesExecuted: readonly string[];
  readonly evidenceCount: number;
  readonly flagBaselineOk: boolean;
  readonly result: string;
  readonly finalGate: string;
  readonly recommendation: string;
  readonly simulationOnly: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly statement: string;
  readonly evaluatedAt: string;
  readonly remoteConnectionOpened: false;
  readonly remoteReadsExecuted: false;
  readonly remoteWritesExecuted: false;
  readonly flagsChanged: false;
  readonly executionApprovalStillPending: true;
  readonly stageOneBlocked: true;
}

export function buildAuthorizedStagingReadonlyVerificationReport(
  input: ReadonlyVerificationRunnerInput = {},
  meta: { recordHistory?: boolean } = {},
): AuthorizedStagingReadonlyVerificationReport {
  const runner = runAuthorizedStagingReadonlyVerification(input);
  const intake = processStagingAuthorizationIntake(
    input.authorizationInput === undefined ? null : input.authorizationInput,
  );
  const probes = runner.session.probes;
  const flagProbe = probes.find((p) => p.probeId === 'verify-flag-baseline-off');
  const report: AuthorizedStagingReadonlyVerificationReport = Object.freeze({
    runner,
    intakeCompleteness: intake.completeness,
    verificationApprovalStatus: input.verificationApproval?.status
      ?? 'pending',
    environmentId: runner.session.environmentId,
    tenantIds: runner.session.tenantIds,
    capabilitiesReadOnlyGuaranteed: runner.session.capabilities.readOnlyGuaranteed,
    probesExecuted: Object.freeze(probes.map((p) => String(p.probeId))),
    evidenceCount: runner.session.evidence.length,
    flagBaselineOk: flagProbe?.status === 'passed',
    result: runner.result,
    finalGate: runner.finalGate,
    recommendation: runner.recommendation,
    simulationOnly: runner.session.simulationOnly,
    blockers: runner.session.blockers,
    warnings: runner.session.warnings,
    statement:
      'Authorization Data ≠ Read-only Verification ≠ Stage 1 ≠ Flags — remoteConnectionOpened=false; executionApproval pending',
    evaluatedAt: new Date().toISOString(),
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
    executionApprovalStillPending: true as const,
    stageOneBlocked: true as const,
  });
  if (meta.recordHistory !== false) {
    appendReadonlyVerificationHistory(runner);
  }
  return report;
}
