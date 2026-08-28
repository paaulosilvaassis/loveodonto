/**
 * PHASE_10.23E — único boundary de comando:
 * CANCEL_UNSIGNED, ABORT_PARTIAL, REVOKE_SIGNING_ACCESS.
 */
import { loadDb, withDb } from '../db/index.js';
import { isImmutablePilotContract } from '../contracts/remoteSignatureEvidence.js';
import {
  CANCEL_NOT_ALLOWED,
  CEREMONY_NOT_ABORTABLE,
  CONTRACT_LIFECYCLE_TRANSITION_INVALID,
  LIFECYCLE_ACTIONS,
  LIFECYCLE_AUDIT_EVENTS,
  PILOT_IMMUTABLE,
  SIGNING_ACCESS_BINDING_INVALID,
  assertContractTransition,
  createLifecycleError,
  normalizeContractLifecycleStatus,
  resolveCancelOrAbortAction,
} from '../contracts/lifecycle/index.js';
import {
  assertLegalReason,
  assertLifecycleActor,
  assertLifecycleTenant,
  assertSensitiveLifecycleAuth,
  entityTenantId,
} from '../contracts/lifecycle/commandAuth.js';
import {
  findBoundLinks,
  findBoundRequest,
  revokeBoundAccess,
} from '../contracts/lifecycle/accessRevocation.js';
import { appendAccessRevocationAudits } from '../contracts/lifecycle/lifecycleAudit.js';
import { persistCancelEffects } from '../contracts/lifecycle/cancelPersist.js';
import {
  assertCeremonyAbortable,
  signaturesForContract,
} from '../contracts/lifecycle/ceremonyAbortGuard.js';

function loadContract(db, contractId) {
  const row = (db.generatedContracts || []).find((item) => item.id === contractId);
  if (!row) throw new Error('Contrato não encontrado.');
  return row;
}

function guardCommon(user, contract, extra = {}) {
  const actor = assertLifecycleActor(user, extra);
  assertSensitiveLifecycleAuth(user, extra);
  const tenantId = assertLifecycleTenant(user, contract, extra);
  if (isImmutablePilotContract(contract)) {
    throw createLifecycleError(
      PILOT_IMMUTABLE,
      'Contrato piloto histórico não pode ser alterado.',
      extra,
    );
  }
  return { ...actor, tenantId };
}

function alreadyCancelledResult(contract, action) {
  return {
    ok: true,
    idempotent: true,
    alreadyCancelled: true,
    action,
    actedAt: contract.canceledAt || contract.abortedAt || null,
    previousState: contract.previousLifecycleState || null,
    newState: 'cancelled',
    contract,
  };
}

function throwIfLegallySigned(contract, contractId, action) {
  const normalized = normalizeContractLifecycleStatus(contract.status);
  if (normalized !== 'signed' && normalized !== 'voided' && normalized !== 'superseded') {
    return normalized;
  }
  if (action === LIFECYCLE_ACTIONS.ABORT_PARTIAL) {
    throw createLifecycleError(
      CEREMONY_NOT_ABORTABLE,
      'Cerimônia já completa não pode ser abortada.',
      { contractId, normalizedStatus: normalized, action },
    );
  }
  throw createLifecycleError(
    CANCEL_NOT_ALLOWED,
    'Contrato assinado não pode ser cancelado por este fluxo.',
    { contractId, normalizedStatus: normalized },
  );
}

export function cancelUnsignedContract(input = {}) {
  const {
    user, contractId, reason, reasonCode, financialAction, canceledByName,
  } = input;
  return withDb((db) => {
    const extra = { contractId, action: LIFECYCLE_ACTIONS.CANCEL_UNSIGNED };
    const current = loadContract(db, contractId);
    const actor = guardCommon(user, current, extra);
    const normalized = throwIfLegallySigned(current, contractId, extra.action);
    if (normalized === 'cancelled') return alreadyCancelledResult(current, extra.action);
    assertContractTransition(current.status, 'cancelled', extra.action, extra);
    if (signaturesForContract(db, contractId).length > 0) {
      throw createLifecycleError(
        CONTRACT_LIFECYCLE_TRANSITION_INVALID,
        'Contrato com assinatura exige ABORT_PARTIAL, não CANCEL_UNSIGNED.',
        { contractId, normalizedStatus: normalized, from: normalized, to: 'cancelled', action: extra.action },
      );
    }
    return persistCancelEffects(db, {
      current,
      actor,
      parsed: assertLegalReason({ reason, reasonCode }, extra),
      action: extra.action,
      eventType: LIFECYCLE_AUDIT_EVENTS.CONTRACT_CANCELLED,
      accessReason: 'contract_cancelled',
      financialAction,
      canceledByName,
    });
  });
}

export function abortPartialCeremony(input = {}) {
  const {
    user, contractId, reason, reasonCode, financialAction, canceledByName,
  } = input;
  return withDb((db) => {
    const extra = { contractId, action: LIFECYCLE_ACTIONS.ABORT_PARTIAL };
    const current = loadContract(db, contractId);
    const actor = guardCommon(user, current, extra);
    const normalized = throwIfLegallySigned(current, contractId, extra.action);
    if (normalized === 'cancelled') return alreadyCancelledResult(current, extra.action);
    const beforeIds = signaturesForContract(db, contractId).map((row) => row.id);
    assertCeremonyAbortable(db, current);
    assertContractTransition(current.status, 'cancelled', extra.action, extra);
    const result = persistCancelEffects(db, {
      current,
      actor,
      parsed: assertLegalReason({ reason, reasonCode }, extra),
      action: extra.action,
      eventType: LIFECYCLE_AUDIT_EVENTS.CEREMONY_ABORTED,
      accessReason: 'ceremony_aborted',
      financialAction,
      canceledByName,
    });
    const afterIds = signaturesForContract(db, contractId).map((row) => row.id);
    if (afterIds.length !== beforeIds.length || afterIds.some((id, i) => id !== beforeIds[i])) {
      throw createLifecycleError(CEREMONY_NOT_ABORTABLE, 'Abort não pode mutar assinaturas existentes.', extra);
    }
    return result;
  });
}

export function revokeSigningAccess(input = {}) {
  const {
    user, contractId, requestId, signLinkId = null, reason, reasonCode,
  } = input;
  return withDb((db) => {
    if (!contractId || !requestId) {
      throw createLifecycleError(
        SIGNING_ACCESS_BINDING_INVALID,
        'Revogação exige contractId e requestId vinculados.',
        { contractId, requestId, linkId: signLinkId },
      );
    }
    const extra = {
      contractId, requestId, linkId: signLinkId, action: LIFECYCLE_ACTIONS.REVOKE_SIGNING_ACCESS,
    };
    const current = loadContract(db, contractId);
    const actor = guardCommon(user, current, extra);
    const preview = findBoundRequest(db, { contractId, requestId });
    assertLifecycleTenant(user, preview, extra);
    const boundLinks = findBoundLinks(db, { contractId, requestId, signLinkId });
    boundLinks.forEach((link) => assertLifecycleTenant(user, link, extra));
    const parsed = assertLegalReason({ reason, reasonCode }, extra);
    const actedAt = new Date().toISOString();
    const access = revokeBoundAccess(db, {
      contractId,
      requestId,
      signLinkId,
      now: actedAt,
      actorUserId: actor.actorUserId,
      reason: parsed.reasonText,
      reasonCode: parsed.reasonCode,
      parentAction: extra.action,
    });
    if (!access.alreadyRevoked) {
      appendAccessRevocationAudits(db, {
        tenantId: actor.tenantId || entityTenantId(current),
        contractId,
        actorId: actor.actorUserId,
        actorRole: actor.actorRole,
        actedAt,
        reason: parsed.reasonText,
        reasonCode: parsed.reasonCode,
        parentAction: extra.action,
        requests: access.requestChanged ? [access.request] : [],
        links: access.changedLinks,
      });
    }
    return {
      ok: true,
      idempotent: access.alreadyRevoked,
      action: extra.action,
      actedAt: access.alreadyRevoked
        ? (access.request.revokedAt || access.request.cancelledAt || null)
        : actedAt,
      contract: current,
      request: access.request,
      links: access.links,
    };
  });
}

export function dispatchCancelOrAbort(input = {}) {
  const db = loadDb();
  const current = (db.generatedContracts || []).find((row) => row.id === input.contractId);
  if (!current) throw new Error('Contrato não encontrado.');
  const extra = { contractId: input.contractId };
  assertLifecycleActor(input.user, extra);
  assertSensitiveLifecycleAuth(input.user, extra);
  const action = resolveCancelOrAbortAction({
    status: current.status,
    signatureCount: signaturesForContract(db, input.contractId).length,
  });
  if (action === LIFECYCLE_ACTIONS.ABORT_PARTIAL) return abortPartialCeremony(input);
  return cancelUnsignedContract(input);
}
