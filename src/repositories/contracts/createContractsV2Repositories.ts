/**
 * @module repositories/contracts/createContractsV2Repositories
 * @description Factory por ambiente — Phase 10.9 + 10.10.
 *
 * Regras:
 * - produção / default → unavailable
 * - unitários → memory
 * - integração local → postgres-test (exige guard explícito)
 * - storage local → postgres-storage-local-test (+ guard storage)
 * - NÃO seleciona Postgres só porque existem env vars
 */

import { ContractMemoryRepository } from '../../domain/contracts/application/contract-memory.repository.js';
import { ContractLedgerMemoryRepository } from '../../domain/contracts/ledger/contract-ledger.repository.js';
import { createMemoryContractIdempotencyRepository } from '../../domain/contracts/idempotency/contract-idempotency.js';
import {
  createMemoryContractNumberGenerator,
  createMemoryPackageNumberGenerator,
} from '../../domain/contracts/numbering/contract-number.generator.js';
import { SignatureEnvelopeMemoryRepository } from '../../domain/contracts/signatures/signature-memory.repository.js';
import { SignatureSignerMemoryRepository } from '../../domain/contracts/signatures/signature-memory.repository.js';
import { SignaturePolicyMemoryRepository } from '../../domain/contracts/signatures/signature-memory.repository.js';
import { ContractTemplateMemoryRepository } from '../../domain/contracts/templates/contract-template-memory.repository.js';
import { createMemorySigningSessionRepository } from '../../domain/contracts/signatures/signing-session-memory.repository.js';
import { createMemorySignatureAuthenticationChallengeRepository } from '../../domain/contracts/signatures/signature-challenge-memory.repository.js';
import { createMemorySignatureRateLimitRepository } from '../../domain/contracts/signatures/signature-rate-limit-memory.repository.js';
import { createMemorySignatureDeliveryAttemptRepository } from '../../domain/contracts/signatures/signature-delivery-memory.repository.js';
import {
  createMemoryContractPrivateStorage,
  createUnavailableContractPrivateStorage,
} from '../../domain/contracts/files/contract-private-storage.js';
import type { ContractPrivateStorage } from '../../domain/contracts/files/contract-private-storage.js';
import type { SigningSessionRepository } from '../../domain/contracts/signatures/signing-session.repository.js';
import type { SignatureAuthenticationChallengeRepository } from '../../domain/contracts/signatures/signature-challenge.repository.js';
import type { SignatureRateLimitRepository } from '../../domain/contracts/signatures/signature-rate-limit.repository.js';

import { ContractSupabaseRepository } from './contractSupabaseRepository.js';
import { ContractTemplateSupabaseRepository } from './contractTemplateSupabaseRepository.js';
import { ContractPackageSupabaseRepository } from './contractPackageSupabaseRepository.js';
import { SignatureEnvelopeSupabaseRepository } from './signatureEnvelopeSupabaseRepository.js';
import { ContractFileSupabaseRepository } from './contractFileSupabaseRepository.js';
import { ContractAuditSupabaseRepository } from './contractAuditSupabaseRepository.js';
import { ContractLedgerPostgresRepository } from './contractLedgerPostgres.repository.js';
import { ContractIdempotencyPostgresRepository } from './contractIdempotencyPostgres.repository.js';
import { PostgresSigningSessionRepository } from './signingSessionPostgres.repository.js';
import { PostgresSignatureAuthenticationChallengeRepository } from './signatureChallengePostgres.repository.js';
import { PostgresSignatureRateLimitRepository } from './signatureRateLimitPostgres.repository.js';
import {
  createPostgresContractNumberGenerator,
  createPostgresPackageNumberGenerator,
} from './contractNumberSequencePostgres.js';
import {
  assertContractsV2LocalDatabase,
  assertContractsV2LocalStorage,
  type ContractsV2EnvironmentMode,
} from './contractsV2EnvironmentGuard.js';
import { CONTRACTS_V2_PRIVATE_LOCAL_BUCKET } from './contractPersistenceTables.js';
import {
  createContractsV2TransactionManager,
  createMemoryTransactionManager,
  type ContractsV2TransactionManager,
  type DatabaseTransactionClient,
} from './contractsV2Transaction.js';
import { ContractPersistenceUnavailableError } from './contractPersistenceErrors.js';
import type { ContractSupabaseClient } from './contractPersistenceTypes.js';

export interface CreateContractsV2RepositoriesInput {
  mode: ContractsV2EnvironmentMode;
  /** Obrigatório para postgres-test / postgres-storage-local-test. */
  client?: ContractSupabaseClient | DatabaseTransactionClient | null;
  env?: NodeJS.ProcessEnv;
  projectId?: string;
  databaseUrl?: string;
  supabaseUrl?: string;
  storageUrl?: string;
  storageBucket?: string;
  explicitLocalMarker?: boolean;
  /** Factory opcional para storage privado Supabase local. */
  createPrivateStorage?: () => ContractPrivateStorage;
}

function buildPostgresBundle(input: CreateContractsV2RepositoriesInput, mode: ContractsV2EnvironmentMode) {
  assertContractsV2LocalDatabase({
    mode: mode === 'postgres-storage-local-test' ? 'postgres-storage-local-test' : 'postgres-test',
    env: input.env,
    projectId: input.projectId,
    databaseUrl: input.databaseUrl,
    supabaseUrl: input.supabaseUrl,
    explicitLocalMarker: input.explicitLocalMarker,
  });

  if (mode === 'postgres-storage-local-test') {
    assertContractsV2LocalStorage({
      env: input.env,
      bucket: input.storageBucket || CONTRACTS_V2_PRIVATE_LOCAL_BUCKET,
      supabaseUrl: input.supabaseUrl,
      storageUrl: input.storageUrl,
      explicitLocalMarker: input.explicitLocalMarker,
    });
  }

  if (!input.client) {
    throw new ContractPersistenceUnavailableError();
  }

  const client = input.client;
  const tx = createContractsV2TransactionManager(client as DatabaseTransactionClient);

  let privateStorage: ContractPrivateStorage = createUnavailableContractPrivateStorage();
  if (mode === 'postgres-storage-local-test' && input.createPrivateStorage) {
    privateStorage = input.createPrivateStorage();
  }

  return {
    mode,
    contracts: new ContractSupabaseRepository({ client }),
    templates: new ContractTemplateSupabaseRepository({ client }),
    packages: new ContractPackageSupabaseRepository({ client }),
    envelopes: new SignatureEnvelopeSupabaseRepository({ client }),
    files: new ContractFileSupabaseRepository({ client }),
    audit: new ContractAuditSupabaseRepository({ client }),
    ledger: new ContractLedgerPostgresRepository(client),
    idempotency: new ContractIdempotencyPostgresRepository(client),
    sessions: new PostgresSigningSessionRepository(client),
    challenges: new PostgresSignatureAuthenticationChallengeRepository(client),
    rateLimits: new PostgresSignatureRateLimitRepository(client),
    privateStorage,
    numberGenerator: createPostgresContractNumberGenerator(client as never),
    packageNumberGenerator: createPostgresPackageNumberGenerator(client as never),
    transactionManager: tx,
    unavailable: false as const,
    assertAvailable() {
      return true;
    },
  };
}

export function createContractsV2Repositories(input: CreateContractsV2RepositoriesInput) {
  const { mode } = input;

  if (mode === 'unavailable') {
    return {
      mode,
      contracts: new ContractSupabaseRepository({ client: null }),
      templates: new ContractTemplateSupabaseRepository({ client: null }),
      packages: new ContractPackageSupabaseRepository({ client: null }),
      envelopes: new SignatureEnvelopeSupabaseRepository({ client: null }),
      files: new ContractFileSupabaseRepository({ client: null }),
      audit: new ContractAuditSupabaseRepository({ client: null }),
      ledger: new ContractLedgerPostgresRepository(null),
      idempotency: new ContractIdempotencyPostgresRepository(null),
      sessions: null as SigningSessionRepository | null,
      challenges: null as SignatureAuthenticationChallengeRepository | null,
      rateLimits: null as SignatureRateLimitRepository | null,
      privateStorage: createUnavailableContractPrivateStorage(),
      numberGenerator: createPostgresContractNumberGenerator(null),
      packageNumberGenerator: createPostgresPackageNumberGenerator(null),
      transactionManager: null as ContractsV2TransactionManager | null,
      unavailable: true as const,
      assertAvailable() {
        throw new ContractPersistenceUnavailableError();
      },
    };
  }

  if (mode === 'memory') {
    const contracts = new ContractMemoryRepository();
    const ledger = new ContractLedgerMemoryRepository();
    const idempotency = createMemoryContractIdempotencyRepository();
    return {
      mode,
      contracts,
      templates: new ContractTemplateMemoryRepository(),
      packages: null,
      envelopes: new SignatureEnvelopeMemoryRepository(),
      signers: new SignatureSignerMemoryRepository(),
      policies: new SignaturePolicyMemoryRepository(),
      files: null,
      audit: null,
      ledger,
      idempotency,
      sessions: createMemorySigningSessionRepository(),
      challenges: createMemorySignatureAuthenticationChallengeRepository(),
      rateLimits: createMemorySignatureRateLimitRepository(),
      deliveryAttempts: createMemorySignatureDeliveryAttemptRepository(),
      privateStorage: createMemoryContractPrivateStorage(),
      numberGenerator: createMemoryContractNumberGenerator(),
      packageNumberGenerator: createMemoryPackageNumberGenerator(),
      transactionManager: createMemoryTransactionManager([contracts, ledger]),
      unavailable: false as const,
      assertAvailable() {
        return true;
      },
    };
  }

  if (mode === 'postgres-test' || mode === 'postgres-storage-local-test') {
    return buildPostgresBundle(input, mode);
  }

  throw new ContractPersistenceUnavailableError();
}

export type ContractsV2Repositories = ReturnType<typeof createContractsV2Repositories>;
