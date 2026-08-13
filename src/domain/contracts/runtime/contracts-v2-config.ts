/**
 * @module domain/contracts/runtime/contracts-v2-config
 * @description Schema de configuração Contracts V2 — Phase 10.12.
 * Defaults seguros; falha fechada; sem secrets fracos.
 */

import {
  DEFAULT_CONTRACTS_V2_PUBLIC_ORIGINS,
  normalizeOrigin,
  type ContractsV2OriginEnvironment,
} from './contracts-v2-public-cors.js';
import {
  DEFAULT_PUBLIC_SIGNING_RATE_LIMITS,
  type ContractsV2RateLimitMode,
  type PublicSigningRateLimitConfig,
} from './contracts-v2-rate-limit-config.js';
import {
  resolveContractsV2PrivateStorageBinding,
} from '../files/contracts-v2-private-storage-binding.js';

export const CONTRACTS_V2_RUNTIME_MODES = [
  'disabled',
  'memory-test',
  'local-integration',
  'staging-disabled',
] as const;

export type ContractsV2RuntimeMode = (typeof CONTRACTS_V2_RUNTIME_MODES)[number];

export type ContractsV2DatabaseMode =
  | 'unavailable'
  | 'memory'
  | 'postgres-local'
  | 'postgres-staging-disabled';

export type ContractsV2StorageMode =
  | 'unavailable'
  | 'memory'
  | 'private-local'
  | 'private-staging-configured'
  | 'private-production';

export type ContractsV2DeliveryMode = 'disabled' | 'simulation';

export interface ContractsV2EnvironmentConfig {
  runtimeMode: ContractsV2RuntimeMode;
  databaseMode: ContractsV2DatabaseMode;
  storageMode: ContractsV2StorageMode;
  deliveryMode: ContractsV2DeliveryMode;
  rateLimitMode: ContractsV2RateLimitMode;
  publicBaseUrl: string | null;
  publicAllowedOrigins: string[];
  privateBucket: string | null;
  trustProxyHops: number;
  signingTokenSecretPresent: boolean;
  signingTokenSecretStrong: boolean;
  storageSignedUrlTtlSeconds: number;
  originEnvironment: ContractsV2OriginEnvironment;
  rateLimits: PublicSigningRateLimitConfig;
}

export interface ContractsV2ConfigValidationResult {
  ok: boolean;
  config: ContractsV2EnvironmentConfig | null;
  errors: Array<{ code: string; message: string }>;
  /** Valores mascarados para log seguro. */
  maskedSummary: Record<string, string | number | boolean | null>;
}

const WEAK_SECRETS = new Set([
  '',
  'secret',
  'changeme',
  'password',
  '123456',
  'test',
  'dev',
  'contracts-v2',
]);

function parseBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function readMode(env: NodeJS.ProcessEnv): ContractsV2RuntimeMode {
  const raw = String(env.CONTRACTS_V2_RUNTIME_MODE || 'disabled').trim().toLowerCase();
  if ((CONTRACTS_V2_RUNTIME_MODES as readonly string[]).includes(raw)) {
    return raw as ContractsV2RuntimeMode;
  }
  return 'disabled';
}

function isHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalhostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  } catch {
    return false;
  }
}

export function validatePublicBaseUrl(
  url: string | null | undefined,
  runtimeMode: ContractsV2RuntimeMode,
): { ok: boolean; code?: string; message?: string } {
  if (!url) {
    if (runtimeMode === 'disabled' || runtimeMode === 'memory-test' || runtimeMode === 'staging-disabled') {
      return { ok: true };
    }
    return { ok: false, code: 'CONTRACTS_V2_PUBLIC_BASE_URL_REQUIRED', message: 'PUBLIC_BASE_URL obrigatória.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: 'CONTRACTS_V2_PUBLIC_BASE_URL_INVALID', message: 'URL inválida.' };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, code: 'CONTRACTS_V2_PUBLIC_BASE_URL_INVALID', message: 'URL não pode ter query/fragment.' };
  }
  const path = parsed.pathname.replace(/\/$/, '');
  if (path && path !== '') {
    return { ok: false, code: 'CONTRACTS_V2_PUBLIC_BASE_URL_INVALID', message: 'URL não pode ter path inesperado.' };
  }
  if (runtimeMode === 'local-integration' || runtimeMode === 'memory-test') {
    if (!isLocalhostUrl(url) && !isHttpsUrl(url)) {
      return { ok: false, code: 'CONTRACTS_V2_PUBLIC_BASE_URL_INVALID', message: 'Local exige localhost ou https.' };
    }
    return { ok: true };
  }
  if (runtimeMode === 'staging-disabled') {
    if (!isHttpsUrl(url)) {
      return { ok: false, code: 'CONTRACTS_V2_PUBLIC_BASE_URL_HTTPS_REQUIRED', message: 'Staging exige HTTPS.' };
    }
    if (isLocalhostUrl(url)) {
      return { ok: false, code: 'CONTRACTS_V2_PUBLIC_BASE_URL_LOCALHOST_FORBIDDEN', message: 'localhost proibido em staging.' };
    }
  }
  return { ok: true };
}

export function isSigningTokenSecretStrong(secret: string | undefined | null): boolean {
  if (!secret) return false;
  const s = String(secret);
  if (s.length < 32) return false;
  if (WEAK_SECRETS.has(s.toLowerCase())) return false;
  return true;
}

export function maskSecret(value: string | undefined | null): string {
  if (!value) return '(absent)';
  if (value.length < 8) return '***';
  return `${value.slice(0, 2)}…${value.slice(-2)} (len=${value.length})`;
}

/**
 * Carrega e valida configuração a partir de env.
 * Nenhuma seleção automática por presença de uma única env.
 */
export function loadContractsV2EnvironmentConfig(
  env: NodeJS.ProcessEnv = process.env,
): ContractsV2ConfigValidationResult {
  const errors: Array<{ code: string; message: string }> = [];
  const rawMode = String(env.CONTRACTS_V2_RUNTIME_MODE || 'disabled').trim().toLowerCase();
  if (rawMode && !(CONTRACTS_V2_RUNTIME_MODES as readonly string[]).includes(rawMode)) {
    if (rawMode === 'production-enabled' || rawMode === 'production') {
      errors.push({
        code: 'CONTRACTS_V2_RUNTIME_MODE_UNSUPPORTED',
        message: 'Modo production-enabled não existe nesta fase.',
      });
    } else {
      errors.push({
        code: 'CONTRACTS_V2_RUNTIME_MODE_INVALID',
        message: `Modo inválido: ${rawMode}`,
      });
    }
  }

  const runtimeMode = readMode(env);
  const databaseMode = (String(env.CONTRACTS_V2_DATABASE_MODE || 'unavailable').trim().toLowerCase()
    || 'unavailable') as ContractsV2DatabaseMode;
  const storageMode = (String(env.CONTRACTS_V2_STORAGE_MODE || 'unavailable').trim().toLowerCase()
    || 'unavailable') as ContractsV2StorageMode;
  const deliveryMode = (String(env.CONTRACTS_V2_DELIVERY_MODE || 'disabled').trim().toLowerCase()
    || 'disabled') as ContractsV2DeliveryMode;
  const rateLimitMode = (String(env.CONTRACTS_V2_RATE_LIMIT_MODE || (
    runtimeMode === 'local-integration' || runtimeMode === 'staging-disabled'
      ? 'persisted'
      : runtimeMode === 'memory-test'
        ? 'memory-test'
        : 'disabled'
  )).trim().toLowerCase() || 'disabled') as ContractsV2RateLimitMode;

  const allowedDb: ContractsV2DatabaseMode[] = [
    'unavailable', 'memory', 'postgres-local', 'postgres-staging-disabled',
  ];
  if (!allowedDb.includes(databaseMode)) {
    errors.push({ code: 'CONTRACTS_V2_DATABASE_MODE_INVALID', message: `databaseMode inválido: ${databaseMode}` });
  }
  const allowedStorage: ContractsV2StorageMode[] = [
    'unavailable', 'memory', 'private-local', 'private-staging-configured', 'private-production',
  ];
  if (!allowedStorage.includes(storageMode)) {
    errors.push({ code: 'CONTRACTS_V2_STORAGE_MODE_INVALID', message: `storageMode inválido: ${storageMode}` });
  }
  if (deliveryMode !== 'disabled' && deliveryMode !== 'simulation') {
    errors.push({
      code: 'CONTRACTS_V2_DELIVERY_MODE_INVALID',
      message: 'Delivery apenas disabled|simulation nesta fase.',
    });
  }
  if (deliveryMode === 'simulation' && runtimeMode !== 'local-integration' && runtimeMode !== 'memory-test') {
    errors.push({
      code: 'CONTRACTS_V2_DELIVERY_SIMULATION_LOCAL_ONLY',
      message: 'simulation só em local/memory-test.',
    });
  }

  if (runtimeMode === 'staging-disabled') {
    if (databaseMode === 'memory') {
      errors.push({
        code: 'CONTRACTS_V2_STAGING_MEMORY_FORBIDDEN',
        message: 'Staging não pode usar database memory.',
      });
    }
    if (storageMode === 'memory') {
      errors.push({
        code: 'CONTRACTS_V2_STAGING_STORAGE_MEMORY_FORBIDDEN',
        message: 'Staging não pode usar storage memory.',
      });
    }
    if (rateLimitMode === 'memory-test') {
      errors.push({
        code: 'CONTRACTS_V2_STAGING_RATE_LIMIT_MEMORY_FORBIDDEN',
        message: 'Staging não pode usar rate limit memory.',
      });
    }
  }

  const publicBaseUrl = env.CONTRACTS_V2_PUBLIC_BASE_URL
    ? String(env.CONTRACTS_V2_PUBLIC_BASE_URL).trim().replace(/\/$/, '')
    : null;
  const urlCheck = validatePublicBaseUrl(publicBaseUrl, runtimeMode);
  if (!urlCheck.ok) {
    errors.push({ code: urlCheck.code!, message: urlCheck.message! });
  }

  let originEnvironment: ContractsV2OriginEnvironment = 'local';
  if (runtimeMode === 'memory-test') originEnvironment = 'test';
  if (runtimeMode === 'staging-disabled') originEnvironment = 'staging';

  const explicitOrigins = env.CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS
    ? String(env.CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const baseOrigins = explicitOrigins.length
    ? explicitOrigins
    : DEFAULT_CONTRACTS_V2_PUBLIC_ORIGINS[originEnvironment];
  const publicAllowedOrigins = baseOrigins
    .map((o) => normalizeOrigin(o))
    .filter(Boolean) as string[];

  if ((runtimeMode === 'staging-disabled') && publicAllowedOrigins.length === 0) {
    errors.push({
      code: 'CONTRACTS_V2_PUBLIC_ORIGIN_CONFIGURATION_REQUIRED',
      message: 'Origins de staging devem ser configuradas explicitamente.',
    });
  }
  if (runtimeMode === 'staging-disabled') {
    for (const o of publicAllowedOrigins) {
      if (o.includes('localhost') || o.includes('127.0.0.1')) {
        errors.push({
          code: 'CONTRACTS_V2_PUBLIC_ORIGIN_LOCALHOST_IN_STAGING',
          message: 'localhost não permitido em staging.',
        });
        break;
      }
    }
  }

  const privateBucket = env.CONTRACTS_V2_PRIVATE_BUCKET
    ? String(env.CONTRACTS_V2_PRIVATE_BUCKET).trim()
    : null;
  if (privateBucket === 'contracts-v2-private-staging' && runtimeMode !== 'staging-disabled') {
    errors.push({
      code: 'CONTRACTS_V2_PRIVATE_BUCKET_STAGING_ONLY',
      message: 'Bucket staging só com runtime staging-disabled.',
    });
  }

  if (storageMode === 'private-production') {
    if (runtimeMode === 'local-integration' || runtimeMode === 'memory-test' || runtimeMode === 'staging-disabled') {
      errors.push({
        code: 'CONTRACTS_V2_PRODUCTION_STORAGE_RUNTIME_MISMATCH',
        message: 'Storage private-production não combina com runtime local/staging.',
      });
    }
  }

  const storageBinding = resolveContractsV2PrivateStorageBinding(env);
  if (!storageBinding.ok) {
    errors.push({
      code: storageBinding.code || 'CONTRACTS_V2_STORAGE_BINDING_INVALID',
      message: storageBinding.reasons[0] || 'Binding de storage privado inválido.',
    });
  }

  const trustProxyRaw = env.CONTRACTS_V2_TRUST_PROXY;
  const trustProxyHops = trustProxyRaw == null || trustProxyRaw === ''
    ? 0
    : Math.max(0, Number.parseInt(String(trustProxyRaw), 10) || 0);
  if (runtimeMode === 'staging-disabled' && Number.isNaN(Number(trustProxyRaw))) {
    errors.push({
      code: 'CONTRACTS_V2_TRUST_PROXY_REQUIRED',
      message: 'Trust proxy deve ser número explícito em staging.',
    });
  }

  const secret = env.CONTRACTS_V2_SIGNING_TOKEN_SECRET;
  const signingTokenSecretPresent = Boolean(secret && String(secret).length > 0);
  const signingTokenSecretStrong = isSigningTokenSecretStrong(secret);
  if ((runtimeMode === 'local-integration' || runtimeMode === 'staging-disabled')
    && !signingTokenSecretStrong) {
    errors.push({
      code: 'CONTRACTS_V2_SIGNING_TOKEN_SECRET_WEAK',
      message: 'Secret de signing token ausente ou fraco (mín. 32 chars, não trivial).',
    });
  }

  const ttl = Number.parseInt(String(env.CONTRACTS_V2_STORAGE_SIGNED_URL_TTL || '60'), 10);
  const storageSignedUrlTtlSeconds = Number.isFinite(ttl) && ttl > 0 && ttl <= 300 ? ttl : 60;

  const maskedSummary: Record<string, string | number | boolean | null> = {
    runtimeMode,
    databaseMode,
    storageMode,
    deliveryMode,
    rateLimitMode,
    publicBaseUrl: publicBaseUrl ? `${publicBaseUrl.slice(0, 12)}…` : null,
    originsCount: publicAllowedOrigins.length,
    privateBucket,
    trustProxyHops,
    signingTokenSecret: maskSecret(secret),
    storageSignedUrlTtlSeconds,
    harnessOptIn: parseBool(env.CONTRACTS_V2_PUBLIC_LOCAL_HARNESS),
  };

  if (errors.length) {
    return { ok: false, config: null, errors, maskedSummary };
  }

  const config: ContractsV2EnvironmentConfig = {
    runtimeMode,
    databaseMode,
    storageMode,
    deliveryMode,
    rateLimitMode,
    publicBaseUrl,
    publicAllowedOrigins,
    privateBucket,
    trustProxyHops,
    signingTokenSecretPresent,
    signingTokenSecretStrong,
    storageSignedUrlTtlSeconds,
    originEnvironment,
    rateLimits: DEFAULT_PUBLIC_SIGNING_RATE_LIMITS,
  };

  return { ok: true, config, errors: [], maskedSummary };
}

export function assertContractsV2ConfigOrThrow(env: NodeJS.ProcessEnv = process.env): ContractsV2EnvironmentConfig {
  const result = loadContractsV2EnvironmentConfig(env);
  if (!result.ok || !result.config) {
    const first = result.errors[0];
    const err = new Error(first?.message || 'Configuração Contracts V2 inválida.');
    (err as Error & { code: string; details: unknown }).code = first?.code || 'CONTRACTS_V2_CONFIG_INVALID';
    (err as Error & { details: unknown }).details = result.errors;
    throw err;
  }
  return result.config;
}
