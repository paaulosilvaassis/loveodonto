/**
 * @module domain/contracts/signatures/signature-signer-status.machine
 * @description State machine pura de signatários — Phase 10.6.
 */

import { createContractDomainError, type ContractDomainError } from '../contract.errors.js';
import type { SignatureSignerStatus } from './signature.types.js';

export const ALLOWED_SIGNER_TRANSITIONS: Readonly<
  Record<SignatureSignerStatus, readonly SignatureSignerStatus[]>
> = {
  PENDING: ['INVITED', 'CANCELLED'],
  INVITED: [
    'DELIVERED', 'VIEWED', 'AUTHENTICATED', 'SIGNED',
    'DECLINED', 'EXPIRED', 'FAILED', 'CANCELLED',
  ],
  DELIVERED: [
    'VIEWED', 'AUTHENTICATED', 'SIGNED',
    'DECLINED', 'EXPIRED', 'FAILED', 'CANCELLED',
  ],
  VIEWED: [
    'AUTHENTICATED', 'SIGNED',
    'DECLINED', 'EXPIRED', 'FAILED', 'CANCELLED',
  ],
  AUTHENTICATED: [
    'SIGNED', 'DECLINED', 'EXPIRED', 'FAILED', 'CANCELLED',
  ],
  SIGNED: [],
  DECLINED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export interface SignerTransitionResult {
  allowed: boolean;
  from: SignatureSignerStatus;
  to: SignatureSignerStatus;
  errors: ContractDomainError[];
}

export function canTransitionSignerStatus(
  from: SignatureSignerStatus,
  to: SignatureSignerStatus,
): SignerTransitionResult {
  const allowed = (ALLOWED_SIGNER_TRANSITIONS[from] || []).includes(to);
  return {
    allowed,
    from,
    to,
    errors: allowed ? [] : [createContractDomainError(
      'INVALID_STATUS_TRANSITION',
      `Transição de signatário ${from} → ${to} não permitida.`,
      'status',
    )],
  };
}

export function isTerminalSignerStatus(status: SignatureSignerStatus): boolean {
  return ['SIGNED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'FAILED'].includes(status);
}
