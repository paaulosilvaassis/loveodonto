/**
 * @module domain/contracts/rollout/contracts-operational-ux-local-test
 * @description Phase 10.21K — bypass EXCLUSIVO localhost/dev para testar UX operacional
 * sem alterar feature_flags / produção.
 *
 * Nunca liga produção. Nunca escreve SSOT. Nunca ativa em loveodonto.com.br / Vercel.
 */

import { parseBooleanLike } from '../../../repositories/shared/repositoryV3FlagHelpers.js';

export const CONTRACTS_OPERATIONAL_UX_LOCAL_TEST_ENV_KEY = 'VITE_CONTRACTS_OPERATIONAL_UX_LOCAL_TEST';

export type ContractsOperationalUxLocalTestInput = {
  /** Override de import.meta.env.DEV (testes). */
  isDev?: boolean;
  /** Override do valor da env (testes). */
  envFlag?: string | boolean | null;
  /** Override de window.location.hostname (testes). */
  hostname?: string | null;
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function readIsDev(): boolean {
  try {
    return (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
}

function readEnvFlag(): string | boolean | null {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
    const fromMeta = env[CONTRACTS_OPERATIONAL_UX_LOCAL_TEST_ENV_KEY];
    if (fromMeta != null && String(fromMeta).trim() !== '') return fromMeta;
  } catch {
    /* fall through */
  }
  if (typeof process !== 'undefined') {
    return process.env?.[CONTRACTS_OPERATIONAL_UX_LOCAL_TEST_ENV_KEY] ?? null;
  }
  return null;
}

function readHostname(): string {
  try {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return String(window.location.hostname);
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** Hostname permitido para o bypass local. */
export function isLocalhostHostname(hostname: unknown): boolean {
  const h = String(hostname ?? '').trim().toLowerCase();
  return LOCAL_HOSTNAMES.has(h);
}

/**
 * Hostnames onde o bypass é sempre impossível (defense-in-depth).
 * Inclui produção e previews Vercel.
 */
export function isForbiddenProductionHostname(hostname: unknown): boolean {
  const h = String(hostname ?? '').trim().toLowerCase();
  if (!h) return false;
  if (h === 'loveodonto.com.br' || h === 'www.loveodonto.com.br') return true;
  if (h.endsWith('.vercel.app')) return true;
  return false;
}

/**
 * Regra canônica 10.21K:
 * DEV && env===true && hostname ∈ {localhost, 127.0.0.1}
 * e nunca em domínios de produção/Vercel.
 */
export function isContractsOperationalUxLocalTestEnabled(
  input: ContractsOperationalUxLocalTestInput = {},
): boolean {
  const isDev = typeof input.isDev === 'boolean' ? input.isDev : readIsDev();
  if (isDev !== true) return false;

  const envRaw = input.envFlag !== undefined ? input.envFlag : readEnvFlag();
  if (parseBooleanLike(envRaw) !== true) return false;

  const hostname = input.hostname !== undefined && input.hostname !== null
    ? String(input.hostname)
    : readHostname();
  if (!hostname) return false;
  if (isForbiddenProductionHostname(hostname)) return false;
  if (!isLocalhostHostname(hostname)) return false;

  return true;
}

export function getContractsOperationalUxLocalTestStatus(
  input: ContractsOperationalUxLocalTestInput = {},
): {
  localTestEnabled: boolean;
  isDev: boolean;
  envFlagOn: boolean;
  hostname: string;
  hostnameAllowed: boolean;
  forbiddenHost: boolean;
} {
  const isDev = typeof input.isDev === 'boolean' ? input.isDev : readIsDev();
  const envRaw = input.envFlag !== undefined ? input.envFlag : readEnvFlag();
  const envFlagOn = parseBooleanLike(envRaw) === true;
  const hostname = input.hostname !== undefined && input.hostname !== null
    ? String(input.hostname)
    : readHostname();
  return {
    localTestEnabled: isContractsOperationalUxLocalTestEnabled(input),
    isDev,
    envFlagOn,
    hostname,
    hostnameAllowed: isLocalhostHostname(hostname),
    forbiddenHost: isForbiddenProductionHostname(hostname),
  };
}
