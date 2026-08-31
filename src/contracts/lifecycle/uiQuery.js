/**
 * Snapshot de leitura do acesso remoto e linhagem. Sem mutação.
 */
import { loadDb } from '../../db/index.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';
import { findPatientSlotRequest, listSignableLinks } from './accessRotation.js';
import { normalizeContractLifecycleStatus } from './normalize.js';

function clinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

function findContract(id) {
  if (!id) return null;
  return (loadDb().generatedContracts || []).find((row) => row.id === id) || null;
}

export function getSigningAccessSnapshot(contractId, trustedNow = Date.now()) {
  const db = loadDb();
  const request = findPatientSlotRequest(db, contractId)
    || (db.contractSignatureRequests || [])
      .filter((row) => row.contractId === contractId)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]
    || null;
  const links = (db.contractSignLinks || []).filter((row) => {
    if (row.contractId !== contractId) return false;
    if (request?.id) return row.requestId === request.id;
    return true;
  });
  const signable = request ? listSignableLinks(db, request.id, trustedNow)[0] : null;
  const latest = [...links].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  return { request, link: signable || latest || null };
}

export function describeContractLineage(contract) {
  if (!contract) return { predecessor: null, successor: null };
  const successorId = contract.replacedById || contract.supersededByContractId || null;
  const predecessorId = contract.previousContractId || contract.reissuedFromContractId || null;
  const successor = findContract(successorId);
  const predecessor = findContract(predecessorId);
  return {
    predecessor: predecessor
      ? {
        id: predecessor.id,
        number: formatFriendlyContractNumber(predecessor.contractNumber, 1),
      }
      : null,
    successor: successor
      ? {
        id: successor.id,
        number: formatFriendlyContractNumber(successor.contractNumber, 1),
      }
      : null,
  };
}

const ARCHIVE_STATES = new Set([
  'signed', 'completed', 'vigente', 'voided', 'superseded', 'replaced', 'cancelled', 'canceled',
]);

export function listLifecycleArchiveContracts() {
  const cid = clinicId();
  return (loadDb().generatedContracts || [])
    .filter((row) => row.clinicId === cid && ARCHIVE_STATES.has(row.status))
    .sort((a, b) => new Date(b.signedAt || b.generatedAt || 0) - new Date(a.signedAt || a.generatedAt || 0));
}

export function listLifecycleAudits(contractId) {
  return (loadDb().contractLifecycleAudits || [])
    .filter((row) => row.contractId === contractId)
    .sort((a, b) => new Date(b.actedAt || b.createdAt || 0) - new Date(a.actedAt || a.createdAt || 0));
}

export function isCanonicalLifecycleState(status) {
  const normalized = normalizeContractLifecycleStatus(status);
  return normalized !== 'unknown';
}
