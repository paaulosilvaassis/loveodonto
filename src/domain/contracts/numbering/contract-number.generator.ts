/**
 * @module domain/contracts/numbering/contract-number.generator
 * @description Numeração CTR-YYYY-000001 por tenant — Phase 10.5.
 */

import type { TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';

export interface ContractNumberGenerationInput {
  documentType?: string;
  year?: number;
}

export interface ContractNumberGenerator {
  generate(
    tenantId: TenantId,
    input?: ContractNumberGenerationInput,
  ): Promise<string>;
}

export interface PackageNumberGenerator {
  generate(tenantId: TenantId, input?: { year?: number }): Promise<string>;
}

/**
 * Contador in-memory por tenant+ano.
 * Não reutiliza números (mesmo após cancelamento — sequência só cresce).
 * Preparado para sequence persistida em fase posterior (sem migration nesta fase).
 */
export function createMemoryContractNumberGenerator(
  clock: ContractClock = createSystemContractClock(),
): ContractNumberGenerator {
  const counters = new Map<string, number>();

  return {
    async generate(tenantId, input = {}) {
      const tid = String(tenantId || '').trim();
      if (!tid) throw new Error('TENANT_REQUIRED');
      const year = input.year ?? clock.now().getUTCFullYear();
      const key = `${tid}::CTR::${year}`;
      const next = (counters.get(key) || 0) + 1;
      counters.set(key, next);
      return `CTR-${year}-${String(next).padStart(6, '0')}`;
    },
  };
}

export function createMemoryPackageNumberGenerator(
  clock: ContractClock = createSystemContractClock(),
): PackageNumberGenerator {
  const counters = new Map<string, number>();

  return {
    async generate(tenantId, input = {}) {
      const tid = String(tenantId || '').trim();
      if (!tid) throw new Error('TENANT_REQUIRED');
      const year = input.year ?? clock.now().getUTCFullYear();
      const key = `${tid}::PKG::${year}`;
      const next = (counters.get(key) || 0) + 1;
      counters.set(key, next);
      return `PKG-${year}-${String(next).padStart(6, '0')}`;
    },
  };
}
