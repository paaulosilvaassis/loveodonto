/**
 * @module domain/contracts/contract-status.machine
 * @description Máquina de estados pura — sem React, IndexedDB, Supabase ou side effects.
 */

import {
  CONTENT_LOCKED_CONTRACT_STATUSES,
  TERMINAL_CONTRACT_STATUSES,
  type ContractStatus,
} from './contract.constants.js';
import {
  createContractDomainError,
  type ContractDomainError,
} from './contract.errors.js';

export interface ContractTransitionContext {
  hasPublishedTemplate: boolean;
  hasPatient: boolean;
  hasRequiredGuardian: boolean;
  hasBudgetWhenRequired: boolean;
  hasFinancialSnapshotWhenRequired: boolean;
  hasRequiredSigners: boolean;
  hasRequiredApprovals: boolean;
  hasLockedVersion: boolean;
  signaturesStarted: boolean;
  allRequiredSignaturesCompleted: boolean;
  cancellationReason?: string;
  supersededByContractId?: string;
  hasActiveDecline?: boolean;
  envelopeExpired?: boolean;
  evidenceAvailable?: boolean;
}

export interface ContractTransitionResult {
  allowed: boolean;
  from: ContractStatus;
  to: ContractStatus;
  errors: ContractDomainError[];
}

/** Grafo mínimo de transições permitidas (Phase 10 §8). */
export const ALLOWED_CONTRACT_TRANSITIONS: Readonly<
  Record<ContractStatus, readonly ContractStatus[]>
> = {
  DRAFT: ['READY_FOR_REVIEW', 'CANCELLED'],
  READY_FOR_REVIEW: ['DRAFT', 'PENDING_INTERNAL_APPROVAL', 'APPROVED', 'CANCELLED'],
  PENDING_INTERNAL_APPROVAL: ['READY_FOR_REVIEW', 'APPROVED', 'CANCELLED'],
  APPROVED: ['PENDING_SIGNATURES', 'CANCELLED'],
  PENDING_SIGNATURES: [
    'PARTIALLY_SIGNED',
    'SIGNED',
    'DECLINED',
    'EXPIRED',
    'CANCELLED',
  ],
  PARTIALLY_SIGNED: ['SIGNED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  SIGNED: ['SUPERSEDED', 'TERMINATED'],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
  SUPERSEDED: [],
  TERMINATED: [],
  VOIDED: [],
};

export function isTerminalContractStatus(status: ContractStatus): boolean {
  return (TERMINAL_CONTRACT_STATUSES as readonly string[]).includes(status)
    || status === 'DECLINED'
    || status === 'EXPIRED'
    || status === 'CANCELLED';
}

/**
 * Conteúdo bloqueado quando status já iniciou coleta/assinatura/conclusão
 * ou quando o contexto indica envelope enviado.
 */
export function isContractContentLocked(
  status: ContractStatus,
  context?: Pick<ContractTransitionContext, 'signaturesStarted' | 'hasLockedVersion'>,
): boolean {
  if ((CONTENT_LOCKED_CONTRACT_STATUSES as readonly string[]).includes(status)) {
    if (status === 'PENDING_SIGNATURES') {
      return Boolean(context?.signaturesStarted || context?.hasLockedVersion !== false);
    }
    return true;
  }
  return false;
}

function baseTransitionAllowed(from: ContractStatus, to: ContractStatus): boolean {
  const allowed = ALLOWED_CONTRACT_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

function collectContextErrors(
  from: ContractStatus,
  to: ContractStatus,
  context: ContractTransitionContext,
): ContractDomainError[] {
  const errors: ContractDomainError[] = [];

  if (to === 'CANCELLED' || to === 'VOIDED') {
    if (!String(context.cancellationReason || '').trim()) {
      errors.push(createContractDomainError(
        'CANCELLATION_REASON_REQUIRED',
        'Cancelamento exige motivo.',
        'cancellationReason',
      ));
    }
  }

  if (to === 'READY_FOR_REVIEW' || to === 'APPROVED') {
    if (!context.hasPatient) {
      errors.push(createContractDomainError(
        'PATIENT_REQUIRED',
        'Paciente obrigatório para revisão/aprovação.',
        'patientId',
      ));
    }
    if (!context.hasRequiredGuardian) {
      errors.push(createContractDomainError(
        'GUARDIAN_REQUIRED',
        'Responsável legal obrigatório ausente.',
        'guardianPatientId',
      ));
    }
    if (!context.hasBudgetWhenRequired) {
      errors.push(createContractDomainError(
        'BUDGET_REQUIRED',
        'Orçamento obrigatório ausente.',
        'budgetId',
      ));
    }
    if (!context.hasFinancialSnapshotWhenRequired) {
      errors.push(createContractDomainError(
        'FINANCIAL_SNAPSHOT_REQUIRED',
        'Snapshot financeiro obrigatório ausente.',
        'financialSnapshot',
      ));
    }
  }

  if (to === 'APPROVED') {
    if (!context.hasPublishedTemplate) {
      errors.push(createContractDomainError(
        'TEMPLATE_NOT_PUBLISHED',
        'Modelo publicado obrigatório para aprovação.',
        'templateId',
      ));
    }
    if (!context.hasRequiredApprovals) {
      errors.push(createContractDomainError(
        'APPROVALS_REQUIRED',
        'Aprovações internas pendentes.',
        'approvals',
      ));
    }
  }

  if (to === 'PENDING_SIGNATURES') {
    if (!context.hasLockedVersion) {
      errors.push(createContractDomainError(
        'VERSION_NOT_LOCKED',
        'Envio para assinatura exige versão bloqueada.',
        'lockedAt',
      ));
    }
    if (!context.hasRequiredSigners) {
      errors.push(createContractDomainError(
        'REQUIRED_SIGNER_MISSING',
        'Signatários obrigatórios ausentes.',
        'signers',
      ));
    }
  }

  if (to === 'SIGNED') {
    if (!context.hasLockedVersion) {
      errors.push(createContractDomainError(
        'VERSION_NOT_LOCKED',
        'Conclusão exige versão bloqueada.',
        'lockedAt',
      ));
    }
    if (!context.allRequiredSignaturesCompleted) {
      errors.push(createContractDomainError(
        'SIGNATURES_INCOMPLETE',
        'Assinaturas obrigatórias incompletas.',
        'signatures',
      ));
    }
    if (context.hasActiveDecline) {
      errors.push(createContractDomainError(
        'SIGNATURE_DECLINED',
        'Há recusa ativa impedindo conclusão.',
        'signatures',
      ));
    }
    if (context.envelopeExpired) {
      errors.push(createContractDomainError(
        'ENVELOPE_EXPIRED',
        'Envelope expirado impede conclusão.',
        'envelope',
      ));
    }
  }

  if (to === 'TERMINATED' && from !== 'SIGNED') {
    errors.push(createContractDomainError(
      'INVALID_STATUS_TRANSITION',
      'Rescisão exige contrato previamente assinado.',
      'status',
      { from, to },
    ));
  }

  if (to === 'SUPERSEDED') {
    if (from !== 'SIGNED') {
      errors.push(createContractDomainError(
        'INVALID_STATUS_TRANSITION',
        'Substituição exige contrato assinado.',
        'status',
        { from, to },
      ));
    }
    if (!String(context.supersededByContractId || '').trim()) {
      errors.push(createContractDomainError(
        'SUPERSEDE_REFERENCE_REQUIRED',
        'Substituição exige referência do contrato sucessor.',
        'supersededByContractId',
      ));
    }
  }

  if (from === 'PARTIALLY_SIGNED' && to !== 'SIGNED' && to !== 'DECLINED'
    && to !== 'EXPIRED' && to !== 'CANCELLED') {
    errors.push(createContractDomainError(
      'CONTENT_LOCKED',
      'Documento parcialmente assinado não permite esta transição.',
      'status',
    ));
  }

  return errors;
}

export function canTransitionContract(
  from: ContractStatus,
  to: ContractStatus,
  context: ContractTransitionContext,
): ContractTransitionResult {
  const errors: ContractDomainError[] = [];

  if (from === to) {
    errors.push(createContractDomainError(
      'INVALID_STATUS_TRANSITION',
      'Transição para o mesmo status não é necessária.',
      'status',
      { from, to },
    ));
    return { allowed: false, from, to, errors };
  }

  // SIGNED pode ir para SUPERSEDED/TERMINATED; demais terminais permanecem fechados.
  if (isTerminalContractStatus(from)) {
    errors.push(createContractDomainError(
      'TERMINAL_STATUS',
      'Estado terminal não pode ser reaberto.',
      'status',
      { from, to },
    ));
    return { allowed: false, from, to, errors };
  }

  // SIGNED nunca volta para DRAFT/APPROVED
  if (from === 'SIGNED' && (to === 'DRAFT' || to === 'APPROVED' || to === 'READY_FOR_REVIEW'
    || to === 'PENDING_INTERNAL_APPROVAL' || to === 'PENDING_SIGNATURES'
    || to === 'PARTIALLY_SIGNED')) {
    errors.push(createContractDomainError(
      'INVALID_STATUS_TRANSITION',
      'Contrato assinado não pode retornar a estados anteriores.',
      'status',
      { from, to },
    ));
    return { allowed: false, from, to, errors };
  }

  if (!baseTransitionAllowed(from, to)) {
    errors.push(createContractDomainError(
      'INVALID_STATUS_TRANSITION',
      'Transição de status não permitida.',
      'status',
      { from, to },
    ));
    return { allowed: false, from, to, errors };
  }

  errors.push(...collectContextErrors(from, to, context));

  return {
    allowed: errors.length === 0,
    from,
    to,
    errors,
  };
}

export function assertContractTransition(
  from: ContractStatus,
  to: ContractStatus,
  context: ContractTransitionContext,
): ContractTransitionResult {
  const result = canTransitionContract(from, to, context);
  if (!result.allowed) {
    const err = new Error(
      `INVALID_STATUS_TRANSITION: ${from} → ${to} (${result.errors.map((e) => e.code).join(',')})`,
    );
    (err as Error & { domainResult: ContractTransitionResult }).domainResult = result;
    throw err;
  }
  return result;
}

export function getAllowedContractTransitions(
  from: ContractStatus,
  context?: ContractTransitionContext,
): ContractStatus[] {
  const candidates = [...(ALLOWED_CONTRACT_TRANSITIONS[from] || [])];
  if (!context) return candidates;
  return candidates.filter((to) => canTransitionContract(from, to, context).allowed);
}

/** Contexto permissivo para testes de grafo puro (sem regras de negócio extras). */
export function createPermissiveTransitionContext(
  overrides: Partial<ContractTransitionContext> = {},
): ContractTransitionContext {
  return {
    hasPublishedTemplate: true,
    hasPatient: true,
    hasRequiredGuardian: true,
    hasBudgetWhenRequired: true,
    hasFinancialSnapshotWhenRequired: true,
    hasRequiredSigners: true,
    hasRequiredApprovals: true,
    hasLockedVersion: true,
    signaturesStarted: false,
    allRequiredSignaturesCompleted: true,
    cancellationReason: 'motivo de teste',
    supersededByContractId: 'contract-successor',
    hasActiveDecline: false,
    envelopeExpired: false,
    evidenceAvailable: true,
    ...overrides,
  };
}
