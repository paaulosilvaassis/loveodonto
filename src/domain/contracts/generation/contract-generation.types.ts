/**
 * @module domain/contracts/generation/contract-generation.types
 * @description Context e resultados do pipeline — Phase 10.5.
 */

import type {
  ContractTemplateId,
  ContractTemplateVersionId,
  ContractId,
  ContractVersionId,
  TenantId,
} from '../contract.ids.js';
import type { ContractVersionGenerationReason } from '../contract.constants.js';
import type { ContractDomainEvent } from '../contract.events.js';
import type { ContractDomainError, ContractDomainWarning } from '../contract.errors.js';
import type {
  Contract,
  ContractAttachmentSnapshot,
  ContractBudgetSnapshot,
  ContractClinicSnapshot,
  ContractConsentSnapshot,
  ContractFinancialSnapshot,
  ContractGuardianSnapshot,
  ContractOdontogramSnapshot,
  ContractPatientSnapshot,
  ContractProfessionalSnapshot,
  ContractSignerSnapshot,
  ContractTermsSnapshot,
  ContractTreatmentSnapshot,
  ContractVersion,
} from '../contract.types.js';
import type { ContractTemplate } from '../templates/contract-template.types.js';
import type { ContractTemplateVersion } from '../templates/contract-template.types.js';

/** Ator de operação de aplicação (≠ ledger ContractAuditActor). */
export interface ContractOperationActor {
  userId: string;
  displayName?: string;
  permissions?: string[];
}

export interface ContractGenerationContext {
  tenantId: TenantId;
  contract: Contract;
  template: ContractTemplate;
  templateVersion: ContractTemplateVersion;

  patient: ContractPatientSnapshot;
  guardian?: ContractGuardianSnapshot;
  clinic: ContractClinicSnapshot;
  professional?: ContractProfessionalSnapshot;
  budget?: ContractBudgetSnapshot;
  treatment?: ContractTreatmentSnapshot;
  odontogram?: ContractOdontogramSnapshot;
  financial?: ContractFinancialSnapshot;
  consents?: ContractConsentSnapshot[];
  signers: ContractSignerSnapshot[];
  attachments?: ContractAttachmentSnapshot[];
  terms?: ContractTermsSnapshot;

  generationReason: ContractVersionGenerationReason;
  actor: ContractOperationActor;
  generatedAt: string;
  idempotencyKey?: string;
  /** Quando true, assinatura já iniciada — bloqueia nova versão. */
  signaturesStarted?: boolean;
  requirements?: {
    requiresBudget?: boolean;
    requiresFinancialPlan?: boolean;
    requiresOdontogram?: boolean;
    requiresGuardian?: boolean;
  };
}

export interface GenerateContractVersionInput {
  context: ContractGenerationContext;
}

export interface ContractGenerationValidationResult {
  valid: boolean;
  errors: ContractDomainError[];
  warnings: ContractDomainWarning[];
  variables: {
    used: string[];
    unknown: string[];
    unresolvedRequired: string[];
    unresolvedOptional: string[];
  };
}

export interface GenerateContractVersionResult {
  contract: Contract;
  version: ContractVersion;
  validation: ContractGenerationValidationResult;
  events: ContractDomainEvent[];
  warnings: ContractDomainWarning[];
  idempotentReplay: boolean;
}

export interface CreateContractDraftInput {
  documentType: import('../contract.constants.js').ContractDocumentType;
  title: string;
  patientId: import('../contract.ids.js').PatientId;
  guardianPatientId?: import('../contract.ids.js').PatientId;
  budgetId?: import('../contract.ids.js').BudgetId;
  treatmentPlanId?: string;
  appointmentId?: string;
  templateId?: ContractTemplateId;
  templateVersionId?: ContractTemplateVersionId;
  origin: import('../contract.constants.js').ContractOrigin;
  requirements?: import('../templates/contract-template.types.js').ContractTemplateRequirements;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateContractDraftResult {
  contract: Contract;
  events: ContractDomainEvent[];
  idempotentReplay: boolean;
}

export interface UpdateContractDraftInput {
  title?: string;
  documentType?: import('../contract.constants.js').ContractDocumentType;
  guardianPatientId?: import('../contract.ids.js').PatientId | null;
  budgetId?: import('../contract.ids.js').BudgetId | null;
  treatmentPlanId?: string | null;
  appointmentId?: string | null;
  templateId?: ContractTemplateId | null;
  templateVersionId?: ContractTemplateVersionId | null;
  expectedRowVersion?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateContractVersionInput {
  context: Omit<ContractGenerationContext, 'contract' | 'tenantId' | 'actor' | 'generatedAt'> & {
    generatedAt?: string;
  };
  idempotencyKey?: string;
}

export interface CreateContractVersionResult extends GenerateContractVersionResult {}

export interface ContractDetails {
  contract: Contract;
  currentVersion: ContractVersion | null;
  versions: ContractVersion[];
}

export interface ContractStatusTransitionServiceInput {
  toStatus: import('../contract.constants.js').ContractStatus;
  expectedRowVersion?: number;
  cancellationReason?: string;
  metadata?: Record<string, unknown>;
}

export interface ContractStatusTransitionResult {
  contract: Contract;
  events: ContractDomainEvent[];
}

export interface CancelContractInput {
  cancellationReason: string;
  expectedRowVersion?: number;
}

export interface DuplicateContractInput {
  title?: string;
}

export interface ContractReadinessResult {
  targetStatus: import('../contract.constants.js').ContractStatus;
  valid: boolean;
  errors: ContractDomainError[];
  warnings: ContractDomainWarning[];
}

export interface CreateContractPackageInput {
  patientId: import('../contract.ids.js').PatientId;
  budgetId?: import('../contract.ids.js').BudgetId;
  treatmentPlanId?: string;
  requirements: import('../packages/contract-package.types.js').ContractPackageRequirement[];
  idempotencyKey?: string;
}

export interface CreateContractPackageResult {
  package: import('../packages/contract-package.types.js').ContractPackage;
  events: ContractDomainEvent[];
  idempotentReplay: boolean;
}

export interface AddContractToPackageInput {
  contractId: ContractId;
  required?: boolean;
}

export interface ContractPackageValidationResult {
  valid: boolean;
  errors: ContractDomainError[];
  warnings: ContractDomainWarning[];
}

/** Refs tipados para eventos (payloads sem PII integral). */
export interface ContractCreatedEventPayload {
  contractId: ContractId;
  contractNumber: string;
  documentType: string;
  patientId: string;
  origin: string;
}

export interface ContractVersionCreatedEventPayload {
  contractId: ContractId;
  versionId: ContractVersionId;
  versionNumber: number;
  generationReason: string;
  documentHash?: string;
}

export interface ContractVersionLockedEventPayload {
  contractId: ContractId;
  versionId: ContractVersionId;
  versionNumber: number;
  documentHash: string;
  lockedAt: string;
}

export interface ContractReadyForReviewEventPayload {
  contractId: ContractId;
  versionId?: ContractVersionId;
}

export interface ContractApprovalRequestedEventPayload {
  contractId: ContractId;
  versionId?: ContractVersionId;
}

export interface ContractApprovedEventPayload {
  contractId: ContractId;
  versionId?: ContractVersionId;
}

export interface ContractCancelledEventPayload {
  contractId: ContractId;
  reasonPresent: boolean;
}

export interface ContractPackageCreatedEventPayload {
  packageId: string;
  packageNumber: string;
  patientId: string;
}

export interface ContractPackageCompletedEventPayload {
  packageId: string;
  packageNumber: string;
  itemCount: number;
}
