/**
 * @module repositories/shared/repositoryV3FlagHelpers
 * @description Helpers compartilhados para resolução de feature flags — Repository V3 toolkit.
 * Usado por novos domínios (CRM+). Domínios legados permanecem inalterados.
 */

export const REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

export function parseBooleanLike(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function extractSupabaseProjectRef(url: unknown): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

export function resolveConfiguredSupabaseProjectRef(): string {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  if (!env) return '';
  const url =
    env.VITE_SUPABASE_APP_URL
    || env.VITE_SUPABASE_URL
    || env.VITE_SUPABASE_PLATFORM_URL
    || '';
  return extractSupabaseProjectRef(url);
}

export function isProductionSupabaseHostConfigured(): boolean {
  return resolveConfiguredSupabaseProjectRef() === REPOSITORY_V3_PRODUCTION_SUPABASE_PROJECT_REF;
}

export function isProductionRuntime(): boolean {
  return Boolean(typeof import.meta !== 'undefined' && import.meta.env?.PROD);
}

export function readEnvFlag(envKey: string, fallback: boolean): boolean {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  if (!env) return fallback;
  return parseBooleanLike(env[envKey], fallback);
}

export function readTenantFlag(
  tenantFlags: Record<string, unknown> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  if (!tenantFlags || !(key in tenantFlags)) return fallback;
  return parseBooleanLike(tenantFlags[key], fallback);
}

export function readFlagFromSources(
  key: string,
  envKey: string,
  defaults: Record<string, boolean>,
  tenantFlags?: Record<string, unknown>,
): boolean {
  const fallback = defaults[key] ?? false;
  const fromTenant = readTenantFlag(tenantFlags, key, fallback);
  return readTenantFlag(tenantFlags, key, readEnvFlag(envKey, fromTenant));
}
