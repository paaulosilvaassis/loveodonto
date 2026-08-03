/**
 * @module domain/contracts/runtime/contracts-v2-runtime-readiness
 * @description Runtime readiness Contracts V2 — Phase 10.12.
 * Máximo: READY_FOR_STAGING_VALIDATION. Nunca READY_FOR_PRODUCTION.
 */

import { CONTRACT_FEATURE_FLAG_DEFAULTS } from '../contract-feature-flags.js';
import type { ContractsV2EnvironmentConfig } from './contracts-v2-config.js';

export const CONTRACTS_V2_EXPECTED_MIGRATIONS = [
  '028_app_contracts_v2_foundation.sql',
  '029_app_contracts_v2_rls.sql',
  '030_app_contract_ledger.sql',
  '031_app_contract_number_sequences.sql',
  '032_app_signature_sessions_and_challenges.sql',
  '033_app_contract_private_storage_local.sql',
  '034_app_signature_delivery_attempts.sql',
] as const;

export type ContractsV2ReadinessState =
  | 'NOT_CONFIGURED'
  | 'DISABLED'
  | 'NOT_READY'
  | 'READY_FOR_LOCAL_TEST'
  | 'READY_FOR_STAGING_VALIDATION';

export interface ContractsV2ComponentReadiness {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ContractsV2RuntimeReadinessResult {
  state: ContractsV2ReadinessState;
  ready: boolean;
  mode: string;
  components: ContractsV2ComponentReadiness[];
  expectedMigrations: readonly string[];
  bucketConfigured: boolean;
  flagsAllDisabled: boolean;
  blockers: string[];
  /** Nunca true nesta fase. */
  readyForProduction: false;
}

export interface ContractsV2RuntimeReadinessService {
  check(): Promise<ContractsV2RuntimeReadinessResult>;
}

export interface ContractsV2ReadinessProbeInput {
  config: ContractsV2EnvironmentConfig | null;
  configErrors?: Array<{ code: string; message: string }>;
  databaseOk?: boolean;
  migrationsPresent?: boolean;
  rlsOk?: boolean;
  storageOk?: boolean;
  bucketPrivate?: boolean;
  deliveryProviderOk?: boolean;
  rateLimiterOk?: boolean;
  tokenServiceOk?: boolean;
  clockOk?: boolean;
  ledgerOk?: boolean;
  rendererOk?: boolean;
  publicOriginsConfigured?: boolean;
  secretsOk?: boolean;
  harnessMounted?: boolean;
}

export function evaluateContractsV2RuntimeReadiness(
  input: ContractsV2ReadinessProbeInput,
): ContractsV2RuntimeReadinessResult {
  const blockers: string[] = [];
  const components: ContractsV2ComponentReadiness[] = [];

  const flagsAllDisabled = Object.values(CONTRACT_FEATURE_FLAG_DEFAULTS).every((v) => v === false);
  components.push({
    name: 'feature_flags',
    ok: flagsAllDisabled,
    detail: flagsAllDisabled ? 'all_false' : 'unexpected_true_default',
  });
  if (!flagsAllDisabled) blockers.push('FEATURE_FLAG_DEFAULT_TRUE');

  if (!input.config) {
    for (const err of input.configErrors || []) blockers.push(err.code);
    return {
      state: input.configErrors?.length ? 'NOT_CONFIGURED' : 'DISABLED',
      ready: false,
      mode: 'unknown',
      components,
      expectedMigrations: CONTRACTS_V2_EXPECTED_MIGRATIONS,
      bucketConfigured: false,
      flagsAllDisabled,
      blockers: blockers.length ? blockers : ['NOT_CONFIGURED'],
      readyForProduction: false,
    };
  }

  const cfg = input.config;
  if (cfg.runtimeMode === 'disabled') {
    return {
      state: 'DISABLED',
      ready: false,
      mode: cfg.runtimeMode,
      components: [
        ...components,
        { name: 'configuration', ok: true, detail: 'disabled' },
      ],
      expectedMigrations: CONTRACTS_V2_EXPECTED_MIGRATIONS,
      bucketConfigured: Boolean(cfg.privateBucket),
      flagsAllDisabled,
      blockers: ['RUNTIME_DISABLED'],
      readyForProduction: false,
    };
  }

  const checks: Array<[string, boolean | undefined, string]> = [
    ['configuration', true, 'ok'],
    ['database', input.databaseOk, 'database'],
    ['migrations', input.migrationsPresent, 'migrations'],
    ['rls', input.rlsOk, 'rls'],
    ['storage', input.storageOk, 'storage'],
    ['bucket_private', input.bucketPrivate, 'bucket'],
    ['delivery', input.deliveryProviderOk ?? cfg.deliveryMode === 'disabled', 'delivery'],
    ['rate_limiter', input.rateLimiterOk, 'rate_limiter'],
    ['token_service', input.tokenServiceOk, 'token_service'],
    ['clock', input.clockOk ?? true, 'clock'],
    ['ledger', input.ledgerOk, 'ledger'],
    ['renderer', input.rendererOk, 'renderer'],
    ['public_origins', input.publicOriginsConfigured ?? cfg.publicAllowedOrigins.length > 0, 'origins'],
    ['secrets', input.secretsOk ?? cfg.signingTokenSecretStrong, 'secrets'],
  ];

  for (const [name, ok, code] of checks) {
    const passed = ok === true;
    components.push({ name, ok: passed, detail: passed ? 'ok' : 'missing_or_failed' });
    if (!passed) blockers.push(`${code.toUpperCase()}_NOT_READY`);
  }

  if (input.harnessMounted && cfg.runtimeMode !== 'local-integration' && cfg.runtimeMode !== 'memory-test') {
    blockers.push('HARNESS_MOUNTED_OUTSIDE_LOCAL');
    components.push({ name: 'harness_isolation', ok: false, detail: 'mounted_outside_local' });
  } else {
    components.push({ name: 'harness_isolation', ok: true, detail: 'ok' });
  }

  if (cfg.runtimeMode === 'staging-disabled' && cfg.rateLimitMode !== 'persisted') {
    blockers.push('STAGING_RATE_LIMIT_NOT_PERSISTED');
  }

  const ready = blockers.length === 0;

  let state: ContractsV2ReadinessState = 'NOT_READY';
  if (ready && cfg.runtimeMode === 'local-integration') {
    state = 'READY_FOR_LOCAL_TEST';
  } else if (ready && cfg.runtimeMode === 'memory-test') {
    state = 'READY_FOR_LOCAL_TEST';
  } else if (ready && cfg.runtimeMode === 'staging-disabled') {
    state = 'READY_FOR_STAGING_VALIDATION';
  }

  return {
    state,
    ready,
    mode: cfg.runtimeMode,
    components,
    expectedMigrations: CONTRACTS_V2_EXPECTED_MIGRATIONS,
    bucketConfigured: Boolean(cfg.privateBucket) && (input.bucketPrivate !== false),
    flagsAllDisabled,
    blockers,
    readyForProduction: false,
  };
}

export function createContractsV2RuntimeReadinessService(
  probe: () => Promise<ContractsV2ReadinessProbeInput> | ContractsV2ReadinessProbeInput,
): ContractsV2RuntimeReadinessService {
  return {
    async check() {
      const input = await probe();
      return evaluateContractsV2RuntimeReadiness(input);
    },
  };
}

/** Payload seguro para health check interno (sem secrets). */
export function toPublicReadinessPayload(result: ContractsV2RuntimeReadinessResult) {
  return {
    mode: result.mode,
    ready: result.ready,
    state: result.state,
    components: result.components.map((c) => ({ name: c.name, ok: c.ok })),
    expectedMigrations: [...result.expectedMigrations],
    bucketConfigured: result.bucketConfigured,
    flagsEnabled: false,
    flagsAllDisabled: result.flagsAllDisabled,
    blockers: result.blockers,
    readyForProduction: false as const,
  };
}
