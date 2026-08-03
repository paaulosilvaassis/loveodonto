/**
 * @module repositories/contracts/contractLedgerPostgres.repository
 * @description Ledger Postgres real (wiring apenas em postgres-test) — Phase 10.9.
 * Migration 030. Hash canônico validado na aplicação antes do insert.
 */

import type { ContractLedgerRepository } from '../../domain/contracts/ledger/contract-ledger.repository.js';
import type {
  ContractLedgerEntry,
  ContractLedgerVerificationResult,
} from '../../domain/contracts/ledger/contract-ledger.types.js';
import type { ContractId, TenantId } from '../../domain/contracts/contract.ids.js';
import { createContractDomainError } from '../../domain/contracts/contract.errors.js';
import { hashLedgerEntry } from '../../domain/contracts/ledger/contract-ledger.hash.js';
import { timingSafeEqualHex } from '../../domain/contracts/files/contract-binary-hash.js';
import {
  ContractPersistenceUnavailableError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import { assertValidTenantId } from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type { ContractSupabaseClient } from './contractPersistenceTypes.js';
import type { DatabaseTransactionClient } from './contractsV2Transaction.js';

function fail(code: Parameters<typeof createContractDomainError>[0], message: string): never {
  throw Object.assign(new Error(message), {
    domainError: createContractDomainError(code, message),
    code,
  });
}

function mapRow(row: Record<string, unknown>): ContractLedgerEntry {
  return {
    id: String(row.id) as ContractLedgerEntry['id'],
    tenantId: String(row.tenant_id) as TenantId,
    contractId: String(row.contract_id) as ContractId,
    contractVersionId: row.contract_version_id
      ? String(row.contract_version_id) as ContractLedgerEntry['contractVersionId']
      : undefined,
    envelopeId: row.envelope_id
      ? String(row.envelope_id) as ContractLedgerEntry['envelopeId']
      : undefined,
    sequenceNumber: Number(row.sequence_number),
    eventType: String(row.event_type) as ContractLedgerEntry['eventType'],
    actor: {
      actorType: String(row.actor_type) as never,
      actorId: row.actor_id ? String(row.actor_id) : undefined,
      actorName: row.actor_name ? String(row.actor_name) : undefined,
    },
    source: String(row.source) as ContractLedgerEntry['source'],
    payload: (row.payload || {}) as Record<string, unknown>,
    previousEntryHash: row.previous_entry_hash
      ? String(row.previous_entry_hash)
      : undefined,
    entryHash: String(row.entry_hash),
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : undefined,
    correlationId: row.correlation_id ? String(row.correlation_id) : undefined,
    causationId: row.causation_id ? String(row.causation_id) : undefined,
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
  };
}

function toRow(entry: ContractLedgerEntry) {
  return {
    id: entry.id,
    tenant_id: entry.tenantId,
    contract_id: entry.contractId,
    contract_version_id: entry.contractVersionId || null,
    envelope_id: entry.envelopeId || null,
    sequence_number: entry.sequenceNumber,
    event_type: entry.eventType,
    actor_type: entry.actor.actorType,
    actor_id: entry.actor.actorId || null,
    actor_name: entry.actor.actorName || null,
    source: entry.source,
    payload: entry.payload || {},
    previous_entry_hash: entry.previousEntryHash || null,
    entry_hash: entry.entryHash,
    idempotency_key: entry.idempotencyKey || null,
    correlation_id: entry.correlationId || null,
    causation_id: entry.causationId || null,
    occurred_at: entry.occurredAt,
    created_at: entry.createdAt,
  };
}

export class ContractLedgerPostgresRepository implements ContractLedgerRepository {
  constructor(
    private readonly client?: ContractSupabaseClient | DatabaseTransactionClient | null,
  ) {}

  private getClient(): ContractSupabaseClient {
    if (!this.client) {
      throw Object.assign(
        new ContractPersistenceUnavailableError(),
        {
          domainError: createContractDomainError(
            'CONTRACT_LEDGER_UNAVAILABLE',
            'Ledger Postgres indisponível (sem client / migration 030).',
          ),
          code: 'CONTRACT_LEDGER_UNAVAILABLE',
        },
      );
    }
    return this.client;
  }

  async getLatestEntry(tenantId: TenantId, contractId: ContractId) {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.LEDGER)
      .select('*')
      .eq('tenant_id', tid)
      .eq('contract_id', contractId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapRow(data) : null;
  }

  async listByContract(tenantId: TenantId, contractId: ContractId) {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.LEDGER)
      .select('*')
      .eq('tenant_id', tid)
      .eq('contract_id', contractId)
      .order('sequence_number', { ascending: true });
    if (error) mapPersistenceDriverError(error);
    return (data || []).map(mapRow);
  }

  async append(tenantId: TenantId, entry: ContractLedgerEntry) {
    const tid = assertValidTenantId(tenantId);
    if (entry.tenantId !== tid) {
      fail('CONTRACT_SIGNED_ARTIFACT_TENANT_MISMATCH', 'Tenant do ledger diverge.');
    }
    if (!entry.entryHash) {
      fail('CONTRACT_LEDGER_HASH_INVALID', 'entryHash obrigatório.');
    }

    const latest = await this.getLatestEntry(tid, entry.contractId);
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

    if (entry.eventType === 'CONTRACT_SIGNED') {
      const list = await this.listByContract(tid, entry.contractId);
      if (list.some((e) => e.eventType === 'CONTRACT_SIGNED')) {
        fail('CONTRACT_LEDGER_ALREADY_CONTAINS_EVENT', 'CONTRACT_SIGNED já existe.');
      }
    }

    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.LEDGER)
      .insert(toRow(entry))
      .select('*')
      .single();
    if (error) {
      const msg = String(error.message || '');
      if (msg.toLowerCase().includes('append-only') || msg.includes('unique')) {
        fail('CONTRACT_LEDGER_APPEND_FAILED', msg);
      }
      mapPersistenceDriverError(error);
    }
    return mapRow(data);
  }

  async appendMany(tenantId: TenantId, entries: ContractLedgerEntry[]) {
    const out: ContractLedgerEntry[] = [];
    for (const entry of entries) {
      out.push(await this.append(tenantId, entry));
    }
    return out;
  }

  async verifyChain(
    tenantId: TenantId,
    contractId: ContractId,
  ): Promise<ContractLedgerVerificationResult> {
    const list = await this.listByContract(tenantId, contractId);
    const errors: string[] = [];
    let prevHash: string | undefined;
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i];
      if (entry.sequenceNumber !== i + 1) errors.push(`SEQ:${entry.sequenceNumber}`);
      if (i === 0 && entry.previousEntryHash) errors.push('FIRST_PREV');
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
