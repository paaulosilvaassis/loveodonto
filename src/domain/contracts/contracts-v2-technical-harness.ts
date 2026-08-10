/**
 * @module domain/contracts/contracts-v2-technical-harness
 * @description Isolamento TECHNICAL_HARNESS vs OPERATIONAL_UI (Phase 10.16 / C3).
 *
 * Rotas *-v2 são superfície técnica. Nunca ficam visíveis só porque flags
 * operacionais (piloto staging / domain / module) foram ligadas.
 */

import { parseBooleanLike, readEnvFlag } from '../../repositories/shared/repositoryV3FlagHelpers.js';
import { PRODUCTION_REF, STAGING_REF } from './staging/contracts-v2-staging-pilot.js';

export const CONTRACTS_V2_SURFACE = {
  TECHNICAL_HARNESS: 'TECHNICAL_HARNESS',
  OPERATIONAL_UI: 'OPERATIONAL_UI',
} as const;

export type ContractsV2Surface = (typeof CONTRACTS_V2_SURFACE)[keyof typeof CONTRACTS_V2_SURFACE];

export const TECHNICAL_HARNESS_ENV_KEY = 'VITE_CONTRACTS_V2_TECHNICAL_HARNESS_ENABLED';

const ELEVATED_ROLES = new Set(['admin', 'master']);

export interface TechnicalHarnessContext {
  user?: { role?: string | null } | null;
  /** Project ref conhecido (staging/prod). */
  projectRef?: string | null;
  environmentMarker?: string | null;
  /** Somente testes unitários. */
  forceAllowInTest?: boolean;
  /** Override explícito da flag técnica (testes). */
  technicalFlagOverride?: boolean;
}

function readViteMode(): string {
  try {
    return String((import.meta as ImportMeta & { env?: { MODE?: string; PROD?: boolean; DEV?: boolean } }).env?.MODE || '');
  } catch {
    return '';
  }
}

function readViteProd(): boolean {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);
  } catch {
    return false;
  }
}

function readViteDev(): boolean {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function resolveProjectRef(context: TechnicalHarnessContext = {}): string {
  const fromCtx = String(context.projectRef || '').trim();
  if (fromCtx) return fromCtx;
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
    return String(env.VITE_SUPABASE_PROJECT_REF || env.VITE_SUPABASE_REF || '').trim();
  } catch {
    return '';
  }
}

/** Produção: harness sempre false. */
export function isContractsV2TechnicalHarnessProductionBlocked(context: TechnicalHarnessContext = {}): boolean {
  const ref = resolveProjectRef(context);
  if (ref && ref === PRODUCTION_REF) return true;
  const marker = String(context.environmentMarker || '').toLowerCase();
  if (marker === 'production' || marker === 'prod') return true;
  if (readViteProd() && readViteMode() === 'production') return true;
  if (typeof process !== 'undefined') {
    const nodeEnv = String(process.env?.NODE_ENV || '').toLowerCase();
    const loveEnv = String(process.env?.LOVE_ODONTO_ENV || process.env?.APP_ENV || '').toLowerCase();
    if (nodeEnv === 'production' && (loveEnv === 'production' || loveEnv === 'prod')) return true;
    if (String(process.env?.VITE_SUPABASE_PROJECT_REF || '') === PRODUCTION_REF) return true;
  }
  return false;
}

/**
 * Ambiente local, Vitest, ou teste autorizado (staging allowlisted com marker).
 * Staging operacional comum NÃO basta — exige marker/autorização explícita.
 */
export function isContractsV2TechnicalHarnessEnvironmentAllowed(context: TechnicalHarnessContext = {}): boolean {
  if (context.forceAllowInTest) return true;
  if (isContractsV2TechnicalHarnessProductionBlocked(context)) return false;

  const mode = readViteMode();
  if (mode === 'test' || mode === 'development') return true;
  if (readViteDev()) return true;

  const marker = String(context.environmentMarker || '').toLowerCase();
  if (marker === 'authorized_test' || marker === 'local' || marker === 'test') return true;

  if (typeof process !== 'undefined') {
    const auth = parseBooleanLike(process.env?.CONTRACTS_V2_TECHNICAL_HARNESS_AUTHORIZED);
    if (auth === true) return true;
    const nodeEnv = String(process.env?.NODE_ENV || '').toLowerCase();
    if (nodeEnv === 'test' || nodeEnv === 'development') return true;
  }

  const ref = resolveProjectRef(context);
  // Staging allowlisted só conta como autorizado com marker explícito.
  if (ref === STAGING_REF && (marker === 'authorized_test' || marker === 'harness')) {
    return true;
  }

  return false;
}

export function isContractsV2TechnicalHarnessFlagEnabled(context: TechnicalHarnessContext = {}): boolean {
  if (typeof context.technicalFlagOverride === 'boolean') {
    return context.technicalFlagOverride;
  }
  if (context.forceAllowInTest && typeof process !== 'undefined') {
    const testFlag = parseBooleanLike(process.env?.CONTRACTS_V2_TECHNICAL_HARNESS_TEST);
    if (testFlag === true) return true;
  }
  return readEnvFlag(TECHNICAL_HARNESS_ENV_KEY, false);
}

export function hasContractsV2TechnicalHarnessElevatedPermission(context: TechnicalHarnessContext = {}): boolean {
  if (context.forceAllowInTest) return true;
  const role = String(context.user?.role || '').toLowerCase();
  return ELEVATED_ROLES.has(role);
}

/**
 * Guard explícito do harness técnico *-v2.
 * Independente das flags operacionais comuns (piloto / domain / module / portal).
 */
export function isContractsV2TechnicalHarnessEnabled(context: TechnicalHarnessContext = {}): boolean {
  if (isContractsV2TechnicalHarnessProductionBlocked(context)) return false;
  if (!isContractsV2TechnicalHarnessEnvironmentAllowed(context)) return false;
  if (!isContractsV2TechnicalHarnessFlagEnabled(context)) return false;
  if (!hasContractsV2TechnicalHarnessElevatedPermission(context)) return false;
  return true;
}

export function isContractsV2TechnicalHarnessNavItem(item: { surface?: string; id?: string; route?: string } | null | undefined): boolean {
  if (!item) return false;
  if (item.surface === CONTRACTS_V2_SURFACE.TECHNICAL_HARNESS) return true;
  if (String(item.id || '').endsWith('-v2')) return true;
  if (String(item.route || '').includes('-v2')) return true;
  return false;
}
