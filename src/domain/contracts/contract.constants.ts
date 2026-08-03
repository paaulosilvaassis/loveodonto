/**
 * @module domain/contracts/contract.constants
 * @description Constantes e enums canônicos — Phase 10.2.
 * Não substitui `src/contracts/contractConstants.js` (legado operacional).
 */

export const CONTRACT_DOCUMENT_TYPES = [
  'SERVICE_CONTRACT',
  'INFORMED_CONSENT',
  'LGPD_TERM',
  'IMAGE_AUTHORIZATION',
  'ANESTHESIA_CONSENT',
  'SURGICAL_CONSENT',
  'IMPLANT_CONSENT',
  'PROSTHESIS_CONSENT',
  'ORTHODONTIC_CONSENT',
  'ENDODONTIC_CONSENT',
  'SEDATION_CONSENT',
  'FINANCIAL_ACKNOWLEDGEMENT',
  'TREATMENT_REFUSAL',
  'CANCELLATION_TERM',
  'TERMINATION_AGREEMENT',
  'CONTRACT_ADDENDUM',
  'CUSTOM',
] as const;

export type ContractDocumentType = (typeof CONTRACT_DOCUMENT_TYPES)[number];

export const CONTRACT_STATUSES = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'PENDING_INTERNAL_APPROVAL',
  'APPROVED',
  'PENDING_SIGNATURES',
  'PARTIALLY_SIGNED',
  'SIGNED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'SUPERSEDED',
  'TERMINATED',
  'VOIDED',
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_ORIGINS = [
  'MANUAL',
  'CRM_BUDGET',
  'CLINICAL_BUDGET',
  'PATIENT_CHART',
  'TREATMENT_PLAN',
  'ADDENDUM',
  'LEGACY_IMPORT',
] as const;

export type ContractOrigin = (typeof CONTRACT_ORIGINS)[number];

export const CONTRACT_VERSION_GENERATION_REASONS = [
  'INITIAL',
  'REVISION',
  'MANUAL_REVISION',
  'CORRECTION',
  'DATA_CORRECTION',
  'BUDGET_CHANGE',
  'TREATMENT_CHANGE',
  'FINANCIAL_CHANGE',
  'SIGNER_CHANGE',
  'ADDENDUM',
  'LEGACY_IMPORT',
  'REISSUE',
  'OTHER',
] as const;

export type ContractVersionGenerationReason =
  (typeof CONTRACT_VERSION_GENERATION_REASONS)[number];

export const TERMINAL_CONTRACT_STATUSES: readonly ContractStatus[] = [
  'SUPERSEDED',
  'TERMINATED',
  'VOIDED',
] as const;

export const CONTENT_LOCKED_CONTRACT_STATUSES: readonly ContractStatus[] = [
  'PENDING_SIGNATURES',
  'PARTIALLY_SIGNED',
  'SIGNED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'SUPERSEDED',
  'TERMINATED',
  'VOIDED',
] as const;

export const CONTRACT_AGGREGATE_TYPES = [
  'contract',
  'contract_version',
  'contract_template',
  'contract_package',
  'signature_envelope',
  'contract_file',
] as const;

export type ContractAggregateType = (typeof CONTRACT_AGGREGATE_TYPES)[number];

export function isContractDocumentType(value: unknown): value is ContractDocumentType {
  return typeof value === 'string'
    && (CONTRACT_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isContractStatus(value: unknown): value is ContractStatus {
  return typeof value === 'string'
    && (CONTRACT_STATUSES as readonly string[]).includes(value);
}
