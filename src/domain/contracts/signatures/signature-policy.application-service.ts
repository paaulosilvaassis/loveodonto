/**
 * @module domain/contracts/signatures/signature-policy.application-service
 * @description Application service de políticas de assinatura — Phase 10.6.
 */

import {
  createContractDomainError,
  type ContractDomainError,
} from '../contract.errors.js';
import {
  isContractFeatureEnabled,
  type ContractFeatureFlagContext,
} from '../contract-feature-flags.js';
import type { SignaturePolicyId, TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractIdFactory } from '../shared/contract-id-factory.js';
import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import {
  isMethodCapabilityUnavailable,
  type SignatureLevel,
  type SignatureMethod,
  type SignaturePolicy,
  type SignatureSigningOrder,
} from './signature.types.js';
import type { SignaturePolicyRepository } from './signature-memory.repository.js';
import {
  SignatureApplicationError,
  type SignatureOperationActor,
} from './signature-envelope.application-service.js';

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new SignatureApplicationError(createContractDomainError(code, message, field));
}

function requirePerm(actor: SignatureOperationActor, permission: string): void {
  if (!(actor.permissions || []).includes(permission)) {
    fail('PERMISSION_DENIED', `Permissão necessária: ${permission}.`);
  }
}

export interface CreateSignaturePolicyInput {
  name: string;
  signatureLevel: SignatureLevel;
  allowedMethods: SignatureMethod[];
  requireOtp?: boolean;
  requireEmailConfirmation?: boolean;
  requireSmsConfirmation?: boolean;
  requireDocumentCheck?: boolean;
  requireSelfie?: boolean;
  requireGeolocation?: boolean;
  requireIpAddress?: boolean;
  requireWitnesses?: boolean;
  signingOrder?: SignatureSigningOrder;
  linkExpirationHours?: number;
  otpExpirationMinutes?: number;
  maxAuthenticationAttempts?: number;
}

export interface SignaturePolicyApplicationServiceDeps {
  policyRepository: SignaturePolicyRepository;
  clock?: ContractClock;
  ids?: ContractIdFactory;
  featureFlagContext?: ContractFeatureFlagContext;
  skipFeatureFlagCheck?: boolean;
}

export function createSignaturePolicyApplicationService(
  deps: SignaturePolicyApplicationServiceDeps,
) {
  const clock = deps.clock || createSystemContractClock();
  const ids = deps.ids || createCryptoContractIdFactory();

  function assertFlags(): void {
    if (deps.skipFeatureFlagCheck) return;
    const ctx = deps.featureFlagContext || {};
    if (!isContractFeatureEnabled('contracts_domain_v2_enabled', ctx)
      || !isContractFeatureEnabled('contract_internal_signature_v2_enabled', ctx)) {
      fail('FEATURE_FLAG_DISABLED', 'Assinatura interna v2 desabilitada.');
    }
  }

  return {
    async listPolicies(tenantId: TenantId, actor: SignatureOperationActor) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:manage_policies');
      const items = await deps.policyRepository.list(tenantId);
      return { items, total: items.length };
    },

    async getPolicy(
      tenantId: TenantId,
      policyId: SignaturePolicyId,
      actor: SignatureOperationActor,
    ) {
      assertFlags();
      requirePerm(actor, 'contract_signatures:manage_policies');
      return deps.policyRepository.findById(tenantId, policyId);
    },

    async createPolicy(
      tenantId: TenantId,
      input: CreateSignaturePolicyInput,
      actor: SignatureOperationActor,
    ): Promise<SignaturePolicy> {
      assertFlags();
      requirePerm(actor, 'contract_signatures:manage_policies');
      if (!String(input.name || '').trim()) {
        fail('INVALID_INPUT', 'Nome da política obrigatório.', 'name');
      }
      if (!input.allowedMethods?.length) {
        fail('INVALID_INPUT', 'allowedMethods obrigatório.', 'allowedMethods');
      }
      for (const method of input.allowedMethods) {
        if (isMethodCapabilityUnavailable(method)) {
          fail('SIGNATURE_CAPABILITY_UNAVAILABLE', `Método indisponível: ${method}.`);
        }
      }
      if (input.signatureLevel === 'EXTERNAL_PROVIDER' || input.signatureLevel === 'QUALIFIED') {
        fail(
          'SIGNATURE_CAPABILITY_UNAVAILABLE',
          'Nível EXTERNAL_PROVIDER/QUALIFIED não disponível nesta fase.',
        );
      }

      const now = clock.nowIso();
      const requireIp = Boolean(input.requireIpAddress);
      const requireWitnesses = Boolean(input.requireWitnesses);
      const maxAttempts = input.maxAuthenticationAttempts ?? 5;
      const policy: SignaturePolicy = {
        id: ids.next('pol') as SignaturePolicyId,
        tenantId,
        name: input.name.trim(),
        signatureLevel: input.signatureLevel || 'SIMPLE',
        allowedMethods: [...input.allowedMethods],
        requireOtp: Boolean(input.requireOtp),
        requireEmailConfirmation: Boolean(input.requireEmailConfirmation),
        requireSmsConfirmation: Boolean(input.requireSmsConfirmation),
        requireDocumentCheck: Boolean(input.requireDocumentCheck),
        requireSelfie: Boolean(input.requireSelfie),
        requireGeolocation: Boolean(input.requireGeolocation),
        requireIp,
        requireIpAddress: requireIp,
        requireWitness: requireWitnesses,
        requireWitnesses,
        signingOrder: input.signingOrder || 'ANY_ORDER',
        linkExpirationHours: input.linkExpirationHours ?? 72,
        otpExpirationMinutes: input.otpExpirationMinutes ?? 10,
        maxAuthenticationAttempts: maxAttempts,
        maxAttempts,
        createdAt: now,
        updatedAt: now,
        rowVersion: 1,
      };
      return deps.policyRepository.create(tenantId, policy);
    },
  };
}

export type SignaturePolicyApplicationService = ReturnType<
  typeof createSignaturePolicyApplicationService
>;
