/**
 * @module domain/contracts/packages/contract-package.repository
 */

import type { ContractPackageId, TenantId } from '../contract.ids.js';
import type { ContractPackage } from './contract-package.types.js';

export interface ContractPackageRepository {
  findById(
    tenantId: TenantId,
    packageId: ContractPackageId,
  ): Promise<ContractPackage | null>;

  listByPatient(
    tenantId: TenantId,
    patientId: string,
  ): Promise<ContractPackage[]>;

  listByBudget(
    tenantId: TenantId,
    budgetId: string,
  ): Promise<ContractPackage[]>;

  create(
    tenantId: TenantId,
    pkg: ContractPackage,
  ): Promise<ContractPackage>;

  update(
    tenantId: TenantId,
    packageId: ContractPackageId,
    pkg: ContractPackage,
  ): Promise<ContractPackage>;
}
