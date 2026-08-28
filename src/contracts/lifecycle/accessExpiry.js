/**
 * Persistência lazy de expired. Relógio (expiresAt) é a fonte de verdade.
 * Não promove o contrato. Não apaga rows. Sem token em audit.
 */
import { withDb } from '../../db/index.js';
import { LINK_LIFECYCLE_STATES, LIFECYCLE_AUDIT_EVENTS } from './constants.js';
import { isAccessExpired } from './accessGuards.js';
import { normalizeLinkLifecycleStatus, normalizeRequestLifecycleStatus } from './normalize.js';
import { appendLifecycleAudit } from './lifecycleAudit.js';

function replaceById(arr, next) {
  const idx = arr.findIndex((row) => row.id === next.id);
  if (idx >= 0) arr[idx] = next;
}

function expireLinkRow(row, { now }) {
  const status = normalizeLinkLifecycleStatus(row?.status);
  if (!row || status === 'expired' || status === 'revoked' || status === 'signed') {
    return { row, changed: false };
  }
  if (status !== LINK_LIFECYCLE_STATES.PENDING) return { row, changed: false };
  return {
    changed: true,
    row: {
      ...row,
      status: 'expired',
      expiredAt: now,
      previousStatus: row.status,
    },
  };
}

function expireRequestRow(row, { now }) {
  const status = normalizeRequestLifecycleStatus(row?.status);
  if (!row || status === 'expired' || status === 'revoked' || status === 'completed') {
    return { row, changed: false };
  }
  if (status !== 'pending' && status !== 'sent') return { row, changed: false };
  return {
    changed: true,
    row: {
      ...row,
      status: 'expired',
      expiredAt: now,
      previousStatus: row.status,
    },
  };
}

function matchesScope(row, { contractId, requestId, linkId, token }) {
  if (token && row.token === token) return true;
  if (linkId && row.id === linkId) return true;
  if (requestId && (row.id === requestId || row.requestId === requestId)) return true;
  if (contractId && row.contractId === contractId) return true;
  return !contractId && !requestId && !linkId && !token;
}

function auditExpiredLink(db, link, {
  tenantId, actorId, actorRole, actedAt, contractId,
}) {
  appendLifecycleAudit(db, {
    tenantId: tenantId || link.tenant_id || link.tenantId || null,
    contractId: contractId || link.contractId,
    actorId: actorId || 'system',
    actorRole: actorRole || 'system',
    actedAt,
    eventType: LIFECYCLE_AUDIT_EVENTS.SIGN_LINK_EXPIRED,
    previousState: link.previousStatus || 'pending',
    newState: 'expired',
    requestId: link.requestId || null,
    linkId: link.id,
    parentAction: 'EXPIRE_SIGNING_ACCESS',
  });
}

export function persistClockExpiredAccess(db, {
  contractId = null,
  requestId = null,
  linkId = null,
  token = null,
  trustedNow = Date.now(),
  actorId = 'system',
  actorRole = 'system',
  tenantId = null,
} = {}) {
  const nowIso = new Date(trustedNow).toISOString();
  const expiredLinks = [];
  const expiredRequests = [];
  const requests = db.contractSignatureRequests || [];
  const links = db.contractSignLinks || [];

  for (let i = 0; i < requests.length; i += 1) {
    const row = requests[i];
    if (!matchesScope(row, { contractId, requestId, linkId: null, token: null })) continue;
    if (!isAccessExpired(row.expiresAt, trustedNow)) continue;
    const next = expireRequestRow(row, { now: nowIso });
    requests[i] = next.row;
    if (next.changed) expiredRequests.push(next.row);
  }

  const requestExpiredIds = new Set(expiredRequests.map((row) => row.id));

  for (let i = 0; i < links.length; i += 1) {
    const row = links[i];
    if (!matchesScope(row, { contractId, requestId, linkId, token })) continue;
    const requestClockDead = requestExpiredIds.has(row.requestId)
      || requests.some((req) => req.id === row.requestId && isAccessExpired(req.expiresAt, trustedNow));
    if (!isAccessExpired(row.expiresAt, trustedNow) && !requestClockDead) continue;
    const next = expireLinkRow(row, { now: nowIso });
    links[i] = next.row;
    if (next.changed) {
      expiredLinks.push(next.row);
      auditExpiredLink(db, next.row, {
        tenantId, actorId, actorRole, actedAt: nowIso, contractId,
      });
    }
  }

  expiredRequests.forEach((row) => replaceById(requests, row));
  return {
    expiredRequests,
    expiredLinks,
    alreadyExpired: expiredRequests.length === 0 && expiredLinks.length === 0,
    actedAt: nowIso,
  };
}

export function persistExpiredSigningAccess(input = {}) {
  return withDb((db) => persistClockExpiredAccess(db, input));
}
