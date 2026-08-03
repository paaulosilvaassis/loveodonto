/**
 * @module domain-events/staging-activation/stagingEnvironmentContract
 * @description Staging Environment Contract — Phase 8.6.
 * Produção e hosts de produção são rejeitados. Sem credenciais.
 */

import { PRODUCTION_SUPABASE_PROJECT_REF } from '../domainEventFlags.js';
import type { StagingEnvironmentContract } from './stagingActivationTypes.js';

export const PRODUCTION_HOST_MARKERS = Object.freeze([
  `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
  PRODUCTION_SUPABASE_PROJECT_REF,
] as const);

export interface StagingEnvironmentInput {
  environmentId?: string;
  environmentName?: string;
  environmentType?: StagingEnvironmentContract['environmentType'];
  host?: string | null;
  projectRef?: string | null;
  authorized?: boolean;
  authorizedBy?: string | null;
  authorizedAt?: string | null;
  allowedTenantIds?: readonly string[];
  expiresAt?: string | null;
  notes?: string;
  /** NODE_ENV nunca basta para autorizar staging. */
  nodeEnv?: string | null;
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t < Date.now();
}

function looksLikeProduction(input: StagingEnvironmentInput): boolean {
  if (input.environmentType === 'production') return true;
  const host = String(input.host || '').toLowerCase();
  const ref = String(input.projectRef || '').toLowerCase();
  if (ref === PRODUCTION_SUPABASE_PROJECT_REF.toLowerCase()) return true;
  if (PRODUCTION_HOST_MARKERS.some((m) => host.includes(m.toLowerCase()))) return true;
  if (host.includes('production') && host.includes('supabase')) return true;
  return false;
}

/**
 * Constrói e valida contrato de ambiente. Sem credenciais.
 * Staging/local-simulated precisam authorized=true explícito.
 */
export function buildStagingEnvironmentContract(
  input: StagingEnvironmentInput = {},
): StagingEnvironmentContract {
  const production = looksLikeProduction(input);
  const type = production
    ? 'production'
    : input.environmentType || 'unknown';
  const isStaging = type === 'staging' || type === 'local-simulated';
  const expired = isExpired(input.expiresAt);
  const authorized = Boolean(input.authorized) && isStaging && !production && !expired;
  const blocked =
    production
    || !isStaging
    || !authorized
    || expired
    || type === 'unknown';

  return Object.freeze({
    environmentId: input.environmentId || 'env-unspecified',
    environmentName: input.environmentName || 'unspecified',
    environmentType: type,
    host: input.host ?? null,
    projectRef: input.projectRef ?? null,
    isProduction: production,
    isStaging,
    authorized,
    authorizedBy: authorized ? (input.authorizedBy || null) : null,
    authorizedAt: authorized ? (input.authorizedAt || null) : null,
    allowedTenantIds: Object.freeze([...(input.allowedTenantIds || [])]),
    expiresAt: input.expiresAt ?? null,
    notes: input.notes
      || (blocked
        ? 'Ambiente blocked — autorização explícita de staging requerida; NODE_ENV insuficiente'
        : 'Staging environment autorizado estruturalmente'),
    status: blocked ? 'blocked' : 'ok',
  });
}

/** Fase 8.6: contrato default sem autorização (blocked). */
export function buildDefaultBlockedStagingEnvironment(): StagingEnvironmentContract {
  return buildStagingEnvironmentContract({
    environmentId: 'staging-not-authorized',
    environmentName: 'awaiting-explicit-authorization',
    environmentType: 'unknown',
    authorized: false,
    notes: 'Phase 8.6 — staging remoto não autorizado; plano estrutural apenas',
  });
}

export function assertEnvironmentNotProduction(
  env: StagingEnvironmentContract,
): { ok: boolean; reason?: string } {
  if (env.isProduction || env.environmentType === 'production') {
    return { ok: false, reason: 'production rejected' };
  }
  if (env.projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    return { ok: false, reason: 'production projectRef rejected' };
  }
  return { ok: true };
}
