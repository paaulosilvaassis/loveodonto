/**
 * Cerimônia: HYBRID. Deriva aborted/awaiting_remote/not_started; não persiste estados novos.
 */
import { CEREMONY_LIFECYCLE_STATES as C } from './constants.js';
import { normalizeCeremonyState, normalizeContractLifecycleStatus } from './normalize.js';

const CEREMONY_SIGNABLE = new Set([
  C.READY_TO_SIGN,
  C.AWAITING_REMOTE,
  C.PARTIALLY_SIGNED,
]);

export function isCeremonyTerminal(rawStatus) {
  const status = normalizeCeremonyState(rawStatus);
  return status === C.SIGNED || status === C.ABORTED || status === C.LEGACY_SIGNED;
}

export function isCeremonySignable(rawStatus) {
  return CEREMONY_SIGNABLE.has(normalizeCeremonyState(rawStatus));
}

export function deriveCeremonyLifecycleState({
  contract = null,
  signatureCount = 0,
  requiredCount = 0,
  hasActiveRemoteAccess = false,
  persistedStatus = null,
  legacySigned = false,
} = {}) {
  const legal = normalizeContractLifecycleStatus(contract?.status);
  const persisted = persistedStatus != null
    ? normalizeCeremonyState(persistedStatus)
    : normalizeCeremonyState(contract?.metadata?.signatureCeremony?.status);
  const sigs = Number(signatureCount) || 0;
  const required = Number(requiredCount) || 0;

  if (legal === 'cancelled' || legal === 'voided' || legal === 'superseded') {
    return sigs > 0 ? C.ABORTED : (persisted === C.BLOCKED ? C.BLOCKED : C.NOT_STARTED);
  }
  if (legacySigned || persisted === C.LEGACY_SIGNED) return C.LEGACY_SIGNED;
  if (legal === 'signed' || (required > 0 && sigs >= required)) return C.SIGNED;
  if (persisted === C.BLOCKED) return C.BLOCKED;
  if (sigs > 0) return C.PARTIALLY_SIGNED;
  if (hasActiveRemoteAccess) return C.AWAITING_REMOTE;
  if (legal === 'draft' || legal === 'unknown') return C.NOT_STARTED;
  if (legal === 'generated') return C.READY_TO_SIGN;
  return persisted === 'unknown' ? C.NOT_STARTED : persisted;
}
