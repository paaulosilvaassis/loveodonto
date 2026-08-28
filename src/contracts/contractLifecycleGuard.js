/**
 * PHASE_10.23C — fronteira de normalização e fail-closed de signability.
 * Não reescreve rows históricas. Sem secrets no erro.
 */

export const CONTRACT_NOT_SIGNABLE = 'CONTRACT_NOT_SIGNABLE';
export const SIGNED_CONTRACT_IMMUTABLE = 'SIGNED_CONTRACT_IMMUTABLE';
export const PILOT_IMMUTABLE = 'PILOT_IMMUTABLE';
export const CANCEL_NOT_ALLOWED = 'CANCEL_NOT_ALLOWED';

export const SIGNABLE_CONTRACT_STATES = Object.freeze(['generated', 'partially_signed']);

export const TERMINAL_CONTRACT_STATES = Object.freeze([
  'cancelled',
  'signed',
  'voided',
  'superseded',
]);

const STATUS_ALIASES = {
  canceled: 'cancelled',
  cancelled: 'cancelled',
  replaced: 'superseded',
  superseded: 'superseded',
  completed: 'signed',
  signed: 'signed',
  vigente: 'signed',
  voided: 'voided',
  draft: 'draft',
  generated: 'generated',
  sent: 'generated',
  viewed: 'generated',
  ready_to_send: 'generated',
  awaiting_data: 'draft',
  signed_by_clinic: 'partially_signed',
  signed_by_patient: 'partially_signed',
  partially_signed: 'partially_signed',
};

export function createLifecycleError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  if (extra.contractId) err.contractId = extra.contractId;
  if (extra.normalizedStatus) err.normalizedStatus = extra.normalizedStatus;
  return err;
}

export function normalizeContractLifecycleStatus(rawStatus) {
  if (rawStatus == null) return 'unknown';
  const key = String(rawStatus).trim().toLowerCase();
  if (!key) return 'unknown';
  return STATUS_ALIASES[key] || 'unknown';
}

export function isContractSignable(contract) {
  if (!contract) return false;
  const normalizedStatus = normalizeContractLifecycleStatus(contract.status);
  return SIGNABLE_CONTRACT_STATES.includes(normalizedStatus);
}

export function assertContractSignable(contract) {
  if (!contract) {
    throw createLifecycleError(CONTRACT_NOT_SIGNABLE, 'Contrato não encontrado.', {
      normalizedStatus: 'unknown',
    });
  }
  const normalizedStatus = normalizeContractLifecycleStatus(contract.status);
  if (SIGNABLE_CONTRACT_STATES.includes(normalizedStatus)) return contract;
  const message = normalizedStatus === 'draft'
    ? 'Não é possível assinar contrato em rascunho. Finalize o contrato primeiro.'
    : normalizedStatus === 'signed'
      ? 'Contrato já assinado.'
      : 'Contrato não está assinável.';
  throw createLifecycleError(CONTRACT_NOT_SIGNABLE, message, {
    contractId: contract.id || null,
    normalizedStatus,
  });
}

export function assertInPlaceReissueBlocked(contract) {
  if (!contract) throw new Error('Contrato não encontrado.');
  const normalizedStatus = normalizeContractLifecycleStatus(contract.status);
  throw createLifecycleError(
    SIGNED_CONTRACT_IMMUTABLE,
    'Contratos assinados não podem ser alterados. A reemissão jurídica será feita por um novo contrato.',
    { contractId: contract.id || null, normalizedStatus },
  );
}

export function isCancelableLifecycleStatus(rawStatus) {
  const normalized = normalizeContractLifecycleStatus(rawStatus);
  return normalized === 'draft'
    || normalized === 'generated'
    || normalized === 'partially_signed';
}

export function contractHasFinalSignedArtifact(contract, attachments = []) {
  if (!contract) return false;
  const md = contract.metadata || {};
  if (md.finalArtifactStatus === 'generated') {
    if (contract.pdfUrl || contract.signedPdfUrl || md.finalArtifactAttachmentId) return true;
  }
  const rows = (attachments || []).filter((row) => row.contractId === contract.id);
  if (rows.some((row) => row.source === 'final_signed_artifact' || row.immutable === true)) {
    return true;
  }
  const normalized = normalizeContractLifecycleStatus(contract.status);
  const legallySigned = normalized === 'signed'
    || normalized === 'voided'
    || normalized === 'superseded';
  return Boolean(legallySigned && (contract.pdfUrl || contract.signedPdfUrl));
}
