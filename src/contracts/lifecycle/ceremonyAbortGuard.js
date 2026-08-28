/**
 * Abort só é legal em cerimônia parcial incompleta.
 */
import { evaluateSignatureCeremony } from '../clinicalSignatureCeremony.js';
import { CEREMONY_NOT_ABORTABLE } from './constants.js';
import { createLifecycleError } from './errors.js';
import { normalizeCeremonyState, normalizeContractLifecycleStatus } from './normalize.js';

export function signaturesForContract(db, contractId) {
  return (db.contractSignatures || []).filter((row) => row.contractId === contractId);
}

export function isCeremonyComplete(db, contract) {
  const normalized = normalizeContractLifecycleStatus(contract?.status);
  if (normalized === 'signed' || normalized === 'voided' || normalized === 'superseded') {
    return true;
  }
  const persisted = normalizeCeremonyState(contract?.metadata?.signatureCeremony?.status);
  if (persisted === 'signed' || persisted === 'legacy_signed') return true;
  const ceremony = evaluateSignatureCeremony({
    contractId: contract?.id,
    tenantId: contract?.tenant_id || contract?.tenantId || null,
    patientId: contract?.patientId || null,
    budgetId: contract?.quoteId || null,
  });
  return ceremony.allRequiredSatisfied === true;
}

export function assertCeremonyAbortable(db, contract) {
  const contractId = contract?.id || null;
  const normalized = normalizeContractLifecycleStatus(contract?.status);
  if (normalized !== 'partially_signed') {
    throw createLifecycleError(
      CEREMONY_NOT_ABORTABLE,
      'Abort só é permitido em contrato partially_signed.',
      { contractId, normalizedStatus: normalized, action: 'ABORT_PARTIAL' },
    );
  }
  const signatures = signaturesForContract(db, contractId);
  if (signatures.length < 1) {
    throw createLifecycleError(
      CEREMONY_NOT_ABORTABLE,
      'Abort exige ao menos uma assinatura persistida.',
      { contractId, normalizedStatus: normalized, action: 'ABORT_PARTIAL' },
    );
  }
  if (isCeremonyComplete(db, contract)) {
    throw createLifecycleError(
      CEREMONY_NOT_ABORTABLE,
      'Cerimônia já completa não pode ser abortada.',
      { contractId, normalizedStatus: normalized, action: 'ABORT_PARTIAL' },
    );
  }
  return signatures;
}
