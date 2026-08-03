/**
 * Resolução de sessão SaaS (Supabase Platform) com:
 * - timeouts curtos (nunca deixa a inicialização presa);
 * - retry único para falhas transitórias de rede;
 * - dedupe de resoluções simultâneas (single-flight);
 * - cache local do usuário resolvido para liberar o app imediatamente no refresh.
 *
 * O cache guarda apenas dados de UI (nome, role, tenantId) — nenhum token.
 * A autorização real continua no servidor (RLS/RPC); o cache não amplia privilégios.
 */
import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { fetchSaasAccessBootstrap } from '../services/saasAuthService.js';
import { raceWithTimeout } from '../utils/async.js';
import {
  enrichSaasUserPrivileges,
  isMasterMembershipRole,
  normalizeSaasBootstrapRole,
} from '../utils/rbacHelpers.js';
import { resolveSessionDisplayName } from '../utils/userDisplayName.js';

import {
  PLATFORM_AUTH_STORAGE_KEY,
  SESSION_KEY,
  isStaleRefreshAuthError,
  isLoginBlockedByStaleAuth,
  recoverFromStalePlatformAuth,
} from './saasAuthStorage.js';

export { SESSION_KEY } from './saasAuthStorage.js';
export {
  isStaleRefreshAuthError,
  isLoginBlockedByStaleAuth,
  recoverFromStalePlatformAuth,
  clearSaasAuthStorage,
  STALE_SESSION_CLEARED_MESSAGE,
} from './saasAuthStorage.js';

const GET_SESSION_TIMEOUT_MS = 8000;
const BOOTSTRAP_TIMEOUT_MS = 10000;
const BOOTSTRAP_RETRIES = 1;

/** Log de diagnóstico do fluxo de auth — apenas em desenvolvimento. */
export const authDebug = (...args) => {
  if (import.meta.env?.DEV) console.debug('[auth]', ...args);
};

// ─── Storage da sessão reduzida ──────────────────────────────────────────────

export const readStoredSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const writeStoredSession = (stored) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  } catch {
    /* storage indisponível: sessão segue válida em memória */
  }
};

export const clearStoredSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
};

/** Versão reduzida e não sensível do usuário para cache de UI (sem tokens). */
export const sanitizeCachedUser = (u) => (u
  ? {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    saasAppRole: u.saasAppRole,
    has_system_access: u.has_system_access,
    isMaster: u.isMaster,
    tenantId: u.tenantId,
    authMode: 'saas',
    permissionOverrides: u.permissionOverrides || {},
    has_custom_permissions: u.has_custom_permissions === true,
    custom_permissions: u.custom_permissions || null,
  }
  : null);

// ─── Classificação de erros ──────────────────────────────────────────────────

const TRANSIENT_PATTERNS = [
  'timeout',
  'tempo limite',
  'failed to fetch',
  'networkerror',
  'network request failed',
  'fetch failed',
  'load failed',
  'abort',
  'signal is aborted',
];

/** Erro transitório (rede/timeout) — vale repetir ou manter cache. */
export const isTransientAuthError = (err) => {
  const msg = String(err?.message || err || '').toLowerCase();
  return TRANSIENT_PATTERNS.some((pattern) => msg.includes(pattern));
};

// ─── Sessão Supabase ─────────────────────────────────────────────────────────

/** Lê JWT do localStorage (evita getSession() paralelo que aborta no supabase-js). */
export function readPlatformAccessTokenFromStorage() {
  try {
    const raw = localStorage.getItem(PLATFORM_AUTH_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    if (typeof parsed?.access_token === 'string' && parsed.access_token) {
      return parsed.access_token;
    }
    if (typeof parsed?.currentSession?.access_token === 'string') {
      return parsed.currentSession.access_token;
    }
    if (typeof parsed?.session?.access_token === 'string') {
      return parsed.session.access_token;
    }
    return '';
  } catch {
    return '';
  }
}

let inFlightGetSession = null;

/**
 * getSession com timeout curto e single-flight (evita AbortError por chamadas paralelas).
 * Retorna a sessão Supabase ou null (sem sessão).
 */
export async function getPlatformSession() {
  if (!supabasePlatformClient) return null;
  if (!inFlightGetSession) {
    inFlightGetSession = (async () => {
      const { data, error } = await raceWithTimeout(
        supabasePlatformClient.auth.getSession(),
        GET_SESSION_TIMEOUT_MS,
        'timeout: getSession excedeu o tempo limite',
      );
      if (error) {
        if (isStaleRefreshAuthError(error)) {
          await recoverFromStalePlatformAuth();
        }
        throw new Error(error.message || 'Falha ao obter sessão SaaS.');
      }
      return data?.session || null;
    })().finally(() => {
      inFlightGetSession = null;
    });
  }
  return inFlightGetSession;
}

/** Token JWT da sessão platform — localStorage primeiro, getSession só se necessário. */
export async function getPlatformAccessToken() {
  const cached = readPlatformAccessTokenFromStorage();
  if (cached) return cached;
  const session = await getPlatformSession();
  return session?.access_token || '';
}

// ─── Resolução do usuário (bootstrap RPC) ────────────────────────────────────

async function fetchBootstrapWithRetry() {
  let lastErr;
  for (let attempt = 0; attempt <= BOOTSTRAP_RETRIES; attempt += 1) {
    try {
      return await raceWithTimeout(
        fetchSaasAccessBootstrap(supabasePlatformClient),
        BOOTSTRAP_TIMEOUT_MS,
        'timeout: bootstrap SaaS excedeu o tempo limite',
      );
    } catch (err) {
      lastErr = err;
      if (!isTransientAuthError(err)) break;
      authDebug(`bootstrap: tentativa ${attempt + 1} falhou (transitório), repetindo…`);
    }
  }
  throw lastErr;
}

function buildResolvedUser(supaSession, bootstrap) {
  const authMeta = supaSession.user?.app_metadata && typeof supaSession.user.app_metadata === 'object'
    ? supaSession.user.app_metadata
    : {};
  const rawOverrides = authMeta.permission_overrides;
  const permissionOverrides = rawOverrides && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides)
    ? rawOverrides
    : {};
  const hasCustomPermissions = authMeta.has_custom_permissions === true;
  const customPermissions = hasCustomPermissions
    && authMeta.custom_permissions
    && typeof authMeta.custom_permissions === 'object'
    && !Array.isArray(authMeta.custom_permissions)
    ? authMeta.custom_permissions
    : null;
  const saasAppRole = String(supaSession.user?.app_metadata?.role || '').trim().toLowerCase();
  const bootstrapRole = bootstrap.role;
  const roleFromAppMeta = saasAppRole ? normalizeSaasBootstrapRole(saasAppRole) : '';
  const isMaster = isMasterMembershipRole(bootstrapRole) || isMasterMembershipRole(saasAppRole);
  const role = isMaster
    ? (isMasterMembershipRole(bootstrapRole) ? bootstrapRole : roleFromAppMeta || bootstrapRole)
    : bootstrapRole;
  return {
    id: supaSession.user.id,
    name: resolveSessionDisplayName(supaSession.user, bootstrap) || 'Usuário',
    email: supaSession.user.email || '',
    role,
    saasAppRole: saasAppRole || bootstrapRole,
    has_system_access: bootstrap.isActive,
    isMaster,
    tenantId: bootstrap.tenantId,
    authMode: 'saas',
    permissionOverrides,
    has_custom_permissions: hasCustomPermissions,
    custom_permissions: customPermissions,
  };
}

export { buildResolvedUser as buildResolvedSaasUser, enrichSaasUserPrivileges };

let inFlightResolve = null;

/**
 * Resolve o usuário SaaS (role/tenant) a partir de uma sessão Supabase válida.
 * Chamadas simultâneas (hidratação + onAuthStateChange + login) compartilham
 * a mesma Promise — evita validações duplicadas e race conditions.
 */
export function resolveSaasUser(supaSession) {
  if (!supaSession?.user?.id) return Promise.resolve(null);
  if (!inFlightResolve) {
    inFlightResolve = (async () => {
      const bootstrap = await fetchBootstrapWithRetry();
      if (!bootstrap?.tenantId) return null;
      return buildResolvedUser(supaSession, bootstrap);
    })().finally(() => {
      inFlightResolve = null;
    });
  }
  return inFlightResolve;
}
