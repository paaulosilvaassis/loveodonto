/**
 * Grafo de transições jurídicas. TRANSITION_DEFINED ≠ WRITER_IMPLEMENTED.
 * REISSUE não é mutação in-place: exige novo contractId.
 */
import {
  CONTRACT_LIFECYCLE_STATES as S,
  CONTRACT_LIFECYCLE_TRANSITION_INVALID,
  CONTRACT_LIFECYCLE_WRITER_NOT_IMPLEMENTED,
  LIFECYCLE_ACTIONS as A,
  LIFECYCLE_ACTION_WRITER_IMPLEMENTED,
  REISSUE_IDENTITY_INVALID,
  REISSUE_REQUIRES_NEW_CONTRACT_ID,
} from './constants.js';
import { createLifecycleError } from './errors.js';
import { normalizeContractLifecycleStatus } from './normalize.js';

export { REISSUE_REQUIRES_NEW_CONTRACT_ID };

const EDGES = Object.freeze([
  { from: S.DRAFT, to: S.GENERATED, action: A.GENERATE },
  { from: S.GENERATED, to: S.PARTIALLY_SIGNED, action: A.RECORD_SIGNATURE },
  { from: S.GENERATED, to: S.SIGNED, action: A.RECORD_SIGNATURE },
  { from: S.PARTIALLY_SIGNED, to: S.SIGNED, action: A.RECORD_SIGNATURE },
  { from: S.DRAFT, to: S.CANCELLED, action: A.CANCEL_UNSIGNED },
  { from: S.GENERATED, to: S.CANCELLED, action: A.CANCEL_UNSIGNED },
  { from: S.GENERATED, to: S.CANCELLED, action: A.ABORT_PARTIAL },
  { from: S.PARTIALLY_SIGNED, to: S.CANCELLED, action: A.ABORT_PARTIAL },
  { from: S.SIGNED, to: S.VOIDED, action: A.VOID_SIGNED },
  { from: S.VOIDED, to: S.SUPERSEDED, action: A.SUPERSEDE },
  { from: S.CANCELLED, to: S.SUPERSEDED, action: A.SUPERSEDE },
]);

function findEdges(from, to, action) {
  return EDGES.filter((edge) => (
    edge.from === from
    && edge.to === to
    && (!action || edge.action === action)
  ));
}

export function describeContractTransition(fromRaw, toRaw, action) {
  const from = normalizeContractLifecycleStatus(fromRaw);
  const to = normalizeContractLifecycleStatus(toRaw);
  if (from === 'unknown' || to === 'unknown') {
    return {
      from, to, action: action || null, defined: false, writerImplemented: false, allowed: false,
    };
  }
  if (from === to) {
    return {
      from, to, action: action || null, defined: true, writerImplemented: true, allowed: true, sameState: true,
    };
  }
  const edges = findEdges(from, to, action);
  if (!edges.length) {
    return {
      from, to, action: action || null, defined: false, writerImplemented: false, allowed: false,
    };
  }
  const writerImplemented = edges.some((edge) => LIFECYCLE_ACTION_WRITER_IMPLEMENTED[edge.action] === true);
  return {
    from,
    to,
    action: action || edges[0].action,
    defined: true,
    writerImplemented,
    allowed: writerImplemented,
  };
}

export function isContractTransitionDefined(fromRaw, toRaw, action) {
  const desc = describeContractTransition(fromRaw, toRaw, action);
  return desc.defined === true && desc.sameState !== true;
}

export function canTransitionContract(fromRaw, toRaw, action) {
  const desc = describeContractTransition(fromRaw, toRaw, action);
  return desc.allowed === true && desc.sameState !== true;
}

export function assertContractTransition(fromRaw, toRaw, action, extra = {}) {
  const desc = describeContractTransition(fromRaw, toRaw, action);
  const meta = {
    from: desc.from,
    to: desc.to,
    action: desc.action || action || null,
    contractId: extra.contractId || null,
  };
  if (desc.sameState) return desc;
  if (!desc.defined) {
    throw createLifecycleError(
      CONTRACT_LIFECYCLE_TRANSITION_INVALID,
      'Transição de lifecycle jurídica não permitida.',
      meta,
    );
  }
  if (!desc.writerImplemented) {
    throw createLifecycleError(
      CONTRACT_LIFECYCLE_WRITER_NOT_IMPLEMENTED,
      'Transição definida, mas o writer ainda não está implementado.',
      meta,
    );
  }
  return desc;
}

export function assertContractStatusMutation(current, nextRawStatus, extra = {}) {
  const fromRaw = current?.status;
  return assertContractTransition(fromRaw, nextRawStatus, extra.action, {
    contractId: extra.contractId || current?.id || null,
  });
}

export function resolveCancelOrAbortAction({ status, signatureCount = 0 } = {}) {
  const normalized = normalizeContractLifecycleStatus(status);
  if (normalized === S.PARTIALLY_SIGNED || Number(signatureCount) > 0) {
    return A.ABORT_PARTIAL;
  }
  return A.CANCEL_UNSIGNED;
}

export function assertReissueIdentities({
  oldContractId,
  newContractId,
  oldManifestId = null,
  newManifestId = null,
} = {}) {
  if (!REISSUE_REQUIRES_NEW_CONTRACT_ID) {
    throw createLifecycleError(REISSUE_IDENTITY_INVALID, 'REISSUE_REQUIRES_NEW_CONTRACT_ID violado.');
  }
  if (!oldContractId || !newContractId) {
    throw createLifecycleError(
      REISSUE_IDENTITY_INVALID,
      'Reissue exige oldContractId e newContractId.',
    );
  }
  if (String(oldContractId) === String(newContractId)) {
    throw createLifecycleError(
      REISSUE_IDENTITY_INVALID,
      'Reissue exige um novo contractId. Mutação in-place é proibida.',
      { contractId: oldContractId },
    );
  }
  if (oldManifestId && newManifestId && String(oldManifestId) === String(newManifestId)) {
    throw createLifecycleError(
      REISSUE_IDENTITY_INVALID,
      'Reissue exige um novo manifestId.',
      { contractId: oldContractId },
    );
  }
  return true;
}
