/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationIntakeReport
 */

import {
  consolidateStagingAuthorizationPackageFromInput,
} from './stagingAuthorizationIntakeService.js';
import { appendStagingAuthorizationIntakeHistory } from './stagingAuthorizationIntakeHistory.js';
import type { StagingAuthorizationIntakeResult } from './stagingAuthorizationIntakeTypes.js';
import type { ConsolidationResult } from './stagingAuthorizationIntakeService.js';

export interface StagingAuthorizationIntakeReport {
  readonly intake: StagingAuthorizationIntakeResult;
  readonly consolidation: ConsolidationResult;
  readonly inputSource: string | null;
  readonly parserResult: string;
  readonly sanitizerDiagnostics: readonly string[];
  readonly completeness: string;
  readonly finalGate: string;
  readonly recommendation: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly remoteVerificationRequired: true;
  readonly explicitExecutionApprovalRequired: true;
  readonly statement: string;
  readonly evaluatedAt: string;
  readonly flagsChanged: false;
  readonly remoteActionsExecuted: false;
}

export function buildStagingAuthorizationIntakeReport(
  rawInput: unknown | null = null,
  meta: { recordHistory?: boolean } = {},
): StagingAuthorizationIntakeReport {
  const consolidation = consolidateStagingAuthorizationPackageFromInput(rawInput);
  const { intake } = consolidation;
  const report: StagingAuthorizationIntakeReport = Object.freeze({
    intake,
    consolidation,
    inputSource: intake.input?.inputSource ?? null,
    parserResult: intake.parseResult,
    sanitizerDiagnostics: intake.diagnostics,
    completeness: intake.completeness,
    finalGate: intake.finalGate,
    recommendation: intake.recommendation,
    blockers: intake.blockers,
    warnings: intake.warnings,
    remoteVerificationRequired: true,
    explicitExecutionApprovalRequired: true,
    statement:
      'Authorization Data Intake ≠ Human Approval ≠ Execution Approval ≠ Stage 1 Activation — remoteVerificationRequired; flags unchanged',
    evaluatedAt: new Date().toISOString(),
    flagsChanged: false,
    remoteActionsExecuted: false,
  });
  if (meta.recordHistory !== false) {
    appendStagingAuthorizationIntakeHistory(report);
  }
  return report;
}
