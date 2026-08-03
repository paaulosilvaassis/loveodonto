/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationFinalGate
 */

import type {
  ReadonlyVerificationFinalGate,
  ReadonlyVerificationRecommendation,
  ReadonlyVerificationResult,
} from './readonlyVerificationTypes.js';

export function evaluateReadonlyVerificationCompletionGate(args: {
  result: ReadonlyVerificationResult;
  simulationOnly?: boolean;
  entrySatisfied?: boolean;
}): ReadonlyVerificationFinalGate {
  // Simulation nunca promove para verified real
  if (args.simulationOnly) {
    if (args.result === 'failed' || args.result === 'failed_production_detected') return 'failed';
    if (args.result === 'passed' || args.result === 'warning') return 'manual_required';
    return 'blocked';
  }
  if (
    args.result === 'failed'
    || args.result === 'failed_production_detected'
    || args.result === 'blocked_readonly_not_guaranteed'
  ) {
    return 'failed';
  }
  if (args.result === 'blocked' || args.result === 'not_started') return 'blocked';
  if (args.result === 'manual_required') return 'manual_required';
  if (args.result === 'passed' || args.result === 'warning') {
    return 'readonly_verified_awaiting_stage_one_execution_approval';
  }
  return 'blocked';
}

export function recommendationFromReadonlyGate(
  gate: ReadonlyVerificationFinalGate,
  result: ReadonlyVerificationResult,
  reason: 'missing_data' | 'missing_approval' | 'capabilities' | 'failed' | 'passed' | 'other' = 'other',
): ReadonlyVerificationRecommendation {
  if (reason === 'missing_data' || (gate === 'blocked' && reason !== 'missing_approval')) {
    if (reason === 'capabilities') {
      return 'readonly_verification_blocked_capabilities_not_safe';
    }
    if (reason === 'missing_approval') {
      return 'readonly_verification_blocked_missing_approval';
    }
    if (reason === 'missing_data') {
      return 'readonly_verification_blocked_missing_authorization_data';
    }
  }
  if (reason === 'missing_approval') {
    return 'readonly_verification_blocked_missing_approval';
  }
  if (reason === 'capabilities' || result === 'blocked_readonly_not_guaranteed') {
    return 'readonly_verification_blocked_capabilities_not_safe';
  }
  if (gate === 'failed' || result === 'failed' || result === 'failed_production_detected') {
    return 'readonly_verification_failed';
  }
  if (gate === 'readonly_verified_awaiting_stage_one_execution_approval') {
    return 'readonly_verification_passed_awaiting_explicit_stage_one_execution_approval';
  }
  if (gate === 'blocked') {
    return reason === 'missing_approval'
      ? 'readonly_verification_blocked_missing_approval'
      : 'readonly_verification_blocked_missing_authorization_data';
  }
  return 'readonly_verification_blocked_missing_authorization_data';
}
