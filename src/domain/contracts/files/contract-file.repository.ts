/**
 * @module domain/contracts/files/contract-file.repository
 */

import type { ContractFileId, TenantId } from '../contract.ids.js';
import type { ContractFile } from './contract-file.types.js';

export interface ContractFileRepository {
  findById(
    tenantId: TenantId,
    fileId: ContractFileId,
  ): Promise<ContractFile | null>;

  listByContract(
    tenantId: TenantId,
    contractId: string,
  ): Promise<ContractFile[]>;

  create(
    tenantId: TenantId,
    file: ContractFile,
  ): Promise<ContractFile>;

  softDelete(
    tenantId: TenantId,
    fileId: ContractFileId,
    deletedAt: string,
  ): Promise<ContractFile>;
}
