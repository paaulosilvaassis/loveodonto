/**
 * @module repositories/contracts/contractPackageSupabaseRepository
 */

import type { ContractPackageRepository } from '../../domain/contracts/packages/contract-package.repository.js';
import type { ContractPackage } from '../../domain/contracts/packages/contract-package.types.js';
import {
  ContractPersistenceNotFoundError,
  ContractPersistenceTenantMismatchError,
  ContractPersistenceUnavailableError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import {
  assertValidTenantId,
  mapDomainPackageToRow,
  mapPackageRowToDomain,
} from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type {
  AppContractPackageRow,
  ContractSupabaseClient,
} from './contractPersistenceTypes.js';

export class ContractPackageSupabaseRepository implements ContractPackageRepository {
  constructor(private readonly deps: { client?: ContractSupabaseClient | null } = {}) {}

  private client(): ContractSupabaseClient {
    if (!this.deps.client) throw new ContractPersistenceUnavailableError();
    return this.deps.client;
  }

  async findById(tenantId: string, packageId: string): Promise<ContractPackage | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.PACKAGES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', packageId)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapPackageRowToDomain(data as AppContractPackageRow) : null;
  }

  async listByPatient(tenantId: string, patientId: string): Promise<ContractPackage[]> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.PACKAGES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('patient_id', patientId);
    if (error) mapPersistenceDriverError(error);
    return (data || []).map((row: AppContractPackageRow) => mapPackageRowToDomain(row));
  }

  async listByBudget(tenantId: string, budgetId: string): Promise<ContractPackage[]> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.PACKAGES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('budget_id', budgetId);
    if (error) mapPersistenceDriverError(error);
    return (data || []).map((row: AppContractPackageRow) => mapPackageRowToDomain(row));
  }

  async create(tenantId: string, pkg: ContractPackage): Promise<ContractPackage> {
    const tid = assertValidTenantId(tenantId);
    if (pkg.tenantId && pkg.tenantId !== tid) {
      throw new ContractPersistenceTenantMismatchError(tid, pkg.tenantId);
    }
    const row = mapDomainPackageToRow({ ...pkg, tenantId: tid });
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.PACKAGES)
      .insert(row)
      .select('*')
      .single();
    if (error) mapPersistenceDriverError(error);
    return mapPackageRowToDomain(data as AppContractPackageRow);
  }

  async update(
    tenantId: string,
    packageId: string,
    pkg: ContractPackage,
  ): Promise<ContractPackage> {
    const tid = assertValidTenantId(tenantId);
    const row = mapDomainPackageToRow({ ...pkg, tenantId: tid, id: packageId });
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.PACKAGES)
      .update(row)
      .eq('tenant_id', tid)
      .eq('id', packageId)
      .select('*')
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) throw new ContractPersistenceNotFoundError('package', packageId);
    return mapPackageRowToDomain(data as AppContractPackageRow);
  }
}
