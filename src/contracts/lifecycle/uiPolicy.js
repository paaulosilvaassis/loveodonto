/**
 * Autoridade única de capacidades de UI. Writers continuam fail-closed.
 * Não duplica o grafo de transição: usa normalização + auth canônicos.
 */
import {
  canPerformLegalHighImpact,
  canPerformOperationalSigningAccess,
  canPerformRotateSigningAccess,
  canPerformSensitiveLifecycle,
} from './commandAuth.js';
import { isContractSignable } from './signability.js';
import { normalizeContractLifecycleStatus } from './normalize.js';
import { describeSigningAccessUi } from './uiLabels.js';

function stateFlags(state) {
  return {
    isDraft: state === 'draft',
    isGenerated: state === 'generated',
    isPartial: state === 'partially_signed',
    isSigned: state === 'signed',
    isCancelled: state === 'cancelled',
    isVoided: state === 'voided',
    isSuperseded: state === 'superseded',
  };
}

export function getContractLifecycleUiPolicy({
  contract,
  ceremony = null,
  request = null,
  link = null,
  actor = null,
  trustedNow = Date.now(),
} = {}) {
  const state = normalizeContractLifecycleStatus(contract?.status);
  const flags = stateFlags(state);
  const signable = isContractSignable(contract);
  const access = describeSigningAccessUi({ request, link, trustedNow });
  const hasRequest = Boolean(request?.id);
  const auth = {
    legalHigh: canPerformLegalHighImpact(actor),
    sensitive: canPerformSensitiveLifecycle(actor),
    rotate: canPerformRotateSigningAccess(actor),
    resend: canPerformOperationalSigningAccess(actor),
  };

  const canCancelUnsigned = auth.sensitive && (flags.isDraft || flags.isGenerated);
  const canAbortPartial = auth.sensitive && flags.isPartial;
  const canSendForSignature = signable && (flags.isGenerated || flags.isPartial) && access.kind === 'none';
  const canSignOnScreen = signable && (flags.isGenerated || flags.isPartial);
  const canResendAccess = signable && auth.resend && access.kind === 'signable';
  const canRotateAccess = signable && auth.rotate && hasRequest
    && (access.kind === 'signable' || access.kind === 'expired' || access.kind === 'pending');
  const canRevokeAccess = signable && auth.sensitive && access.kind === 'signable';
  const canVoidSigned = flags.isSigned && auth.legalHigh;
  const canReissue = auth.legalHigh && (flags.isSigned || flags.isVoided || flags.isCancelled);
  const canViewEvidence = flags.isSigned || flags.isVoided || flags.isSuperseded || flags.isCancelled || flags.isPartial;
  const canGenerate = flags.isDraft;
  const canViewFinalArtifact = flags.isSigned || flags.isVoided || flags.isSuperseded;

  return {
    state,
    access,
    auth,
    canGenerate,
    canSendForSignature,
    canSignOnScreen,
    canCancelUnsigned,
    canAbortPartial,
    canRevokeAccess,
    canRotateAccess,
    canResendAccess,
    canVoidSigned,
    canReissue,
    canViewEvidence,
    canViewFinalArtifact,
    showSigningWorkflow: signable,
    hideUnsafeNewVersion: flags.isSigned || flags.isVoided || flags.isSuperseded,
  };
}
