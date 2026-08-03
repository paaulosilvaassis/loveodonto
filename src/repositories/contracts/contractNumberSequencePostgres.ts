/**
 * @module repositories/contracts/contractNumberSequencePostgres
 * @description Numeração CTR/PKG via função SQL concorrente — Phase 10.9.
 */

import type {
  ContractNumberGenerator,
  PackageNumberGenerator,
} from '../../domain/contracts/numbering/contract-number.generator.js';
import type { TenantId } from '../../domain/contracts/contract.ids.js';
import { ContractPersistenceUnavailableError } from './contractPersistenceErrors.js';
import { assertValidTenantId } from './contractPersistenceMappers.js';
import type { DatabaseTransactionClient } from './contractsV2Transaction.js';

export interface ContractNumberRpcClient {
  rpc?: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: { message?: string } | null }>;
  query?: DatabaseTransactionClient['query'];
}

export function createPostgresContractNumberGenerator(
  client?: ContractNumberRpcClient | null,
): ContractNumberGenerator {
  return {
    async generate(tenantId: TenantId, input = {}) {
      if (!client) throw new ContractPersistenceUnavailableError();
      const tid = assertValidTenantId(tenantId);
      const year = input.year;
      if (client.rpc) {
        const { data, error } = await client.rpc('app_contract_next_number', {
          p_tenant_id: tid,
          p_kind: 'CTR',
          p_year: year ?? null,
        });
        if (error) throw new Error(error.message || 'NUMBER_GENERATION_FAILED');
        if (!data) throw new Error('NUMBER_GENERATION_EMPTY');
        return data;
      }
      if (client.query) {
        const yearSql = year == null ? 'null' : String(year);
        const { rows } = await client.query<{ app_contract_next_number: string }>(
          `select public.app_contract_next_number('${tid}'::uuid, 'CTR', ${yearSql}) as app_contract_next_number`,
        );
        return rows[0].app_contract_next_number;
      }
      throw new ContractPersistenceUnavailableError();
    },
  };
}

export function createPostgresPackageNumberGenerator(
  client?: ContractNumberRpcClient | null,
): PackageNumberGenerator {
  return {
    async generate(tenantId: TenantId, input = {}) {
      if (!client) throw new ContractPersistenceUnavailableError();
      const tid = assertValidTenantId(tenantId);
      const year = input.year;
      if (client.rpc) {
        const { data, error } = await client.rpc('app_contract_next_number', {
          p_tenant_id: tid,
          p_kind: 'PKG',
          p_year: year ?? null,
        });
        if (error) throw new Error(error.message || 'NUMBER_GENERATION_FAILED');
        if (!data) throw new Error('NUMBER_GENERATION_EMPTY');
        return data;
      }
      if (client.query) {
        const yearSql = year == null ? 'null' : String(year);
        const { rows } = await client.query<{ app_contract_next_number: string }>(
          `select public.app_contract_next_number('${tid}'::uuid, 'PKG', ${yearSql}) as app_contract_next_number`,
        );
        return rows[0].app_contract_next_number;
      }
      throw new ContractPersistenceUnavailableError();
    },
  };
}
