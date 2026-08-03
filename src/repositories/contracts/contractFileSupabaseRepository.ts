/**
 * @module repositories/contracts/contractFileSupabaseRepository
 */

import type { ContractFileRepository } from '../../domain/contracts/files/contract-file.repository.js';
import type { ContractFile } from '../../domain/contracts/files/contract-file.types.js';
import {
  ContractPersistenceNotFoundError,
  ContractPersistenceTenantMismatchError,
  ContractPersistenceUnavailableError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import {
  assertValidTenantId,
  mapDomainFileToRow,
  mapFileRowToDomain,
} from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type {
  AppContractFileRow,
  ContractSupabaseClient,
} from './contractPersistenceTypes.js';

export class ContractFileSupabaseRepository implements ContractFileRepository {
  constructor(private readonly deps: { client?: ContractSupabaseClient | null } = {}) {}

  private client(): ContractSupabaseClient {
    if (!this.deps.client) throw new ContractPersistenceUnavailableError();
    return this.deps.client;
  }

  async findById(tenantId: string, fileId: string): Promise<ContractFile | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.FILES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', fileId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapFileRowToDomain(data as AppContractFileRow) : null;
  }

  async listByContract(tenantId: string, contractId: string): Promise<ContractFile[]> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.FILES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('contract_id', contractId)
      .is('deleted_at', null);
    if (error) mapPersistenceDriverError(error);
    return (data || []).map((row: AppContractFileRow) => mapFileRowToDomain(row));
  }

  async create(tenantId: string, file: ContractFile): Promise<ContractFile> {
    const tid = assertValidTenantId(tenantId);
    if (file.tenantId && file.tenantId !== tid) {
      throw new ContractPersistenceTenantMismatchError(tid, file.tenantId);
    }
    const row = mapDomainFileToRow({ ...file, tenantId: tid });
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.FILES)
      .insert(row)
      .select('*')
      .single();
    if (error) mapPersistenceDriverError(error);
    return mapFileRowToDomain(data as AppContractFileRow);
  }

  async softDelete(
    tenantId: string,
    fileId: string,
    deletedAt: string,
  ): Promise<ContractFile> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.FILES)
      .update({ deleted_at: deletedAt })
      .eq('tenant_id', tid)
      .eq('id', fileId)
      .select('*')
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) throw new ContractPersistenceNotFoundError('file', fileId);
    return mapFileRowToDomain(data as AppContractFileRow);
  }
}
