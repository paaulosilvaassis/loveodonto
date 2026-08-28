/**
 * ROTATE SAME_REQUEST: revoga/expira todos os pending e insere um novo link.
 * Invariante: no máximo um link signable por requestId.
 */
import { createId } from '../../services/helpers.js';
import { CLINICAL_SIGNER_ROLE, mapLegacySignerRole } from '../clinicalRequiredSigners.js';
import { ROTATION_RACE, SIGNING_ACCESS_BINDING_INVALID } from './constants.js';
import { createLifecycleError } from './errors.js';
import { isSignLinkSignable } from './accessGuards.js';
import { normalizeRequestLifecycleStatus } from './normalize.js';
import { revokeLinkRow } from './accessRevocation.js';

export function listSignableLinks(db, requestId, trustedNow = Date.now()) {
  return (db.contractSignLinks || []).filter(
    (row) => row.requestId === requestId && isSignLinkSignable(row, trustedNow),
  );
}

export function findPatientSlotRequest(db, contractId) {
  const rows = (db.contractSignatureRequests || [])
    .filter((row) => row.contractId === contractId)
    .filter((row) => mapLegacySignerRole(row.signerRole || CLINICAL_SIGNER_ROLE.PATIENT)
      === CLINICAL_SIGNER_ROLE.PATIENT)
    .filter((row) => {
      const status = normalizeRequestLifecycleStatus(row.status);
      return status !== 'completed' && status !== 'revoked';
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return rows[0] || null;
}

function assertNoSignableLeft(db, requestId, trustedNow, extra) {
  const leftover = listSignableLinks(db, requestId, trustedNow);
  if (leftover.length > 0) {
    throw createLifecycleError(
      ROTATION_RACE,
      'Já existe link assinável ativo para este request.',
      { ...extra, requestId, linkId: leftover[0].id },
    );
  }
}

function buildRotatedLink({
  sourceLink, request, contract, token, expiresAt, actedAt, actorUserId,
}) {
  return {
    id: createId('clnk'),
    tenant_id: request.tenant_id || contract.tenant_id || sourceLink?.tenant_id || null,
    tenantId: request.tenantId || contract.tenantId || sourceLink?.tenantId || null,
    clinicId: request.clinicId || contract.clinicId || sourceLink?.clinicId || null,
    contractId: contract.id,
    requestId: request.id,
    token,
    expiresAt,
    status: 'pending',
    signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
    signerPersonId: request.signerPersonId || contract.patientId || sourceLink?.signerPersonId || null,
    createdBy: actorUserId || null,
    createdAt: actedAt,
    viewedAt: null,
    signedAt: null,
    rotatedFromLinkId: sourceLink?.id || null,
  };
}

export function applyRotateSignLink(db, {
  request,
  contract,
  actorUserId,
  reason,
  reasonCode,
  actedAt,
  trustedNow,
  expiryDays = 7,
  extra = {},
}) {
  if (!request?.id || !contract?.id) {
    throw createLifecycleError(
      SIGNING_ACCESS_BINDING_INVALID,
      'Rotação exige request e contrato vinculados.',
      extra,
    );
  }
  const links = db.contractSignLinks || [];
  const ofRequest = links.filter((row) => row.requestId === request.id);
  const retired = [];
  for (let i = 0; i < links.length; i += 1) {
    const row = links[i];
    if (row.requestId !== request.id) continue;
    if (!isSignLinkSignable(row, trustedNow)) continue;
    const next = revokeLinkRow(row, {
      now: actedAt,
      actorUserId,
      reason,
      reasonCode,
      parentAction: extra.action,
    });
    links[i] = next.row;
    if (next.changed) retired.push(next.row);
  }
  assertNoSignableLeft(db, request.id, trustedNow, extra);

  const days = Number(expiryDays) > 0 ? Number(expiryDays) : 7;
  const expiresAt = new Date(new Date(actedAt).getTime() + days * 86400000).toISOString();
  const token = createId('csgn');
  const sourceLink = ofRequest.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  )[0] || null;
  const newLink = buildRotatedLink({
    sourceLink, request, contract, token, expiresAt, actedAt, actorUserId,
  });
  links.push(newLink);

  const prevRequestStatus = normalizeRequestLifecycleStatus(request.status);
  const nextRequestStatus = prevRequestStatus === 'sent' ? 'sent' : 'pending';
  const requests = db.contractSignatureRequests || [];
  const rIdx = requests.findIndex((row) => row.id === request.id);
  const nextRequest = {
    ...request,
    status: nextRequestStatus,
    expiresAt,
    externalId: token,
    previousStatus: request.status,
  };
  if (rIdx >= 0) requests[rIdx] = nextRequest;

  return {
    request: nextRequest,
    newLink,
    retiredLinks: retired,
    previousLinks: ofRequest,
    signUrl: `/assinatura/${token}`,
    oldLinkId: sourceLink?.id || retired[0]?.id || null,
  };
}
