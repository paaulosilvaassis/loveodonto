/**
 * @module domain/contracts/application/contract.application-service
 * @description Application service de instâncias contratuais — Phase 10.5.
 */

import {
  createContractDomainError,
  type ContractDomainError,
} from '../contract.errors.js';
import { createContractDomainEvent } from '../contract.events.js';
import {
  isContractFeatureEnabled,
  type ContractFeatureFlagContext,
} from '../contract-feature-flags.js';
import type {
  ContractId,
  ContractTemplateId,
  ContractTemplateVersionId,
  ContractVersionId,
  TenantId,
} from '../contract.ids.js';
import type { Contract, ContractListQuery, ContractListResult, ContractVersion } from '../contract.types.js';
import {
  canTransitionContract,
  createPermissiveTransitionContext,
  isContractContentLocked,
} from '../contract-status.machine.js';
import type { ContractTemplate, ContractTemplateVersion } from '../templates/contract-template.types.js';
import {
  createContractGenerationPipeline,
  type ContractGenerationPipeline,
} from '../generation/contract-generation.pipeline.js';
import type {
  CancelContractInput,
  ContractDetails,
  ContractOperationActor,
  ContractReadinessResult,
  ContractStatusTransitionResult,
  ContractStatusTransitionServiceInput,
  CreateContractDraftInput,
  CreateContractDraftResult,
  CreateContractVersionInput,
  CreateContractVersionResult,
  DuplicateContractInput,
  UpdateContractDraftInput,
} from '../generation/contract-generation.types.js';
import {
  createMemoryContractIdempotencyRepository,
  fingerprintIdempotencyInput,
  ContractIdempotencyConflictError,
  type ContractIdempotencyRepository,
} from '../idempotency/contract-idempotency.js';
import {
  createMemoryContractNumberGenerator,
  type ContractNumberGenerator,
} from '../numbering/contract-number.generator.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractIdFactory } from '../shared/contract-id-factory.js';
import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import { createContractContentHasher } from '../hash/contract-content-hasher.js';
import { validateReadinessForTarget } from './contract-readiness.js';
import type { ContractApplicationRepository } from './contract-memory.repository.js';
import { createContractAuditEvent } from '../audit/contract-audit.factory.js';

export const CONTRACT_INSTANCE_PERMISSIONS = [
  'contracts:view',
  'contracts:create',
  'contracts:update_draft',
  'contracts:review',
  'contracts:approve',
  'contracts:cancel',
  'contracts:view_audit',
] as const;

export type ContractInstancePermission = (typeof CONTRACT_INSTANCE_PERMISSIONS)[number];

export class ContractApplicationError extends Error {
  readonly domainError: ContractDomainError;

  constructor(domainError: ContractDomainError) {
    super(domainError.message);
    this.name = 'ContractApplicationError';
    this.domainError = domainError;
  }
}

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new ContractApplicationError(createContractDomainError(code, message, field));
}

function requireTenant(tenantId: TenantId | string | undefined): TenantId {
  const tid = String(tenantId || '').trim();
  if (!tid) fail('TENANT_REQUIRED', 'tenantId é obrigatório.', 'tenantId');
  return tid as TenantId;
}

function requirePermission(actor: ContractOperationActor, permission: ContractInstancePermission): void {
  if (!(actor.permissions || []).includes(permission)) {
    fail('PERMISSION_DENIED', `Permissão necessária: ${permission}.`, 'permissions');
  }
}

function translateRepoError(error: unknown): never {
  if (error instanceof ContractApplicationError) throw error;
  if (error instanceof ContractIdempotencyConflictError) throw error;
  const code = String((error as { code?: string })?.code || '');
  const message = String((error as Error)?.message || 'Erro de persistência.');
  if (code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE' || message.includes('não está disponível')) {
    fail('CONTRACTS_V2_STORAGE_UNAVAILABLE', 'O módulo de contratos v2 ainda não está disponível neste ambiente.');
  }
  if (code === 'OPTIMISTIC_CONCURRENCY_CONFLICT') {
    fail('OPTIMISTIC_CONCURRENCY_CONFLICT', 'Conflito de versão (rowVersion).');
  }
  if (code === 'TENANT_MISMATCH') fail('TENANT_MISMATCH', 'tenantId não corresponde.');
  if (code === 'VERSION_ALREADY_LOCKED') fail('VERSION_ALREADY_LOCKED', 'Versão bloqueada.');
  if (code === 'CONTRACT_NOT_FOUND') fail('CONTRACT_NOT_FOUND', 'Contrato ou versão não encontrado.');
  fail('INVALID_INPUT', message);
}

export interface TemplateLookup {
  getTemplate(tenantId: TenantId, templateId: ContractTemplateId): Promise<ContractTemplate | null>;
  getTemplateVersion(
    tenantId: TenantId,
    versionId: ContractTemplateVersionId,
  ): Promise<ContractTemplateVersion | null>;
}

export interface ContractApplicationServiceDeps {
  repository: ContractApplicationRepository;
  templateLookup?: TemplateLookup;
  numberGenerator?: ContractNumberGenerator;
  idempotency?: ContractIdempotencyRepository;
  clock?: ContractClock;
  ids?: ContractIdFactory;
  pipeline?: ContractGenerationPipeline;
  featureFlagContext?: ContractFeatureFlagContext;
  skipFeatureFlagCheck?: boolean;
  /** Timeline auditável em memória (não persiste). */
  auditSink?: Array<ReturnType<typeof createContractAuditEvent>>;
}

export interface ContractApplicationService {
  createDraft(
    tenantId: TenantId,
    input: CreateContractDraftInput,
    actor: ContractOperationActor,
  ): Promise<CreateContractDraftResult>;

  getContract(tenantId: TenantId, contractId: ContractId, actor: ContractOperationActor): Promise<ContractDetails | null>;

  listContracts(
    tenantId: TenantId,
    query: ContractListQuery,
    actor: ContractOperationActor,
  ): Promise<ContractListResult>;

  updateDraft(
    tenantId: TenantId,
    contractId: ContractId,
    input: UpdateContractDraftInput,
    actor: ContractOperationActor,
  ): Promise<Contract>;

  createVersion(
    tenantId: TenantId,
    contractId: ContractId,
    input: CreateContractVersionInput,
    actor: ContractOperationActor,
  ): Promise<CreateContractVersionResult>;

  validateReadiness(
    tenantId: TenantId,
    contractId: ContractId,
    targetStatus: import('../contract.constants.js').ContractStatus,
    actor: ContractOperationActor,
  ): Promise<ContractReadinessResult>;

  transitionStatus(
    tenantId: TenantId,
    contractId: ContractId,
    input: ContractStatusTransitionServiceInput,
    actor: ContractOperationActor,
  ): Promise<ContractStatusTransitionResult>;

  lockVersion(
    tenantId: TenantId,
    contractId: ContractId,
    versionId: ContractVersionId,
    actor: ContractOperationActor,
  ): Promise<ContractVersion>;

  cancelContract(
    tenantId: TenantId,
    contractId: ContractId,
    input: CancelContractInput,
    actor: ContractOperationActor,
  ): Promise<Contract>;

  duplicateContractDraft(
    tenantId: TenantId,
    contractId: ContractId,
    input: DuplicateContractInput,
    actor: ContractOperationActor,
  ): Promise<Contract>;
}

export function createContractApplicationService(
  deps: ContractApplicationServiceDeps,
): ContractApplicationService {
  const repo = deps.repository;
  const clock = deps.clock || createSystemContractClock();
  const ids = deps.ids || createCryptoContractIdFactory();
  const numbers = deps.numberGenerator || createMemoryContractNumberGenerator(clock);
  const idempotency = deps.idempotency || createMemoryContractIdempotencyRepository();
  const hasher = createContractContentHasher();
  const auditSink = deps.auditSink;

  const pipeline = deps.pipeline || createContractGenerationPipeline({
    hasher,
    ids,
    clock,
    saveVersion: (tid, version) => repo.saveVersion(tid as TenantId, version),
    updateContract: async (tid, contract) => {
      const current = await repo.findById(tid as TenantId, contract.id);
      return repo.update(
        tid as TenantId,
        contract,
        current?.rowVersion,
      );
    },
    listVersions: (tid, cid) => repo.listVersions(tid as TenantId, cid as ContractId),
  });

  function assertFlags(): void {
    if (deps.skipFeatureFlagCheck) return;
    const ctx = deps.featureFlagContext || {};
    if (!isContractFeatureEnabled('contracts_domain_v2_enabled', ctx)
      || !isContractFeatureEnabled('contracts_module_v2_enabled', ctx)
      || !isContractFeatureEnabled('contract_versioning_enabled', ctx)) {
      fail('FEATURE_FLAG_DISABLED', 'Contratos v2 desabilitados neste ambiente.', 'featureFlag');
    }
  }

  function pushAudit(event: ReturnType<typeof createContractAuditEvent>): void {
    if (auditSink) auditSink.push(event);
  }

  async function load(tenantId: TenantId, contractId: ContractId): Promise<Contract> {
    try {
      const found = await repo.findById(tenantId, contractId);
      if (!found) fail('CONTRACT_NOT_FOUND', 'Contrato não encontrado.');
      return found;
    } catch (error) {
      translateRepoError(error);
    }
  }

  return {
    async createDraft(tenantId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contracts:create');
      if (!String(input.title || '').trim()) fail('TITLE_REQUIRED', 'Título obrigatório.', 'title');
      if (!String(input.patientId || '').trim()) fail('PATIENT_REQUIRED', 'Paciente obrigatório.', 'patientId');

      const fingerprintPayload = {
        documentType: input.documentType,
        title: input.title,
        patientId: input.patientId,
        guardianPatientId: input.guardianPatientId || null,
        budgetId: input.budgetId || null,
        templateId: input.templateId || null,
        templateVersionId: input.templateVersionId || null,
        origin: input.origin,
      };
      const fingerprint = fingerprintIdempotencyInput(fingerprintPayload);

      if (input.idempotencyKey) {
        const reservation = await idempotency.reserve(
          tid,
          'CREATE_CONTRACT',
          input.idempotencyKey,
          fingerprint,
          clock.nowIso(),
        );
        if (reservation.kind === 'conflict') {
          throw new ContractIdempotencyConflictError();
        }
        if (reservation.kind === 'replay' && reservation.record.status === 'COMPLETED') {
          const existing = await repo.findById(
            tid,
            reservation.record.resultRef as ContractId,
          );
          if (existing) {
            return { contract: existing, events: [], idempotentReplay: true };
          }
        }
      }

      if (input.templateId && deps.templateLookup) {
        const template = await deps.templateLookup.getTemplate(tid, input.templateId);
        if (!template) fail('TEMPLATE_REQUIRED', 'Template não encontrado.', 'templateId');
        if (template.tenantId !== tid) fail('TENANT_MISMATCH', 'Template de outro tenant.', 'templateId');
        if (template.templateStatus !== 'PUBLISHED') {
          fail('TEMPLATE_NOT_PUBLISHED', 'Template não publicado.', 'templateId');
        }
        if (input.templateVersionId) {
          const tv = await deps.templateLookup.getTemplateVersion(tid, input.templateVersionId);
          if (!tv || tv.templateId !== template.id || tv.tenantId !== tid) {
            fail('VERSION_REQUIRED', 'Versão de template inválida.', 'templateVersionId');
          }
          if (tv.status !== 'PUBLISHED') {
            fail('TEMPLATE_NOT_PUBLISHED', 'Versão de template não publicada.', 'templateVersionId');
          }
        }
      }

      const now = clock.nowIso();
      const contractNumber = await numbers.generate(tid);
      const contract: Contract = {
        id: ids.next('ctr') as ContractId,
        tenantId: tid,
        contractNumber,
        documentType: input.documentType,
        title: String(input.title).trim(),
        patientId: input.patientId,
        guardianPatientId: input.guardianPatientId,
        budgetId: input.budgetId,
        treatmentPlanId: input.treatmentPlanId as Contract['treatmentPlanId'],
        appointmentId: input.appointmentId as Contract['appointmentId'],
        origin: input.origin,
        status: 'DRAFT',
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
        rowVersion: 1,
        metadata: {
          ...(input.metadata || {}),
          templateId: input.templateId,
          templateVersionId: input.templateVersionId,
          requirements: input.requirements,
        },
      };

      try {
        const created = await repo.create(tid, contract);
        if (input.idempotencyKey) {
          await idempotency.complete(tid, 'CREATE_CONTRACT', input.idempotencyKey, created.id, now);
        }
        const event = createContractDomainEvent({
          tenantId: tid,
          aggregateId: created.id,
          aggregateType: 'contract',
          eventType: 'contract.created',
          occurredAt: now,
          actor: { actorType: 'USER', actorId: actor.userId, actorName: actor.displayName },
          payload: {
            contractId: created.id,
            contractNumber: created.contractNumber,
            documentType: created.documentType,
            patientId: created.patientId,
            origin: created.origin,
          },
        });
        pushAudit(createContractAuditEvent({
          tenantId: tid,
          contractId: created.id,
          eventType: 'CREATED',
          actor: { actorType: 'USER', actorId: actor.userId },
          source: 'APP',
          occurredAt: now,
          metadata: { contractNumber: created.contractNumber },
        }));
        return { contract: created, events: [event], idempotentReplay: false };
      } catch (error) {
        if (input.idempotencyKey) {
          await idempotency.fail(tid, 'CREATE_CONTRACT', input.idempotencyKey, 'INVALID_INPUT', clock.nowIso());
        }
        translateRepoError(error);
      }
    },

    async getContract(tenantId, contractId, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contracts:view');
      try {
        const contract = await repo.findById(tid, contractId);
        if (!contract) return null;
        const versions = await repo.listVersions(tid, contractId);
        const currentVersion = contract.currentVersionId
          ? versions.find((v) => v.id === contract.currentVersionId) || null
          : versions[versions.length - 1] || null;
        return { contract, currentVersion, versions };
      } catch (error) {
        translateRepoError(error);
      }
    },

    async listContracts(tenantId, query, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contracts:view');
      try {
        const items = await repo.list(tid, query || {});
        return {
          items,
          total: items.length,
          limit: query?.limit ?? items.length,
          offset: query?.offset ?? 0,
        };
      } catch (error) {
        translateRepoError(error);
      }
    },

    async updateDraft(tenantId, contractId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contracts:update_draft');
      const contract = await load(tid, contractId);
      if (contract.status !== 'DRAFT' && contract.status !== 'READY_FOR_REVIEW') {
        fail('CONTENT_LOCKED', 'Somente DRAFT/READY_FOR_REVIEW permitem update de draft.');
      }
      if (isContractContentLocked(contract.status, { signaturesStarted: false, hasLockedVersion: false })) {
        fail('CONTENT_LOCKED', 'Conteúdo bloqueado.');
      }
      if (contract.currentVersionId) {
        const version = await repo.findVersionById(tid, contract.currentVersionId);
        if (version?.lockedAt) fail('VERSION_ALREADY_LOCKED', 'Versão bloqueada — draft não editável.');
      }

      const next: Contract = {
        ...contract,
        title: input.title != null ? String(input.title).trim() : contract.title,
        documentType: input.documentType ?? contract.documentType,
        guardianPatientId: input.guardianPatientId === null
          ? undefined
          : (input.guardianPatientId ?? contract.guardianPatientId),
        budgetId: input.budgetId === null ? undefined : (input.budgetId ?? contract.budgetId),
        treatmentPlanId: input.treatmentPlanId === null
          ? undefined
          : ((input.treatmentPlanId ?? contract.treatmentPlanId) as Contract['treatmentPlanId']),
        appointmentId: input.appointmentId === null
          ? undefined
          : ((input.appointmentId ?? contract.appointmentId) as Contract['appointmentId']),
        updatedAt: clock.nowIso(),
        metadata: {
          ...(contract.metadata || {}),
          ...(input.metadata || {}),
          ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
          ...(input.templateVersionId !== undefined
            ? { templateVersionId: input.templateVersionId }
            : {}),
        },
      };
      if (!next.title) fail('TITLE_REQUIRED', 'Título vazio.', 'title');
      try {
        return await repo.update(tid, next, input.expectedRowVersion ?? contract.rowVersion);
      } catch (error) {
        translateRepoError(error);
      }
    },

    async createVersion(tenantId, contractId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contracts:update_draft');
      const contract = await load(tid, contractId);
      if (contract.status === 'CANCELLED' || contract.status === 'VOIDED') {
        fail('TERMINAL_STATUS', 'Contrato terminal não gera versão.');
      }

      const fingerprint = fingerprintIdempotencyInput({
        contractId,
        generationReason: input.context.generationReason,
        templateVersionId: input.context.templateVersion.id,
        patientId: input.context.patient.patientId,
      });

      if (input.idempotencyKey) {
        const reservation = await idempotency.reserve(
          tid,
          'CREATE_VERSION',
          input.idempotencyKey,
          fingerprint,
          clock.nowIso(),
        );
        if (reservation.kind === 'conflict') throw new ContractIdempotencyConflictError();
        if (reservation.kind === 'replay' && reservation.record.status === 'COMPLETED') {
          const versionId = reservation.record.resultRef as ContractVersionId;
          const version = await repo.findVersionById(tid, versionId);
          if (version) {
            return {
              contract,
              version,
              validation: { valid: true, errors: [], warnings: [], variables: { used: [], unknown: [], unresolvedRequired: [], unresolvedOptional: [] } },
              events: [],
              warnings: [],
              idempotentReplay: true,
            };
          }
        }
      }

      const run = async () => {
        const result = await pipeline.generate({
          context: {
            ...input.context,
            tenantId: tid,
            contract,
            actor,
            generatedAt: input.context.generatedAt || clock.nowIso(),
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (!result.validation.valid || !result.version) {
          const first = result.validation.errors[0];
          throw new ContractApplicationError(first || createContractDomainError(
            'INVALID_INPUT',
            'Geração inválida.',
          ));
        }
        if (input.idempotencyKey) {
          await idempotency.complete(
            tid,
            'CREATE_VERSION',
            input.idempotencyKey,
            result.version.id,
            clock.nowIso(),
          );
        }
        pushAudit(createContractAuditEvent({
          tenantId: tid,
          contractId,
          contractVersionId: result.version.id,
          eventType: 'VERSION_CREATED',
          actor: { actorType: 'USER', actorId: actor.userId },
          source: 'APP',
          occurredAt: clock.nowIso(),
          metadata: {
            versionNumber: result.version.versionNumber,
            generationReason: result.version.generationReason,
            documentHash: result.version.documentHash,
          },
        }));
        return result;
      };

      try {
        if (repo.withTransaction) return await repo.withTransaction(run);
        return await run();
      } catch (error) {
        if (input.idempotencyKey) {
          await idempotency.fail(tid, 'CREATE_VERSION', input.idempotencyKey, 'INVALID_INPUT', clock.nowIso());
        }
        translateRepoError(error);
      }
    },

    async validateReadiness(tenantId, contractId, targetStatus, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contracts:view');
      const details = await this.getContract(tid, contractId, actor);
      if (!details) fail('CONTRACT_NOT_FOUND', 'Contrato não encontrado.');
      const requirements = (details.contract.metadata?.requirements || {}) as never;
      return validateReadinessForTarget(targetStatus, {
        contract: details.contract,
        version: details.currentVersion,
        requirements,
        hasPublishedTemplate: Boolean(details.currentVersion?.templateVersionId),
        hasSignaturePolicy: true,
        hasActiveConflictingEnvelope: false,
      });
    },

    async transitionStatus(tenantId, contractId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      const contract = await load(tid, contractId);
      const to = input.toStatus;

      if (to === 'READY_FOR_REVIEW' || to === 'PENDING_INTERNAL_APPROVAL') {
        requirePermission(actor, 'contracts:review');
      } else if (to === 'APPROVED') {
        requirePermission(actor, 'contracts:approve');
      } else if (to === 'CANCELLED') {
        requirePermission(actor, 'contracts:cancel');
      } else {
        fail('INVALID_STATUS_TRANSITION', `Transição para ${to} não suportada nesta fase.`);
      }

      // Nesta fase: até APPROVED; assinatura só no domínio/testes da SM.
      if (['PENDING_SIGNATURES', 'PARTIALLY_SIGNED', 'SIGNED'].includes(to)) {
        fail('INVALID_STATUS_TRANSITION', 'Assinatura real não iniciada nesta fase.');
      }

      const details = await this.getContract(tid, contractId, {
        ...actor,
        permissions: [...(actor.permissions || []), 'contracts:view'],
      });
      const version = details?.currentVersion || null;

      if (to === 'READY_FOR_REVIEW' || to === 'PENDING_INTERNAL_APPROVAL' || to === 'APPROVED') {
        const readiness = validateReadinessForTarget(
          to === 'APPROVED' ? 'PENDING_INTERNAL_APPROVAL' : to,
          {
            contract,
            version,
            requirements: (contract.metadata?.requirements || {}) as never,
            hasPublishedTemplate: Boolean(version?.templateVersionId),
          },
        );
        if (to !== 'READY_FOR_REVIEW' && !readiness.valid) {
          throw new ContractApplicationError(readiness.errors[0]);
        }
        if (to === 'READY_FOR_REVIEW' && !validateReadinessForTarget('READY_FOR_REVIEW', {
          contract,
          version,
          hasPublishedTemplate: Boolean(version?.templateVersionId),
        }).valid) {
          const r = validateReadinessForTarget('READY_FOR_REVIEW', {
            contract,
            version,
            hasPublishedTemplate: Boolean(version?.templateVersionId),
          });
          throw new ContractApplicationError(r.errors[0]);
        }
      }

      const ctx = createPermissiveTransitionContext({
        hasPublishedTemplate: Boolean(version?.templateVersionId),
        hasPatient: Boolean(contract.patientId),
        hasRequiredGuardian: !contract.metadata?.requirements
          || !(contract.metadata.requirements as { requiresGuardian?: boolean }).requiresGuardian
          || Boolean(version?.guardianSnapshot),
        hasBudgetWhenRequired: true,
        hasFinancialSnapshotWhenRequired: Boolean(version?.financialSnapshot)
          || !(contract.metadata?.requirements as { requiresFinancialPlan?: boolean })?.requiresFinancialPlan,
        hasRequiredSigners: Boolean(version?.signersSnapshot?.length),
        hasRequiredApprovals: true,
        hasLockedVersion: Boolean(version?.lockedAt),
        signaturesStarted: false,
        allRequiredSignaturesCompleted: false,
        cancellationReason: input.cancellationReason,
      });

      const transition = canTransitionContract(contract.status, to, ctx);
      if (!transition.allowed) {
        fail('INVALID_STATUS_TRANSITION', transition.errors[0]?.message || 'Transição inválida.');
      }

      const now = clock.nowIso();
      const next: Contract = {
        ...contract,
        status: to,
        updatedAt: now,
        ...(to === 'CANCELLED' ? {
          cancelledAt: now,
          cancelledBy: actor.userId,
          cancellationReason: input.cancellationReason,
        } : {}),
      };

      try {
        const saved = await repo.update(tid, next, input.expectedRowVersion ?? contract.rowVersion);
        const eventType = to === 'READY_FOR_REVIEW'
          ? 'contract.ready_for_review'
          : to === 'PENDING_INTERNAL_APPROVAL'
            ? 'contract.approval_requested'
            : to === 'APPROVED'
              ? 'contract.approved'
              : to === 'CANCELLED'
                ? 'contract.cancelled'
                : 'contract.updated';
        const event = createContractDomainEvent({
          tenantId: tid,
          aggregateId: saved.id,
          aggregateType: 'contract',
          eventType,
          occurredAt: now,
          actor: { actorType: 'USER', actorId: actor.userId },
          payload: {
            contractId: saved.id,
            versionId: saved.currentVersionId,
            ...(to === 'CANCELLED' ? { reasonPresent: Boolean(input.cancellationReason) } : {}),
          },
        });
        pushAudit(createContractAuditEvent({
          tenantId: tid,
          contractId: saved.id,
          contractVersionId: saved.currentVersionId,
          eventType: to === 'CANCELLED' ? 'CANCELLED' : 'STATUS_CHANGED',
          actor: { actorType: 'USER', actorId: actor.userId },
          source: 'APP',
          occurredAt: now,
          metadata: { from: contract.status, to },
        }));
        return { contract: saved, events: [event] };
      } catch (error) {
        translateRepoError(error);
      }
    },

    async lockVersion(tenantId, contractId, versionId, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contracts:review');
      const contract = await load(tid, contractId);
      let version: ContractVersion | null;
      try {
        version = await repo.findVersionById(tid, versionId);
      } catch (error) {
        translateRepoError(error);
      }
      if (!version || version.contractId !== contractId) {
        fail('CONTRACT_NOT_FOUND', 'Versão não encontrada.');
      }
      if (!version.documentHash) {
        fail('CONTENT_HASH_REQUIRED', 'Lock exige hash.', 'documentHash');
      }
      if (!version.patientSnapshot || !version.clinicSnapshot) {
        fail('SNAPSHOT_REQUIRED', 'Snapshots mínimos ausentes.');
      }
      if (!version.templateVersionId) {
        fail('TEMPLATE_REQUIRED', 'Template inválido na versão.');
      }

      if (version.lockedAt) {
        // Idempotente se mesmo conteúdo
        return version;
      }

      const now = clock.nowIso();
      const locked: ContractVersion = { ...version, lockedAt: now };
      try {
        const saved = await repo.updateVersion(tid, locked);
        createContractDomainEvent({
          tenantId: tid,
          aggregateId: contractId,
          aggregateType: 'contract_version',
          eventType: 'contract.version_locked',
          occurredAt: now,
          actor: { actorType: 'USER', actorId: actor.userId },
          payload: {
            contractId,
            versionId,
            versionNumber: saved.versionNumber,
            documentHash: saved.documentHash!,
            lockedAt: now,
          },
        });
        pushAudit(createContractAuditEvent({
          tenantId: tid,
          contractId,
          contractVersionId: versionId,
          eventType: 'VERSION_LOCKED',
          actor: { actorType: 'USER', actorId: actor.userId },
          source: 'APP',
          occurredAt: now,
          metadata: { documentHash: saved.documentHash },
        }));
        void contract;
        return saved;
      } catch (error) {
        translateRepoError(error);
      }
    },

    async cancelContract(tenantId, contractId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contracts:cancel');
      if (!String(input.cancellationReason || '').trim()) {
        fail('CANCELLATION_REASON_REQUIRED', 'Motivo obrigatório.', 'cancellationReason');
      }
      const result = await this.transitionStatus(
        tid,
        contractId,
        {
          toStatus: 'CANCELLED',
          cancellationReason: input.cancellationReason,
          expectedRowVersion: input.expectedRowVersion,
        },
        actor,
      );
      return result.contract;
    },

    async duplicateContractDraft(tenantId, contractId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contracts:create');
      const source = await load(tid, contractId);
      return (await this.createDraft(tid, {
        documentType: source.documentType,
        title: input.title || `Cópia de ${source.title}`,
        patientId: source.patientId,
        guardianPatientId: source.guardianPatientId,
        budgetId: source.budgetId,
        treatmentPlanId: source.treatmentPlanId,
        appointmentId: source.appointmentId,
        templateId: source.metadata?.templateId as ContractTemplateId | undefined,
        templateVersionId: source.metadata?.templateVersionId as ContractTemplateVersionId | undefined,
        origin: 'MANUAL',
        requirements: source.metadata?.requirements as never,
      }, actor)).contract;
    },
  };
}
