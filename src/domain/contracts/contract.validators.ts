/**
 * @module domain/contracts/contract.validators
 * @description Validators puros — sem biblioteca externa (Phase 10.2).
 */

import {
  isContractDocumentType,
  isContractStatus,
  type ContractDocumentType,
  type ContractStatus,
} from './contract.constants.js';
import {
  createContractDomainError,
  createContractDomainWarning,
  type ContractDomainError,
  type ContractDomainWarning,
} from './contract.errors.js';
import type { Contract, ContractVersion } from './contract.types.js';
import { isContractContentLocked } from './contract-status.machine.js';

export interface ValidationResult {
  valid: boolean;
  errors: ContractDomainError[];
  warnings: ContractDomainWarning[];
}

function result(errors: ContractDomainError[], warnings: ContractDomainWarning[] = []): ValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

function nonEmpty(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

function isValidIsoDate(value: string): boolean {
  const t = Date.parse(value);
  return Number.isFinite(t);
}

const HASH_PATTERN = /^(sha256:)?[a-f0-9]{16,128}$/i;

export function validateContract(contract: Partial<Contract>): ValidationResult {
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];

  if (!nonEmpty(contract.tenantId)) {
    errors.push(createContractDomainError('TENANT_REQUIRED', 'tenantId é obrigatório.', 'tenantId'));
  }
  if (!nonEmpty(contract.patientId)) {
    errors.push(createContractDomainError('PATIENT_REQUIRED', 'patientId é obrigatório.', 'patientId'));
  }
  if (!nonEmpty(contract.title)) {
    errors.push(createContractDomainError('TITLE_REQUIRED', 'Título é obrigatório.', 'title'));
  }
  if (!isContractDocumentType(contract.documentType)) {
    errors.push(createContractDomainError(
      'INVALID_DOCUMENT_TYPE',
      'Tipo de documento não reconhecido.',
      'documentType',
      { documentType: contract.documentType },
    ));
  }
  if (!isContractStatus(contract.status)) {
    errors.push(createContractDomainError(
      'INVALID_STATUS',
      'Status não reconhecido.',
      'status',
      { status: contract.status },
    ));
  }
  if (!nonEmpty(contract.contractNumber)) {
    errors.push(createContractDomainError(
      'CONTRACT_NUMBER_INVALID',
      'Número do contrato inválido.',
      'contractNumber',
    ));
  }

  if (contract.effectiveDate && contract.expirationDate
    && isValidIsoDate(contract.effectiveDate)
    && isValidIsoDate(contract.expirationDate)
    && Date.parse(contract.expirationDate) < Date.parse(contract.effectiveDate)) {
    errors.push(createContractDomainError(
      'INVALID_DATE_RANGE',
      'Data de expiração anterior à vigência.',
      'expirationDate',
    ));
  }

  if ((contract.status === 'CANCELLED' || contract.status === 'VOIDED')
    && !nonEmpty(contract.cancellationReason)) {
    errors.push(createContractDomainError(
      'CANCELLATION_REASON_REQUIRED',
      'Cancelamento exige motivo.',
      'cancellationReason',
    ));
  }

  return result(errors, warnings);
}

export function validateContractVersion(version: Partial<ContractVersion>): ValidationResult {
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];

  if (!nonEmpty(version.tenantId)) {
    errors.push(createContractDomainError('TENANT_REQUIRED', 'tenantId é obrigatório.', 'tenantId'));
  }
  if (!nonEmpty(version.contractId)) {
    errors.push(createContractDomainError('VERSION_REQUIRED', 'contractId é obrigatório.', 'contractId'));
  }
  if (!Number.isInteger(version.versionNumber) || Number(version.versionNumber) < 1) {
    errors.push(createContractDomainError(
      'VERSION_NUMBER_INVALID',
      'versionNumber deve ser inteiro >= 1.',
      'versionNumber',
    ));
  }
  if (!version.patientSnapshot || !nonEmpty(version.patientSnapshot.fullName)) {
    errors.push(createContractDomainError(
      'SNAPSHOT_REQUIRED',
      'Snapshot do paciente é obrigatório.',
      'patientSnapshot',
    ));
  }
  if (!version.clinicSnapshot || !nonEmpty(version.clinicSnapshot.legalName)) {
    errors.push(createContractDomainError(
      'SNAPSHOT_REQUIRED',
      'Snapshot da clínica é obrigatório.',
      'clinicSnapshot',
    ));
  }
  if (!Array.isArray(version.signersSnapshot) || version.signersSnapshot.length === 0) {
    errors.push(createContractDomainError(
      'REQUIRED_SIGNER_MISSING',
      'Signatários devem estar definidos no snapshot.',
      'signersSnapshot',
    ));
  }
  if (version.documentHash && !HASH_PATTERN.test(String(version.documentHash))) {
    errors.push(createContractDomainError(
      'HASH_INVALID',
      'Formato de hash inválido.',
      'documentHash',
    ));
  }
  if (version.lockedAt && version.createdAt
    && isValidIsoDate(version.lockedAt)
    && isValidIsoDate(version.createdAt)
    && Date.parse(version.lockedAt) < Date.parse(version.createdAt)) {
    errors.push(createContractDomainError(
      'INVALID_DATE_RANGE',
      'lockedAt anterior a createdAt.',
      'lockedAt',
    ));
  }
  if (!version.odontogramSnapshot) {
    warnings.push(createContractDomainWarning(
      'OPTIONAL_SNAPSHOT_ABSENT',
      'Snapshot de odontograma ausente.',
      'odontogramSnapshot',
    ));
  }

  return result(errors, warnings);
}

export interface ReadinessInput {
  contract: Partial<Contract>;
  version?: Partial<ContractVersion> | null;
  requiresGuardian?: boolean;
  requiresBudget?: boolean;
  requiresFinancialSnapshot?: boolean;
  requiresPublishedTemplate?: boolean;
  hasPublishedTemplate?: boolean;
  hasRequiredApprovals?: boolean;
}

export function validateContractReadyForReview(input: ReadinessInput): ValidationResult {
  const base = validateContract(input.contract);
  const errors = [...base.errors];
  const warnings = [...base.warnings];

  if (!input.version) {
    errors.push(createContractDomainError('VERSION_REQUIRED', 'Versão obrigatória para revisão.', 'version'));
  } else {
    const v = validateContractVersion(input.version);
    errors.push(...v.errors);
    warnings.push(...v.warnings);
  }

  if (input.requiresGuardian && !nonEmpty(input.contract.guardianPatientId)) {
    errors.push(createContractDomainError(
      'GUARDIAN_REQUIRED',
      'Responsável legal obrigatório.',
      'guardianPatientId',
    ));
  }
  if (input.requiresBudget && !nonEmpty(input.contract.budgetId)) {
    errors.push(createContractDomainError('BUDGET_REQUIRED', 'Orçamento obrigatório.', 'budgetId'));
  }

  return result(errors, warnings);
}

export function validateContractReadyForApproval(input: ReadinessInput): ValidationResult {
  const review = validateContractReadyForReview(input);
  const errors = [...review.errors];
  const warnings = [...review.warnings];

  if (input.requiresPublishedTemplate !== false && !input.hasPublishedTemplate) {
    errors.push(createContractDomainError(
      'TEMPLATE_NOT_PUBLISHED',
      'Modelo publicado obrigatório.',
      'templateId',
    ));
  }
  if (input.requiresFinancialSnapshot && !input.version?.financialSnapshot) {
    errors.push(createContractDomainError(
      'FINANCIAL_SNAPSHOT_REQUIRED',
      'Snapshot financeiro obrigatório.',
      'financialSnapshot',
    ));
  }
  if (input.hasRequiredApprovals === false) {
    errors.push(createContractDomainError(
      'APPROVALS_REQUIRED',
      'Aprovações internas pendentes.',
      'approvals',
    ));
  }

  return result(errors, warnings);
}

export function validateContractReadyForSignature(input: ReadinessInput & {
  signaturesStarted?: boolean;
}): ValidationResult {
  const approval = validateContractReadyForApproval(input);
  const errors = [...approval.errors];
  const warnings = [...approval.warnings];

  if (!input.version?.lockedAt) {
    errors.push(createContractDomainError(
      'VERSION_NOT_LOCKED',
      'Versão deve estar bloqueada antes da assinatura.',
      'lockedAt',
    ));
  }

  const requiredSigners = (input.version?.signersSnapshot || []).filter((s) => s.required);
  if (requiredSigners.length === 0) {
    errors.push(createContractDomainError(
      'REQUIRED_SIGNER_MISSING',
      'Nenhum signatário obrigatório definido.',
      'signersSnapshot',
    ));
  }

  const status = input.contract.status as ContractStatus | undefined;
  if (status && isContractContentLocked(status, {
    signaturesStarted: Boolean(input.signaturesStarted),
    hasLockedVersion: Boolean(input.version?.lockedAt),
  }) && input.signaturesStarted) {
    // alteração de conteúdo já iniciada — validator apenas sinaliza lock
    warnings.push(createContractDomainWarning(
      'LEGACY_VERSION_NOT_LOCKED',
      'Conteúdo bloqueado após início da coleta de assinaturas.',
      'status',
    ));
  }

  return result(errors, warnings);
}

export function validateContractReadyForCompletion(input: ReadinessInput & {
  allRequiredSignaturesCompleted?: boolean;
  hasActiveDecline?: boolean;
  envelopeExpired?: boolean;
  evidenceAvailable?: boolean;
}): ValidationResult {
  const sig = validateContractReadyForSignature(input);
  const errors = [...sig.errors];
  const warnings = [...sig.warnings];

  if (!input.allRequiredSignaturesCompleted) {
    errors.push(createContractDomainError(
      'SIGNATURES_INCOMPLETE',
      'Assinaturas obrigatórias incompletas.',
      'signatures',
    ));
  }
  if (input.hasActiveDecline) {
    errors.push(createContractDomainError(
      'SIGNATURE_DECLINED',
      'Há recusa ativa.',
      'signatures',
    ));
  }
  if (input.envelopeExpired) {
    errors.push(createContractDomainError(
      'ENVELOPE_EXPIRED',
      'Envelope expirado.',
      'envelope',
    ));
  }
  if (input.evidenceAvailable === false) {
    errors.push(createContractDomainError(
      'EVIDENCE_PENDING',
      'Evidências de assinatura pendentes.',
      'evidence',
    ));
  }

  return result(errors, warnings);
}

export function assertTenantMatch(
  tenantId: string | undefined,
  resourceTenantId: string | undefined,
  field = 'tenantId',
): ContractDomainError | null {
  if (!nonEmpty(tenantId)) {
    return createContractDomainError('TENANT_REQUIRED', 'tenantId é obrigatório.', field);
  }
  if (nonEmpty(resourceTenantId) && String(tenantId) !== String(resourceTenantId)) {
    return createContractDomainError(
      'TENANT_MISMATCH',
      'Recurso não pertence ao tenant informado.',
      field,
      { tenantId, resourceTenantId },
    );
  }
  return null;
}

export function isKnownDocumentType(value: unknown): value is ContractDocumentType {
  return isContractDocumentType(value);
}
