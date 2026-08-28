/**
 * Guards de request/link. Runtime expiration sempre vence status persistido.
 */
import {
  LINK_SIGNABLE_STATES,
  REQUEST_SIGNABLE_STATES,
  SIGNATURE_REQUEST_NOT_SIGNABLE,
  SIGN_LINK_NOT_SIGNABLE,
} from './constants.js';
import { createLifecycleError } from './errors.js';
import {
  normalizeLinkLifecycleStatus,
  normalizeRequestLifecycleStatus,
} from './normalize.js';

export function toTrustedNowMs(trustedNow = Date.now()) {
  if (trustedNow instanceof Date) return trustedNow.getTime();
  if (typeof trustedNow === 'string') {
    const parsed = Date.parse(trustedNow);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  return Number(trustedNow) || Date.now();
}

export function isAccessExpired(expiresAt, trustedNow = Date.now()) {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return false;
  return ts <= toTrustedNowMs(trustedNow);
}

export function isSignatureRequestSignable(request, trustedNow = Date.now()) {
  if (!request) return false;
  const status = normalizeRequestLifecycleStatus(request.status);
  if (!REQUEST_SIGNABLE_STATES.includes(status)) return false;
  if (isAccessExpired(request.expiresAt, trustedNow)) return false;
  return true;
}

export function isSignLinkSignable(link, trustedNow = Date.now()) {
  if (!link) return false;
  const status = normalizeLinkLifecycleStatus(link.status);
  if (!LINK_SIGNABLE_STATES.includes(status)) return false;
  if (isAccessExpired(link.expiresAt, trustedNow)) return false;
  return true;
}

export function assertSignatureRequestSignable(request, trustedNow = Date.now()) {
  if (isSignatureRequestSignable(request, trustedNow)) return request;
  const status = normalizeRequestLifecycleStatus(request?.status);
  throw createLifecycleError(
    SIGNATURE_REQUEST_NOT_SIGNABLE,
    'Solicitação de assinatura não está assinável.',
    { normalizedStatus: status, contractId: request?.contractId || null },
  );
}

export function assertSignLinkSignable(link, trustedNow = Date.now()) {
  if (isSignLinkSignable(link, trustedNow)) return link;
  const status = normalizeLinkLifecycleStatus(link?.status);
  throw createLifecycleError(
    SIGN_LINK_NOT_SIGNABLE,
    'Link de assinatura não está assinável.',
    { normalizedStatus: status, contractId: link?.contractId || null },
  );
}
