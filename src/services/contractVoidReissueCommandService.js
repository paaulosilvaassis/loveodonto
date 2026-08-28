/**
 * PHASE_10.23F — VOID_SIGNED + REISSUE (novo contractId) + SUPERSEDE interno.
 * createContractNewVersion permanece bloqueado (mutação in-place).
 */
import { withDb } from '../db/index.js';
import { isImmutablePilotContract } from '../contracts/remoteSignatureEvidence.js';
import {
  LIFECYCLE_ACTIONS,
  LIFECYCLE_AUDIT_EVENTS,
  PILOT_IMMUTABLE,
  REISSUE_NOT_ALLOWED,
  SUPERSEDE_REFERENCE_REQUIRED,
  VOID_NOT_ALLOWED,
  assertContractTransition,
  assertLegalHighImpactAuth,
  assertLegalReason,
  assertLifecycleActor,
  assertLifecycleTenant,
  assertReissueIdentities,
  createLifecycleError,
  entityTenantId,
  normalizeContractLifecycleStatus,
} from '../contracts/lifecycle/index.js';
import { appendLifecycleAudit } from '../contracts/lifecycle/lifecycleAudit.js';
import {
  allocateSuccessorIdentity,
  applySupersededContract,
  applyVoidedContract,
  buildSuccessorDraft,
  nextContractNumber,
  successorExists,
} from '../contracts/lifecycle/voidReissuePersist.js';

function loadContract(db, contractId) {
  const row = (db.generatedContracts || []).find((item) => item.id === contractId);
  if (!row) throw new Error('Contrato não encontrado.');
  return row;
}

function replaceContract(db, next) {
  const arr = db.generatedContracts || [];
  const idx = arr.findIndex((row) => row.id === next.id);
  if (idx < 0) throw new Error('Contrato não encontrado.');
  arr[idx] = next;
}

function guardLegalHigh(user, contract, extra) {
  const actor = assertLifecycleActor(user, extra);
  assertLegalHighImpactAuth(user, extra);
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

function assertReissueSource(normalized, extra) {
  if (normalized === 'generated' || normalized === 'partially_signed' || normalized === 'draft') {
    throw createLifecycleError(
      REISSUE_NOT_ALLOWED,
      'Reissue exige fonte cancelled, voided ou signed (via void atômico).',
      extra,
    );
  }
  if (normalized !== 'signed' && normalized !== 'voided' && normalized !== 'cancelled') {
    throw createLifecycleError(
      REISSUE_NOT_ALLOWED,
      'Estado de origem não admite reissue.',
      extra,
    );
  }
}

function voidSourceIfSigned(db, source, { actor, parsed, actedAt, extra }) {
  if (normalizeContractLifecycleStatus(source.status) !== 'signed') return source;
  assertContractTransition(source.status, 'voided', LIFECYCLE_ACTIONS.VOID_SIGNED, extra);
  const current = applyVoidedContract(source, {
    actedAt,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    actorName: actor.actorName,
    reasonText: parsed.reasonText,
    reasonCode: parsed.reasonCode,
  });
  appendLifecycleAudit(db, {
    tenantId: actor.tenantId || entityTenantId(current),
    contractId: source.id,
    actorId: actor.actorUserId,
    actorRole: actor.actorRole,
    actedAt,
    eventType: LIFECYCLE_AUDIT_EVENTS.CONTRACT_VOIDED,
    reason: parsed.reasonText,
    reasonCode: parsed.reasonCode,
    previousState: 'signed',
    newState: 'voided',
    parentAction: extra.action,
  });
  return current;
}

function persistSuccessor(db, source, current, { actor, parsed, actedAt, extra, originState }) {
  const identity = allocateSuccessorIdentity(source);
  assertReissueIdentities({
    oldContractId: source.id,
    newContractId: identity.newId,
    oldManifestId: source.metadata?.packageManifestId || source.packageManifestId || null,
    newManifestId: null,
  });
  const successor = buildSuccessorDraft(source, {
    newId: identity.newId,
    contractNumber: nextContractNumber(db),
    version: identity.version,
    actedAt,
    actorUserId: actor.actorUserId,
  });
  if (!successor.id || successor.id === source.id) {
    throw createLifecycleError(SUPERSEDE_REFERENCE_REQUIRED, 'Reissue exige newContractId.', extra);
  }
  assertContractTransition(current.status, 'superseded', LIFECYCLE_ACTIONS.SUPERSEDE, extra);
  const superseded = applySupersededContract(current, {
    actedAt,
    actorUserId: actor.actorUserId,
    newContractId: successor.id,
  });
  replaceContract(db, superseded);
  db.generatedContracts.push(successor);
  appendLifecycleAudit(db, {
    tenantId: actor.tenantId || entityTenantId(superseded),
    contractId: source.id,
    actorId: actor.actorUserId,
    actorRole: actor.actorRole,
    actedAt,
    eventType: LIFECYCLE_AUDIT_EVENTS.CONTRACT_SUPERSEDED,
    reason: parsed.reasonText,
    reasonCode: parsed.reasonCode,
    previousState: normalizeContractLifecycleStatus(current.status),
    newState: 'superseded',
    parentAction: extra.action,
    relatedContractId: successor.id,
  });
  appendLifecycleAudit(db, {
    tenantId: actor.tenantId || entityTenantId(successor),
    contractId: successor.id,
    actorId: actor.actorUserId,
    actorRole: actor.actorRole,
    actedAt,
    eventType: LIFECYCLE_AUDIT_EVENTS.CONTRACT_REISSUED,
    reason: parsed.reasonText,
    reasonCode: parsed.reasonCode,
    previousState: originState,
    newState: 'draft',
    parentAction: extra.action,
    relatedContractId: source.id,
  });
  return { superseded, successor };
}

export function voidSignedContract(input = {}) {
  const { user, contractId, reason, reasonCode } = input;
  return withDb((db) => {
    const extra = { contractId, action: LIFECYCLE_ACTIONS.VOID_SIGNED };
    const current = loadContract(db, contractId);
    const actor = guardLegalHigh(user, current, extra);
    const normalized = normalizeContractLifecycleStatus(current.status);
    if (normalized === 'voided') {
      return {
        ok: true,
        idempotent: true,
        alreadyVoided: true,
        action: extra.action,
        actedAt: current.voidedAt || null,
        previousState: current.previousLifecycleState || 'signed',
        newState: 'voided',
        contract: current,
      };
    }
    if (normalized !== 'signed') {
      throw createLifecycleError(
        VOID_NOT_ALLOWED,
        'Somente contrato assinado pode ser invalidado (void).',
        { contractId, normalizedStatus: normalized, action: extra.action },
      );
    }
    const parsed = assertLegalReason({ reason, reasonCode }, extra);
    const actedAt = new Date().toISOString();
    assertContractTransition(current.status, 'voided', extra.action, extra);
    const next = applyVoidedContract(current, {
      actedAt,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      actorName: actor.actorName,
      reasonText: parsed.reasonText,
      reasonCode: parsed.reasonCode,
    });
    replaceContract(db, next);
    appendLifecycleAudit(db, {
      tenantId: actor.tenantId || entityTenantId(next),
      contractId,
      actorId: actor.actorUserId,
      actorRole: actor.actorRole,
      actedAt,
      eventType: LIFECYCLE_AUDIT_EVENTS.CONTRACT_VOIDED,
      reason: parsed.reasonText,
      reasonCode: parsed.reasonCode,
      previousState: next.previousLifecycleState,
      newState: 'voided',
      parentAction: extra.action,
    });
    return {
      ok: true,
      idempotent: false,
      action: extra.action,
      actedAt,
      previousState: next.previousLifecycleState,
      newState: 'voided',
      contract: next,
    };
  });
}

export function reissueContract(input = {}) {
  const { user, contractId, reason, reasonCode } = input;
  return withDb((db) => {
    const extra = { contractId, action: LIFECYCLE_ACTIONS.REISSUE, failureCode: REISSUE_NOT_ALLOWED };
    const source = loadContract(db, contractId);
    const actor = guardLegalHigh(user, source, extra);
    const parsed = assertLegalReason({ reason, reasonCode }, extra);
    const normalized = normalizeContractLifecycleStatus(source.status);
    const existing = successorExists(db, source);
    if (normalized === 'superseded' && existing) {
      return {
        ok: true,
        idempotent: true,
        alreadyReissued: true,
        action: extra.action,
        actedAt: source.supersededAt || source.voidedAt || null,
        previousState: 'superseded',
        newState: 'superseded',
        contract: source,
        newContract: existing,
      };
    }
    if (normalized === 'superseded') {
      throw createLifecycleError(REISSUE_NOT_ALLOWED, 'Contrato superseded sem sucessor persistido.', extra);
    }
    assertReissueSource(normalized, { ...extra, normalizedStatus: normalized });
    const actedAt = new Date().toISOString();
    const current = voidSourceIfSigned(db, source, { actor, parsed, actedAt, extra });
    const { superseded, successor } = persistSuccessor(db, source, current, {
      actor, parsed, actedAt, extra, originState: normalized,
    });
    return {
      ok: true,
      idempotent: false,
      action: extra.action,
      actedAt,
      previousState: normalized,
      newState: 'superseded',
      contract: superseded,
      newContract: successor,
    };
  });
}
