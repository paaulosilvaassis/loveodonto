/**
 * PHASE_10.23G — ROTATE / RESEND / EXPIRE de acesso de assinatura.
 * SAME_REQUEST. No máximo um link signable. E-mail de RESEND não cria token.
 */
import { withDb } from '../db/index.js';
import { deliverSignatureInviteEmail } from './signatureInviteEmailService.js';
import {
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_ACTIONS,
  LIFECYCLE_AUDIT_EVENTS,
  ROTATION_RACE,
  SIGNATURE_REQUEST_NOT_SIGNABLE,
  SIGNING_ACCESS_BINDING_INVALID,
  SIGN_LINK_NOT_SIGNABLE,
  assertLifecycleActor,
  assertLifecycleTenant,
  assertLegalReason,
  assertOperationalSigningAccess,
  assertRotateSigningAccessAuth,
  assertSignatureRequestSignable,
  createLifecycleError,
  entityTenantId,
  isContractSignable,
  normalizeRequestLifecycleStatus,
} from '../contracts/lifecycle/index.js';
import { findBoundRequest } from '../contracts/lifecycle/accessRevocation.js';
import { persistClockExpiredAccess } from '../contracts/lifecycle/accessExpiry.js';
import {
  applyRotateSignLink,
  findPatientSlotRequest,
  listSignableLinks,
} from '../contracts/lifecycle/accessRotation.js';
import { appendLifecycleAudit } from '../contracts/lifecycle/lifecycleAudit.js';

function loadContract(db, contractId) {
  const row = (db.generatedContracts || []).find((item) => item.id === contractId);
  if (!row) throw new Error('Contrato não encontrado.');
  return row;
}

function assertContractStillSignable(contract, extra) {
  if (isContractSignable(contract)) return contract;
  throw createLifecycleError(
    CONTRACT_NOT_SIGNABLE,
    'Contrato não está assinável para esta operação de acesso.',
    extra,
  );
}

function resolveRequest(db, { contractId, requestId, extra }) {
  if (requestId) return findBoundRequest(db, { contractId, requestId });
  const request = findPatientSlotRequest(db, contractId);
  if (!request) {
    throw createLifecycleError(
      SIGNING_ACCESS_BINDING_INVALID,
      'Não há solicitação de assinatura rotacionável para este contrato.',
      extra,
    );
  }
  return request;
}

function guardRotate(user, contract, extra) {
  const actor = assertLifecycleActor(user, extra);
  assertRotateSigningAccessAuth(user, extra);
  const tenantId = assertLifecycleTenant(user, contract, extra);
  return { ...actor, tenantId };
}

function guardResend(user, contract, extra) {
  const actor = assertLifecycleActor(user, extra);
  assertOperationalSigningAccess(user, extra);
  const tenantId = assertLifecycleTenant(user, contract, extra);
  return { ...actor, tenantId };
}

function publicSignUrl(link, origin) {
  const path = `/assinatura/${link.token}`;
  if (origin) return `${String(origin).replace(/\/$/, '')}${path}`;
  return path;
}

export function persistExpiredSigningAccess(input = {}) {
  return withDb((db) => persistClockExpiredAccess(db, input));
}

export function rotateSigningAccess(input = {}) {
  const {
    user, contractId, requestId = null, reason, reasonCode,
    expiryDays = 7, trustedNow = Date.now(),
  } = input;
  return withDb((db) => {
    const extra = { contractId, requestId, action: LIFECYCLE_ACTIONS.ROTATE_SIGNING_ACCESS };
    const contract = loadContract(db, contractId);
    const actor = guardRotate(user, contract, extra);
    assertContractStillSignable(contract, extra);
    persistClockExpiredAccess(db, {
      contractId,
      requestId,
      trustedNow,
      actorId: actor.actorUserId,
      actorRole: actor.actorRole,
      tenantId: actor.tenantId,
    });
    const request = resolveRequest(db, { contractId, requestId, extra });
    assertLifecycleTenant(user, request, extra);
    const reqStatus = normalizeRequestLifecycleStatus(request.status);
    if (reqStatus === 'completed' || reqStatus === 'revoked') {
      throw createLifecycleError(
        SIGNATURE_REQUEST_NOT_SIGNABLE,
        'Solicitação não admite rotação de credencial.',
        { ...extra, requestId: request.id },
      );
    }
    const parsed = assertLegalReason({ reason, reasonCode }, extra);
    const actedAt = new Date(trustedNow).toISOString();
    const rotated = applyRotateSignLink(db, {
      request,
      contract,
      actorUserId: actor.actorUserId,
      reason: parsed.reasonText,
      reasonCode: parsed.reasonCode,
      actedAt,
      trustedNow,
      expiryDays,
      extra,
    });
    appendLifecycleAudit(db, {
      tenantId: actor.tenantId || entityTenantId(contract),
      contractId,
      actorId: actor.actorUserId,
      actorRole: actor.actorRole,
      actedAt,
      eventType: LIFECYCLE_AUDIT_EVENTS.SIGN_LINK_ROTATED,
      reason: parsed.reasonText,
      reasonCode: parsed.reasonCode,
      previousState: 'pending',
      newState: 'pending',
      requestId: rotated.request.id,
      linkId: rotated.newLink.id,
      oldLinkId: rotated.oldLinkId,
      newLinkId: rotated.newLink.id,
      parentAction: extra.action,
    });
    return {
      ok: true,
      action: extra.action,
      actedAt,
      contract,
      request: rotated.request,
      link: rotated.newLink,
      oldLinkId: rotated.oldLinkId,
      newLinkId: rotated.newLink.id,
      signUrl: rotated.signUrl,
      retiredLinks: rotated.retiredLinks,
    };
  });
}

export function prepareSigningAccessResend(input = {}) {
  const {
    user, contractId, requestId = null, trustedNow = Date.now(),
  } = input;
  return withDb((db) => {
    const extra = { contractId, requestId, action: LIFECYCLE_ACTIONS.RESEND_SIGNING_ACCESS };
    const contract = loadContract(db, contractId);
    const actor = guardResend(user, contract, extra);
    assertContractStillSignable(contract, extra);
    persistClockExpiredAccess(db, {
      contractId,
      requestId,
      trustedNow,
      actorId: actor.actorUserId,
      actorRole: actor.actorRole,
      tenantId: actor.tenantId,
    });
    const request = resolveRequest(db, { contractId, requestId, extra });
    assertLifecycleTenant(user, request, extra);
    const signable = listSignableLinks(db, request.id, trustedNow);
    if (signable.length === 0) {
      throw createLifecycleError(
        SIGN_LINK_NOT_SIGNABLE,
        'Link expirado. Use rotação, não reenvio.',
        { ...extra, requestId: request.id },
      );
    }
    if (signable.length > 1) {
      throw createLifecycleError(
        ROTATION_RACE,
        'Há mais de um link assinável. Rotacione antes de reenviar.',
        { ...extra, requestId: request.id, linkId: signable[0].id },
      );
    }
    assertSignatureRequestSignable(request, trustedNow);
    return {
      actor,
      extra,
      contract,
      request,
      link: signable[0],
      signUrl: `/assinatura/${signable[0].token}`,
      expiresAt: signable[0].expiresAt,
    };
  });
}

export async function resendSigningAccess(input = {}) {
  const { deliverEmail = true, origin = '', treatmentName = '', clinicName = '', clinicIdentity = null } = input;
  const prepared = prepareSigningAccessResend(input);
  const beforeExpiresAt = prepared.expiresAt;
  const beforeToken = prepared.link.token;
  let delivery = { skipped: true };
  if (deliverEmail) {
    const to = prepared.request.recipients?.patientEmail;
    delivery = await deliverSignatureInviteEmail({
      to,
      patientName: prepared.request.recipients?.patientName,
      treatmentName,
      clinicName,
      clinicIdentity,
      signUrl: publicSignUrl(prepared.link, origin),
      expiresAt: prepared.link.expiresAt,
      contractNumber: prepared.request.contractNumber,
      requestId: prepared.request.id,
    });
  }
  const actedAt = new Date().toISOString();
  withDb((db) => {
    const live = (db.contractSignLinks || []).find((row) => row.id === prepared.link.id);
    if (!live || live.token !== beforeToken || live.expiresAt !== beforeExpiresAt) {
      throw createLifecycleError(
        SIGN_LINK_NOT_SIGNABLE,
        'RESEND não pode alterar token nem expiresAt.',
        prepared.extra,
      );
    }
    appendLifecycleAudit(db, {
      tenantId: prepared.actor.tenantId || entityTenantId(prepared.contract),
      contractId: prepared.contract.id,
      actorId: prepared.actor.actorUserId,
      actorRole: prepared.actor.actorRole,
      actedAt,
      eventType: LIFECYCLE_AUDIT_EVENTS.SIGN_INVITE_RESENT,
      previousState: live.status,
      newState: live.status,
      requestId: prepared.request.id,
      linkId: live.id,
      deliveryAttemptId: delivery.messageId || null,
      parentAction: prepared.extra.action,
    });
    return db;
  });
  return {
    ok: true,
    action: prepared.extra.action,
    actedAt,
    contract: prepared.contract,
    request: prepared.request,
    link: prepared.link,
    signUrl: prepared.signUrl,
    delivery,
    expiresAt: beforeExpiresAt,
  };
}
