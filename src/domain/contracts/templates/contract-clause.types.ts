/**
 * @module domain/contracts/templates/contract-clause.types
 * @description Biblioteca de cláusulas (domínio; sem tabela Postgres na 10.3).
 */

import type { TenantId } from '../contract.ids.js';
import type { ContractTemplateVersionVariableEntry } from './contract-template.types.js';

export type ContractClauseId = string & { readonly __brand: 'ContractClauseId' };

export const CONTRACT_CLAUSE_CATEGORIES = [
  'IDENTIFICATION',
  'OBJECT',
  'TREATMENT_SCOPE',
  'PATIENT_OBLIGATIONS',
  'CLINIC_OBLIGATIONS',
  'FINANCIAL',
  'CANCELLATION',
  'WARRANTY',
  'RISKS',
  'CONSENT',
  'LGPD',
  'IMAGE_AUTHORIZATION',
  'FORCE_MAJEURE',
  'DISPUTE',
  'SIGNATURE',
  'CUSTOM',
] as const;

export type ContractClauseCategory = (typeof CONTRACT_CLAUSE_CATEGORIES)[number];

export type ContractClauseRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ContractClauseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ContractClauseLegalReviewStatus = 'PENDING' | 'REVIEWED' | 'NOT_REQUIRED';

export interface ContractClause {
  id: ContractClauseId;
  tenantId: TenantId | null;
  clauseCode: string;
  title: string;
  category: ContractClauseCategory;
  content: string;
  variables: ContractTemplateVersionVariableEntry[];
  riskLevel: ContractClauseRiskLevel;
  isMandatory: boolean;
  isSystemClause: boolean;
  status: ContractClauseStatus;
  legalReviewStatus?: ContractClauseLegalReviewStatus;
  legalReviewedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
