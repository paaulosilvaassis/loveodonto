/**
 * @module domain/contracts/idempotency/contract-idempotency
 * @description Idempotência por tenant — Phase 10.5 (memory + contrato de persistência).
 */

import type { TenantId } from '../contract.ids.js';
import { createContractDomainError } from '../contract.errors.js';
import { canonicalizeJsonValue } from '../hash/contract-content-hasher.js';

export const CONTRACT_IDEMPOTENCY_OPERATIONS = [
  'CREATE_CONTRACT',
  'CREATE_VERSION',
  'CREATE_PACKAGE',
  'CREATE_ENVELOPE',
  'ADD_SIGNER',
  'SEND_ENVELOPE',
  'REQUEST_CHALLENGE',
  'VERIFY_CHALLENGE',
  'SIGN',
  'DECLINE',
  'CANCEL_ENVELOPE',
  'EXPIRE_ENVELOPE',
  'COMPLETE_CONTRACT_SIGNING',
] as const;

export type ContractIdempotencyOperation = (typeof CONTRACT_IDEMPOTENCY_OPERATIONS)[number];

export interface ContractIdempotencyRecord {
  tenantId: TenantId;
  operation: ContractIdempotencyOperation;
  key: string;
  inputFingerprint: string;
  status: 'RESERVED' | 'COMPLETED' | 'FAILED';
  resultRef?: unknown;
  createdAt: string;
  completedAt?: string;
  errorCode?: string;
}

export type ContractIdempotencyReservationResult =
  | { kind: 'reserved' }
  | { kind: 'replay'; record: ContractIdempotencyRecord }
  | { kind: 'conflict'; record: ContractIdempotencyRecord };

export interface ContractIdempotencyRepository {
  findResult(
    tenantId: TenantId,
    operation: ContractIdempotencyOperation,
    key: string,
  ): Promise<ContractIdempotencyRecord | null>;

  reserve(
    tenantId: TenantId,
    operation: ContractIdempotencyOperation,
    key: string,
    inputFingerprint: string,
    createdAt: string,
  ): Promise<ContractIdempotencyReservationResult>;

  complete(
    tenantId: TenantId,
    operation: ContractIdempotencyOperation,
    key: string,
    resultRef: unknown,
    completedAt: string,
  ): Promise<void>;

  fail(
    tenantId: TenantId,
    operation: ContractIdempotencyOperation,
    key: string,
    errorCode: string,
    completedAt: string,
  ): Promise<void>;
}

/** Fingerprint estável sem dados sensíveis integrais. */
export function fingerprintIdempotencyInput(payload: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(payload));
}

export class ContractIdempotencyConflictError extends Error {
  readonly domainError;

  constructor(message = 'Chave de idempotência com payload diferente.') {
    super(message);
    this.name = 'ContractIdempotencyConflictError';
    this.domainError = createContractDomainError(
      'IDEMPOTENCY_CONFLICT',
      message,
      'idempotencyKey',
    );
  }
}

export function createMemoryContractIdempotencyRepository(): ContractIdempotencyRepository {
  const store = new Map<string, ContractIdempotencyRecord>();

  const mapKey = (
    tenantId: string,
    operation: string,
    key: string,
  ) => `${tenantId}::${operation}::${key}`;

  return {
    async findResult(tenantId, operation, key) {
      return store.get(mapKey(tenantId, operation, key)) || null;
    },

    async reserve(tenantId, operation, key, inputFingerprint, createdAt) {
      const k = mapKey(tenantId, operation, key);
      const existing = store.get(k);
      if (existing) {
        if (existing.inputFingerprint !== inputFingerprint) {
          return { kind: 'conflict', record: existing };
        }
        if (existing.status === 'COMPLETED') {
          return { kind: 'replay', record: existing };
        }
        if (existing.status === 'RESERVED') {
          return { kind: 'replay', record: existing };
        }
        // FAILED — permite nova tentativa com mesmo fingerprint
        if (existing.status === 'FAILED' && existing.inputFingerprint === inputFingerprint) {
          store.set(k, {
            ...existing,
            status: 'RESERVED',
            errorCode: undefined,
            completedAt: undefined,
            createdAt,
          });
          return { kind: 'reserved' };
        }
        return { kind: 'conflict', record: existing };
      }
      store.set(k, {
        tenantId,
        operation,
        key,
        inputFingerprint,
        status: 'RESERVED',
        createdAt,
      });
      return { kind: 'reserved' };
    },

    async complete(tenantId, operation, key, resultRef, completedAt) {
      const k = mapKey(tenantId, operation, key);
      const existing = store.get(k);
      if (!existing) return;
      store.set(k, {
        ...existing,
        status: 'COMPLETED',
        resultRef,
        completedAt,
      });
    },

    async fail(tenantId, operation, key, errorCode, completedAt) {
      const k = mapKey(tenantId, operation, key);
      const existing = store.get(k);
      if (!existing) return;
      store.set(k, {
        ...existing,
        status: 'FAILED',
        errorCode,
        completedAt,
      });
    },
  };
}
