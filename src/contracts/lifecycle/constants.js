/**
 * PHASE_10.23D — constantes canônicas de lifecycle jurídico.
 * Persistência histórica NÃO é reescrita. Writers VOID/REISSUE ainda não existem.
 */

export const CONTRACT_LIFECYCLE_STATES = Object.freeze({
  DRAFT: 'draft',
  GENERATED: 'generated',
  PARTIALLY_SIGNED: 'partially_signed',
  SIGNED: 'signed',
  CANCELLED: 'cancelled',
  VOIDED: 'voided',
  SUPERSEDED: 'superseded',
});

export const SIGNABLE_CONTRACT_STATES = Object.freeze([
  CONTRACT_LIFECYCLE_STATES.GENERATED,
  CONTRACT_LIFECYCLE_STATES.PARTIALLY_SIGNED,
]);

export const TERMINAL_CONTRACT_STATES = Object.freeze([
  CONTRACT_LIFECYCLE_STATES.CANCELLED,
  CONTRACT_LIFECYCLE_STATES.SIGNED,
  CONTRACT_LIFECYCLE_STATES.VOIDED,
  CONTRACT_LIFECYCLE_STATES.SUPERSEDED,
]);

export const CEREMONY_LIFECYCLE_STATES = Object.freeze({
  NOT_STARTED: 'not_started',
  BLOCKED: 'blocked',
  READY_TO_SIGN: 'ready_to_sign',
  AWAITING_REMOTE: 'awaiting_remote',
  PARTIALLY_SIGNED: 'partially_signed',
  SIGNED: 'signed',
  ABORTED: 'aborted',
  LEGACY_SIGNED: 'legacy_signed',
});

/** not_started / awaiting_remote / aborted: derivados. Demais podem existir em metadata.signatureCeremony.status. */
export const CEREMONY_STATE_SOURCE = Object.freeze({
  not_started: 'DERIVED',
  blocked: 'HYBRID',
  ready_to_sign: 'HYBRID',
  awaiting_remote: 'DERIVED',
  partially_signed: 'HYBRID',
  signed: 'HYBRID',
  aborted: 'DERIVED',
  legacy_signed: 'HYBRID',
});

export const REQUEST_LIFECYCLE_STATES = Object.freeze({
  PENDING: 'pending',
  SENT: 'sent',
  COMPLETED: 'completed',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
});

export const REQUEST_SIGNABLE_STATES = Object.freeze([
  REQUEST_LIFECYCLE_STATES.PENDING,
  REQUEST_LIFECYCLE_STATES.SENT,
]);

export const LINK_LIFECYCLE_STATES = Object.freeze({
  PENDING: 'pending',
  SIGNED: 'signed',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
});

export const LINK_SIGNABLE_STATES = Object.freeze([
  LINK_LIFECYCLE_STATES.PENDING,
]);

export const LIFECYCLE_ACTIONS = Object.freeze({
  GENERATE: 'GENERATE',
  RECORD_SIGNATURE: 'RECORD_SIGNATURE',
  CANCEL_UNSIGNED: 'CANCEL_UNSIGNED',
  ABORT_PARTIAL: 'ABORT_PARTIAL',
  VOID_SIGNED: 'VOID_SIGNED',
  SUPERSEDE: 'SUPERSEDE',
  REISSUE: 'REISSUE',
  REVOKE_SIGNING_ACCESS: 'REVOKE_SIGNING_ACCESS',
  ROTATE_SIGNING_ACCESS: 'ROTATE_SIGNING_ACCESS',
  RESEND_SIGNING_ACCESS: 'RESEND_SIGNING_ACCESS',
  EXPIRE_SIGNING_ACCESS: 'EXPIRE_SIGNING_ACCESS',
});

/** Graph may DEFINE a transition whose writer is not implemented yet. */
export const LIFECYCLE_ACTION_WRITER_IMPLEMENTED = Object.freeze({
  [LIFECYCLE_ACTIONS.GENERATE]: true,
  [LIFECYCLE_ACTIONS.RECORD_SIGNATURE]: true,
  [LIFECYCLE_ACTIONS.CANCEL_UNSIGNED]: true,
  [LIFECYCLE_ACTIONS.ABORT_PARTIAL]: true,
  [LIFECYCLE_ACTIONS.VOID_SIGNED]: false,
  [LIFECYCLE_ACTIONS.SUPERSEDE]: false,
  [LIFECYCLE_ACTIONS.REISSUE]: false,
  [LIFECYCLE_ACTIONS.REVOKE_SIGNING_ACCESS]: true,
  [LIFECYCLE_ACTIONS.ROTATE_SIGNING_ACCESS]: true,
  [LIFECYCLE_ACTIONS.RESEND_SIGNING_ACCESS]: true,
  [LIFECYCLE_ACTIONS.EXPIRE_SIGNING_ACCESS]: true,
});

export const REISSUE_REQUIRES_NEW_CONTRACT_ID = true;

export const CONTRACT_NOT_SIGNABLE = 'CONTRACT_NOT_SIGNABLE';
export const SIGNED_CONTRACT_IMMUTABLE = 'SIGNED_CONTRACT_IMMUTABLE';
export const PILOT_IMMUTABLE = 'PILOT_IMMUTABLE';
export const CANCEL_NOT_ALLOWED = 'CANCEL_NOT_ALLOWED';
export const CONTRACT_LIFECYCLE_TRANSITION_INVALID = 'CONTRACT_LIFECYCLE_TRANSITION_INVALID';
export const CONTRACT_LIFECYCLE_WRITER_NOT_IMPLEMENTED = 'CONTRACT_LIFECYCLE_WRITER_NOT_IMPLEMENTED';
export const SIGNATURE_REQUEST_NOT_SIGNABLE = 'SIGNATURE_REQUEST_NOT_SIGNABLE';
export const SIGN_LINK_NOT_SIGNABLE = 'SIGN_LINK_NOT_SIGNABLE';
export const REISSUE_IDENTITY_INVALID = 'REISSUE_IDENTITY_INVALID';
