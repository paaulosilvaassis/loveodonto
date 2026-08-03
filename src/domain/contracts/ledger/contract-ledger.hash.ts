/**
 * @module domain/contracts/ledger/contract-ledger.hash
 * @description Hash encadeado SHA-256 do ledger — Phase 10.8.
 */

import { canonicalizeJsonValue } from '../hash/contract-content-hasher.js';
import { sha256Utf8 } from '../files/contract-binary-hash.js';
import type { ContractLedgerEntry } from './contract-ledger.types.js';

export function canonicalizeLedgerEntryForHash(
  entry: Omit<ContractLedgerEntry, 'id' | 'entryHash' | 'createdAt'>,
): string {
  return JSON.stringify(canonicalizeJsonValue({
    tenantId: entry.tenantId,
    contractId: entry.contractId,
    contractVersionId: entry.contractVersionId || null,
    envelopeId: entry.envelopeId || null,
    sequenceNumber: entry.sequenceNumber,
    eventType: entry.eventType,
    payload: entry.payload || {},
    actor: {
      actorType: entry.actor?.actorType || 'SYSTEM',
      actorId: entry.actor?.actorId || null,
    },
    source: entry.source,
    previousEntryHash: entry.previousEntryHash || null,
    occurredAt: entry.occurredAt,
    correlationId: entry.correlationId || null,
    causationId: entry.causationId || null,
    idempotencyKey: entry.idempotencyKey || null,
  }));
}

export async function hashLedgerEntry(
  entry: Omit<ContractLedgerEntry, 'id' | 'entryHash' | 'createdAt'>,
): Promise<string> {
  return sha256Utf8(canonicalizeLedgerEntryForHash(entry));
}
