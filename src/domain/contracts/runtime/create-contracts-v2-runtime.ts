/**
 * @module domain/contracts/runtime/create-contracts-v2-runtime
 * @description Bootstrap seguro Contracts V2 — Phase 10.12.
 * Nenhuma seleção automática; staging nunca cai em memory.
 */

import { createSystemContractClock, type ContractClock } from '../shared/contract-clock.js';
import { createSignatureRateLimitService } from '../signatures/signature-rate-limit.service.js';
import { createMemorySignatureRateLimitRepository } from '../signatures/signature-rate-limit-memory.repository.js';
import {
  assertContractsV2ConfigOrThrow,
  loadContractsV2EnvironmentConfig,
  type ContractsV2EnvironmentConfig,
} from './contracts-v2-config.js';
import { createPublicSigningCorsPolicy } from './contracts-v2-public-cors.js';
import { createTrustedClientAddressResolver } from './contracts-v2-trusted-client-address.js';
import {
  createInMemoryHttpSignatureRateLimitAdapter,
  createPersistedHttpSignatureRateLimitAdapter,
  type HttpSignatureRateLimitAdapter,
} from './contracts-v2-http-rate-limit.js';
import { createContractsV2SecureLogger, type ContractsV2SecureLogger } from './contracts-v2-secure-logger.js';
import { createInMemoryContractsV2Metrics, type ContractsV2Metrics } from './contracts-v2-observability.js';
import {
  createContractsV2RuntimeReadinessService,
  type ContractsV2RuntimeReadinessService,
} from './contracts-v2-runtime-readiness.js';
import { DEFAULT_CONTRACTS_V2_SECURITY_HEADERS } from './contracts-v2-security-headers.js';

export interface ContractsV2RuntimeDependencies {
  config?: ContractsV2EnvironmentConfig;
  env?: NodeJS.ProcessEnv;
  database?: { ok: boolean; client?: unknown } | null;
  storage?: { ok: boolean; privateBucket?: boolean } | null;
  delivery?: { ok: boolean; mode?: string } | null;
  clock?: ContractClock;
  logger?: ContractsV2SecureLogger;
  metrics?: ContractsV2Metrics;
  repositories?: Record<string, unknown> | null;
  rateLimitRepository?: ReturnType<typeof createMemorySignatureRateLimitRepository> | null;
  migrationsPresent?: boolean;
  rlsOk?: boolean;
  ledgerOk?: boolean;
  rendererOk?: boolean;
  tokenServiceOk?: boolean;
  harnessMounted?: boolean;
  /** Exige opt-in explícito; nunca por header/query. */
  allowLocalHarness?: boolean;
}

export interface ContractsV2Runtime {
  config: ContractsV2EnvironmentConfig;
  clock: ContractClock;
  logger: ContractsV2SecureLogger;
  metrics: ContractsV2Metrics;
  corsPolicy: ReturnType<typeof createPublicSigningCorsPolicy>;
  securityHeaders: typeof DEFAULT_CONTRACTS_V2_SECURITY_HEADERS;
  clientAddressResolver: ReturnType<typeof createTrustedClientAddressResolver>;
  httpRateLimit: HttpSignatureRateLimitAdapter;
  readiness: ContractsV2RuntimeReadinessService;
  publicRoutesMountable: boolean;
  harnessMountable: boolean;
  deliveryEnabled: boolean;
}

export function createContractsV2Runtime(deps: ContractsV2RuntimeDependencies = {}): ContractsV2Runtime {
  const env = deps.env || process.env;
  const config = deps.config || assertContractsV2ConfigOrThrow(env);
  const logger = deps.logger || createContractsV2SecureLogger();
  const metrics = deps.metrics || createInMemoryContractsV2Metrics();
  const clock = deps.clock || createSystemContractClock();

  logger.log({
    level: 'info',
    message: 'contracts_v2_runtime_bootstrap',
    eventCode: 'RUNTIME_BOOTSTRAP',
    meta: loadContractsV2EnvironmentConfig(env).maskedSummary,
  });

  if (config.runtimeMode === 'staging-disabled' && config.databaseMode === 'memory') {
    throw Object.assign(new Error('Staging não pode usar memory database.'), {
      code: 'CONTRACTS_V2_STAGING_MEMORY_FORBIDDEN',
    });
  }

  const corsPolicy = createPublicSigningCorsPolicy({
    environment: config.originEnvironment,
    explicitOrigins: config.publicAllowedOrigins,
  });

  const clientAddressResolver = createTrustedClientAddressResolver({
    trustProxyHops: config.trustProxyHops,
  });

  let httpRateLimit: HttpSignatureRateLimitAdapter;
  if (config.rateLimitMode === 'disabled' || config.runtimeMode === 'disabled') {
    httpRateLimit = {
      async check() {
        return { allowed: false, remaining: 0 };
      },
    };
  } else if (config.rateLimitMode === 'memory-test') {
    if (config.runtimeMode === 'staging-disabled') {
      throw Object.assign(new Error('Staging não usa rate limit memory.'), {
        code: 'CONTRACTS_V2_STAGING_RATE_LIMIT_MEMORY_FORBIDDEN',
      });
    }
    httpRateLimit = createInMemoryHttpSignatureRateLimitAdapter({
      config: config.rateLimits,
    });
  } else {
    const repo = deps.rateLimitRepository || (
      config.runtimeMode === 'memory-test' || config.runtimeMode === 'local-integration'
        ? createMemorySignatureRateLimitRepository()
        : null
    );
    if (!repo && config.runtimeMode === 'staging-disabled') {
      // staging-disabled: infraestrutura pode existir, mas sem repo injetado o adapter fecha.
      httpRateLimit = {
        async check() {
          return { allowed: false, remaining: 0 };
        },
      };
    } else {
      const service = createSignatureRateLimitService(
        repo || createMemorySignatureRateLimitRepository(),
        { clock },
      );
      httpRateLimit = createPersistedHttpSignatureRateLimitAdapter({ service });
    }
  }

  const harnessMountable = Boolean(
    deps.allowLocalHarness
    && (config.runtimeMode === 'local-integration' || config.runtimeMode === 'memory-test'),
  );
  if (deps.harnessMounted && !harnessMountable) {
    throw Object.assign(new Error('Harness não pode montar fora de local-integration.'), {
      code: 'CONTRACTS_V2_HARNESS_FORBIDDEN',
    });
  }

  const deliveryEnabled = config.deliveryMode === 'simulation'
    && (config.runtimeMode === 'local-integration' || config.runtimeMode === 'memory-test');

  const publicRoutesMountable = config.runtimeMode === 'local-integration'
    || config.runtimeMode === 'memory-test';

  const readiness = createContractsV2RuntimeReadinessService(() => ({
    config,
    databaseOk: deps.database?.ok ?? (config.databaseMode !== 'unavailable'),
    migrationsPresent: deps.migrationsPresent ?? config.runtimeMode === 'memory-test',
    rlsOk: deps.rlsOk ?? config.runtimeMode === 'memory-test',
    storageOk: deps.storage?.ok ?? (
      config.storageMode === 'memory'
      || config.storageMode === 'private-local'
      || config.storageMode === 'private-staging-configured'
      || config.storageMode === 'private-production'
    ),
    bucketPrivate: deps.storage?.privateBucket ?? (
      config.storageMode === 'memory' || Boolean(config.privateBucket)
    ),
    deliveryProviderOk: deps.delivery?.ok ?? (config.deliveryMode === 'disabled' || deliveryEnabled),
    rateLimiterOk: config.rateLimitMode !== 'disabled',
    tokenServiceOk: deps.tokenServiceOk ?? (
      config.signingTokenSecretStrong
      || config.runtimeMode === 'memory-test'
      || config.runtimeMode === 'disabled'
    ),
    clockOk: true,
    ledgerOk: deps.ledgerOk ?? config.runtimeMode === 'memory-test',
    rendererOk: deps.rendererOk ?? config.runtimeMode === 'memory-test',
    publicOriginsConfigured: config.publicAllowedOrigins.length > 0,
    secretsOk: config.signingTokenSecretStrong
      || config.runtimeMode === 'disabled'
      || config.runtimeMode === 'memory-test',
    harnessMounted: Boolean(deps.harnessMounted),
  }));

  metrics.gauge('contracts_v2_runtime_ready', 0, { mode: config.runtimeMode });

  return {
    config,
    clock,
    logger,
    metrics,
    corsPolicy,
    securityHeaders: DEFAULT_CONTRACTS_V2_SECURITY_HEADERS,
    clientAddressResolver,
    httpRateLimit,
    readiness,
    publicRoutesMountable,
    harnessMountable,
    deliveryEnabled,
  };
}
