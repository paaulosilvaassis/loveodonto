/**
 * Mutações de request/link usadas só dentro do withDb canônico.
 * Não apaga rows. Não reescreve revogação já persistida.
 */
import {
  LINK_LIFECYCLE_STATES,
  REQUEST_SIGNABLE_STATES,
  SIGNING_ACCESS_BINDING_INVALID,
} from './constants.js';
import { createLifecycleError } from './errors.js';
import {
  normalizeLinkLifecycleStatus,
  normalizeRequestLifecycleStatus,
} from './normalize.js';

function isActiveRequest(row) {
  return REQUEST_SIGNABLE_STATES.includes(normalizeRequestLifecycleStatus(row?.status));
}

function isActiveLink(row) {
  return normalizeLinkLifecycleStatus(row?.status) === LINK_LIFECYCLE_STATES.PENDING;
}

function isAlreadyRevokedRequest(row) {
  return normalizeRequestLifecycleStatus(row?.status) === 'revoked';
}

function isAlreadyRevokedLink(row) {
  return normalizeLinkLifecycleStatus(row?.status) === 'revoked';
}

export function revokeRequestRow(row, { now, actorUserId, reason, reasonCode, parentAction }) {
  if (!row || isAlreadyRevokedRequest(row)) return { row, changed: false };
  if (!isActiveRequest(row)) return { row, changed: false };
  return {
    changed: true,
    row: {
      ...row,
      status: 'revoked',
      revokedAt: now,
      revokedBy: actorUserId,
      previousStatus: row.status,
      revokeReason: reason,
      revokeReasonCode: reasonCode || null,
      revokeParentAction: parentAction || null,
    },
  };
}

export function revokeLinkRow(row, { now, actorUserId, reason, reasonCode, parentAction }) {
  if (!row || isAlreadyRevokedLink(row)) return { row, changed: false };
  if (!isActiveLink(row)) return { row, changed: false };
  return {
    changed: true,
    row: {
      ...row,
      status: 'revoked',
      revokedAt: now,
      revokedBy: actorUserId,
      previousStatus: row.status,
      revokeReason: reason,
      revokeReasonCode: reasonCode || null,
      revokeParentAction: parentAction || null,
    },
  };
}

export function revokeAccessForContract(db, {
  contractId,
  now,
  actorUserId,
  reason,
  reasonCode,
  parentAction,
}) {
  const revokedRequests = [];
  const revokedLinks = [];
  const requests = db.contractSignatureRequests || [];
  for (let i = 0; i < requests.length; i += 1) {
    const row = requests[i];
    if (row.contractId !== contractId) continue;
    const next = revokeRequestRow(row, { now, actorUserId, reason, reasonCode, parentAction });
    requests[i] = next.row;
    if (next.changed) revokedRequests.push(next.row);
  }
  const links = db.contractSignLinks || [];
  for (let i = 0; i < links.length; i += 1) {
    const row = links[i];
    if (row.contractId !== contractId) continue;
    const next = revokeLinkRow(row, { now, actorUserId, reason, reasonCode, parentAction });
    links[i] = next.row;
    if (next.changed) revokedLinks.push(next.row);
  }
  return { revokedRequests, revokedLinks };
}

export function findBoundRequest(db, { contractId, requestId }) {
  if (!contractId || !requestId) {
    throw createLifecycleError(
      SIGNING_ACCESS_BINDING_INVALID,
      'Revogação exige contractId e requestId vinculados.',
      { contractId, requestId },
    );
  }
  const request = (db.contractSignatureRequests || []).find((row) => row.id === requestId);
  if (!request) {
    throw createLifecycleError(
      SIGNING_ACCESS_BINDING_INVALID,
      'Solicitação de assinatura não encontrada.',
      { contractId, requestId },
    );
  }
  if (request.contractId !== contractId) {
    throw createLifecycleError(
      SIGNING_ACCESS_BINDING_INVALID,
      'Request não pertence a este contrato.',
      { contractId, requestId },
    );
  }
  return request;
}

function assertLinkBinding(link, { contractId, requestId }) {
  if (!link) {
    throw createLifecycleError(
      SIGNING_ACCESS_BINDING_INVALID,
      'Link não pertence a este contrato/request.',
      { contractId, requestId },
    );
  }
  if (link.contractId && link.contractId !== contractId) {
    throw createLifecycleError(
      SIGNING_ACCESS_BINDING_INVALID,
      'Link não pertence a este contrato.',
      { contractId, requestId, linkId: link.id },
    );
  }
  if (link.requestId && link.requestId !== requestId) {
    throw createLifecycleError(
      SIGNING_ACCESS_BINDING_INVALID,
      'Link não pertence a este request.',
      { contractId, requestId, linkId: link.id },
    );
  }
  if (!link.contractId && !link.requestId) {
    throw createLifecycleError(
      SIGNING_ACCESS_BINDING_INVALID,
      'Link sem binding de contrato/request.',
      { contractId, requestId, linkId: link.id },
    );
  }
}

export function findBoundLinks(db, { contractId, requestId, signLinkId = null }) {
  const all = db.contractSignLinks || [];
  if (signLinkId) {
    const link = all.find((row) => row.id === signLinkId) || null;
    assertLinkBinding(link, { contractId, requestId });
    return [link];
  }
  const bound = all.filter((row) => row.requestId === requestId);
  bound.forEach((link) => assertLinkBinding(link, { contractId, requestId }));
  return bound;
}

export function revokeBoundAccess(db, {
  contractId,
  requestId,
  signLinkId = null,
  now,
  actorUserId,
  reason,
  reasonCode,
  parentAction,
}) {
  const request = findBoundRequest(db, { contractId, requestId });
  const links = findBoundLinks(db, { contractId, requestId, signLinkId });
  const requests = db.contractSignatureRequests || [];
  const rIdx = requests.findIndex((row) => row.id === requestId);
  const nextRequest = revokeRequestRow(request, { now, actorUserId, reason, reasonCode, parentAction });
  if (rIdx >= 0) requests[rIdx] = nextRequest.row;
  const changedLinks = [];
  const allLinks = db.contractSignLinks || [];
  for (let i = 0; i < links.length; i += 1) {
    const target = links[i];
    const lIdx = allLinks.findIndex((row) => row.id === target.id);
    if (lIdx < 0) continue;
    const next = revokeLinkRow(allLinks[lIdx], { now, actorUserId, reason, reasonCode, parentAction });
    allLinks[lIdx] = next.row;
    if (next.changed) changedLinks.push(next.row);
  }
  return {
    request: nextRequest.row,
    requestChanged: nextRequest.changed,
    links: links.map((row) => allLinks.find((live) => live.id === row.id) || row),
    changedLinks,
    alreadyRevoked: !nextRequest.changed && changedLinks.length === 0,
  };
}
