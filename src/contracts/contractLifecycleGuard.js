/**
 * PHASE_10.23C adapter — delega à autoridade canônica 10.23D.
 * Não reescreve rows históricas. Sem secrets no erro.
 */
export {
  CANCEL_NOT_ALLOWED,
  CONTRACT_NOT_SIGNABLE,
  PILOT_IMMUTABLE,
  SIGNABLE_CONTRACT_STATES,
  SIGNED_CONTRACT_IMMUTABLE,
  TERMINAL_CONTRACT_STATES,
  assertContractSignable,
  assertInPlaceReissueBlocked,
  createLifecycleError,
  isCancelableLifecycleStatus,
  isContractSignable,
  normalizeContractLifecycleStatus,
} from './lifecycle/index.js';

import { normalizeContractLifecycleStatus } from './lifecycle/index.js';

export function contractHasFinalSignedArtifact(contract, attachments = []) {
  if (!contract) return false;
  const md = contract.metadata || {};
  if (md.finalArtifactStatus === 'generated') {
    if (contract.pdfUrl || contract.signedPdfUrl || md.finalArtifactAttachmentId) return true;
  }
  const rows = (attachments || []).filter((row) => row.contractId === contract.id);
  if (rows.some((row) => row.source === 'final_signed_artifact' || row.immutable === true)) {
    return true;
  }
  const normalized = normalizeContractLifecycleStatus(contract.status);
  const legallySigned = normalized === 'signed'
    || normalized === 'voided'
    || normalized === 'superseded';
  return Boolean(legallySigned && (contract.pdfUrl || contract.signedPdfUrl));
}
