/**
 * Normalização de fronteira de leitura. Sem rewrite de rows.
 * Aliases persistidos vs valores de cerimônia/UI ficam em mapas distintos.
 */
import {
  CEREMONY_LIFECYCLE_STATES,
  CONTRACT_LIFECYCLE_STATES,
  LINK_LIFECYCLE_STATES,
  REQUEST_LIFECYCLE_STATES,
  SIGNABLE_CONTRACT_STATES,
  TERMINAL_CONTRACT_STATES,
} from './constants.js';

const CONTRACT_PERSISTED_ALIASES = {
  canceled: CONTRACT_LIFECYCLE_STATES.CANCELLED,
  cancelled: CONTRACT_LIFECYCLE_STATES.CANCELLED,
  replaced: CONTRACT_LIFECYCLE_STATES.SUPERSEDED,
  superseded: CONTRACT_LIFECYCLE_STATES.SUPERSEDED,
  completed: CONTRACT_LIFECYCLE_STATES.SIGNED,
  signed: CONTRACT_LIFECYCLE_STATES.SIGNED,
  voided: CONTRACT_LIFECYCLE_STATES.VOIDED,
  draft: CONTRACT_LIFECYCLE_STATES.DRAFT,
  generated: CONTRACT_LIFECYCLE_STATES.GENERATED,
  partially_signed: CONTRACT_LIFECYCLE_STATES.PARTIALLY_SIGNED,
};

/** LIVE ceremony/UI spellings stored on generatedContracts.status — not legal states. */
const CONTRACT_CEREMONY_COMPAT = {
  sent: CONTRACT_LIFECYCLE_STATES.GENERATED,
  viewed: CONTRACT_LIFECYCLE_STATES.GENERATED,
  ready_to_send: CONTRACT_LIFECYCLE_STATES.GENERATED,
  awaiting_data: CONTRACT_LIFECYCLE_STATES.DRAFT,
  signed_by_clinic: CONTRACT_LIFECYCLE_STATES.PARTIALLY_SIGNED,
  signed_by_patient: CONTRACT_LIFECYCLE_STATES.PARTIALLY_SIGNED,
  vigente: CONTRACT_LIFECYCLE_STATES.SIGNED,
};

const CONTRACT_STATUS_ALIASES = {
  ...CONTRACT_PERSISTED_ALIASES,
  ...CONTRACT_CEREMONY_COMPAT,
};

const CEREMONY_ALIASES = {
  not_started: CEREMONY_LIFECYCLE_STATES.NOT_STARTED,
  blocked: CEREMONY_LIFECYCLE_STATES.BLOCKED,
  ready_to_sign: CEREMONY_LIFECYCLE_STATES.READY_TO_SIGN,
  awaiting_remote: CEREMONY_LIFECYCLE_STATES.AWAITING_REMOTE,
  awaiting_required_signers: CEREMONY_LIFECYCLE_STATES.AWAITING_REMOTE,
  partially_signed: CEREMONY_LIFECYCLE_STATES.PARTIALLY_SIGNED,
  signed: CEREMONY_LIFECYCLE_STATES.SIGNED,
  completed: CEREMONY_LIFECYCLE_STATES.SIGNED,
  aborted: CEREMONY_LIFECYCLE_STATES.ABORTED,
  legacy_signed: CEREMONY_LIFECYCLE_STATES.LEGACY_SIGNED,
};

const REQUEST_ALIASES = {
  pending: REQUEST_LIFECYCLE_STATES.PENDING,
  sent: REQUEST_LIFECYCLE_STATES.SENT,
  completed: REQUEST_LIFECYCLE_STATES.COMPLETED,
  revoked: REQUEST_LIFECYCLE_STATES.REVOKED,
  expired: REQUEST_LIFECYCLE_STATES.EXPIRED,
  cancelled: REQUEST_LIFECYCLE_STATES.REVOKED,
  canceled: REQUEST_LIFECYCLE_STATES.REVOKED,
};

const LINK_ALIASES = {
  pending: LINK_LIFECYCLE_STATES.PENDING,
  signed: LINK_LIFECYCLE_STATES.SIGNED,
  consumed: LINK_LIFECYCLE_STATES.SIGNED,
  revoked: LINK_LIFECYCLE_STATES.REVOKED,
  expired: LINK_LIFECYCLE_STATES.EXPIRED,
  cancelled: LINK_LIFECYCLE_STATES.REVOKED,
  canceled: LINK_LIFECYCLE_STATES.REVOKED,
};

function lookup(map, raw) {
  if (raw == null) return 'unknown';
  const key = String(raw).trim().toLowerCase();
  if (!key) return 'unknown';
  return map[key] || 'unknown';
}

export function normalizeContractLifecycleStatus(rawStatus) {
  return lookup(CONTRACT_STATUS_ALIASES, rawStatus);
}

export function normalizeCeremonyState(rawStatus) {
  return lookup(CEREMONY_ALIASES, rawStatus);
}

export function normalizeRequestLifecycleStatus(rawStatus) {
  return lookup(REQUEST_ALIASES, rawStatus);
}

export function normalizeLinkLifecycleStatus(rawStatus) {
  return lookup(LINK_ALIASES, rawStatus);
}

export function isContractSignableStatus(rawStatus) {
  return SIGNABLE_CONTRACT_STATES.includes(normalizeContractLifecycleStatus(rawStatus));
}

export function isTerminalContractState(rawStatus) {
  return TERMINAL_CONTRACT_STATES.includes(normalizeContractLifecycleStatus(rawStatus));
}

export function isCancelableLifecycleStatus(rawStatus) {
  const normalized = normalizeContractLifecycleStatus(rawStatus);
  return normalized === CONTRACT_LIFECYCLE_STATES.DRAFT
    || normalized === CONTRACT_LIFECYCLE_STATES.GENERATED
    || normalized === CONTRACT_LIFECYCLE_STATES.PARTIALLY_SIGNED;
}
