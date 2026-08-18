/**
 * Status canônico do pacote jurídico (Wave A).
 * Camada pura de apresentação — não persiste e não altera enums V1/V2.
 */

import { CONTRACT_STATUS } from './contractConstants.js';
import { isContractPackageFrozen } from './treatmentDocumentRequirements.js';

export const LEGAL_PACKAGE_STATUS = {
  NOT_STARTED: 'not_started',
  PREPARING: 'preparing',
  AWAITING_SIGNATURE: 'awaiting_signature',
  PARTIALLY_SIGNED: 'partially_signed',
  COMPLETED: 'completed',
  SUPERSEDED: 'superseded',
  CANCELLED: 'cancelled',
};

export const LEGAL_PACKAGE_STATUS_LABELS = {
  [LEGAL_PACKAGE_STATUS.NOT_STARTED]: 'Não iniciado',
  [LEGAL_PACKAGE_STATUS.PREPARING]: 'Preparando documentos',
  [LEGAL_PACKAGE_STATUS.AWAITING_SIGNATURE]: 'Aguardando assinatura',
  [LEGAL_PACKAGE_STATUS.PARTIALLY_SIGNED]: 'Parcialmente assinado',
  [LEGAL_PACKAGE_STATUS.COMPLETED]: 'Concluído',
  [LEGAL_PACKAGE_STATUS.SUPERSEDED]: 'Substituído',
  [LEGAL_PACKAGE_STATUS.CANCELLED]: 'Cancelado',
};

export const LEGAL_DOCUMENT_STATUS = {
  NOT_STARTED: 'not_started',
  DRAFT: 'draft',
  READY: 'ready',
  AWAITING_SIGNATURE: 'awaiting_signature',
  PARTIALLY_SIGNED: 'partially_signed',
  SIGNED: 'signed',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
  SUPERSEDED: 'superseded',
};

export const LEGAL_DOCUMENT_STATUS_LABELS = {
  [LEGAL_DOCUMENT_STATUS.NOT_STARTED]: 'Não iniciado',
  [LEGAL_DOCUMENT_STATUS.DRAFT]: 'Rascunho',
  [LEGAL_DOCUMENT_STATUS.READY]: 'Pronto',
  [LEGAL_DOCUMENT_STATUS.AWAITING_SIGNATURE]: 'Aguardando assinatura',
  [LEGAL_DOCUMENT_STATUS.PARTIALLY_SIGNED]: 'Parcialmente assinado',
  [LEGAL_DOCUMENT_STATUS.SIGNED]: 'Assinado',
  [LEGAL_DOCUMENT_STATUS.DECLINED]: 'Recusado',
  [LEGAL_DOCUMENT_STATUS.CANCELLED]: 'Cancelado',
  [LEGAL_DOCUMENT_STATUS.SUPERSEDED]: 'Substituído',
};

const SIGNED_CONTRACT = new Set([
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.COMPLETED,
  CONTRACT_STATUS.VIGENTE,
]);

const PARTIAL_CONTRACT = new Set([
  CONTRACT_STATUS.SIGNED_BY_PATIENT,
  CONTRACT_STATUS.SIGNED_BY_CLINIC,
]);

const SENT_CONTRACT = new Set([
  CONTRACT_STATUS.SENT,
  CONTRACT_STATUS.VIEWED,
]);

const CANCELLED_CONTRACT = new Set([
  CONTRACT_STATUS.CANCELED,
  CONTRACT_STATUS.RESCINDIDO,
  'cancelled',
  'canceled',
]);

export function mapContractStatusToDocumentStatus(contract) {
  if (!contract) return LEGAL_DOCUMENT_STATUS.NOT_STARTED;
  const s = String(contract.status || '').toLowerCase();
  if (CANCELLED_CONTRACT.has(s) || CANCELLED_CONTRACT.has(contract.status)) {
    return LEGAL_DOCUMENT_STATUS.CANCELLED;
  }
  if (s === CONTRACT_STATUS.REPLACED || s === 'superseded') {
    return LEGAL_DOCUMENT_STATUS.SUPERSEDED;
  }
  if (s === CONTRACT_STATUS.REFUSED || s === 'declined') {
    return LEGAL_DOCUMENT_STATUS.DECLINED;
  }
  if (SIGNED_CONTRACT.has(s) || SIGNED_CONTRACT.has(contract.status)) {
    return LEGAL_DOCUMENT_STATUS.SIGNED;
  }
  if (PARTIAL_CONTRACT.has(s) || PARTIAL_CONTRACT.has(contract.status)) {
    return LEGAL_DOCUMENT_STATUS.PARTIALLY_SIGNED;
  }
  if (SENT_CONTRACT.has(s) || SENT_CONTRACT.has(contract.status)) {
    return LEGAL_DOCUMENT_STATUS.AWAITING_SIGNATURE;
  }
  if (s === CONTRACT_STATUS.GENERATED || s === CONTRACT_STATUS.READY_TO_SEND) {
    return LEGAL_DOCUMENT_STATUS.READY;
  }
  if (s === CONTRACT_STATUS.DRAFT || s === CONTRACT_STATUS.AWAITING_DATA) {
    return LEGAL_DOCUMENT_STATUS.DRAFT;
  }
  return LEGAL_DOCUMENT_STATUS.DRAFT;
}

export function isLegalDocumentLocked(contract, documentStatus) {
  if (isContractPackageFrozen(contract)) return true;
  return [
    LEGAL_DOCUMENT_STATUS.AWAITING_SIGNATURE,
    LEGAL_DOCUMENT_STATUS.PARTIALLY_SIGNED,
    LEGAL_DOCUMENT_STATUS.SIGNED,
    LEGAL_DOCUMENT_STATUS.DECLINED,
    LEGAL_DOCUMENT_STATUS.CANCELLED,
    LEGAL_DOCUMENT_STATUS.SUPERSEDED,
  ].includes(documentStatus);
}

export function isLegalDocumentSigned(documentStatus) {
  return documentStatus === LEGAL_DOCUMENT_STATUS.SIGNED;
}

/**
 * @param {{
 *   hasPackage?: boolean,
 *   contract?: object|null,
 *   requiredPending?: number,
 *   requiredTotal?: number,
 *   requiredSigned?: number,
 * }} input
 */
export function deriveLegalPackageStatus(input = {}) {
  const contract = input.contract || null;
  const contractStatus = mapContractStatusToDocumentStatus(contract);
  if (contractStatus === LEGAL_DOCUMENT_STATUS.CANCELLED) {
    return LEGAL_PACKAGE_STATUS.CANCELLED;
  }
  if (contractStatus === LEGAL_DOCUMENT_STATUS.SUPERSEDED) {
    return LEGAL_PACKAGE_STATUS.SUPERSEDED;
  }
  if (!contract && !input.hasPackage) {
    return LEGAL_PACKAGE_STATUS.NOT_STARTED;
  }
  if (contractStatus === LEGAL_DOCUMENT_STATUS.SIGNED) {
    const pending = Number(input.requiredPending || 0);
    if (pending > 0) return LEGAL_PACKAGE_STATUS.PARTIALLY_SIGNED;
    return LEGAL_PACKAGE_STATUS.COMPLETED;
  }
  if (contractStatus === LEGAL_DOCUMENT_STATUS.PARTIALLY_SIGNED) {
    return LEGAL_PACKAGE_STATUS.PARTIALLY_SIGNED;
  }
  if (contractStatus === LEGAL_DOCUMENT_STATUS.AWAITING_SIGNATURE) {
    return LEGAL_PACKAGE_STATUS.AWAITING_SIGNATURE;
  }
  if (contract || input.hasPackage) {
    return LEGAL_PACKAGE_STATUS.PREPARING;
  }
  return LEGAL_PACKAGE_STATUS.NOT_STARTED;
}

export function labelLegalPackageStatus(status) {
  return LEGAL_PACKAGE_STATUS_LABELS[status] || LEGAL_PACKAGE_STATUS_LABELS[LEGAL_PACKAGE_STATUS.NOT_STARTED];
}

export function labelLegalDocumentStatus(status) {
  return LEGAL_DOCUMENT_STATUS_LABELS[status] || LEGAL_DOCUMENT_STATUS_LABELS[LEGAL_DOCUMENT_STATUS.NOT_STARTED];
}
