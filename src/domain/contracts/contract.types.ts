/**
 * @module domain/contracts/contract.types
 * @description Entidades canônicas de contrato e snapshots — Phase 10.2.
 */

import type {
  AppointmentId,
  BudgetId,
  ContractId,
  ContractVersionId,
  PatientId,
  SignatureEnvelopeId,
  TenantId,
  TreatmentPlanId,
  ContractTemplateId,
  ContractTemplateVersionId,
} from './contract.ids.js';
import type {
  ContractDocumentType,
  ContractOrigin,
  ContractStatus,
  ContractVersionGenerationReason,
} from './contract.constants.js';

// ---------------------------------------------------------------------------
// Snapshots (somente valores serializáveis)
// ---------------------------------------------------------------------------

export interface ContractPatientSnapshot {
  patientId: PatientId;
  fullName: string;
  documentType?: string;
  documentNumberMasked?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  addressFull?: string;
  maritalStatus?: string;
}

export interface ContractGuardianSnapshot {
  patientId?: PatientId;
  fullName: string;
  documentNumberMasked?: string;
  relationship?: string;
  representationType?: string;
  email?: string;
  phone?: string;
  addressFull?: string;
}

export interface ContractClinicSnapshot {
  legalName: string;
  tradeName?: string;
  cnpjMasked?: string;
  addressFull?: string;
  phone?: string;
  email?: string;
  responsibleProfessionalName?: string;
  responsibleProfessionalCro?: string;
}

export interface ContractProfessionalSnapshot {
  professionalId?: string;
  name: string;
  cro?: string;
  specialty?: string;
}

export interface ContractBudgetItemSnapshot {
  budgetItemId?: string;
  procedureId?: string;
  procedureCode?: string;
  procedureName: string;
  tooth?: string;
  toothSurface?: string;
  region?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  finalPrice: number;
}

export interface ContractBudgetSnapshot {
  budgetId?: BudgetId;
  budgetVersionId?: string;
  budgetNumber?: string;
  quoteSource?: 'crm_budget' | 'clinical_budget' | string;
  quoteId?: string;
  total: number;
  discountTotal?: number;
  finalTotal: number;
  currency?: string;
  validUntil?: string;
  notes?: string;
  items: ContractBudgetItemSnapshot[];
}

export interface ContractTreatmentSnapshot {
  treatmentPlanId?: TreatmentPlanId;
  summary?: string;
  items: ContractBudgetItemSnapshot[];
}

export interface ContractOdontogramSnapshot {
  patientId: PatientId;
  odontogramVersion?: string;
  odontogramData?: unknown;
  imageFileId?: string;
  summary?: string;
  capturedAt?: string;
  hash?: string;
}

export interface ContractFinancialSnapshot {
  budgetTotal?: number;
  discountTotal?: number;
  contractTotal: number;
  downPayment?: number;
  financedAmount?: number;
  installmentCount?: number;
  installmentValue?: number;
  interestRate?: number;
  fees?: number;
  paymentMethods?: string[];
  dueDates?: string[];
  payerSnapshot?: Record<string, unknown>;
  receivablesReference?: string[];
  financialConditionsText?: string;
  currency?: string;
  capturedAt?: string;
  hash?: string;
}

export interface ContractConsentSnapshot {
  consentType: string;
  procedureCode?: string;
  title: string;
  content?: string;
  risks?: string;
  benefits?: string;
  alternatives?: string;
  nonTreatmentConsequences?: string;
  accepted?: boolean;
  acceptedAt?: string;
}

export interface ContractSignerSnapshot {
  role: string;
  name: string;
  email?: string;
  phone?: string;
  documentNumberMasked?: string;
  order?: number;
  required: boolean;
}

export interface ContractAttachmentSnapshot {
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  fileType?: string;
  /** Referência canônica — nunca inventar storage inexistente. */
  storageRefHint?: string;
  /** Indica que o legado mantém data URL (não é storage definitivo). */
  legacyDataUrlPresent?: boolean;
}

export interface ContractTermsSnapshot {
  privacyNoticeVersion?: string;
  acceptanceChannel?: string;
  termsAcceptedAt?: string;
  customTerms?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Contract + Version
// ---------------------------------------------------------------------------

export interface Contract {
  id: ContractId;
  tenantId: TenantId;
  contractNumber: string;
  documentType: ContractDocumentType;
  title: string;
  patientId: PatientId;
  guardianPatientId?: PatientId;
  budgetId?: BudgetId;
  budgetVersionId?: string;
  treatmentPlanId?: TreatmentPlanId;
  appointmentId?: AppointmentId;
  origin: ContractOrigin;
  status: ContractStatus;
  currentVersionId?: ContractVersionId;
  signatureEnvelopeId?: SignatureEnvelopeId;
  effectiveDate?: string;
  expirationDate?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  supersededByContractId?: ContractId;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Versão otimista futura — não persistida nesta fase. */
  rowVersion?: number;
  metadata?: Record<string, unknown>;
}

export interface ContractVersion {
  id: ContractVersionId;
  tenantId: TenantId;
  contractId: ContractId;
  versionNumber: number;
  templateId?: ContractTemplateId;
  templateVersionId?: ContractTemplateVersionId;
  generationReason: ContractVersionGenerationReason;

  contentSchemaSnapshot: unknown;
  renderedHtmlSnapshot?: string;
  plainTextSnapshot?: string;

  patientSnapshot: ContractPatientSnapshot;
  guardianSnapshot?: ContractGuardianSnapshot;
  clinicSnapshot: ContractClinicSnapshot;
  professionalSnapshot?: ContractProfessionalSnapshot;
  budgetSnapshot?: ContractBudgetSnapshot;
  treatmentSnapshot?: ContractTreatmentSnapshot;
  odontogramSnapshot?: ContractOdontogramSnapshot;
  financialSnapshot?: ContractFinancialSnapshot;
  consentsSnapshot?: ContractConsentSnapshot[];
  signersSnapshot: ContractSignerSnapshot[];
  attachmentsSnapshot?: ContractAttachmentSnapshot[];
  termsSnapshot?: ContractTermsSnapshot;

  documentHash?: string;
  previousVersionHash?: string;
  createdBy: string;
  createdAt: string;
  lockedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ContractDraftPatch {
  title?: string;
  documentType?: ContractDocumentType;
  guardianPatientId?: PatientId | null;
  budgetId?: BudgetId | null;
  treatmentPlanId?: TreatmentPlanId | null;
  appointmentId?: AppointmentId | null;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ContractListQuery {
  patientId?: PatientId;
  status?: ContractStatus | ContractStatus[];
  documentType?: ContractDocumentType;
  budgetId?: BudgetId;
  origin?: ContractOrigin;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
  offset?: number;
}

export interface ContractListResult {
  items: Contract[];
  total: number;
  limit: number;
  offset: number;
}

export interface ContractStatusTransitionInput {
  contractId: ContractId;
  fromStatus: ContractStatus;
  toStatus: ContractStatus;
  expectedRowVersion?: number;
  cancellationReason?: string;
  supersededByContractId?: ContractId;
  actorId?: string;
  metadata?: Record<string, unknown>;
}
