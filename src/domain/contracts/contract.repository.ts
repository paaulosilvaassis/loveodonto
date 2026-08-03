/**
 * @module domain/contracts/contract.repository
 * @description Interfaces de repositório — sem implementação Postgres (Phase 10.2).
 */

import type {
  ContractId,
  ContractVersionId,
  TenantId,
} from './contract.ids.js';
import type {
  Contract,
  ContractDraftPatch,
  ContractListQuery,
  ContractListResult,
  ContractStatusTransitionInput,
  ContractVersion,
} from './contract.types.js';

/**
 * Todas as operações exigem tenantId explicitamente.
 * Nenhuma implementação concreta nesta fase.
 */
export interface ContractRepository {
  findById(
    tenantId: TenantId,
    contractId: ContractId,
  ): Promise<Contract | null>;

  list(
    tenantId: TenantId,
    query: ContractListQuery,
  ): Promise<ContractListResult>;

  create(
    tenantId: TenantId,
    contract: Contract,
  ): Promise<Contract>;

  updateDraft(
    tenantId: TenantId,
    contractId: ContractId,
    patch: ContractDraftPatch,
    expectedVersion?: number,
  ): Promise<Contract>;

  saveVersion(
    tenantId: TenantId,
    version: ContractVersion,
  ): Promise<ContractVersion>;

  findVersionById(
    tenantId: TenantId,
    versionId: ContractVersionId,
  ): Promise<ContractVersion | null>;

  listVersions(
    tenantId: TenantId,
    contractId: ContractId,
  ): Promise<ContractVersion[]>;

  transitionStatus(
    tenantId: TenantId,
    input: ContractStatusTransitionInput,
  ): Promise<Contract>;
}

/** Erro tipado para stubs — não implementar persistência nesta fase. */
export class ContractRepositoryNotImplementedError extends Error {
  readonly code = 'CONTRACT_REPOSITORY_NOT_IMPLEMENTED';

  constructor(method: string) {
    super(`ContractRepository.${method} não implementado na Phase 10.2.`);
    this.name = 'ContractRepositoryNotImplementedError';
  }
}
