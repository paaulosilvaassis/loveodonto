/**
 * @module domain/contracts/signatures/signature-v2.harness
 * @description Harness técnico in-memory — Phase 10.6.
 */

import type { Contract, ContractVersion } from '../contract.types.js';
import type { TenantId } from '../contract.ids.js';
import { createFixedContractClock, type ContractClock } from '../shared/contract-clock.js';
import { createSequentialContractIdFactory } from '../shared/contract-id-factory.js';
import { createMemoryContractIdempotencyRepository } from '../idempotency/contract-idempotency.js';
import { DEMO_TENANT_ID } from '../fixtures/contract-v2.fixtures.js';
import {
  createDemoOtpPolicy,
  createDemoSequentialPolicy,
  createDemoSimplePolicy,
  demoSignerPatient,
} from '../fixtures/signature-v2.fixtures.js';
import {
  SignatureEnvelopeMemoryRepository,
  SignatureEvidenceMemoryRepository,
  SignaturePolicyMemoryRepository,
  SignatureSignerMemoryRepository,
} from './signature-memory.repository.js';
import { createMemorySigningSessionTokenService } from './signing-session-token.service.js';
import { createMemorySignatureAuthenticationChallengeService } from './signature-authentication-challenge.service.js';
import { createSignatureEnvelopeApplicationService } from './signature-envelope.application-service.js';
import { createSignatureSignerApplicationService } from './signature-signer.application-service.js';
import { createSignaturePolicyApplicationService } from './signature-policy.application-service.js';
import { createInternalSignatureProvider } from './internal-signature.provider.js';
import { SIGNATURE_PERMISSIONS } from './signature-envelope.application-service.js';

export function createApprovedContractFixture(tenantId: TenantId = DEMO_TENANT_ID): {
  contract: Contract;
  version: ContractVersion;
} {
  const contract = {
    id: 'ctr_demo_approved',
    tenantId,
    contractNumber: 'CTR-DEMO-SIG-001',
    status: 'APPROVED',
    documentType: 'SERVICE_CONTRACT',
    title: 'Contrato Demo Aprovado para Assinatura',
    currentVersionId: 'ver_demo_locked',
    patientId: 'patient_demo_001',
    origin: 'MANUAL',
    createdBy: 'user_demo',
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T11:00:00.000Z',
    rowVersion: 3,
  } as Contract;
  const version = {
    id: 'ver_demo_locked',
    tenantId,
    contractId: contract.id,
    versionNumber: 1,
    generationReason: 'INITIAL',
    contentSchemaSnapshot: {},
    patientSnapshot: { patientId: 'patient_demo_001', fullName: 'Paciente Demo' },
    clinicSnapshot: { legalName: 'Clínica Demo' },
    signersSnapshot: [],
    lockedAt: '2026-08-03T11:00:00.000Z',
    documentHash: 'hash_demo_document_v1',
    renderedHtmlSnapshot: '<p>Documento demonstrativo de assinatura — sem valor jurídico.</p>',
    createdBy: 'user_demo',
    createdAt: '2026-08-03T10:00:00.000Z',
  } as ContractVersion;
  return { contract, version };
}

export interface SignatureV2HarnessOptions {
  tenantId?: TenantId;
  clockIso?: string;
  deterministicOtp?: string;
  seedPolicies?: boolean;
}

export async function createSignatureV2Harness(options: SignatureV2HarnessOptions = {}) {
  const tenantId = options.tenantId || DEMO_TENANT_ID;
  const clock = createFixedContractClock(options.clockIso || '2026-08-03T12:00:00.000Z');
  const ids = createSequentialContractIdFactory(1);
  const idempotency = createMemoryContractIdempotencyRepository();
  const policyRepo = new SignaturePolicyMemoryRepository();
  const envelopeRepo = new SignatureEnvelopeMemoryRepository();
  const signerRepo = new SignatureSignerMemoryRepository();
  const evidenceRepo = new SignatureEvidenceMemoryRepository();
  const tokenService = createMemorySigningSessionTokenService(clock);
  const challengeService = createMemorySignatureAuthenticationChallengeService(clock, {
    deterministicCode: options.deterministicOtp || '123456',
    exposePlainCodeInTests: true,
  });
  const { contract, version } = createApprovedContractFixture(tenantId);
  const contracts = new Map([[contract.id, contract]]);
  const versions = new Map([[version.id, version]]);

  const contractLookup = {
    async getContract(tid: TenantId, contractId: string) {
      if (tid !== tenantId) return null;
      return contracts.get(contractId as never) || null;
    },
    async getVersion(tid: TenantId, versionId: string) {
      if (tid !== tenantId) return null;
      return versions.get(versionId as never) || null;
    },
  };

  if (options.seedPolicies !== false) {
    await policyRepo.create(tenantId, createDemoSimplePolicy(tenantId));
    await policyRepo.create(tenantId, createDemoOtpPolicy(tenantId));
    await policyRepo.create(tenantId, createDemoSequentialPolicy(tenantId));
  }

  const envelopeService = createSignatureEnvelopeApplicationService({
    policyRepository: policyRepo,
    envelopeRepository: envelopeRepo,
    signerRepository: signerRepo,
    evidenceRepository: evidenceRepo,
    contractLookup,
    tokenService,
    challengeService,
    clock,
    ids,
    idempotency,
    skipFeatureFlagCheck: true,
  });

  const signerService = createSignatureSignerApplicationService({
    envelopeRepository: envelopeRepo,
    signerRepository: signerRepo,
    policyRepository: policyRepo,
    evidenceRepository: evidenceRepo,
    tokenService,
    challengeService,
    envelopeService,
    clock,
    idempotency,
    skipFeatureFlagCheck: true,
  });

  const policyService = createSignaturePolicyApplicationService({
    policyRepository: policyRepo,
    clock,
    ids: createSequentialContractIdFactory(500),
    skipFeatureFlagCheck: true,
  });

  const internalProvider = createInternalSignatureProvider({
    envelopeService,
    evidenceRepository: evidenceRepo,
  });

  const actor = {
    userId: 'user_demo_sig',
    permissions: [...SIGNATURE_PERMISSIONS],
  };

  return {
    tenantId,
    clock: clock as ContractClock,
    ids,
    policyRepo,
    envelopeRepo,
    signerRepo,
    evidenceRepo,
    tokenService,
    challengeService,
    contractLookup,
    contracts,
    versions,
    contract,
    version,
    envelopeService,
    signerService,
    policyService,
    internalProvider,
    actor,
    demoSignerPatient,
    advanceClock(iso: string) {
      clock.setIso(iso);
    },
  };
}

export type SignatureV2Harness = Awaited<ReturnType<typeof createSignatureV2Harness>>;
