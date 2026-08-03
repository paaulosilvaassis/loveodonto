/**
 * Limpeza segura de storage Supabase Auth (local/staging).
 * Não escreve no Supabase — apenas remove chaves do localStorage do browser.
 */

export const PLATFORM_AUTH_STORAGE_KEY = 'appgestaoodonto-platform-auth';
export const SESSION_KEY = 'appgestaoodonto.session';

export const STALE_SESSION_CLEARED_MESSAGE =
  'Encontramos uma sessão antiga. Limpamos o acesso local. Tente entrar novamente.';

const PLATFORM_AUTH_PREFIX = `${PLATFORM_AUTH_STORAGE_KEY}-`;
const SB_AUTH_KEY_PATTERN = /^sb-[a-z0-9-]+-auth-token(?:-code-verifier|-user)?$/i;

/** Margem alinhada ao GoTrueClient (refresh proativo antes de expirar). */
const EXPIRY_MARGIN_MS = 10_000;

function decodeJwtExp(accessToken) {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function extractSessionPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.expires_at || parsed.access_token || parsed.refresh_token) return parsed;
  if (parsed.currentSession) return parsed.currentSession;
  if (parsed.session) return parsed.session;
  return null;
}

/**
 * Lista chaves de auth Supabase persistidas (para testes e limpeza).
 */
export function collectSupabaseAuthStorageKeys(storage) {
  if (!storage) return [];
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (
      key === PLATFORM_AUTH_STORAGE_KEY
      || key === SESSION_KEY
      || key.startsWith(PLATFORM_AUTH_PREFIX)
      || SB_AUTH_KEY_PATTERN.test(key)
    ) {
      keys.push(key);
    }
  }
  return keys.sort();
}

/**
 * Remove storage SaaS/Supabase local com segurança.
 * @param {Storage} [storage]
 * @param {{ includeAppSession?: boolean }} [options]
 * @returns {string[]} chaves removidas
 */
export function clearSaasAuthStorage(storage = globalThis.localStorage, options = {}) {
  const { includeAppSession = true } = options;
  if (!storage) return [];

  const keysToRemove = collectSupabaseAuthStorageKeys(storage).filter(
    (key) => includeAppSession || key !== SESSION_KEY,
  );

  const removed = [];
  for (const key of keysToRemove) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      /* ignore */
    }
  }
  return removed;
}

export function hasPersistedPlatformAuth(storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    return Boolean(storage.getItem(PLATFORM_AUTH_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function readAppStoredSession(storage = globalThis.localStorage) {
  const parsed = readJson(storage, SESSION_KEY);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

/**
 * Sessão platform expirada (ou ilegível) no storage — candidata a limpeza no /login.
 */
export function isPlatformAuthExpiredInStorage(storage = globalThis.localStorage) {
  if (!hasPersistedPlatformAuth(storage)) return false;
  const parsed = readJson(storage, PLATFORM_AUTH_STORAGE_KEY);
  const session = extractSessionPayload(parsed);
  if (!session) return true;

  const expiresAtSec = session.expires_at;
  if (typeof expiresAtSec === 'number') {
    return expiresAtSec * 1000 - Date.now() < EXPIRY_MARGIN_MS;
  }

  const exp = decodeJwtExp(session.access_token);
  if (typeof exp === 'number') {
    return exp * 1000 - Date.now() < EXPIRY_MARGIN_MS;
  }

  return Boolean(session.refresh_token);
}

function hasAuthCallbackInUrl(locationLike) {
  const search = String(locationLike?.search || '');
  const hash = String(locationLike?.hash || '');
  if (search.includes('code=') || search.includes('error=')) return true;
  if (hash.includes('access_token=') || hash.includes('refresh_token=') || hash.includes('code=')) {
    return true;
  }
  return false;
}

/**
 * Par app session + platform auth ainda válido — não limpar automaticamente.
 */
export function hasActiveSaasSessionPair(storage = globalThis.localStorage) {
  const appSession = readAppStoredSession(storage);
  if (!appSession?.userId) return false;
  if (appSession.authMode && appSession.authMode !== 'saas') return false;
  if (!hasPersistedPlatformAuth(storage)) return false;
  return !isPlatformAuthExpiredInStorage(storage);
}

/**
 * Executado antes do bundle carregar supabaseClients — evita refresh de token stale no /login.
 */
export function preflightLoginPageAuthStorage(windowLike = globalThis.window) {
  if (!windowLike?.localStorage) return { cleared: false, removed: [] };

  const pathname = String(windowLike.location?.pathname || '');
  if (pathname !== '/login') return { cleared: false, removed: [] };
  if (hasAuthCallbackInUrl(windowLike.location)) return { cleared: false, removed: [] };
  if (hasActiveSaasSessionPair(windowLike.localStorage)) return { cleared: false, removed: [] };

  const hasPlatform = hasPersistedPlatformAuth(windowLike.localStorage);
  if (!hasPlatform) return { cleared: false, removed: [] };

  const appSession = readAppStoredSession(windowLike.localStorage);
  const shouldClear =
    isPlatformAuthExpiredInStorage(windowLike.localStorage)
    || !appSession?.userId;

  if (!shouldClear) return { cleared: false, removed: [] };

  const removed = clearSaasAuthStorage(windowLike.localStorage);
  if (removed.length > 0) {
    try {
      windowLike.sessionStorage?.setItem('love-odonto-stale-auth-cleared', '1');
    } catch {
      /* ignore */
    }
  }
  return { cleared: removed.length > 0, removed, reason: 'preflight_login_stale' };
}

export function isStaleRefreshAuthError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  const status = Number(error?.status);
  if (
    msg.includes('invalid refresh token')
    || msg.includes('refresh token not found')
    || msg.includes('refresh_token_not_found')
    || msg.includes('refresh_token_already_used')
    || msg.includes('invalid_grant')
    || msg.includes('session_not_found')
    || code === 'refresh_token_not_found'
    || code === 'invalid_grant'
  ) {
    return true;
  }
  if (msg.includes('jwt') && msg.includes('expired')) return true;
  if (status === 401 && msg.includes('refresh')) return true;
  return false;
}

/**
 * Erro de rede/CORS provavelmente causado por refresh stale (somente com auth persistida).
 */
export function isLoginBlockedByStaleAuth(error, { hasPlatformAuth = false } = {}) {
  if (isStaleRefreshAuthError(error)) return true;
  if (!hasPlatformAuth) return false;
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('network request failed')
    || msg.includes('fetch failed')
    || msg.includes('cors')
  );
}

/**
 * Reseta estado in-memory dos clients após limpeza local (sem invalidar sessão remota).
 */
export async function resetSupabaseAuthClientsAfterLocalClear() {
  const { supabasePlatformClient, supabaseAppClient } = await import('../lib/supabaseClients.js');
  const clients = [supabasePlatformClient, supabaseAppClient].filter(Boolean);
  await Promise.all(
    clients.map((client) => client.auth.signOut({ scope: 'local' }).catch(() => {})),
  );
}

/**
 * Limpa storage + reseta clients. Retorna mensagem UX quando aplicável.
 */
export async function recoverFromStalePlatformAuth(options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const includeAppSession = options.includeAppSession !== false;
  const removed = clearSaasAuthStorage(storage, { includeAppSession });
  await resetSupabaseAuthClientsAfterLocalClear();
  return {
    cleared: removed.length > 0,
    removed,
    message: STALE_SESSION_CLEARED_MESSAGE,
  };
}
