/**
 * Labels e status derivados da UI operacional de contratos (Phase 10.16).
 * Não altera enums canônicos do banco — apenas apresentação.
 */

import { CONTRACT_STATUS } from './contractConstants.js';

export const OPERATIONAL_UX_STATUS = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  READY_TO_SIGN: 'ready_to_sign',
  AWAITING_SIGNATURE: 'awaiting_signature',
  PARTIALLY_SIGNED: 'partially_signed',
  SIGNED: 'signed',
  CANCELED: 'canceled',
  WITH_PENDING: 'with_pending',
};

export const OPERATIONAL_UX_STATUS_LABELS = {
  [OPERATIONAL_UX_STATUS.DRAFT]: 'Rascunho',
  [OPERATIONAL_UX_STATUS.IN_REVIEW]: 'Em revisão',
  [OPERATIONAL_UX_STATUS.READY_TO_SIGN]: 'Pronto para assinatura',
  [OPERATIONAL_UX_STATUS.AWAITING_SIGNATURE]: 'Aguardando assinatura',
  [OPERATIONAL_UX_STATUS.PARTIALLY_SIGNED]: 'Parcialmente assinado',
  [OPERATIONAL_UX_STATUS.SIGNED]: 'Assinado',
  [OPERATIONAL_UX_STATUS.CANCELED]: 'Cancelado',
  [OPERATIONAL_UX_STATUS.WITH_PENDING]: 'Com pendência',
};

export const OPERATIONAL_UX_STATUS_VARIANT = {
  [OPERATIONAL_UX_STATUS.DRAFT]: 'muted',
  [OPERATIONAL_UX_STATUS.IN_REVIEW]: 'info',
  [OPERATIONAL_UX_STATUS.READY_TO_SIGN]: 'info',
  [OPERATIONAL_UX_STATUS.AWAITING_SIGNATURE]: 'warning',
  [OPERATIONAL_UX_STATUS.PARTIALLY_SIGNED]: 'warning',
  [OPERATIONAL_UX_STATUS.SIGNED]: 'success',
  [OPERATIONAL_UX_STATUS.CANCELED]: 'muted',
  [OPERATIONAL_UX_STATUS.WITH_PENDING]: 'danger',
};

/**
 * @param {object} input
 * @param {string} [input.status]
 * @param {boolean} [input.hasPendency]
 * @param {boolean} [input.partiallySigned]
 */
export function resolveOperationalUxStatus({
  status,
  hasPendency = false,
  partiallySigned = false,
} = {}) {
  if (hasPendency) return OPERATIONAL_UX_STATUS.WITH_PENDING;

  const s = String(status || '').toLowerCase();
  if ([CONTRACT_STATUS.CANCELED, CONTRACT_STATUS.RESCINDIDO, 'canceled', 'cancelled'].includes(s)) {
    return OPERATIONAL_UX_STATUS.CANCELED;
  }
  if ([CONTRACT_STATUS.SIGNED, CONTRACT_STATUS.COMPLETED, CONTRACT_STATUS.VIGENTE].includes(s)) {
    return OPERATIONAL_UX_STATUS.SIGNED;
  }
  if (
    partiallySigned
    || s === CONTRACT_STATUS.SIGNED_BY_PATIENT
    || s === CONTRACT_STATUS.SIGNED_BY_CLINIC
  ) {
    return OPERATIONAL_UX_STATUS.PARTIALLY_SIGNED;
  }
  if ([CONTRACT_STATUS.SENT, CONTRACT_STATUS.VIEWED].includes(s)) {
    return OPERATIONAL_UX_STATUS.AWAITING_SIGNATURE;
  }
  if ([CONTRACT_STATUS.READY_TO_SEND, CONTRACT_STATUS.GENERATED].includes(s)) {
    return OPERATIONAL_UX_STATUS.READY_TO_SIGN;
  }
  if (s === CONTRACT_STATUS.AWAITING_DATA) {
    return OPERATIONAL_UX_STATUS.IN_REVIEW;
  }
  if (s === CONTRACT_STATUS.DRAFT || !s) {
    return OPERATIONAL_UX_STATUS.DRAFT;
  }
  return OPERATIONAL_UX_STATUS.IN_REVIEW;
}

export function labelOperationalUxStatus(uxStatus) {
  return OPERATIONAL_UX_STATUS_LABELS[uxStatus] || 'Em revisão';
}

/**
 * Pendência derivada (UI) — sem novo status canônico no banco.
 * @param {object} contract
 * @param {{ signatures?: object[], signLinks?: object[], attachments?: object[] }} [details]
 */
export function deriveContractPendency(contract, details = {}) {
  const reasons = [];
  if (!contract) return { hasPendency: false, reasons };

  const financial = contract.financialSnapshotJson || {};
  const total = Number(contract.totalValueSnapshot ?? financial.valorTotal ?? NaN);
  if (!Number.isFinite(total) || total < 0) {
    reasons.push('Informação financeira obrigatória ausente.');
  }

  const clinical = contract.clinicalSnapshotJson || {};
  if (!clinical.procedimentos && !contract.renderedHtml) {
    reasons.push('Documento obrigatório ausente ou incompleto.');
  }

  const links = details.signLinks || [];
  const activeLinks = links.filter((l) => l.status === 'pending');
  for (const link of activeLinks) {
    if (!link.email && !link.phone && !link.contact) {
      reasons.push('Signatário sem contato.');
      break;
    }
  }

  if (contract.status === CONTRACT_STATUS.AWAITING_DATA) {
    reasons.push('Versão não pronta — dados obrigatórios pendentes.');
  }

  if (details.deliveryError) {
    reasons.push('Erro de entrega do convite de assinatura.');
  }

  if (details.artifactInvalid) {
    reasons.push('Artefato do documento inválido.');
  }

  return { hasPendency: reasons.length > 0, reasons };
}

/**
 * CTA contextual da fila operacional.
 */
export function resolveOperationalContractCta({ uxStatus, contract } = {}) {
  if (!contract) {
    return { key: 'generate', label: 'Gerar contrato' };
  }
  switch (uxStatus) {
    case OPERATIONAL_UX_STATUS.DRAFT:
      return { key: 'continue', label: 'Continuar' };
    case OPERATIONAL_UX_STATUS.IN_REVIEW:
      return { key: 'review', label: 'Revisar' };
    case OPERATIONAL_UX_STATUS.READY_TO_SIGN:
      return { key: 'send', label: 'Enviar para assinatura' };
    case OPERATIONAL_UX_STATUS.AWAITING_SIGNATURE:
    case OPERATIONAL_UX_STATUS.PARTIALLY_SIGNED:
      return { key: 'view_signature', label: 'Ver assinatura' };
    case OPERATIONAL_UX_STATUS.SIGNED:
      return { key: 'download', label: 'Baixar' };
    case OPERATIONAL_UX_STATUS.WITH_PENDING:
      return { key: 'resolve', label: 'Resolver pendência' };
    case OPERATIONAL_UX_STATUS.CANCELED:
      return { key: 'view', label: 'Ver contrato' };
    default:
      return { key: 'continue', label: 'Continuar' };
  }
}

/**
 * CTA do hub /orcamentos a partir do contrato vinculado.
 */
export function resolveBudgetContractCta({ contractId, contractStatus, budgetStatus, hasPendency } = {}) {
  if (!contractId) {
    return {
      action: 'generate',
      label: 'Gerar contrato',
      nextAction: 'Gerar contrato',
    };
  }
  const ux = resolveOperationalUxStatus({
    status: contractStatus,
    hasPendency,
  });
  if (ux === OPERATIONAL_UX_STATUS.DRAFT || ux === OPERATIONAL_UX_STATUS.IN_REVIEW) {
    return {
      action: 'continue',
      label: 'Continuar contrato',
      nextAction: 'Continuar contrato',
      uxStatus: ux,
    };
  }
  if (ux === OPERATIONAL_UX_STATUS.WITH_PENDING) {
    return {
      action: 'resolve',
      label: 'Resolver pendência',
      nextAction: 'Resolver pendência',
      uxStatus: ux,
    };
  }
  return {
    action: 'view',
    label: 'Ver contrato',
    nextAction: budgetStatus ? 'Acompanhar contrato' : 'Ver contrato',
    uxStatus: ux,
  };
}
