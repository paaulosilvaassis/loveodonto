/**
 * @module domain/contracts/templates/contract-template-status.machine
 * @description State machine pura de templates — Phase 10.4.
 */

import {
  createContractDomainError,
  type ContractDomainError,
} from '../contract.errors.js';
import type { ContractTemplateStatus } from './contract-template.types.js';

export const ALLOWED_TEMPLATE_TRANSITIONS: Readonly<
  Record<ContractTemplateStatus, readonly ContractTemplateStatus[]>
> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['SUPERSEDED', 'ARCHIVED'],
  SUPERSEDED: ['ARCHIVED'],
  ARCHIVED: [],
};

export interface TemplateTransitionResult {
  allowed: boolean;
  from: ContractTemplateStatus;
  to: ContractTemplateStatus;
  errors: ContractDomainError[];
}

export function canTransitionTemplateStatus(
  from: ContractTemplateStatus,
  to: ContractTemplateStatus,
): TemplateTransitionResult {
  const allowed = (ALLOWED_TEMPLATE_TRANSITIONS[from] || []).includes(to);
  const errors: ContractDomainError[] = [];
  if (!allowed) {
    errors.push(createContractDomainError(
      'INVALID_STATUS_TRANSITION',
      `Transição de template ${from} → ${to} não permitida.`,
      'templateStatus',
      { from, to },
    ));
  }
  return { allowed, from, to, errors };
}

export function assertTemplateTransition(
  from: ContractTemplateStatus,
  to: ContractTemplateStatus,
): void {
  const result = canTransitionTemplateStatus(from, to);
  if (!result.allowed) {
    const err = result.errors[0];
    throw Object.assign(new Error(err.message), { domainError: err });
  }
}

export function isTemplateEditableStatus(status: ContractTemplateStatus): boolean {
  return status === 'DRAFT' || status === 'IN_REVIEW';
}

export function isTemplatePublishedImmutable(status: ContractTemplateStatus): boolean {
  return status === 'PUBLISHED' || status === 'SUPERSEDED';
}

export function isTemplateArchived(status: ContractTemplateStatus): boolean {
  return status === 'ARCHIVED';
}
