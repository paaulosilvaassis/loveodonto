/**
 * @module domain/contracts/application/contract-memory.repository
 * @description Repository in-memory de contratos/versões/packages — Phase 10.5.
 */

import type {
  ContractId,
  ContractPackageId,
  ContractVersionId,
  TenantId,
} from '../contract.ids.js';
import type {
  Contract,
  ContractListQuery,
  ContractVersion,
} from '../contract.types.js';
import type { ContractPackage } from '../packages/contract-package.types.js';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface ContractApplicationRepository {
  findById(tenantId: TenantId, contractId: ContractId): Promise<Contract | null>;
  list(tenantId: TenantId, query?: ContractListQuery): Promise<Contract[]>;
  create(tenantId: TenantId, contract: Contract): Promise<Contract>;
  update(
    tenantId: TenantId,
    contract: Contract,
    expectedRowVersion?: number,
  ): Promise<Contract>;
  saveVersion(tenantId: TenantId, version: ContractVersion): Promise<ContractVersion>;
  updateVersion(
    tenantId: TenantId,
    version: ContractVersion,
    expectedRowVersion?: number,
  ): Promise<ContractVersion>;
  findVersionById(
    tenantId: TenantId,
    versionId: ContractVersionId,
  ): Promise<ContractVersion | null>;
  listVersions(tenantId: TenantId, contractId: ContractId): Promise<ContractVersion[]>;
  /** Rollback helper para testes de falha intermediária. */
  withTransaction?<T>(fn: () => Promise<T>): Promise<T>;
}

export interface ContractPackageApplicationRepository {
  findById(tenantId: TenantId, packageId: ContractPackageId): Promise<ContractPackage | null>;
  list(tenantId: TenantId): Promise<ContractPackage[]>;
  create(tenantId: TenantId, pkg: ContractPackage): Promise<ContractPackage>;
  update(tenantId: TenantId, pkg: ContractPackage): Promise<ContractPackage>;
}

export class ContractMemoryRepository implements ContractApplicationRepository {
  private contracts = new Map<string, Contract>();
  private versions = new Map<string, ContractVersion>();
  private available = true;
  private failNextUpdate = false;

  setStorageAvailable(v: boolean): void {
    this.available = v;
  }

  /** Força falha no próximo update (teste de rollback). */
  setFailNextUpdate(v: boolean): void {
    this.failNextUpdate = v;
  }

  private key(tenantId: string, id: string): string {
    return `${tenantId}::${id}`;
  }

  private assertAvailable(): void {
    if (!this.available) {
      const err = new Error('O módulo de contratos v2 ainda não está disponível neste ambiente.');
      (err as Error & { code: string }).code = 'CONTRACTS_V2_STORAGE_UNAVAILABLE';
      throw err;
    }
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.assertAvailable();
    const contractsSnap = new Map(this.contracts);
    const versionsSnap = new Map(this.versions);
    try {
      return await fn();
    } catch (error) {
      this.contracts = contractsSnap;
      this.versions = versionsSnap;
      throw error;
    }
  }

  async findById(tenantId: TenantId, contractId: ContractId): Promise<Contract | null> {
    this.assertAvailable();
    const found = this.contracts.get(this.key(tenantId, contractId));
    return found ? clone(found) : null;
  }

  async list(tenantId: TenantId, query: ContractListQuery = {}): Promise<Contract[]> {
    this.assertAvailable();
    let items = [...this.contracts.values()].filter((c) => c.tenantId === tenantId);
    if (query.patientId) items = items.filter((c) => c.patientId === query.patientId);
    if (query.budgetId) items = items.filter((c) => c.budgetId === query.budgetId);
    if (query.documentType) items = items.filter((c) => c.documentType === query.documentType);
    if (query.origin) items = items.filter((c) => c.origin === query.origin);
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      items = items.filter((c) => statuses.includes(c.status));
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter((c) => c.title.toLowerCase().includes(q)
        || c.contractNumber.toLowerCase().includes(q));
    }
    return items.map(clone);
  }

  async create(tenantId: TenantId, contract: Contract): Promise<Contract> {
    this.assertAvailable();
    if (contract.tenantId !== tenantId) {
      const err = new Error('TENANT_MISMATCH');
      (err as Error & { code: string }).code = 'TENANT_MISMATCH';
      throw err;
    }
    const stored = { ...clone(contract), rowVersion: contract.rowVersion ?? 1 };
    this.contracts.set(this.key(tenantId, contract.id), stored);
    return clone(stored);
  }

  async update(
    tenantId: TenantId,
    contract: Contract,
    expectedRowVersion?: number,
  ): Promise<Contract> {
    this.assertAvailable();
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new Error('SIMULATED_UPDATE_FAILURE');
    }
    const existing = this.contracts.get(this.key(tenantId, contract.id));
    if (!existing) {
      const err = new Error('NOT_FOUND');
      (err as Error & { code: string }).code = 'CONTRACT_NOT_FOUND';
      throw err;
    }
    if (
      expectedRowVersion != null
      && existing.rowVersion != null
      && expectedRowVersion !== existing.rowVersion
    ) {
      const err = new Error('OPTIMISTIC_CONCURRENCY_CONFLICT');
      (err as Error & { code: string }).code = 'OPTIMISTIC_CONCURRENCY_CONFLICT';
      throw err;
    }
    const stored = {
      ...clone(contract),
      tenantId,
      rowVersion: (existing.rowVersion || 1) + 1,
    };
    this.contracts.set(this.key(tenantId, contract.id), stored);
    return clone(stored);
  }

  async saveVersion(tenantId: TenantId, version: ContractVersion): Promise<ContractVersion> {
    this.assertAvailable();
    if (version.tenantId !== tenantId) {
      const err = new Error('TENANT_MISMATCH');
      (err as Error & { code: string }).code = 'TENANT_MISMATCH';
      throw err;
    }
    const key = this.key(tenantId, version.id);
    const existing = this.versions.get(key);
    if (existing?.lockedAt) {
      const err = new Error('VERSION_ALREADY_LOCKED');
      (err as Error & { code: string }).code = 'VERSION_ALREADY_LOCKED';
      throw err;
    }
    const stored = { ...clone(version), metadata: { ...(version.metadata || {}), rowVersion: 1 } };
    this.versions.set(key, stored);
    return clone(stored);
  }

  async updateVersion(
    tenantId: TenantId,
    version: ContractVersion,
    _expectedRowVersion?: number,
  ): Promise<ContractVersion> {
    this.assertAvailable();
    const key = this.key(tenantId, version.id);
    const existing = this.versions.get(key);
    if (!existing || existing.tenantId !== tenantId) {
      const err = new Error('NOT_FOUND');
      (err as Error & { code: string }).code = 'CONTRACT_NOT_FOUND';
      throw err;
    }
    if (existing.lockedAt && version.lockedAt !== existing.lockedAt
      && version.documentHash !== existing.documentHash) {
      const err = new Error('VERSION_ALREADY_LOCKED');
      (err as Error & { code: string }).code = 'VERSION_ALREADY_LOCKED';
      throw err;
    }
    if (existing.lockedAt && !version.lockedAt) {
      const err = new Error('VERSION_ALREADY_LOCKED');
      (err as Error & { code: string }).code = 'VERSION_ALREADY_LOCKED';
      throw err;
    }
    const stored = clone(version);
    this.versions.set(key, stored);
    return clone(stored);
  }

  async findVersionById(
    tenantId: TenantId,
    versionId: ContractVersionId,
  ): Promise<ContractVersion | null> {
    this.assertAvailable();
    const found = this.versions.get(this.key(tenantId, versionId));
    return found && found.tenantId === tenantId ? clone(found) : null;
  }

  async listVersions(tenantId: TenantId, contractId: ContractId): Promise<ContractVersion[]> {
    this.assertAvailable();
    return [...this.versions.values()]
      .filter((v) => v.tenantId === tenantId && v.contractId === contractId)
      .sort((a, b) => a.versionNumber - b.versionNumber)
      .map(clone);
  }
}

export class ContractPackageMemoryRepository implements ContractPackageApplicationRepository {
  private packages = new Map<string, ContractPackage>();

  private key(tenantId: string, id: string): string {
    return `${tenantId}::${id}`;
  }

  async findById(tenantId: TenantId, packageId: ContractPackageId): Promise<ContractPackage | null> {
    const found = this.packages.get(this.key(tenantId, packageId));
    return found ? clone(found) : null;
  }

  async list(tenantId: TenantId): Promise<ContractPackage[]> {
    return [...this.packages.values()]
      .filter((p) => p.tenantId === tenantId)
      .map(clone);
  }

  async create(tenantId: TenantId, pkg: ContractPackage): Promise<ContractPackage> {
    if (pkg.tenantId !== tenantId) {
      const err = new Error('TENANT_MISMATCH');
      (err as Error & { code: string }).code = 'TENANT_MISMATCH';
      throw err;
    }
    this.packages.set(this.key(tenantId, pkg.id), clone(pkg));
    return clone(pkg);
  }

  async update(tenantId: TenantId, pkg: ContractPackage): Promise<ContractPackage> {
    if (!this.packages.has(this.key(tenantId, pkg.id))) {
      const err = new Error('NOT_FOUND');
      (err as Error & { code: string }).code = 'CONTRACT_NOT_FOUND';
      throw err;
    }
    this.packages.set(this.key(tenantId, pkg.id), clone(pkg));
    return clone(pkg);
  }
}
