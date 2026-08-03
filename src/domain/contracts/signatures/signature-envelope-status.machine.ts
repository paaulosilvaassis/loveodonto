/**
 * @module domain/contracts/signatures/signature-envelope-status.machine
 * @description State machine pura de envelopes — Phase 10.6.
 */

import { createContractDomainError, type ContractDomainError } from '../contract.errors.js';
import {
  isTerminalEnvelopeStatus,
  type SignatureEnvelopeStatus,
} from './signature.types.js';

export const ALLOWED_ENVELOPE_TRANSITIONS: Readonly<
  Record<SignatureEnvelopeStatus, readonly SignatureEnvelopeStatus[]>
> = {
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['SENT', 'CANCELLED'],
  SENT: ['IN_PROGRESS', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'FAILED'],
  IN_PROGRESS: ['PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'FAILED'],
  PARTIALLY_SIGNED: ['IN_PROGRESS', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'FAILED'],
  COMPLETED: [],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
  FAILED: [],
};

export interface EnvelopeTransitionResult {
  allowed: boolean;
  from: SignatureEnvelopeStatus;
  to: SignatureEnvelopeStatus;
  errors: ContractDomainError[];
}

export function canTransitionEnvelopeStatus(
  from: SignatureEnvelopeStatus,
  to: SignatureEnvelopeStatus,
): EnvelopeTransitionResult {
  if (isTerminalEnvelopeStatus(from)) {
    return {
      allowed: false,
      from,
      to,
      errors: [createContractDomainError(
        'SIGNATURE_ENVELOPE_ALREADY_TERMINAL',
        `Envelope em estado terminal ${from}.`,
        'status',
      )],
    };
  }
  const allowed = (ALLOWED_ENVELOPE_TRANSITIONS[from] || []).includes(to);
  return {
    allowed,
    from,
    to,
    errors: allowed ? [] : [createContractDomainError(
      'INVALID_STATUS_TRANSITION',
      `Transição de envelope ${from} → ${to} não permitida.`,
      'status',
    )],
  };
}
