import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';

function clinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

function tenantIdFromUser(user) {
  return user?.tenantId || user?.tenant_id || null;
}

/**
 * Registra evento na trilha jurídica de assinatura (append-only).
 * request_created é idempotente por requestId.
 * email_sent é idempotente por requestId+messageId; resend com novo messageId gera novo evento.
 */
export function logSignatureAudit({
  contractId,
  requestId = null,
  action,
  user = null,
  payload = {},
  idempotencyKey = null,
}) {
  if (!contractId || !action) return null;

  const derivedKey = idempotencyKey
    || deriveAuditIdempotencyKey({ action, requestId, payload });

  const entry = {
    id: createId('csaud'),
    tenant_id: tenantIdFromUser(user),
    clinicId: clinicId(),
    contractId,
    requestId,
    action,
    userId: user?.id || null,
    userName: user?.name || user?.nome || null,
    ipAddress: payload.ipAddress || '',
    platform: payload.platform || payload.provider || '',
    recipientEmail: payload.recipientEmail || '',
    signerCpf: payload.signerCpf || '',
    authMethod: payload.authMethod || '',
    documentHash: payload.documentHash || '',
    externalId: payload.externalId || '',
    certificateUrl: payload.certificateUrl || '',
    metadata: payload.metadata || {},
    idempotencyKey: derivedKey || null,
    createdAt: new Date().toISOString(),
  };

  return withDb((db) => {
    if (!Array.isArray(db.contractSignatureAudits)) db.contractSignatureAudits = [];
    if (derivedKey) {
      const existing = db.contractSignatureAudits.find((row) => row.idempotencyKey === derivedKey);
      if (existing) return existing;
    }
    db.contractSignatureAudits.push(entry);
    return entry;
  });
}

function deriveAuditIdempotencyKey({ action, requestId, payload }) {
  if (!requestId) return null;
  if (action === 'request_created') return `request_created:${requestId}`;
  if (action === 'email_sent') {
    const messageId = payload?.metadata?.messageId || payload?.externalId || '';
    if (!messageId) return null;
    return `email_sent:${requestId}:${messageId}`;
  }
  return null;
}

export function listSignatureAudits(contractId) {
  const db = loadDb();
  return (db.contractSignatureAudits || [])
    .filter((entry) => entry.contractId === contractId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getLatestSignatureRequest(contractId) {
  const db = loadDb();
  return (db.contractSignatureRequests || [])
    .filter((req) => req.contractId === contractId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}
