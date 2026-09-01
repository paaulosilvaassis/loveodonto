/**
 * PHASE_10.23J — substitui acesso remoto REVOGADO.
 * Novo request/link/token. O par revoked permanece imutável.
 */
import { withDb } from '../db/index.js';
import { getContractSettings } from './contractModuleService.js';
import { deliverSignatureInviteEmail } from './signatureInviteEmailService.js';
import { isImmutablePilotContract } from '../contracts/remoteSignatureEvidence.js';
import { CLINICAL_SIGNER_ROLE, mapLegacySignerRole } from '../contracts/clinicalRequiredSigners.js';
import {
  ACCESS_REPLACEMENT_NOT_ALLOWED,
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_ACTIONS,
  LIFECYCLE_AUDIT_EVENTS,
  LIFECYCLE_TENANT_MISMATCH,
  PILOT_IMMUTABLE,
  SIGNING_ACCESS_BINDING_INVALID,
  SIGNING_ACCESS_NOT_REPLACEABLE,
  SIGNING_PARTY_ALREADY_SIGNED,
  assertLifecycleActor,
  assertLifecycleTenant,
  assertLegalReason,
  assertReplaceRevokedSigningAccessAuth,
  createLifecycleError,
  entityTenantId,
  isContractSignable,
  isTerminalContractState,
  normalizeContractLifecycleStatus,
} from '../contracts/lifecycle/index.js';
import { persistClockExpiredAccess } from '../contracts/lifecycle/accessExpiry.js';
import { appendLifecycleAudit } from '../contracts/lifecycle/lifecycleAudit.js';
import {
  applyReplaceRevokedSigningAccess,
  findLatestRevokedPartyRequest,
  listSignablePartyAccess,
} from '../contracts/lifecycle/accessReplacement.js';

function loadContract(db, contractId) {
  const row = (db.generatedContracts || []).find((item) => item.id === contractId);
  if (!row) throw new Error('Contrato não encontrado.');
  return row;
}

function publicSignUrl(link, origin) {
  const path = `/assinatura/${link.token}`;
  if (origin) return `${String(origin).replace(/\/$/, '')}${path}`;
  return path;
}

function partyAlreadySigned(db, { contractId, signerRole, signerPersonId }) {
  const role = mapLegacySignerRole(signerRole || CLINICAL_SIGNER_ROLE.PATIENT);
  return (db.contractSignatures || []).some((row) => {
    if (row.contractId !== contractId) return false;
    const rowRole = mapLegacySignerRole(row.signerRole || row.role);
    if (rowRole !== role) return false;
    if (signerPersonId && row.signerPersonId && row.signerPersonId !== signerPersonId) return false;
    return true;
  });
}

function assertFrozenReady(contract, extra) {
  if (contract.quoteSource !== 'clinical_budget') return;
  const md = contract.metadata || {};
  if (md.packageManifestId || md.packageManifestHash || md.frozenAt) return;
  throw createLifecycleError(
    CONTRACT_NOT_SIGNABLE,
    'Manifest ainda não congelado. Prepare o pacote de assinatura primeiro.',
    extra,
  );
}

function snapshotRow(row) {
  return {
    id: row?.id || null,
    status: row?.status || null,
    revokedAt: row?.revokedAt || null,
    revokedBy: row?.revokedBy || null,
    revokeReason: row?.revokeReason || null,
    token: row?.token || null,
    requestId: row?.requestId || null,
  };
}

export function replaceRevokedSigningAccess(input = {}) {
  const {
    user,
    contractId,
    requestId = null,
    reason,
    reasonCode,
    expiryDays,
    trustedNow = Date.now(),
    signerRole = CLINICAL_SIGNER_ROLE.PATIENT,
  } = input;
  return withDb((db) => {
    const extra = {
      contractId,
      requestId,
      action: LIFECYCLE_ACTIONS.REPLACE_REVOKED_SIGNING_ACCESS,
    };
    const contract = loadContract(db, contractId);
    const actor = assertLifecycleActor(user, extra);
    assertReplaceRevokedSigningAccessAuth(user, extra);
    const tenantId = assertLifecycleTenant(user, contract, extra);
    if (isImmutablePilotContract(contract)) {
      throw createLifecycleError(PILOT_IMMUTABLE, 'Contrato piloto histórico não pode ser alterado.', extra);
    }
    if (isTerminalContractState(contract.status) || !isContractSignable(contract)) {
      throw createLifecycleError(
        CONTRACT_NOT_SIGNABLE,
        'Contrato não está assinável para substituição de acesso.',
        extra,
      );
    }
    const legal = normalizeContractLifecycleStatus(contract.status);
    if (legal !== 'generated' && legal !== 'partially_signed') {
      throw createLifecycleError(
        CONTRACT_NOT_SIGNABLE,
        'Somente contratos gerados ou parcialmente assinados admitem novo acesso.',
        extra,
      );
    }
    assertFrozenReady(contract, extra);
    persistClockExpiredAccess(db, {
      contractId,
      trustedNow,
      actorId: actor.actorUserId,
      actorRole: actor.actorRole,
      tenantId,
    });

    const parent = requestId
      ? (db.contractSignatureRequests || []).find((row) => row.id === requestId) || null
      : findLatestRevokedPartyRequest(db, {
        contractId,
        signerRole,
        signerPersonId: contract.patientId || null,
      });
    if (!parent) {
      throw createLifecycleError(
        SIGNING_ACCESS_NOT_REPLACEABLE,
        'Não há acesso revogado elegível para substituição.',
        extra,
      );
    }
    if (parent.contractId !== contractId) {
      throw createLifecycleError(
        SIGNING_ACCESS_BINDING_INVALID,
        'Request não pertence a este contrato.',
        extra,
      );
    }
    assertLifecycleTenant(user, parent, extra);
    const parentParty = mapLegacySignerRole(parent.signerRole || signerRole);
    if (
      parentParty === CLINICAL_SIGNER_ROLE.PATIENT
      && parent.signerPersonId
      && contract.patientId
      && parent.signerPersonId !== contract.patientId
    ) {
      throw createLifecycleError(
        SIGNING_ACCESS_BINDING_INVALID,
        'Request não pertence a este signatário.',
        extra,
      );
    }
    const parentStatus = String(parent.status || '').toLowerCase();
    const signableNow = listSignablePartyAccess(db, {
      contractId,
      signerRole: parent.signerRole || signerRole,
      signerPersonId: parent.signerPersonId || contract.patientId || null,
      trustedNow,
    });
    if (parentStatus !== 'revoked' && signableNow.length === 0) {
      throw createLifecycleError(
        SIGNING_ACCESS_NOT_REPLACEABLE,
        'Substituição exige um request revogado sem acesso assinável ativo.',
        extra,
      );
    }
    if (partyAlreadySigned(db, {
      contractId,
      signerRole: parent.signerRole || signerRole,
      signerPersonId: parent.signerPersonId || contract.patientId,
    })) {
      throw createLifecycleError(
        SIGNING_PARTY_ALREADY_SIGNED,
        'Este signatário já concluiu a assinatura.',
        extra,
      );
    }

    const parsed = assertLegalReason({ reason, reasonCode }, extra);
    const actedAt = new Date(trustedNow).toISOString();
    const oldLink = (db.contractSignLinks || [])
      .filter((row) => row.requestId === parent.id)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
    const beforeParent = snapshotRow(parent);
    const beforeLink = snapshotRow(oldLink);
    const settings = getContractSettings(user);
    const created = applyReplaceRevokedSigningAccess(db, {
      contract,
      parentRequest: parent,
      actorUserId: actor.actorUserId,
      tenantId,
      actedAt,
      expiryDays: expiryDays || settings.signLinkExpiryDays || 7,
      extra: { ...extra, oldLinkId: oldLink?.id || null },
    });
    if (created.request.id === parent.id || created.link.token === oldLink?.token) {
      throw createLifecycleError(
        ACCESS_REPLACEMENT_NOT_ALLOWED,
        'Substituição não pode reutilizar o acesso revogado.',
        extra,
      );
    }
    const liveParent = (db.contractSignatureRequests || []).find((row) => row.id === parent.id);
    if (
      !liveParent
      || liveParent.status !== beforeParent.status
      || liveParent.revokedAt !== beforeParent.revokedAt
      || liveParent.revokedBy !== beforeParent.revokedBy
      || liveParent.revokeReason !== beforeParent.revokeReason
    ) {
      throw createLifecycleError(
        ACCESS_REPLACEMENT_NOT_ALLOWED,
        'Substituição não pode alterar o acesso revogado original.',
        extra,
      );
    }
    if (oldLink) {
      const liveLink = (db.contractSignLinks || []).find((row) => row.id === oldLink.id);
      if (
        !liveLink
        || liveLink.status !== beforeLink.status
        || liveLink.token !== beforeLink.token
        || liveLink.revokedAt !== beforeLink.revokedAt
      ) {
        throw createLifecycleError(
          ACCESS_REPLACEMENT_NOT_ALLOWED,
          'Substituição não pode alterar o link revogado original.',
          extra,
        );
      }
    }
    if (!created.reused) {
      appendLifecycleAudit(db, {
        tenantId: tenantId || entityTenantId(contract),
        contractId,
        actorId: actor.actorUserId,
        actorRole: actor.actorRole,
        actedAt,
        eventType: LIFECYCLE_AUDIT_EVENTS.SIGNING_ACCESS_REPLACED,
        reason: parsed.reasonText,
        reasonCode: parsed.reasonCode,
        previousState: 'revoked',
        newState: 'pending',
        requestId: created.request.id,
        linkId: created.link.id,
        oldRequestId: parent.id,
        oldLinkId: oldLink?.id || null,
        newLinkId: created.link.id,
        parentAction: extra.action,
      });
    }
    const liveContract = (db.generatedContracts || []).find((row) => row.id === contractId);
    return {
      ok: true,
      idempotent: created.reused === true,
      action: extra.action,
      actedAt,
      contract: liveContract,
      request: created.request,
      link: created.link,
      parentRequest: liveParent,
      oldRequestId: parent.id,
      oldLinkId: oldLink?.id || null,
      newRequestId: created.request.id,
      newLinkId: created.link.id,
      signUrl: created.signUrl,
    };
  });
}

export async function replaceRevokedSigningAccessAndInvite(input = {}) {
  const {
    deliverEmail = true,
    origin = '',
    treatmentName = '',
    clinicName = '',
    clinicIdentity = null,
  } = input;
  const created = replaceRevokedSigningAccess(input);
  let delivery = { skipped: true };
  let emailFailed = false;
  let emailError = null;
  if (deliverEmail) {
    try {
      delivery = await deliverSignatureInviteEmail({
        to: created.request.recipients?.patientEmail,
        patientName: created.request.recipients?.patientName,
        treatmentName,
        clinicName,
        clinicIdentity,
        signUrl: publicSignUrl(created.link, origin),
        expiresAt: created.link.expiresAt,
        contractNumber: created.request.contractNumber,
        requestId: created.request.id,
      });
      withDb((db) => {
        const requests = db.contractSignatureRequests || [];
        const idx = requests.findIndex((row) => row.id === created.request.id);
        if (idx >= 0) {
          requests[idx] = {
            ...requests[idx],
            status: requests[idx].status === 'pending' ? 'sent' : requests[idx].status,
            sentAt: requests[idx].sentAt || new Date().toISOString(),
            lastEmailMessageId: delivery.messageId || null,
            lastDeliveryErrorCode: null,
            deliveryStatus: 'PROVIDER_ACCEPTED',
          };
        }
        return db;
      });
    } catch (err) {
      emailFailed = true;
      emailError = err;
      delivery = { ok: false, code: err?.code || 'EMAIL_REQUEST_FAILED' };
    }
  }
  return {
    ...created,
    delivery,
    emailFailed,
    emailError: emailError ? {
      code: emailError.code || 'EMAIL_REQUEST_FAILED',
      message: 'Novo acesso criado, mas o e-mail não pôde ser enviado.',
    } : null,
    signUrl: created.signUrl,
  };
}
