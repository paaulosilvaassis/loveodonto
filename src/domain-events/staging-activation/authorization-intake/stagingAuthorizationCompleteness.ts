/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationCompleteness
 */

import type {
  StagingAuthorizationCompleteness,
  StagingAuthorizationFieldValidation,
  StagingAuthorizationInputEnvelope,
  StagingAuthorizationParseResult,
} from './stagingAuthorizationIntakeTypes.js';

export function evaluateStagingAuthorizationCompleteness(args: {
  parseResult: StagingAuthorizationParseResult;
  envelope: StagingAuthorizationInputEnvelope | null;
  validations: readonly StagingAuthorizationFieldValidation[];
}): StagingAuthorizationCompleteness {
  if (!args.envelope && args.parseResult === 'incomplete') return 'empty';
  if (args.parseResult === 'invalid') return 'invalid';
  if (!args.envelope) return 'incomplete';

  const fails = args.validations.filter((v) => v.result === 'fail');
  if (fails.some((f) => /expirad/i.test(f.message))) return 'expired';
  if (fails.some((f) => /revoked/i.test(f.message))) return 'revoked';
  if (fails.length > 0) {
    const sections = new Set(
      ['environment', 'humanApproval', 'tenants', 'readonly', 'stageOne', 'rollback', 'evidence', 'risks']
        .filter((s) => args.validations.some((v) => v.section === s)),
    );
    const filled = [
      args.envelope.environmentDeclaration,
      args.envelope.humanApproval,
      args.envelope.tenantSelection,
      args.envelope.readonlyAccessDeclaration,
      args.envelope.stageOneAuthorization,
      args.envelope.rollbackAcknowledgement,
      args.envelope.evidenceAcknowledgement,
      args.envelope.riskAcknowledgements,
    ].filter(Boolean).length;
    if (filled === 0) return 'incomplete';
    if (filled < 8) return 'incomplete';
    return 'invalid';
  }

  const humanStatus = String(args.envelope.humanApproval?.status || 'pending');
  if (humanStatus === 'pending') return 'pending_human_review';
  if (humanStatus === 'approved') return 'approved_data_unverified_remote';

  // Sem fails mas não approved — still structurally may be complete awaiting human
  const criticalPresent = Boolean(
    args.envelope.environmentDeclaration
    && args.envelope.humanApproval
    && args.envelope.tenantSelection
    && args.envelope.readonlyAccessDeclaration
    && args.envelope.stageOneAuthorization
    && args.envelope.rollbackAcknowledgement
    && args.envelope.evidenceAcknowledgement
    && args.envelope.riskAcknowledgements,
  );
  if (criticalPresent) return 'structurally_complete';
  return 'incomplete';
}
