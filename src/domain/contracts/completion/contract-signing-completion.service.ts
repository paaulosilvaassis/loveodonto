/**
 * @module domain/contracts/completion/contract-signing-completion.service
 * @description Conclusão jurídica SIGNED + ledger — Phase 10.8.
 * Side-effects externos NÃO executados. Event bus real NÃO acionado.
 */

import {
  createContractDomainError,
  type ContractDomainError,
} from '../contract.errors.js';
import { createContractDomainEvent, type ContractDomainEvent } from '../contract.events.js';
import {
  isContractFeatureEnabled,
  type ContractFeatureFlagContext,
} from '../contract-feature-flags.js';
import type {
  ContractFileId,
  ContractId,
  ContractVersionId,
  SignatureEnvelopeId,
  TenantId,
} from '../contract.ids.js';
import type { Contract, ContractVersion } from '../contract.types.js';
import {
  canTransitionContract,
  type ContractTransitionContext,
} from '../contract-status.machine.js';
import type { ContractApplicationRepository } from '../application/contract-memory.repository.js';
import {
  createMemoryContractIdempotencyRepository,
  fingerprintIdempotencyInput,
  ContractIdempotencyConflictError,
  type ContractIdempotencyRepository,
} from '../idempotency/contract-idempotency.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractIdFactory } from '../shared/contract-id-factory.js';
import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import type { ContractFileArtifact } from '../files/contract-file.types.js';
import type { ContractPrivateStorage } from '../files/contract-private-storage.js';
import type { ContractIntegrityManifest } from '../artifacts/contract-integrity-manifest.js';
import type { SignatureEvidenceReportRepository } from '../artifacts/contract-artifact-memory.repository.js';
import type {
  SignatureEnvelope,
  SignatureEvidenceSnapshot,
  SignatureSigner,
} from '../signatures/signature.types.js';
import type {
  SignatureEnvelopeRepository,
  SignatureEvidenceRepository,
  SignatureSignerRepository,
} from '../signatures/signature-memory.repository.js';
import {
  ContractLedgerMemoryRepository,
  type ContractLedgerRepository,
} from '../ledger/contract-ledger.repository.js';
import { hashLedgerEntry } from '../ledger/contract-ledger.hash.js';
import type {
  ContractLedgerEntry,
  ContractLedgerEventType,
} from '../ledger/contract-ledger.types.js';
import {
  validateContractSigningCompletion,
  type ContractSigningCompletionValidationResult,
} from './contract-signing-completion.validator.js';
import {
  deriveContractSignedPendingEffects,
  type ContractSignedPendingEffects,
} from './contract-signed-effects.policy.js';

export type ContractAuditActor = {
  userId: string;
  displayName?: string;
  permissions?: string[];
};

export const CONTRACT_COMPLETION_PERMISSIONS = [
  'contracts:complete_signing',
  'contracts:view_ledger',
  'contracts:verify_ledger',
  'contracts:view_signed_effects',
  'contracts:reconcile_signed_state',
] as const;

export class ContractSigningCompletionError extends Error {
  readonly domainError: ContractDomainError;
  constructor(domainError: ContractDomainError) {
    super(domainError.message);
    this.name = 'ContractSigningCompletionError';
    this.domainError = domainError;
  }
}

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new ContractSigningCompletionError(createContractDomainError(code, message, field));
}

function requirePerm(actor: ContractAuditActor, permission: string): void {
  if (!(actor.permissions || []).includes(permission)) {
    fail('PERMISSION_DENIED', `Permissão necessária: ${permission}.`);
  }
}

export interface CompleteContractSigningInput {
  contractId: ContractId;
  contractVersionId: ContractVersionId;
  envelopeId: SignatureEnvelopeId;
  signedPdfFileId: ContractFileId;
  evidenceReportFileId: ContractFileId;
  integrityManifestFileId: ContractFileId;
  idempotencyKey: string;
  expectedContractRowVersion?: number;
}

export interface CompleteContractSigningResult {
  contract: Contract;
  version: ContractVersion;
  envelope: SignatureEnvelope;
  signedPdf: ContractFileArtifact;
  evidenceReport: ContractFileArtifact;
  integrityManifest: ContractFileArtifact;
  ledgerEntries: ContractLedgerEntry[];
  effects: ContractSignedPendingEffects;
  events: ContractDomainEvent[];
  idempotentReplay: boolean;
  completedAt: string;
}

export interface ContractSigningCompletionServiceDeps {
  contractRepository: ContractApplicationRepository;
  envelopeRepository: SignatureEnvelopeRepository;
  signerRepository: SignatureSignerRepository;
  evidenceRepository: SignatureEvidenceRepository;
  storage: ContractPrivateStorage;
  /** Manifest JSON parser — harness injeta. */
  loadManifest: (
    tenantId: TenantId,
    file: ContractFileArtifact,
  ) => Promise<ContractIntegrityManifest | null>;
  evidenceReportRepository?: SignatureEvidenceReportRepository;
  ledgerRepository?: ContractLedgerRepository;
  idempotency?: ContractIdempotencyRepository;
  clock?: ContractClock;
  ids?: ContractIdFactory;
  featureFlagContext?: ContractFeatureFlagContext;
  skipFeatureFlagCheck?: boolean;
  /** Injeta falha após N appends de ledger (testes de rollback). */
  failAfterLedgerAppends?: number;
}

function transitionContext(input: {
  version: ContractVersion;
  signers: SignatureSigner[];
}): ContractTransitionContext {
  const required = input.signers.filter((s) => s.required);
  return {
    hasPublishedTemplate: true,
    hasPatient: true,
    hasRequiredGuardian: true,
    hasBudgetWhenRequired: true,
    hasFinancialSnapshotWhenRequired: true,
    hasRequiredSigners: required.length > 0,
    hasRequiredApprovals: true,
    hasLockedVersion: Boolean(input.version.lockedAt),
    signaturesStarted: true,
    allRequiredSignaturesCompleted: required.every((s) => s.status === 'SIGNED'),
    hasActiveDecline: required.some((s) => s.status === 'DECLINED'),
    envelopeExpired: false,
    evidenceAvailable: true,
  };
}

export function createContractSigningCompletionService(
  deps: ContractSigningCompletionServiceDeps,
) {
  const clock = deps.clock || createSystemContractClock();
  const ids = deps.ids || createCryptoContractIdFactory();
  const idempotency = deps.idempotency || createMemoryContractIdempotencyRepository();
  const ledger = deps.ledgerRepository || new ContractLedgerMemoryRepository();

  function assertFlags(): void {
    if (deps.skipFeatureFlagCheck) return;
    const ctx = deps.featureFlagContext || {};
    const required = [
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
      'contract_internal_signature_v2_enabled',
      'contract_pdf_v2_enabled',
      'contract_storage_v2_enabled',
      'contract_audit_ledger_enabled',
    ] as const;
    for (const flag of required) {
      if (!isContractFeatureEnabled(flag, ctx)) {
        fail('FEATURE_FLAG_DISABLED', `Flag desabilitada: ${flag}.`, 'featureFlag');
      }
    }
  }

  async function appendLedger(
    tenantId: TenantId,
    base: {
      contractId: ContractId;
      contractVersionId?: ContractVersionId;
      envelopeId?: SignatureEnvelopeId;
      eventType: ContractLedgerEventType;
      actor: ContractAuditActor;
      payload: Record<string, unknown>;
      idempotencyKey?: string;
      correlationId?: string;
    },
    entries: ContractLedgerEntry[],
  ): Promise<ContractLedgerEntry> {
    const latest = entries[entries.length - 1]
      || await ledger.getLatestEntry(tenantId, base.contractId);
    const sequenceNumber = latest ? latest.sequenceNumber + 1 : 1;
    const previousEntryHash = latest?.entryHash;
    const occurredAt = clock.nowIso();
    const draft = {
      tenantId,
      contractId: base.contractId,
      contractVersionId: base.contractVersionId,
      envelopeId: base.envelopeId,
      sequenceNumber,
      eventType: base.eventType,
      actor: {
        actorType: 'USER' as const,
        actorId: base.actor.userId,
        actorName: base.actor.displayName,
      },
      source: 'APP' as const,
      payload: base.payload,
      previousEntryHash,
      occurredAt,
      correlationId: base.correlationId,
      idempotencyKey: base.idempotencyKey,
    };
    const entryHash = await hashLedgerEntry(draft);
    const entry: ContractLedgerEntry = {
      ...draft,
      id: ids.next('ldg') as never,
      entryHash,
      createdAt: occurredAt,
    };
    const stored = await ledger.append(tenantId, entry);
    entries.push(stored);
    if (deps.failAfterLedgerAppends != null
      && entries.length >= deps.failAfterLedgerAppends) {
      fail('CONTRACT_LEDGER_APPEND_FAILED', 'Falha simulada de ledger.');
    }
    return stored;
  }

  async function loadArtifacts(tenantId: TenantId, input: CompleteContractSigningInput) {
    const signedPdf = await deps.storage.findById(tenantId, input.signedPdfFileId);
    const evidenceReport = await deps.storage.findById(tenantId, input.evidenceReportFileId);
    const integrityManifestFile = await deps.storage.findById(
      tenantId,
      input.integrityManifestFileId,
    );
    const manifest = integrityManifestFile
      ? await deps.loadManifest(tenantId, integrityManifestFile)
      : null;
    return { signedPdf, evidenceReport, integrityManifestFile, manifest };
  }

  async function validateInternal(
    tenantId: TenantId,
    input: CompleteContractSigningInput,
  ): Promise<{
    validation: ContractSigningCompletionValidationResult;
    contract: Contract;
    version: ContractVersion;
    envelope: SignatureEnvelope;
    signers: SignatureSigner[];
    evidences: SignatureEvidenceSnapshot[];
    signedPdf: ContractFileArtifact;
    evidenceReport: ContractFileArtifact;
    integrityManifestFile: ContractFileArtifact;
    manifest: ContractIntegrityManifest;
  }> {
    const contract = await deps.contractRepository.findById(tenantId, input.contractId);
    const version = await deps.contractRepository.findVersionById(
      tenantId,
      input.contractVersionId,
    );
    const envelope = await deps.envelopeRepository.findById(tenantId, input.envelopeId);
    const signers = envelope
      ? await deps.signerRepository.listByEnvelope(tenantId, envelope.id)
      : [];
    const evidences = envelope
      ? await deps.evidenceRepository.listByEnvelope(tenantId, envelope.id)
      : [];
    const artifacts = await loadArtifacts(tenantId, input);

    const validation = await validateContractSigningCompletion({
      tenantId,
      contractId: input.contractId,
      contractVersionId: input.contractVersionId,
      envelopeId: input.envelopeId,
      contract,
      version,
      envelope,
      signers,
      evidences,
      signedPdf: artifacts.signedPdf,
      evidenceReport: artifacts.evidenceReport,
      integrityManifestFile: artifacts.integrityManifestFile,
      manifest: artifacts.manifest,
      expectedContractRowVersion: input.expectedContractRowVersion,
    }, ledger);

    if (!validation.valid) {
      const first = validation.errors[0];
      throw new ContractSigningCompletionError(first || createContractDomainError(
        'CONTRACT_SIGNING_COMPLETION_NOT_READY',
        'Conclusão não pronta.',
      ));
    }

    return {
      validation,
      contract: contract!,
      version: version!,
      envelope: envelope!,
      signers,
      evidences,
      signedPdf: artifacts.signedPdf!,
      evidenceReport: artifacts.evidenceReport!,
      integrityManifestFile: artifacts.integrityManifestFile!,
      manifest: artifacts.manifest!,
    };
  }

  return {
    async validateCompletion(tenantId: TenantId, input: CompleteContractSigningInput) {
      assertFlags();
      try {
        const loaded = await validateInternal(tenantId, input);
        return loaded.validation;
      } catch (error) {
        if (error instanceof ContractSigningCompletionError) {
          return {
            valid: false,
            errors: [error.domainError],
            warnings: [],
            contractReady: false,
            versionReady: false,
            envelopeReady: false,
            evidenceReady: false,
            signedPdfReady: false,
            manifestReady: false,
            ledgerReady: false,
          } satisfies ContractSigningCompletionValidationResult;
        }
        throw error;
      }
    },

    async completeSigning(
      tenantId: TenantId,
      input: CompleteContractSigningInput,
      actor: ContractAuditActor,
    ): Promise<CompleteContractSigningResult> {
      assertFlags();
      requirePerm(actor, 'contracts:complete_signing');
      if (!String(input.idempotencyKey || '').trim()) {
        fail('INVALID_INPUT', 'idempotencyKey obrigatório.', 'idempotencyKey');
      }

      const artifacts = await loadArtifacts(tenantId, input);
      const fingerprint = fingerprintIdempotencyInput({
        contractId: input.contractId,
        contractVersionId: input.contractVersionId,
        envelopeId: input.envelopeId,
        signedPdfFileId: input.signedPdfFileId,
        evidenceReportFileId: input.evidenceReportFileId,
        integrityManifestFileId: input.integrityManifestFileId,
        signedPdfHash: artifacts.signedPdf?.sha256,
        evidenceHash: artifacts.evidenceReport?.sha256,
        manifestHash: artifacts.integrityManifestFile?.sha256,
      });

      const reservation = await idempotency.reserve(
        tenantId,
        'COMPLETE_CONTRACT_SIGNING',
        input.idempotencyKey,
        fingerprint,
        clock.nowIso(),
      );
      if (reservation.kind === 'conflict') {
        throw new ContractIdempotencyConflictError();
      }
      if (reservation.kind === 'replay' && reservation.record.status === 'COMPLETED') {
        const contract = await deps.contractRepository.findById(tenantId, input.contractId);
        const version = await deps.contractRepository.findVersionById(
          tenantId,
          input.contractVersionId,
        );
        const envelope = await deps.envelopeRepository.findById(tenantId, input.envelopeId);
        if (!contract || !version || !envelope || contract.status !== 'SIGNED') {
          fail('CONTRACT_SIGNED_IDEMPOTENCY_CONFLICT', 'Replay inconsistente.');
        }
        const effects = deriveContractSignedPendingEffects({
          contract,
          signed: true,
          signedPdf: artifacts.signedPdf,
          hasFinancialSnapshot: Boolean(version.financialSnapshot),
          hasClinicalConsent: Boolean(version.consentsSnapshot?.length),
        });
        return {
          contract,
          version,
          envelope,
          signedPdf: artifacts.signedPdf!,
          evidenceReport: artifacts.evidenceReport!,
          integrityManifest: artifacts.integrityManifestFile!,
          ledgerEntries: await ledger.listByContract(tenantId, input.contractId),
          effects,
          events: [],
          idempotentReplay: true,
          completedAt: contract.completedAt || clock.nowIso(),
        };
      }

      const run = async (): Promise<CompleteContractSigningResult> => {
        const loaded = await validateInternal(tenantId, input);
        let { contract } = loaded;
        const { version, envelope, signers, signedPdf, evidenceReport, integrityManifestFile } = loaded;
        const events: ContractDomainEvent[] = [];
        const ledgerEntries: ContractLedgerEntry[] = [
          ...(await ledger.listByContract(tenantId, contract.id)),
        ];
        const correlationId = `complete_${input.idempotencyKey}`;

        if (contract.status === 'SIGNED') {
          if (contract.signatureEnvelopeId
            && contract.signatureEnvelopeId !== input.envelopeId) {
            fail('CONTRACT_SIGNING_COMPLETION_CONFLICT', 'Contrato SIGNED com envelope diferente.');
          }
          const signedEntries = ledgerEntries.filter((e) => e.eventType === 'CONTRACT_SIGNED');
          const prior = signedEntries[signedEntries.length - 1];
          const sameArtifacts = prior
            && prior.payload?.signedPdfFileId === signedPdf.id
            && prior.payload?.evidenceReportFileId === evidenceReport.id
            && prior.payload?.integrityManifestFileId === integrityManifestFile.id;
          if (sameArtifacts) {
            const effects = deriveContractSignedPendingEffects({
              contract,
              signed: true,
              signedPdf,
              hasFinancialSnapshot: Boolean(version.financialSnapshot),
              hasClinicalConsent: Boolean(version.consentsSnapshot?.length),
            });
            await idempotency.complete(
              tenantId,
              'COMPLETE_CONTRACT_SIGNING',
              input.idempotencyKey,
              contract.id,
              clock.nowIso(),
            );
            return {
              contract,
              version,
              envelope,
              signedPdf,
              evidenceReport,
              integrityManifest: integrityManifestFile,
              ledgerEntries,
              effects,
              events: [],
              idempotentReplay: true,
              completedAt: contract.completedAt || clock.nowIso(),
            };
          }
          fail(
            'CONTRACT_SIGNING_COMPLETION_ALREADY_DONE',
            'Contrato já SIGNED com artefatos diferentes.',
          );
        }

        events.push(createContractDomainEvent({
          tenantId,
          aggregateId: contract.id,
          aggregateType: 'contract',
          eventType: 'contract.signing_completion.validation_started',
          occurredAt: clock.nowIso(),
          payload: { contractId: contract.id, envelopeId: envelope.id },
        }));

        await appendLedger(tenantId, {
          contractId: contract.id,
          contractVersionId: version.id,
          envelopeId: envelope.id,
          eventType: 'CONTRACT_SIGNING_VALIDATED',
          actor,
          payload: {
            signedPdfFileId: signedPdf.id,
            evidenceReportFileId: evidenceReport.id,
            integrityManifestFileId: integrityManifestFile.id,
          },
          correlationId,
          idempotencyKey: `${input.idempotencyKey}:validated`,
        }, ledgerEntries);

        events.push(createContractDomainEvent({
          tenantId,
          aggregateId: contract.id,
          aggregateType: 'contract',
          eventType: 'contract.signing_completion.validated',
          occurredAt: clock.nowIso(),
          payload: { contractId: contract.id },
        }));

        const ctx = transitionContext({ version, signers });

        // APPROVED → PENDING_SIGNATURES
        if (contract.status === 'APPROVED') {
          const t = canTransitionContract(contract.status, 'PENDING_SIGNATURES', ctx);
          if (!t.allowed) fail(t.errors[0].code, t.errors[0].message);
          contract = await deps.contractRepository.update(tenantId, {
            ...contract,
            status: 'PENDING_SIGNATURES',
            updatedAt: clock.nowIso(),
            signatureEnvelopeId: envelope.id,
          }, contract.rowVersion);
          await appendLedger(tenantId, {
            contractId: contract.id,
            contractVersionId: version.id,
            envelopeId: envelope.id,
            eventType: 'CONTRACT_STATUS_PENDING_SIGNATURES',
            actor,
            payload: { from: 'APPROVED', to: 'PENDING_SIGNATURES' },
            correlationId,
          }, ledgerEntries);
        }

        // PENDING_SIGNATURES → PARTIALLY_SIGNED (se houver parcial histórico)
        const signedCount = signers.filter((s) => s.required && s.status === 'SIGNED').length;
        const requiredCount = signers.filter((s) => s.required).length;
        if (contract.status === 'PENDING_SIGNATURES'
          && signedCount > 0
          && signedCount < requiredCount) {
          const t = canTransitionContract(contract.status, 'PARTIALLY_SIGNED', ctx);
          if (t.allowed) {
            contract = await deps.contractRepository.update(tenantId, {
              ...contract,
              status: 'PARTIALLY_SIGNED',
              updatedAt: clock.nowIso(),
            }, contract.rowVersion);
            await appendLedger(tenantId, {
              contractId: contract.id,
              contractVersionId: version.id,
              envelopeId: envelope.id,
              eventType: 'CONTRACT_STATUS_PARTIALLY_SIGNED',
              actor,
              payload: { from: 'PENDING_SIGNATURES', to: 'PARTIALLY_SIGNED' },
              correlationId,
            }, ledgerEntries);
          }
        }

        // → SIGNED
        if (contract.status !== 'SIGNED') {
          const from = contract.status;
          const t = canTransitionContract(from, 'SIGNED', ctx);
          if (!t.allowed) fail(t.errors[0].code, t.errors[0].message);
          const completedAt = clock.nowIso();
          contract = await deps.contractRepository.update(tenantId, {
            ...contract,
            status: 'SIGNED',
            completedAt,
            signatureEnvelopeId: envelope.id,
            updatedAt: completedAt,
          }, contract.rowVersion);

          await appendLedger(tenantId, {
            contractId: contract.id,
            contractVersionId: version.id,
            envelopeId: envelope.id,
            eventType: 'CONTRACT_SIGNED',
            actor,
            payload: {
              from,
              to: 'SIGNED',
              signedPdfFileId: signedPdf.id,
              evidenceReportFileId: evidenceReport.id,
              integrityManifestFileId: integrityManifestFile.id,
              documentHash: version.documentHash,
              // NÃO publicar no event bus legado CONTRACT_SIGNED
              domainEventBusNotified: false,
            },
            correlationId,
            idempotencyKey: `${input.idempotencyKey}:signed`,
          }, ledgerEntries);

          events.push(createContractDomainEvent({
            tenantId,
            aggregateId: contract.id,
            aggregateType: 'contract',
            eventType: 'contract.signed',
            occurredAt: completedAt,
            actor: { actorType: 'USER', actorId: actor.userId },
            payload: {
              contractId: contract.id,
              envelopeId: envelope.id,
              effectsPending: true,
              legacyBusNotNotified: true,
            },
          }));
        }

        const effects = deriveContractSignedPendingEffects({
          contract,
          signed: contract.status === 'SIGNED',
          signedPdf,
          hasFinancialSnapshot: Boolean(version.financialSnapshot),
          hasClinicalConsent: Boolean(version.consentsSnapshot?.length),
        });

        await appendLedger(tenantId, {
          contractId: contract.id,
          contractVersionId: version.id,
          envelopeId: envelope.id,
          eventType: 'CONTRACT_SIGNED_EFFECTS_PREPARED',
          actor,
          payload: {
            effects: Object.fromEntries(
              Object.entries(effects).map(([k, v]) => [k, {
                required: v.required,
                ready: v.ready,
                executed: false,
              }]),
            ),
          },
          correlationId,
          idempotencyKey: `${input.idempotencyKey}:effects`,
        }, ledgerEntries);

        events.push(createContractDomainEvent({
          tenantId,
          aggregateId: contract.id,
          aggregateType: 'contract',
          eventType: 'contract.signed_effects_prepared',
          occurredAt: clock.nowIso(),
          payload: { contractId: contract.id, executed: false },
        }));

        await idempotency.complete(
          tenantId,
          'COMPLETE_CONTRACT_SIGNING',
          input.idempotencyKey,
          contract.id,
          clock.nowIso(),
        );

        return {
          contract,
          version,
          envelope,
          signedPdf,
          evidenceReport,
          integrityManifest: integrityManifestFile,
          ledgerEntries: await ledger.listByContract(tenantId, contract.id),
          effects,
          events,
          idempotentReplay: false,
          completedAt: contract.completedAt || clock.nowIso(),
        };
      };

      try {
        if (deps.contractRepository.withTransaction && ledger.withTransaction) {
          return await deps.contractRepository.withTransaction(async () => (
            ledger.withTransaction!(async () => run())
          ));
        }
        return await run();
      } catch (error) {
        try {
          await idempotency.fail(
            tenantId,
            'COMPLETE_CONTRACT_SIGNING',
            input.idempotencyKey,
            'CONTRACT_SIGNED_ROLLBACK_FAILED',
            clock.nowIso(),
          );
        } catch {
          // ignore
        }
        throw error;
      }
    },

    async reconcileSigningCompletion(tenantId: TenantId, contractId: ContractId) {
      assertFlags();
      const contract = await deps.contractRepository.findById(tenantId, contractId);
      if (!contract) fail('CONTRACT_NOT_FOUND', 'Contrato não encontrado.');
      const chain = await ledger.verifyChain(tenantId, contractId);
      const entries = await ledger.listByContract(tenantId, contractId);
      const hasSignedLedger = entries.some((e) => e.eventType === 'CONTRACT_SIGNED');
      const inconsistencies: string[] = [];

      if (contract.status === 'SIGNED' && !hasSignedLedger) {
        inconsistencies.push('SIGNED_WITHOUT_LEDGER');
      }
      if (contract.status !== 'SIGNED' && hasSignedLedger) {
        inconsistencies.push('LEDGER_WITHOUT_SIGNED_STATUS');
      }
      if (!chain.valid) inconsistencies.push('CHAIN_INVALID');

      let envelope: SignatureEnvelope | null = null;
      if (contract.signatureEnvelopeId) {
        envelope = await deps.envelopeRepository.findById(
          tenantId,
          contract.signatureEnvelopeId,
        );
        if (envelope?.status === 'COMPLETED' && contract.status === 'APPROVED') {
          inconsistencies.push('ENVELOPE_COMPLETED_CONTRACT_APPROVED');
        }
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
          autoExecuted: false,
        })),
        events: inconsistencies.length
          ? [createContractDomainEvent({
            tenantId,
            aggregateId: contractId,
            aggregateType: 'contract',
            eventType: 'contract.signed_reconciliation_required',
            occurredAt: clock.nowIso(),
            payload: { inconsistencies },
          })]
          : [],
      };
    },

    async retryPendingCompletion(
      tenantId: TenantId,
      input: CompleteContractSigningInput,
      actor: ContractAuditActor,
    ) {
      return this.completeSigning(tenantId, input, actor);
    },

    getLedgerRepository: () => ledger,
  };
}

export type ContractSigningCompletionService = ReturnType<
  typeof createContractSigningCompletionService
>;
