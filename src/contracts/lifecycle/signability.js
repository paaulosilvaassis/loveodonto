import {
  CONTRACT_NOT_SIGNABLE,
  SIGNABLE_CONTRACT_STATES,
  SIGNED_CONTRACT_IMMUTABLE,
} from './constants.js';
import { createLifecycleError } from './errors.js';
import { normalizeContractLifecycleStatus } from './normalize.js';

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
