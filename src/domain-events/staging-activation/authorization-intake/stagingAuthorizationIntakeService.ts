/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationIntakeService
 * Intake + consolidation — não altera human approval automaticamente; não executa Stage 1.
 */

import { buildStagingAuthorizationPackage } from '../authorization/stagingAuthorizationPackage.js';
import type { StagingAuthorizationPackage } from '../authorization/stagingAuthorizationTypes.js';
import { parseStagingAuthorizationInput } from './stagingAuthorizationInputParser.js';
import { runAllSectionValidations } from './stagingAuthorizationInputValidator.js';
import { evaluateStagingAuthorizationCompleteness } from './stagingAuthorizationCompleteness.js';
import {
  evaluateFinalStageOneAuthorizationData,
  recommendationFromGate,
} from './stagingAuthorizationFinalGate.js';
import { buildPendingStageOneExecutionApproval } from './stageOneExecutionApproval.js';
import type {
  StagingAuthorizationIntakeResult,
  StagingAuthorizationInputEnvelope,
} from './stagingAuthorizationIntakeTypes.js';

export interface ConsolidationResult {
  readonly candidatePackage: StagingAuthorizationPackage;
  readonly validation: ReturnType<typeof runAllSectionValidations> | readonly [];
  readonly completeness: StagingAuthorizationIntakeResult['completeness'];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly remoteVerificationRequired: true;
  readonly explicitExecutionApprovalRequired: true;
  readonly intake: StagingAuthorizationIntakeResult;
  readonly inputOrigin: string | null;
  readonly flagsChanged: false;
  readonly remoteActionsExecuted: false;
}

function deriveEnvRemoteStatus(
  validations: ReturnType<typeof runAllSectionValidations>,
): StagingAuthorizationIntakeResult['environmentRemoteStatus'] {
  const env = validations.filter((v) => v.section === 'environment');
  if (env.some((v) => v.code === 'structurally_valid_unverified_remote')) {
    return 'structurally_valid_unverified_remote';
  }
  if (env.some((v) => v.result === 'fail')) return 'invalid';
  return 'missing';
}

function deriveReadonlyRemoteStatus(
  validations: ReturnType<typeof runAllSectionValidations>,
  envelope: StagingAuthorizationInputEnvelope | null,
): StagingAuthorizationIntakeResult['readonlyRemoteStatus'] {
  if (!envelope?.readonlyAccessDeclaration) return 'missing';
  if (String(envelope.readonlyAccessDeclaration.status) === 'verified_readonly'
    && !validations.some((v) => v.section === 'readonly' && v.result === 'fail')) {
    return 'declared_verified_readonly';
  }
  if (validations.some((v) => v.section === 'readonly' && v.result === 'fail')) return 'invalid';
  return 'unverified';
}

/**
 * Processa input explícito. Sem dados → incomplete/blocked.
 * Nunca aprova human/execution. Nunca altera flags.
 */
export function processStagingAuthorizationIntake(
  rawInput: unknown | null = null,
): StagingAuthorizationIntakeResult {
  if (rawInput == null) {
    const executionApproval = buildPendingStageOneExecutionApproval(null);
    return Object.freeze({
      input: null,
      parseResult: 'incomplete',
      diagnostics: Object.freeze([]),
      fieldValidations: Object.freeze([]),
      completeness: 'empty',
      finalGate: 'blocked',
      recommendation: 'authorization_data_missing',
      blockers: Object.freeze(['input ausente']),
      warnings: Object.freeze([]),
      remoteVerificationRequired: true,
      explicitExecutionApprovalRequired: true,
      executionApproval,
      flagsChanged: false,
      remoteActionsExecuted: false,
      environmentRemoteStatus: 'missing',
      readonlyRemoteStatus: 'missing',
    });
  }

  const parsed = parseStagingAuthorizationInput(rawInput);
  if (!parsed.envelope) {
    return Object.freeze({
      input: null,
      parseResult: parsed.parseResult,
      diagnostics: parsed.diagnostics,
      fieldValidations: Object.freeze([]),
      completeness: parsed.parseResult === 'invalid' ? 'invalid' : 'incomplete',
      finalGate: 'blocked',
      recommendation:
        parsed.parseResult === 'invalid'
          ? 'authorization_data_invalid'
          : 'authorization_data_incomplete',
      blockers: parsed.errors,
      warnings: Object.freeze([]),
      remoteVerificationRequired: true,
      explicitExecutionApprovalRequired: true,
      executionApproval: buildPendingStageOneExecutionApproval(null),
      flagsChanged: false,
      remoteActionsExecuted: false,
      environmentRemoteStatus: 'missing',
      readonlyRemoteStatus: 'missing',
    });
  }

  const validations = runAllSectionValidations(parsed.envelope);
  const completeness = evaluateStagingAuthorizationCompleteness({
    parseResult: parsed.parseResult,
    envelope: parsed.envelope,
    validations,
  });
  const fails = validations.filter((v) => v.result === 'fail');
  const warnings = validations
    .filter((v) => v.result === 'warning' || v.result === 'manual_required')
    .map((v) => `${v.section}: ${v.message}`);
  const finalGate = evaluateFinalStageOneAuthorizationData({
    completeness,
    hasFails: fails.length > 0,
    remoteVerified: false,
    executionApproved: false,
  });
  const recommendation = recommendationFromGate(finalGate, completeness);

  return Object.freeze({
    input: parsed.envelope,
    parseResult: parsed.parseResult,
    diagnostics: parsed.diagnostics,
    fieldValidations: validations,
    completeness,
    finalGate,
    recommendation,
    blockers: Object.freeze(fails.map((f) => `${f.section}: ${f.message}`)),
    warnings: Object.freeze(warnings),
    remoteVerificationRequired: true,
    explicitExecutionApprovalRequired: true,
    executionApproval: buildPendingStageOneExecutionApproval(parsed.envelope.packageId),
    flagsChanged: false,
    remoteActionsExecuted: false,
    environmentRemoteStatus: deriveEnvRemoteStatus(validations),
    readonlyRemoteStatus: deriveReadonlyRemoteStatus(validations, parsed.envelope),
  });
}

/**
 * Consolida candidate package a partir do input — não substitui oficial automaticamente.
 * Human approval do pacote 8.8 permanece pending se input não trouxer approved explícito
 * (e mesmo assim o candidate não executa Stage 1).
 */
export function consolidateStagingAuthorizationPackageFromInput(
  rawInput: unknown | null = null,
): ConsolidationResult {
  const intake = processStagingAuthorizationIntake(rawInput);
  // Candidate sempre via builder 8.8 vazio/default — input não escreve approved automaticamente
  // Dados do intake ficam no envelope; package oficial permanece incomplete
  const candidatePackage = buildStagingAuthorizationPackage({
    planId: null,
    preflightExecutionId: null,
  });

  return Object.freeze({
    candidatePackage,
    validation: intake.fieldValidations,
    completeness: intake.completeness,
    blockers: intake.blockers,
    warnings: intake.warnings,
    remoteVerificationRequired: true,
    explicitExecutionApprovalRequired: true,
    intake,
    inputOrigin: intake.input?.inputSource ?? null,
    flagsChanged: false,
    remoteActionsExecuted: false,
  });
}
