/**
 * @module domain/contracts/application/contract-readiness
 * @description Validadores de prontidão por alvo — Phase 10.5.
 */

import { createContractDomainError, createContractDomainWarning } from '../contract.errors.js';
import type { ContractStatus } from '../contract.constants.js';
import type { Contract, ContractVersion } from '../contract.types.js';
import type { ContractTemplateRequirements } from '../templates/contract-template.types.js';
import type { ContractReadinessResult } from '../generation/contract-generation.types.js';
import { parseContractTemplateVariables } from '../templates/contract-template-parser.js';
import { isKnownContractTemplateVariableKey } from '../templates/contract-template-variables.catalog.js';

export interface ContractInstanceReadinessInput {
  contract: Contract;
  version: ContractVersion | null;
  requirements?: Partial<ContractTemplateRequirements>;
  hasPublishedTemplate?: boolean;
  hasSignaturePolicy?: boolean;
  hasActiveConflictingEnvelope?: boolean;
}

function baseErrors(input: ContractInstanceReadinessInput) {
  const errors = [];
  const warnings = [];
  const { contract, version } = input;

  if (!contract) {
    errors.push(createContractDomainError('CONTRACT_NOT_FOUND', 'Contrato ausente.'));
    return { errors, warnings };
  }
  if (!String(contract.patientId || '').trim()) {
    errors.push(createContractDomainError('PATIENT_REQUIRED', 'Paciente ausente.', 'patientId'));
  }
  if (!String(contract.title || '').trim()) {
    errors.push(createContractDomainError('TITLE_REQUIRED', 'Título ausente.', 'title'));
  }
  if (!version) {
    errors.push(createContractDomainError('VERSION_REQUIRED', 'Versão inexistente.', 'currentVersionId'));
    return { errors, warnings };
  }
  if (!String(version.renderedHtmlSnapshot || '').trim()) {
    errors.push(createContractDomainError(
      'TEMPLATE_CONTENT_EMPTY',
      'Conteúdo renderizado ausente.',
      'renderedHtmlSnapshot',
    ));
  }
  if (!version.patientSnapshot?.fullName || !version.clinicSnapshot?.legalName) {
    errors.push(createContractDomainError(
      'SNAPSHOT_REQUIRED',
      'Snapshots mínimos ausentes.',
      'snapshots',
    ));
  }
  if (input.hasPublishedTemplate === false) {
    errors.push(createContractDomainError(
      'TEMPLATE_NOT_PUBLISHED',
      'Template publicado ausente.',
      'templateId',
    ));
  }

  const html = version.renderedHtmlSnapshot || '';
  const parsed = parseContractTemplateVariables(html);
  for (const key of parsed.usedKeys) {
    if (!isKnownContractTemplateVariableKey(key) && key.includes('.')) {
      // tokens já resolvidos não ficam no HTML; se restarem {{x}}, parse captura
    }
  }
  // Variáveis não resolvidas no HTML (ainda com {{)
  if (/\{\{[a-zA-Z_][a-zA-Z0-9_.]*\}\}/.test(html)) {
    const leftover = parseContractTemplateVariables(html).usedKeys;
    for (const key of leftover) {
      if (!isKnownContractTemplateVariableKey(key)) {
        errors.push(createContractDomainError(
          'TEMPLATE_VARIABLE_UNKNOWN',
          `Variável desconhecida residual: ${key}`,
          'content',
        ));
      }
    }
  }

  return { errors, warnings };
}

export function validateReadyForReview(input: ContractInstanceReadinessInput): ContractReadinessResult {
  const { errors, warnings } = baseErrors(input);
  return {
    targetStatus: 'READY_FOR_REVIEW',
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateReadyForApproval(input: ContractInstanceReadinessInput): ContractReadinessResult {
  const base = validateReadyForReview(input);
  const errors = [...base.errors];
  const warnings = [...base.warnings];
  const { version } = input;
  const req = input.requirements || {};

  if (version && !version.lockedAt) {
    errors.push(createContractDomainError(
      'VERSION_NOT_LOCKED',
      'Versão deve estar bloqueada.',
      'lockedAt',
    ));
  }
  if (req.requiresGuardian && !version?.guardianSnapshot) {
    errors.push(createContractDomainError('GUARDIAN_REQUIRED', 'Responsável ausente.', 'guardian'));
  }
  if (req.requiresBudget && !version?.budgetSnapshot) {
    errors.push(createContractDomainError('BUDGET_REQUIRED', 'Orçamento ausente.', 'budget'));
  }
  if (req.requiresFinancialPlan && !version?.financialSnapshot) {
    errors.push(createContractDomainError(
      'FINANCIAL_SNAPSHOT_REQUIRED',
      'Financeiro ausente.',
      'financial',
    ));
  }
  if (req.requiresOdontogram && !version?.odontogramSnapshot) {
    errors.push(createContractDomainError(
      'INVALID_INPUT',
      'Odontograma obrigatório ausente.',
      'odontogram',
    ));
  } else if (!version?.odontogramSnapshot) {
    warnings.push(createContractDomainWarning(
      'LEGACY_ODONTOGRAM_SNAPSHOT_ABSENT',
      'Odontograma opcional ausente.',
      'odontogram',
    ));
  }
  const requiredSigners = (version?.signersSnapshot || []).filter((s) => s.required);
  if (!requiredSigners.length) {
    errors.push(createContractDomainError(
      'REQUIRED_SIGNER_MISSING',
      'Signatários obrigatórios ausentes.',
      'signers',
    ));
  }

  return {
    targetStatus: 'PENDING_INTERNAL_APPROVAL',
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** Validator apenas — não inicia envelope. */
export function validateReadyForSignature(input: ContractInstanceReadinessInput): ContractReadinessResult {
  const errors = [];
  const warnings = [];
  const { contract, version } = input;

  if (contract.status !== 'APPROVED') {
    errors.push(createContractDomainError(
      'INVALID_STATUS',
      'Assinatura exige status APPROVED.',
      'status',
    ));
  }
  if (!version?.lockedAt) {
    errors.push(createContractDomainError('VERSION_NOT_LOCKED', 'Versão não bloqueada.', 'lockedAt'));
  }
  if (!version?.documentHash) {
    errors.push(createContractDomainError(
      'CONTENT_HASH_REQUIRED',
      'Hash obrigatório.',
      'documentHash',
    ));
  }
  if (!(version?.signersSnapshot || []).length) {
    errors.push(createContractDomainError(
      'REQUIRED_SIGNER_MISSING',
      'Signatários ausentes.',
      'signers',
    ));
  }
  if (input.hasSignaturePolicy === false) {
    errors.push(createContractDomainError(
      'INVALID_INPUT',
      'Política de assinatura ausente.',
      'signaturePolicy',
    ));
  }
  if (input.hasActiveConflictingEnvelope) {
    errors.push(createContractDomainError(
      'INVALID_INPUT',
      'Envelope ativo conflitante.',
      'envelope',
    ));
  }

  return {
    targetStatus: 'PENDING_SIGNATURES' as ContractStatus,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateReadinessForTarget(
  targetStatus: ContractStatus,
  input: ContractInstanceReadinessInput,
): ContractReadinessResult {
  if (targetStatus === 'READY_FOR_REVIEW') return validateReadyForReview(input);
  if (targetStatus === 'PENDING_INTERNAL_APPROVAL' || targetStatus === 'APPROVED') {
    return validateReadyForApproval(input);
  }
  if (targetStatus === 'PENDING_SIGNATURES') return validateReadyForSignature(input);
  return {
    targetStatus,
    valid: false,
    errors: [createContractDomainError(
      'INVALID_STATUS',
      `Readiness não suportado para ${targetStatus}.`,
      'status',
    )],
    warnings: [],
  };
}
