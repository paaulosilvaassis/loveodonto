/**
 * Append-only de eventos jurídicos 10.23E. Sem token, senha ou PII desnecessária.
 */
import { createId } from '../../services/helpers.js';
import { LIFECYCLE_AUDIT_EVENTS } from './constants.js';

export { LIFECYCLE_AUDIT_EVENTS };

export function appendLifecycleAudit(db, event) {
  if (!Array.isArray(db.contractLifecycleAudits)) db.contractLifecycleAudits = [];
  if (!Array.isArray(db.contractAuditLogs)) db.contractAuditLogs = [];
  const row = {
    id: createId('claud'),
    tenantId: event.tenantId || null,
    tenant_id: event.tenantId || null,
    clinicId: event.clinicId || db.clinicProfile?.id || null,
    contractId: event.contractId,
    actorId: event.actorId,
    actorRole: event.actorRole || null,
    actedAt: event.actedAt,
    eventType: event.eventType,
    action: event.eventType,
    reason: event.reason || null,
    reasonCode: event.reasonCode || null,
    previousState: event.previousState || null,
    newState: event.newState || null,
    requestId: event.requestId || null,
    linkId: event.linkId || null,
    relatedContractId: event.relatedContractId || null,
    oldLinkId: event.oldLinkId || null,
    newLinkId: event.newLinkId || null,
    deliveryAttemptId: event.deliveryAttemptId || null,
    parentAction: event.parentAction || null,
    createdAt: event.actedAt,
  };
  db.contractLifecycleAudits.push(row);
  db.contractAuditLogs.push({
    id: createId('cadt'),
    clinicId: row.clinicId,
    contractId: row.contractId,
    action: row.eventType,
    userId: row.actorId,
    metadata: {
      reason: row.reason,
      reasonCode: row.reasonCode,
      previousState: row.previousState,
      newState: row.newState,
      requestId: row.requestId,
      linkId: row.linkId,
      parentAction: row.parentAction,
      relatedContractId: row.relatedContractId,
      oldLinkId: row.oldLinkId,
      newLinkId: row.newLinkId,
      deliveryAttemptId: row.deliveryAttemptId,
      actedAt: row.actedAt,
    },
    createdAt: event.actedAt,
  });
  return row;
}

export function appendAccessRevocationAudits(db, {
  tenantId,
  clinicId,
  contractId,
  actorId,
  actorRole,
  actedAt,
  reason,
  reasonCode,
  parentAction,
  requests = [],
  links = [],
}) {
  requests.forEach((request) => {
    appendLifecycleAudit(db, {
      tenantId,
      clinicId,
      contractId,
      actorId,
      actorRole,
      actedAt,
      eventType: LIFECYCLE_AUDIT_EVENTS.SIGN_REQUEST_REVOKED,
      reason,
      reasonCode,
      previousState: request.previousStatus || 'pending',
      newState: 'revoked',
      requestId: request.id,
      parentAction,
    });
  });
  links.forEach((link) => {
    appendLifecycleAudit(db, {
      tenantId,
      clinicId,
      contractId,
      actorId,
      actorRole,
      actedAt,
      eventType: LIFECYCLE_AUDIT_EVENTS.SIGN_LINK_REVOKED,
      reason,
      reasonCode,
      previousState: link.previousStatus || 'pending',
      newState: 'revoked',
      requestId: link.requestId || null,
      linkId: link.id,
      parentAction,
    });
  });
}
