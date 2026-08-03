/**
 * @module domain/contracts/ledger/contract-ledger.types
 * @description Ledger jurídico append-only — Phase 10.8.
 * Separado do audit operacional (app_contract_audit_events).
 */

import type {
  ContractId,
  ContractLedgerEntryId,
  ContractVersionId,
  SignatureEnvelopeId,
  TenantId,
} from '../contract.ids.js';
import type { ContractAuditActor, ContractAuditSource } from '../audit/contract-audit.types.js';

export const CONTRACT_LEDGER_EVENT_TYPES = [
  'CONTRACT_CREATED',
  'CONTRACT_VERSION_CREATED',
  'CONTRACT_VERSION_LOCKED',
  'CONTRACT_READY_FOR_REVIEW',
  'CONTRACT_APPROVED',
  'SIGNATURE_ENVELOPE_CREATED',
  'SIGNATURE_ENVELOPE_SENT',
  'SIGNER_VIEWED',
  'SIGNER_AUTHENTICATED',
  'SIGNER_SIGNED',
  'SIGNATURE_ENVELOPE_COMPLETED',
  'UNSIGNED_PDF_GENERATED',
  'SIGNED_PDF_GENERATED',
  'EVIDENCE_REPORT_GENERATED',
  'INTEGRITY_MANIFEST_GENERATED',
  'CONTRACT_SIGNING_VALIDATED',
  'CONTRACT_STATUS_PENDING_SIGNATURES',
  'CONTRACT_STATUS_PARTIALLY_SIGNED',
  'CONTRACT_SIGNED',
  'CONTRACT_SIGNED_EFFECTS_PREPARED',
] as const;

export type ContractLedgerEventType = (typeof CONTRACT_LEDGER_EVENT_TYPES)[number];

export interface ContractLedgerEntry {
  id: ContractLedgerEntryId;
  tenantId: TenantId;
  contractId: ContractId;
  contractVersionId?: ContractVersionId;
  envelopeId?: SignatureEnvelopeId;
  sequenceNumber: number;
  eventType: ContractLedgerEventType;
  actor: ContractAuditActor;
  source: ContractAuditSource;
  payload: Record<string, unknown>;
  previousEntryHash?: string;
  entryHash: string;
  idempotencyKey?: string;
  correlationId?: string;
  causationId?: string;
  occurredAt: string;
  createdAt: string;
}

export interface ContractLedgerVerificationResult {
  valid: boolean;
  entryCount: number;
  lastSequence?: number;
  lastEntryHash?: string;
  errors: string[];
}
