import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';

function clinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

function tenantIdFromUser(user) {
  return user?.tenantId || user?.tenant_id || null;
}

/**
 * Registra evento na trilha jurídica de assinatura.
 */
export function logSignatureAudit({
  contractId,
  requestId = null,
  action,
  user = null,
  payload = {},
}) {
  if (!contractId || !action) return null;

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
    createdAt: new Date().toISOString(),
  };

  return withDb((db) => {
    if (!Array.isArray(db.contractSignatureAudits)) db.contractSignatureAudits = [];
    db.contractSignatureAudits.push(entry);
    return entry;
  });
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
