/**
 * @module domain/contracts/signatures/signature.validators
 */

import { createContractDomainError, type ContractDomainError } from '../contract.errors.js';
import type { ValidationResult } from '../contract.validators.js';
import type { SignatureEnvelope, SignatureSigner } from './signature.types.js';

export function validateSignatureEnvelope(envelope: Partial<SignatureEnvelope>): ValidationResult {
  const errors: ContractDomainError[] = [];
  if (!String(envelope.tenantId || '').trim()) {
    errors.push(createContractDomainError('TENANT_REQUIRED', 'tenantId é obrigatório.', 'tenantId'));
  }
  if (!String(envelope.contractId || '').trim()) {
    errors.push(createContractDomainError('CONTRACT_NOT_FOUND', 'contractId é obrigatório.', 'contractId'));
  }
  if (!String(envelope.contractVersionId || '').trim()) {
    errors.push(createContractDomainError('VERSION_REQUIRED', 'contractVersionId é obrigatório.', 'contractVersionId'));
  }
  if (envelope.expiresAt) {
    const exp = Date.parse(envelope.expiresAt);
    if (!Number.isFinite(exp)) {
      errors.push(createContractDomainError('INVALID_DATE_RANGE', 'expiresAt inválido.', 'expiresAt'));
    } else if (envelope.status === 'SENT' || envelope.status === 'READY') {
      if (exp <= Date.now()) {
        errors.push(createContractDomainError(
          'ENVELOPE_EXPIRED',
          'Expiração deve ser futura para envelopes ativos.',
          'expiresAt',
        ));
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateSignatureSigner(signer: Partial<SignatureSigner>): ValidationResult {
  const errors: ContractDomainError[] = [];
  if (!String(signer.tenantId || '').trim()) {
    errors.push(createContractDomainError('TENANT_REQUIRED', 'tenantId é obrigatório.', 'tenantId'));
  }
  if (!String(signer.envelopeId || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'envelopeId é obrigatório.', 'envelopeId'));
  }
  if (!String(signer.name || '').trim()) {
    errors.push(createContractDomainError('REQUIRED_SIGNER_MISSING', 'Nome do signatário obrigatório.', 'name'));
  }
  if (signer.required && !String(signer.signerRole || '').trim()) {
    errors.push(createContractDomainError(
      'REQUIRED_SIGNER_MISSING',
      'Papel do signatário obrigatório.',
      'signerRole',
    ));
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}
