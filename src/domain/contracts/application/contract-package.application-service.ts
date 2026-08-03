/**
 * @module domain/contracts/application/contract-package.application-service
 * @description Application service de packages — Phase 10.5.
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
import type { ContractId, ContractPackageId, TenantId } from '../contract.ids.js';
import type { ContractPackage } from '../packages/contract-package.types.js';
import {
  createMemoryContractIdempotencyRepository,
  fingerprintIdempotencyInput,
  ContractIdempotencyConflictError,
  type ContractIdempotencyRepository,
} from '../idempotency/contract-idempotency.js';
import {
  createMemoryPackageNumberGenerator,
  type PackageNumberGenerator,
} from '../numbering/contract-number.generator.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractIdFactory } from '../shared/contract-id-factory.js';
import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import type {
  AddContractToPackageInput,
  ContractOperationActor,
  ContractPackageValidationResult,
  CreateContractPackageInput,
  CreateContractPackageResult,
} from '../generation/contract-generation.types.js';
import type {
  ContractApplicationRepository,
  ContractPackageApplicationRepository,
} from './contract-memory.repository.js';
import { ContractApplicationError } from './contract.application-service.js';

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new ContractApplicationError(createContractDomainError(code, message, field));
}

export interface ContractPackageApplicationServiceDeps {
  packageRepository: ContractPackageApplicationRepository;
  contractRepository: ContractApplicationRepository;
  numberGenerator?: PackageNumberGenerator;
  idempotency?: ContractIdempotencyRepository;
  clock?: ContractClock;
  ids?: ContractIdFactory;
  featureFlagContext?: ContractFeatureFlagContext;
  skipFeatureFlagCheck?: boolean;
}

export interface ContractPackageApplicationService {
  createPackage(
    tenantId: TenantId,
    input: CreateContractPackageInput,
    actor: ContractOperationActor,
  ): Promise<CreateContractPackageResult>;

  addContract(
    tenantId: TenantId,
    packageId: ContractPackageId,
    input: AddContractToPackageInput,
    actor: ContractOperationActor,
  ): Promise<ContractPackage>;

  validatePackage(
    tenantId: TenantId,
    packageId: ContractPackageId,
  ): Promise<ContractPackageValidationResult>;

  completePackage(
    tenantId: TenantId,
    packageId: ContractPackageId,
    actor: ContractOperationActor,
  ): Promise<ContractPackage>;
}

export function createContractPackageApplicationService(
  deps: ContractPackageApplicationServiceDeps,
): ContractPackageApplicationService {
  const packages = deps.packageRepository;
  const contracts = deps.contractRepository;
  const clock = deps.clock || createSystemContractClock();
  const ids = deps.ids || createCryptoContractIdFactory();
  const numbers = deps.numberGenerator || createMemoryPackageNumberGenerator(clock);
  const idempotency = deps.idempotency || createMemoryContractIdempotencyRepository();

  function assertFlags(): void {
    if (deps.skipFeatureFlagCheck) return;
    const ctx = deps.featureFlagContext || {};
    if (!isContractFeatureEnabled('contracts_domain_v2_enabled', ctx)
      || !isContractFeatureEnabled('contract_packages_enabled', ctx)) {
      fail('FEATURE_FLAG_DISABLED', 'Packages v2 desabilitados.', 'featureFlag');
    }
  }

  return {
    async createPackage(tenantId, input, actor) {
      assertFlags();
      const tid = String(tenantId || '').trim() as TenantId;
      if (!tid) fail('TENANT_REQUIRED', 'tenantId obrigatório.', 'tenantId');
      if (!(actor.permissions || []).includes('contracts:create')) {
        fail('PERMISSION_DENIED', 'Permissão contracts:create necessária.');
      }
      if (!String(input.patientId || '').trim()) {
        fail('PATIENT_REQUIRED', 'Package exige paciente.', 'patientId');
      }

      const fingerprint = fingerprintIdempotencyInput({
        patientId: input.patientId,
        budgetId: input.budgetId || null,
        requirements: input.requirements,
      });

      if (input.idempotencyKey) {
        const reservation = await idempotency.reserve(
          tid,
          'CREATE_PACKAGE',
          input.idempotencyKey,
          fingerprint,
          clock.nowIso(),
        );
        if (reservation.kind === 'conflict') throw new ContractIdempotencyConflictError();
        if (reservation.kind === 'replay' && reservation.record.status === 'COMPLETED') {
          const existing = await packages.findById(
            tid,
            reservation.record.resultRef as ContractPackageId,
          );
          if (existing) {
            return { package: existing, events: [], idempotentReplay: true };
          }
        }
      }

      const now = clock.nowIso();
      const pkg: ContractPackage = {
        id: ids.next('cpkg') as ContractPackageId,
        tenantId: tid,
        patientId: input.patientId,
        budgetId: input.budgetId,
        treatmentPlanId: input.treatmentPlanId as ContractPackage['treatmentPlanId'],
        status: 'DRAFT',
        packageNumber: await numbers.generate(tid),
        requirements: [...(input.requirements || [])],
        items: [],
        createdBy: actor.userId,
        createdAt: now,
      };

      const created = await packages.create(tid, pkg);
      if (input.idempotencyKey) {
        await idempotency.complete(tid, 'CREATE_PACKAGE', input.idempotencyKey, created.id, now);
      }
      const event = createContractDomainEvent({
        tenantId: tid,
        aggregateId: created.id,
        aggregateType: 'contract_package',
        eventType: 'contract.package_created',
        occurredAt: now,
        actor: { actorType: 'USER', actorId: actor.userId },
        payload: {
          packageId: created.id,
          packageNumber: created.packageNumber,
          patientId: created.patientId,
        },
      });
      return { package: created, events: [event], idempotentReplay: false };
    },

    async addContract(tenantId, packageId, input, actor) {
      assertFlags();
      const tid = String(tenantId || '').trim() as TenantId;
      if (!(actor.permissions || []).includes('contracts:update_draft')) {
        fail('PERMISSION_DENIED', 'Permissão contracts:update_draft necessária.');
      }
      const pkg = await packages.findById(tid, packageId);
      if (!pkg) fail('CONTRACT_NOT_FOUND', 'Package não encontrado.');
      const contract = await contracts.findById(tid, input.contractId as ContractId);
      if (!contract) fail('CONTRACT_NOT_FOUND', 'Contrato não encontrado.');
      if (contract.tenantId !== tid) fail('TENANT_MISMATCH', 'Contrato de outro tenant.');
      if (contract.patientId !== pkg.patientId) {
        fail('PACKAGE_PATIENT_MISMATCH', 'Paciente do contrato diverge do package.');
      }

      const item = {
        contractId: contract.id,
        documentType: contract.documentType,
        required: input.required !== false,
        status: contract.status,
        completedAt: contract.status === 'SIGNED' || contract.status === 'APPROVED'
          ? clock.nowIso()
          : undefined,
      };
      const next: ContractPackage = {
        ...pkg,
        items: [...pkg.items.filter((i) => i.contractId !== contract.id), item],
        status: pkg.status === 'DRAFT' ? 'PENDING' : pkg.status,
      };
      return packages.update(tid, next);
    },

    async validatePackage(tenantId, packageId) {
      assertFlags();
      const tid = String(tenantId || '').trim() as TenantId;
      const pkg = await packages.findById(tid, packageId);
      if (!pkg) {
        return {
          valid: false,
          errors: [createContractDomainError('CONTRACT_NOT_FOUND', 'Package não encontrado.')],
          warnings: [],
        };
      }
      const errors: ContractDomainError[] = [];
      for (const req of pkg.requirements.filter((r) => r.required)) {
        const matching = pkg.items.filter((i) => i.documentType === req.documentType);
        if (!matching.length) {
          errors.push(createContractDomainError(
            'PACKAGE_INCOMPLETE',
            `Item obrigatório ausente: ${req.documentType}.`,
            'requirements',
          ));
          continue;
        }
        const ok = matching.some((i) => i.status !== 'CANCELLED' && i.status !== 'VOIDED'
          && (i.status === 'APPROVED' || i.status === 'SIGNED' || i.completedAt));
        if (!ok) {
          const cancelledOnly = matching.every((i) => i.status === 'CANCELLED');
          errors.push(createContractDomainError(
            cancelledOnly ? 'PACKAGE_INCOMPLETE_ITEMS' : 'PACKAGE_INCOMPLETE',
            cancelledOnly
              ? `Requisito ${req.documentType} só possui contratos cancelados.`
              : `Requisito obrigatório pendente: ${req.documentType}.`,
            'items',
          ));
        }
      }
      return { valid: errors.length === 0, errors, warnings: [] };
    },

    async completePackage(tenantId, packageId, actor) {
      assertFlags();
      const tid = String(tenantId || '').trim() as TenantId;
      if (!(actor.permissions || []).includes('contracts:approve')) {
        fail('PERMISSION_DENIED', 'Permissão contracts:approve necessária.');
      }
      const validation = await this.validatePackage(tid, packageId);
      if (!validation.valid) {
        throw new ContractApplicationError(validation.errors[0]);
      }
      const pkg = await packages.findById(tid, packageId);
      if (!pkg) fail('CONTRACT_NOT_FOUND', 'Package não encontrado.');
      const now = clock.nowIso();
      const completed: ContractPackage = {
        ...pkg,
        status: 'COMPLETED',
        completedAt: now,
      };
      const saved = await packages.update(tid, completed);
      createContractDomainEvent({
        tenantId: tid,
        aggregateId: saved.id,
        aggregateType: 'contract_package',
        eventType: 'contract.package_completed',
        occurredAt: now,
        actor: { actorType: 'USER', actorId: actor.userId },
        payload: {
          packageId: saved.id,
          packageNumber: saved.packageNumber,
          itemCount: saved.items.length,
        },
      });
      return saved;
    },
  };
}
