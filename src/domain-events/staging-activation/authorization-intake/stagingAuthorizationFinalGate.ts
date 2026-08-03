/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationFinalGate
 */

import type {
  StagingAuthorizationCompleteness,
  StagingAuthorizationFinalGate,
  StagingAuthorizationIntakeRecommendation,
} from './stagingAuthorizationIntakeTypes.js';

export function evaluateFinalStageOneAuthorizationData(args: {
  completeness: StagingAuthorizationCompleteness;
  hasFails: boolean;
  remoteVerified?: boolean;
  executionApproved?: boolean;
}): StagingAuthorizationFinalGate {
  // Nunca ready_for_stage_one_execution
  if (args.hasFails) {
    if (args.completeness === 'expired') return 'blocked';
    if (args.completeness === 'invalid' || args.completeness === 'revoked') return 'blocked';
  }
  if (
    args.completeness === 'empty'
    || args.completeness === 'incomplete'
    || args.completeness === 'invalid'
    || args.completeness === 'expired'
    || args.completeness === 'revoked'
  ) {
    return 'blocked';
  }
  if (args.completeness === 'pending_human_review' || args.completeness === 'structurally_complete') {
    return 'manual_required';
  }
  if (args.completeness === 'approved_data_unverified_remote') {
    if (args.remoteVerified && args.executionApproved) {
      return 'ready_for_phase_8_10_planning';
    }
    if (args.remoteVerified && !args.executionApproved) {
      return 'data_verified_awaiting_execution_approval';
    }
    // Phase 8.9: sem remote verification — máximo estrutural
    return 'data_complete_awaiting_remote_verification';
  }
  return 'manual_required';
}

export function recommendationFromGate(
  gate: StagingAuthorizationFinalGate,
  completeness: StagingAuthorizationCompleteness,
): StagingAuthorizationIntakeRecommendation {
  if (completeness === 'empty') return 'authorization_data_missing';
  if (completeness === 'invalid') return 'authorization_data_invalid';
  if (completeness === 'incomplete') return 'authorization_data_incomplete';
  if (gate === 'manual_required' || completeness === 'pending_human_review') {
    return 'authorization_data_pending_human_review';
  }
  if (gate === 'data_complete_awaiting_remote_verification') {
    return 'authorization_data_complete_awaiting_remote_verification';
  }
  if (gate === 'data_verified_awaiting_execution_approval') {
    return 'authorization_data_verified_awaiting_explicit_execution_approval';
  }
  if (gate === 'blocked') {
    return completeness === 'invalid'
      ? 'authorization_data_invalid'
      : 'authorization_data_incomplete';
  }
  return 'authorization_data_pending_human_review';
}
