/**
 * @module domain/contracts/shared/contract-id-factory
 * @description Factory de IDs injetável — Phase 10.5.
 */

export interface ContractIdFactory {
  next(prefix: string): string;
}

export function createCryptoContractIdFactory(): ContractIdFactory {
  return {
    next(prefix: string) {
      const p = String(prefix || 'id').replace(/[^a-z0-9_]/gi, '');
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${p}_${crypto.randomUUID()}`;
      }
      return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    },
  };
}

/** Sequencial determinístico para testes. */
export function createSequentialContractIdFactory(start = 1): ContractIdFactory {
  let seq = start;
  return {
    next(prefix: string) {
      const n = seq;
      seq += 1;
      return `${prefix}_${String(n).padStart(6, '0')}`;
    },
  };
}
