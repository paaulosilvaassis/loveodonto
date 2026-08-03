/**
 * @module domain/contracts/templates/contract-template.types
 */

import type {
  ContractTemplateId,
  ContractTemplateVersionId,
  SignaturePolicyId,
  TenantId,
} from '../contract.ids.js';
import type { ContractDocumentType } from '../contract.constants.js';
import type { ContractContentSchema } from './contract-template-content.schema.js';

export const CONTRACT_TEMPLATE_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'PUBLISHED',
  'SUPERSEDED',
  'ARCHIVED',
] as const;

export type ContractTemplateStatus = (typeof CONTRACT_TEMPLATE_STATUSES)[number];

export interface ContractTemplateRequirements {
  requiresBudget: boolean;
  requiresFinancialPlan: boolean;
  requiresOdontogram: boolean;
  requiresGuardian: boolean;
  requiresWitnesses: boolean;
  witnessesMin?: number;
  witnessesMax?: number;
  requiresProfessionalSignature: boolean;
  requiresClinicSignature: boolean;
  requiresPatientSignature: boolean;
  requiresResponsibleSignature: boolean;
  requiresInternalApproval: boolean;
  /** Consentimento exige seção de riscos quando true. */
  requiresRisksSection?: boolean;
}

export function createDefaultTemplateRequirements(): ContractTemplateRequirements {
  return {
    requiresBudget: true,
    requiresFinancialPlan: false,
    requiresOdontogram: false,
    requiresGuardian: false,
    requiresWitnesses: false,
    witnessesMin: 0,
    witnessesMax: 2,
    requiresProfessionalSignature: true,
    requiresClinicSignature: true,
    requiresPatientSignature: true,
    requiresResponsibleSignature: false,
    requiresInternalApproval: false,
    requiresRisksSection: false,
  };
}

/** Entrada serializada em variablesSchema da versão (Phase 10.2). */
export interface ContractTemplateVersionVariableEntry {
  key: string;
  label: string;
  required: boolean;
  valueType: 'string' | 'number' | 'date' | 'boolean' | 'html' | 'table' | 'image';
  path?: string;
}

export interface ContractTemplate {
  id: ContractTemplateId;
  tenantId: TenantId;
  name: string;
  description?: string;
  documentType: ContractDocumentType;
  category?: string;
  procedureCodes?: string[];
  specialtyCodes?: string[];
  templateStatus: ContractTemplateStatus;
  currentVersionId?: ContractTemplateVersionId;
  isDefault: boolean;
  requirements: ContractTemplateRequirements;
  signaturePolicyId?: SignaturePolicyId;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt: string;
  archivedAt?: string;
  rowVersion?: number;
}

export interface ContractTemplateVersion {
  id: ContractTemplateVersionId;
  tenantId: TenantId;
  templateId: ContractTemplateId;
  versionNumber: number;
  versionLabel?: string;
  contentSchema?: ContractContentSchema | unknown;
  contentHtml: string;
  contentText?: string;
  variablesSchema: ContractTemplateVersionVariableEntry[];
  clausesSnapshot?: unknown;
  changeSummary?: string;
  status: ContractTemplateStatus;
  publishedBy?: string;
  publishedAt?: string;
  lockedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  rowVersion?: number;
}

export interface ContractTemplateListQuery {
  search?: string;
  documentType?: string;
  category?: string;
  status?: ContractTemplateStatus | ContractTemplateStatus[];
  procedureCode?: string;
  specialtyCode?: string;
  isDefault?: boolean;
  includeArchived?: boolean;
}

export interface ContractTemplateListResult {
  items: ContractTemplate[];
  total: number;
}

export interface ContractTemplateDetails {
  template: ContractTemplate;
  currentVersion: ContractTemplateVersion | null;
  versions: ContractTemplateVersion[];
}

/** Ator de operações do application service de templates (≠ ContractAuditActor do ledger). */
export interface ContractTemplateActor {
  userId: string;
  displayName?: string;
  permissions?: string[];
}

export interface CreateContractTemplateInput {
  name: string;
  description?: string;
  documentType: ContractDocumentType;
  category?: string;
  procedureCodes?: string[];
  specialtyCodes?: string[];
  isDefault?: boolean;
  requirements?: Partial<ContractTemplateRequirements>;
  signaturePolicyId?: SignaturePolicyId;
  initialContentSchema?: ContractContentSchema;
}

export interface UpdateContractTemplateInput {
  name?: string;
  description?: string;
  category?: string;
  procedureCodes?: string[];
  specialtyCodes?: string[];
  isDefault?: boolean;
  requirements?: Partial<ContractTemplateRequirements>;
  signaturePolicyId?: SignaturePolicyId | null;
  expectedRowVersion?: number;
}

export interface CreateContractTemplateVersionInput {
  versionLabel?: string;
  contentSchema?: ContractContentSchema;
  contentHtml?: string;
  contentText?: string;
  changeSummary?: string;
  clausesSnapshot?: unknown;
}

export interface UpdateContractTemplateVersionInput {
  versionLabel?: string;
  contentSchema?: ContractContentSchema;
  contentHtml?: string;
  contentText?: string;
  changeSummary?: string;
  clausesSnapshot?: unknown;
  expectedRowVersion?: number;
}

export interface PublishedContractTemplateResult {
  template: ContractTemplate;
  version: ContractTemplateVersion;
  supersededVersionId?: ContractTemplateVersionId;
  /** Evento tipado — não publicado no bus nesta fase. */
  event: {
    type: 'contract_template.version_published';
    tenantId: string;
    templateId: string;
    versionId: string;
    publishedBy: string;
    occurredAt: string;
  };
}

export interface ContractTemplateValidationResult {
  valid: boolean;
  errors: import('../contract.errors.js').ContractDomainError[];
  warnings: import('../contract.errors.js').ContractDomainWarning[];
  variables: {
    used: string[];
    unknown: string[];
    unresolved: string[];
    sensitive: string[];
  };
  blocks: {
    total: number;
    invalid: string[];
    missingRequired: import('./contract-template-content.schema.js').ContractTemplateBlockType[];
  };
}
