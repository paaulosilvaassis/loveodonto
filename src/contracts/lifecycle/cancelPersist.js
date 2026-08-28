import { LIFECYCLE_ACTIONS } from './constants.js';
import { normalizeContractLifecycleStatus } from './normalize.js';
import { revokeAccessForContract } from './accessRevocation.js';
import { appendAccessRevocationAudits, appendLifecycleAudit } from './lifecycleAudit.js';
import { entityTenantId } from './commandAuth.js';

const LIVE_CANCELLED = 'canceled';

export function applyCancelledContract(current, ctx) {
  const previousCanonical = normalizeContractLifecycleStatus(current.status);
  const metadata = { ...(current.metadata || {}) };
  if (ctx.action === LIFECYCLE_ACTIONS.ABORT_PARTIAL) {
    metadata.signatureCeremony = {
      ...(metadata.signatureCeremony || {}),
      status: 'aborted',
      abortedAt: ctx.actedAt,
      abortedBy: ctx.actorUserId,
      abortReason: ctx.reasonText,
    };
  }
  return {
    ...current,
    status: LIVE_CANCELLED,
    canceledAt: ctx.actedAt,
    cancelReason: ctx.reasonText,
    canceledBy: ctx.actorUserId,
    canceledByName: ctx.actorName || null,
    canceledByRole: ctx.actorRole || null,
    cancelFinancialAction: ctx.financialAction || current.cancelFinancialAction || null,
    cancelLifecycleAction: ctx.action,
    cancelReasonCode: ctx.reasonCode || null,
    previousLifecycleState: previousCanonical,
    ...(ctx.action === LIFECYCLE_ACTIONS.ABORT_PARTIAL ? {
      abortedAt: ctx.actedAt,
      abortedBy: ctx.actorUserId,
      abortReason: ctx.reasonText,
    } : {}),
    metadata,
  };
}

export function persistCancelEffects(db, {
  current,
  actor,
  parsed,
  action,
  eventType,
  accessReason,
  financialAction,
  canceledByName,
}) {
  const actedAt = new Date().toISOString();
  const next = applyCancelledContract(current, {
    actedAt,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    actorName: canceledByName || actor.actorName,
    reasonText: parsed.reasonText,
    reasonCode: parsed.reasonCode,
    action,
    financialAction,
  });
  const access = revokeAccessForContract(db, {
    contractId: current.id,
    now: actedAt,
    actorUserId: actor.actorUserId,
    reason: accessReason,
    reasonCode: parsed.reasonCode,
    parentAction: action,
  });
  const arr = db.generatedContracts || [];
  const idx = arr.findIndex((row) => row.id === next.id);
  if (idx < 0) throw new Error('Contrato não encontrado.');
  arr[idx] = next;
  const tenantId = actor.tenantId || entityTenantId(next);
  appendLifecycleAudit(db, {
    tenantId,
    contractId: current.id,
    actorId: actor.actorUserId,
    actorRole: actor.actorRole,
    actedAt,
    eventType,
    reason: parsed.reasonText,
    reasonCode: parsed.reasonCode,
    previousState: next.previousLifecycleState,
    newState: 'cancelled',
    parentAction: action,
  });
  appendAccessRevocationAudits(db, {
    tenantId,
    contractId: current.id,
    actorId: actor.actorUserId,
    actorRole: actor.actorRole,
    actedAt,
    reason: parsed.reasonText,
    reasonCode: parsed.reasonCode,
    parentAction: action,
    requests: access.revokedRequests,
    links: access.revokedLinks,
  });
  return {
    ok: true,
    idempotent: false,
    action,
    actedAt,
    previousState: next.previousLifecycleState,
    newState: 'cancelled',
    contract: next,
  };
}
