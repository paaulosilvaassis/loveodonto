/**
 * @module domain/contracts/packages/contract-package.types
 */

import type {
  BudgetId,
  ContractId,
  ContractPackageId,
  PatientId,
  TenantId,
  TreatmentPlanId,
} from '../contract.ids.js';
import type { ContractDocumentType } from '../contract.constants.js';

export const CONTRACT_PACKAGE_STATUSES = [
  'DRAFT',
  'PENDING',
  'PARTIALLY_COMPLETE',
  'COMPLETED',
  'CANCELLED',
] as const;

export type ContractPackageStatus = (typeof CONTRACT_PACKAGE_STATUSES)[number];

export interface ContractPackageRequirement {
  documentType: ContractDocumentType;
  required: boolean;
  procedureCode?: string;
  templateIdHint?: string;
}

export interface ContractPackageItem {
  contractId: ContractId;
  documentType: ContractDocumentType;
  required: boolean;
  status: string;
  completedAt?: string;
}

export interface ContractPackage {
  id: ContractPackageId;
  tenantId: TenantId;
  patientId: PatientId;
  budgetId?: BudgetId;
  treatmentPlanId?: TreatmentPlanId;
  status: ContractPackageStatus;
  packageNumber: string;
  requirements: ContractPackageRequirement[];
  items: ContractPackageItem[];
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}
