/**
 * @module domain/contracts/ledger/contract-ledger.repository
 * @description Repository append-only do ledger — Phase 10.8.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { ContractId, TenantId } from '../contract.ids.js';
import { timingSafeEqualHex } from '../files/contract-binary-hash.js';
import { hashLedgerEntry } from './contract-ledger.hash.js';
import type {
  ContractLedgerEntry,
  ContractLedgerVerificationResult,
} from './contract-ledger.types.js';

export interface ContractLedgerRepository {
  getLatestEntry(
    tenantId: TenantId,
    contractId: ContractId,
  ): Promise<ContractLedgerEntry | null>;

  append(
    tenantId: TenantId,
    entry: ContractLedgerEntry,
  ): Promise<ContractLedgerEntry>;

  appendMany(
    tenantId: TenantId,
    entries: ContractLedgerEntry[],
  ): Promise<ContractLedgerEntry[]>;

  listByContract(
    tenantId: TenantId,
    contractId: ContractId,
  ): Promise<ContractLedgerEntry[]>;

  verifyChain(
    tenantId: TenantId,
    contractId: ContractId,
  ): Promise<ContractLedgerVerificationResult>;

  /** Snapshot/rollback para testes de atomicidade. */
  withTransaction?<T>(fn: () => Promise<T>): Promise<T>;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function fail(code: Parameters<typeof createContractDomainError>[0], message: string): never {
  throw Object.assign(new Error(message), {
    domainError: createContractDomainError(code, message),
  });
}

export class ContractLedgerMemoryRepository implements ContractLedgerRepository {
  private store = new Map<string, ContractLedgerEntry[]>();

  private key(tenantId: string, contractId: string) {
    return `${tenantId}::${contractId}`;
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const snap = new Map(
      [...this.store.entries()].map(([k, v]) => [k, v.map(clone)]),
    );
    try {
      return await fn();
    } catch (error) {
      this.store = snap;
      throw error;
    }
  }

  async getLatestEntry(tenantId: TenantId, contractId: ContractId) {
    const list = this.store.get(this.key(tenantId, contractId)) || [];
    if (!list.length) return null;
    return clone(list[list.length - 1]);
  }

  async listByContract(tenantId: TenantId, contractId: ContractId) {
    return (this.store.get(this.key(tenantId, contractId)) || []).map(clone);
  }

  async append(tenantId: TenantId, entry: ContractLedgerEntry) {
    if (entry.tenantId !== tenantId) {
      fail('CONTRACT_SIGNED_ARTIFACT_TENANT_MISMATCH', 'Tenant do ledger diverge.');
    }
    if (!entry.entryHash) {
      fail('CONTRACT_LEDGER_HASH_INVALID', 'entryHash obrigatório.');
    }

    const key = this.key(tenantId, entry.contractId);
    const list = this.store.get(key) || [];
    const latest = list[list.length - 1];

    const expectedSeq = latest ? latest.sequenceNumber + 1 : 1;
    if (entry.sequenceNumber !== expectedSeq) {
      fail('CONTRACT_LEDGER_SEQUENCE_CONFLICT', 'sequenceNumber conflita.');
    }
    if (latest) {
      if (!entry.previousEntryHash
        || !timingSafeEqualHex(entry.previousEntryHash, latest.entryHash)) {
        fail('CONTRACT_LEDGER_HASH_INVALID', 'previousEntryHash diverge.');
      }
    } else if (entry.previousEntryHash) {
      fail('CONTRACT_LEDGER_HASH_INVALID', 'Primeira entrada não deve ter previousEntryHash.');
    }

    if (list.some((e) => e.eventType === entry.eventType
      && e.eventType === 'CONTRACT_SIGNED')) {
      fail('CONTRACT_LEDGER_ALREADY_CONTAINS_EVENT', 'CONTRACT_SIGNED já existe.');
    }
    if (entry.idempotencyKey
      && list.some((e) => e.idempotencyKey === entry.idempotencyKey
        && e.eventType === entry.eventType)) {
      fail('CONTRACT_LEDGER_ALREADY_CONTAINS_EVENT', 'Entrada idempotente duplicada.');
    }

    const recomputed = await hashLedgerEntry({
      tenantId: entry.tenantId,
      contractId: entry.contractId,
      contractVersionId: entry.contractVersionId,
      envelopeId: entry.envelopeId,
      sequenceNumber: entry.sequenceNumber,
      eventType: entry.eventType,
      actor: entry.actor,
      source: entry.source,
      payload: entry.payload,
      previousEntryHash: entry.previousEntryHash,
      occurredAt: entry.occurredAt,
      correlationId: entry.correlationId,
      causationId: entry.causationId,
      idempotencyKey: entry.idempotencyKey,
    });
    if (!timingSafeEqualHex(recomputed, entry.entryHash)) {
      fail('CONTRACT_LEDGER_HASH_INVALID', 'entryHash não confere.');
    }

    const stored = clone(entry);
    list.push(stored);
    this.store.set(key, list);
    return clone(stored);
  }

  async appendMany(tenantId: TenantId, entries: ContractLedgerEntry[]) {
    const out: ContractLedgerEntry[] = [];
    for (const entry of entries) {
      out.push(await this.append(tenantId, entry));
    }
    return out;
  }

  async verifyChain(tenantId: TenantId, contractId: ContractId) {
    const list = await this.listByContract(tenantId, contractId);
    const errors: string[] = [];
    let prevHash: string | undefined;
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i];
      if (entry.sequenceNumber !== i + 1) {
        errors.push(`SEQ:${entry.sequenceNumber}`);
      }
      if (i === 0 && entry.previousEntryHash) {
        errors.push('FIRST_PREV');
      }
      if (i > 0) {
        if (!entry.previousEntryHash
          || !timingSafeEqualHex(entry.previousEntryHash, prevHash || '')) {
          errors.push(`PREV:${entry.sequenceNumber}`);
        }
      }
      const recomputed = await hashLedgerEntry({
        tenantId: entry.tenantId,
        contractId: entry.contractId,
        contractVersionId: entry.contractVersionId,
        envelopeId: entry.envelopeId,
        sequenceNumber: entry.sequenceNumber,
        eventType: entry.eventType,
        actor: entry.actor,
        source: entry.source,
        payload: entry.payload,
        previousEntryHash: entry.previousEntryHash,
        occurredAt: entry.occurredAt,
        correlationId: entry.correlationId,
        causationId: entry.causationId,
        idempotencyKey: entry.idempotencyKey,
      });
      if (!timingSafeEqualHex(recomputed, entry.entryHash)) {
        errors.push(`HASH:${entry.sequenceNumber}`);
      }
      prevHash = entry.entryHash;
    }
    return {
      valid: errors.length === 0,
      entryCount: list.length,
      lastSequence: list.length ? list[list.length - 1].sequenceNumber : undefined,
      lastEntryHash: list.length ? list[list.length - 1].entryHash : undefined,
      errors,
    };
  }
}
