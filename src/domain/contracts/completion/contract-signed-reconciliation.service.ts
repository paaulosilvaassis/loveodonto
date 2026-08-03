/**
 * @module domain/contracts/completion/contract-signed-reconciliation.service
 * @description Reconciliação SIGNED vs ledger/artefatos — Phase 10.8.
 * Não altera dados reais automaticamente; não inventa evidências.
 */

import { createContractDomainEvent, type ContractDomainEvent } from '../contract.events.js';
import type { ContractId, TenantId } from '../contract.ids.js';
import type { ContractApplicationRepository } from '../application/contract-memory.repository.js';
import type { ContractPrivateStorage } from '../files/contract-private-storage.js';
import type { SignatureEnvelopeRepository } from '../signatures/signature-memory.repository.js';
import type { ContractLedgerRepository } from '../ledger/contract-ledger.repository.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import { createContractDomainError, type ContractDomainError } from '../contract.errors.js';

export interface ContractSignedReconciliationResult {
  contractId: ContractId;
  contractStatus?: string;
  ledgerValid: boolean;
  hasSignedLedger: boolean;
  inconsistencies: string[];
  repairPlan: Array<{
    code: string;
    action: string;
    autoExecuted: false;
  }>;
  events: ContractDomainEvent[];
  errors: ContractDomainError[];
}

export interface ContractSignedReconciliationService {
  inspect(
    tenantId: TenantId,
    contractId: ContractId,
  ): Promise<ContractSignedReconciliationResult>;

  repairLedgerProjection(
    tenantId: TenantId,
    contractId: ContractId,
    actor: { userId: string; permissions?: string[] },
  ): Promise<ContractSignedReconciliationResult>;
}

export function createContractSignedReconciliationService(deps: {
  contractRepository: ContractApplicationRepository;
  envelopeRepository: SignatureEnvelopeRepository;
  storage: ContractPrivateStorage;
  ledgerRepository: ContractLedgerRepository;
  clock?: ContractClock;
}): ContractSignedReconciliationService {
  const clock = deps.clock || createSystemContractClock();

  async function inspect(
    tenantId: TenantId,
    contractId: ContractId,
  ): Promise<ContractSignedReconciliationResult> {
    const errors: ContractDomainError[] = [];
    const inconsistencies: string[] = [];
    const contract = await deps.contractRepository.findById(tenantId, contractId);
    if (!contract) {
      return {
        contractId,
        ledgerValid: false,
        hasSignedLedger: false,
        inconsistencies: ['CONTRACT_NOT_FOUND'],
        repairPlan: [{
          code: 'CONTRACT_NOT_FOUND',
          action: 'MANUAL_REVIEW_REQUIRED',
          autoExecuted: false,
        }],
        events: [],
        errors: [createContractDomainError('CONTRACT_NOT_FOUND', 'Contrato não encontrado.')],
      };
    }

    const chain = await deps.ledgerRepository.verifyChain(tenantId, contractId);
    const entries = await deps.ledgerRepository.listByContract(tenantId, contractId);
    const hasSignedLedger = entries.some((e) => e.eventType === 'CONTRACT_SIGNED');

    if (contract.status === 'SIGNED' && !hasSignedLedger) {
      inconsistencies.push('SIGNED_WITHOUT_LEDGER');
    }
    if (contract.status !== 'SIGNED' && hasSignedLedger) {
      inconsistencies.push('LEDGER_WITHOUT_SIGNED_STATUS');
    }
    if (!chain.valid) inconsistencies.push('CHAIN_INVALID');

    if (contract.signatureEnvelopeId) {
      const envelope = await deps.envelopeRepository.findById(
        tenantId,
        contract.signatureEnvelopeId,
      );
      if (envelope?.status === 'COMPLETED' && contract.status === 'APPROVED') {
        inconsistencies.push('ENVELOPE_COMPLETED_CONTRACT_APPROVED');
      }
      if (envelope && envelope.tenantId !== tenantId) {
        inconsistencies.push('ENVELOPE_TENANT_MISMATCH');
      }
    }

    if (contract.status === 'SIGNED') {
      const files = await deps.storage.listByContract(tenantId, contractId);
      const signedPdf = files.find((f) => f.fileType === 'SIGNED_PDF' && !f.deletedAt);
      const evidence = files.find((f) => f.fileType === 'EVIDENCE_REPORT' && !f.deletedAt);
      const manifest = files.find((f) => f.fileType === 'INTEGRITY_MANIFEST' && !f.deletedAt);
      if (!signedPdf) inconsistencies.push('SIGNED_PDF_MISSING');
      if (!evidence) inconsistencies.push('EVIDENCE_REPORT_MISSING');
      if (!manifest) inconsistencies.push('INTEGRITY_MANIFEST_MISSING');
      if (signedPdf && signedPdf.status !== 'VERIFIED') {
        inconsistencies.push('SIGNED_PDF_NOT_VERIFIED');
      }
      if (manifest && manifest.status !== 'VERIFIED') {
        inconsistencies.push('MANIFEST_NOT_VERIFIED');
      }
      const seqs = new Set(entries.map((e) => e.sequenceNumber));
      if (seqs.size !== entries.length) inconsistencies.push('DUPLICATE_SEQUENCE');
    }

    const events: ContractDomainEvent[] = inconsistencies.length
      ? [createContractDomainEvent({
        tenantId,
        aggregateId: contractId,
        aggregateType: 'contract',
        eventType: 'contract.signed_reconciliation_required',
        occurredAt: clock.nowIso(),
        payload: { inconsistencies },
      })]
      : [];

    if (inconsistencies.length) {
      errors.push(createContractDomainError(
        'CONTRACT_SIGNED_RECONCILIATION_REQUIRED',
        'Reconciliação necessária.',
        'contractId',
        { inconsistencies },
      ));
    }

    return {
      contractId,
      contractStatus: contract.status,
      ledgerValid: chain.valid,
      hasSignedLedger,
      inconsistencies,
      repairPlan: inconsistencies.map((code) => ({
        code,
        action: 'MANUAL_REVIEW_REQUIRED',
        autoExecuted: false as const,
      })),
      events,
      errors,
    };
  }

  return {
    inspect,

    async repairLedgerProjection(tenantId, contractId, actor) {
      if (!(actor.permissions || []).includes('contracts:reconcile_signed_state')) {
        return {
          contractId,
          ledgerValid: false,
          hasSignedLedger: false,
          inconsistencies: ['PERMISSION_DENIED'],
          repairPlan: [],
          events: [],
          errors: [createContractDomainError(
            'PERMISSION_DENIED',
            'Permissão contracts:reconcile_signed_state necessária.',
          )],
        };
      }
      // Nesta fase: inspeciona e produz plano — NÃO reescreve ledger, NÃO marca SIGNED.
      const result = await inspect(tenantId, contractId);
      return {
        ...result,
        repairPlan: result.repairPlan.map((p) => ({
          ...p,
          action: p.action === 'MANUAL_REVIEW_REQUIRED'
            ? 'PROJECTION_REBUILD_IN_MEMORY_ONLY'
            : p.action,
          autoExecuted: false as const,
        })),
      };
    },
  };
}
