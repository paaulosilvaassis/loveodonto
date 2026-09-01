/**
 * Persistência de substituição de acesso REVOGADO.
 * Cria request+link novos. Não ressuscita o par antigo.
 */
import { createId } from '../../services/helpers.js';
import { SIGNATURE_PROVIDERS } from '../contractConstants.js';
import { CLINICAL_SIGNER_ROLE, mapLegacySignerRole } from '../clinicalRequiredSigners.js';
import {
  ROTATION_RACE,
  SIGNING_ACCESS_NOT_REPLACEABLE,
} from './constants.js';
import { createLifecycleError } from './errors.js';
import { isSignLinkSignable, isSignatureRequestSignable } from './accessGuards.js';
import { normalizeRequestLifecycleStatus } from './normalize.js';

export function partyKey(row, fallbackPersonId = null) {
  const role = mapLegacySignerRole(row?.signerRole || CLINICAL_SIGNER_ROLE.PATIENT);
  const personId = row?.signerPersonId || fallbackPersonId || null;
  return `${role}:${personId || ''}`;
}

export function listSignablePartyAccess(db, {
  contractId,
  signerRole = CLINICAL_SIGNER_ROLE.PATIENT,
  signerPersonId = null,
  trustedNow = Date.now(),
} = {}) {
  const target = partyKey({ signerRole, signerPersonId });
  const requests = (db.contractSignatureRequests || []).filter((row) => (
    row.contractId === contractId
    && partyKey(row, signerPersonId) === target
    && isSignatureRequestSignable(row, trustedNow)
  ));
  const pairs = [];
  for (const request of requests) {
    const links = (db.contractSignLinks || []).filter((row) => (
      row.requestId === request.id && isSignLinkSignable(row, trustedNow)
    ));
    links.forEach((link) => pairs.push({ request, link }));
  }
  return pairs;
}

export function findLatestRevokedPartyRequest(db, {
  contractId,
  signerRole = CLINICAL_SIGNER_ROLE.PATIENT,
  signerPersonId = null,
} = {}) {
  const target = partyKey({ signerRole, signerPersonId });
  return (db.contractSignatureRequests || [])
    .filter((row) => row.contractId === contractId)
    .filter((row) => partyKey(row, signerPersonId) === target)
    .filter((row) => normalizeRequestLifecycleStatus(row.status) === 'revoked')
    .sort((a, b) => new Date(b.revokedAt || b.createdAt || 0) - new Date(a.revokedAt || a.createdAt || 0))[0]
    || null;
}

export function assertNoOrphanHalfWrite(db, requestId, linkId) {
  const request = (db.contractSignatureRequests || []).find((row) => row.id === requestId);
  const link = (db.contractSignLinks || []).find((row) => row.id === linkId);
  if (!request || !link || link.requestId !== requestId) {
    throw createLifecycleError(
      SIGNING_ACCESS_NOT_REPLACEABLE,
      'Substituição de acesso incompleta. Nenhum registro órfão foi aceito.',
      { requestId, linkId },
    );
  }
}

export function applyReplaceRevokedSigningAccess(db, {
  contract,
  parentRequest,
  actorUserId,
  tenantId,
  actedAt,
  expiryDays = 7,
  extra = {},
}) {
  const signerRole = mapLegacySignerRole(
    parentRequest.signerRole || CLINICAL_SIGNER_ROLE.PATIENT,
  );
  const signerPersonId = parentRequest.signerPersonId || contract.patientId || null;
  const signable = listSignablePartyAccess(db, {
    contractId: contract.id,
    signerRole,
    signerPersonId,
    trustedNow: Date.parse(actedAt) || Date.now(),
  });
  if (signable.length > 1) {
    throw createLifecycleError(
      ROTATION_RACE,
      'Já existe mais de um acesso assinável para este signatário.',
      { ...extra, requestId: signable[0].request.id, linkId: signable[0].link.id },
    );
  }
  if (signable.length === 1) {
    return {
      reused: true,
      request: signable[0].request,
      link: signable[0].link,
      parentRequest,
      signUrl: `/assinatura/${signable[0].link.token}`,
    };
  }

  const days = Number(expiryDays) > 0 ? Number(expiryDays) : 7;
  const expiresAt = new Date(new Date(actedAt).getTime() + days * 86400000).toISOString();
  const token = createId('csgn');
  const requestId = createId('csreq');
  if (!requestId) {
    throw new Error('NEW_LINK_WITHOUT_REQUEST_ID');
  }
  const request = {
    id: requestId,
    tenant_id: tenantId || parentRequest.tenant_id || contract.tenant_id || null,
    tenantId: tenantId || parentRequest.tenantId || contract.tenantId || null,
    clinicId: parentRequest.clinicId || contract.clinicId || null,
    contractId: contract.id,
    provider: parentRequest.provider || SIGNATURE_PROVIDERS.INTERNAL,
    externalId: token,
    status: 'pending',
    signerRole,
    signerPersonId,
    signatureType: parentRequest.signatureType || null,
    deliveryStatus: 'LINK_CREATED',
    documentHash: parentRequest.documentHash || contract.documentHash || null,
    contractNumber: parentRequest.contractNumber || contract.contractNumber || null,
    budgetId: parentRequest.budgetId || contract.budgetId || null,
    quoteId: parentRequest.quoteId || contract.quoteId || null,
    recipients: { ...(parentRequest.recipients || {}) },
    authRequirements: parentRequest.authRequirements || {},
    expiresAt,
    createdBy: actorUserId || null,
    createdAt: actedAt,
    sentAt: null,
    completedAt: null,
    replacedFromRequestId: parentRequest.id,
  };
  const link = {
    id: createId('clnk'),
    tenant_id: request.tenant_id,
    tenantId: request.tenantId,
    clinicId: request.clinicId,
    contractId: contract.id,
    requestId,
    token,
    expiresAt,
    status: 'pending',
    signerRole,
    signerPersonId,
    createdBy: actorUserId || null,
    createdAt: actedAt,
    viewedAt: null,
    signedAt: null,
    replacedFromLinkId: extra.oldLinkId || null,
  };
  if (!link.requestId) {
    throw new Error('NEW_LINK_WITHOUT_REQUEST_ID');
  }
  if (!Array.isArray(db.contractSignatureRequests)) db.contractSignatureRequests = [];
  if (!Array.isArray(db.contractSignLinks)) db.contractSignLinks = [];
  db.contractSignatureRequests.push(request);
  db.contractSignLinks.push(link);
  assertNoOrphanHalfWrite(db, request.id, link.id);
  return {
    reused: false,
    request,
    link,
    parentRequest,
    signUrl: `/assinatura/${token}`,
  };
}
