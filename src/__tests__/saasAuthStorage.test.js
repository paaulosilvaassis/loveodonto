import { describe, expect, it, beforeEach } from 'vitest';
import {
  PLATFORM_AUTH_STORAGE_KEY,
  SESSION_KEY,
  STALE_SESSION_CLEARED_MESSAGE,
  clearSaasAuthStorage,
  collectSupabaseAuthStorageKeys,
  hasActiveSaasSessionPair,
  hasPersistedPlatformAuth,
  isLoginBlockedByStaleAuth,
  isPlatformAuthExpiredInStorage,
  isStaleRefreshAuthError,
  preflightLoginPageAuthStorage,
} from '../auth/saasAuthStorage.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    clear: () => { map.clear(); },
  };
}

function createFakeJwt(exp) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp, sub: 'u1' }));
  return `${header}.${payload}.sig`;
}
function expiredPlatformSession() {
  const expiresAt = Math.floor(Date.now() / 1000) - 3600;
  return JSON.stringify({
    access_token: 'header.payload.sig',
    refresh_token: 'stale-refresh-token',
    expires_at: expiresAt,
    token_type: 'bearer',
    user: { id: 'user-old', email: 'old@test.com' },
  });
}

describe('saasAuthStorage', () => {
  let storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('clearSaasAuthStorage remove platform auth', () => {
    storage.setItem(PLATFORM_AUTH_STORAGE_KEY, '{"refresh_token":"x"}');
    storage.setItem(`${PLATFORM_AUTH_STORAGE_KEY}-code-verifier`, 'cv');
    const removed = clearSaasAuthStorage(storage);
    expect(removed).toContain(PLATFORM_AUTH_STORAGE_KEY);
    expect(removed).toContain(`${PLATFORM_AUTH_STORAGE_KEY}-code-verifier`);
    expect(hasPersistedPlatformAuth(storage)).toBe(false);
  });

  it('clearSaasAuthStorage remove appgestaoodonto.session', () => {
    storage.setItem(SESSION_KEY, '{"userId":"u1"}');
    storage.setItem(PLATFORM_AUTH_STORAGE_KEY, '{}');
    const removed = clearSaasAuthStorage(storage);
    expect(removed).toContain(SESSION_KEY);
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('clearSaasAuthStorage remove chaves sb-* auth-token', () => {
    storage.setItem('sb-tckdjyunwmdpqmewrwvt-auth-token', '{}');
    storage.setItem('sb-uoeprod-auth-token-code-verifier', 'x');
    storage.setItem('other-key', 'keep');
    const removed = clearSaasAuthStorage(storage);
    expect(removed).toContain('sb-tckdjyunwmdpqmewrwvt-auth-token');
    expect(removed).toContain('sb-uoeprod-auth-token-code-verifier');
    expect(storage.getItem('other-key')).toBe('keep');
  });

  it('isStaleRefreshAuthError detecta refresh inválido', () => {
    expect(isStaleRefreshAuthError(new Error('Invalid Refresh Token: Refresh Token Not Found'))).toBe(true);
    expect(isStaleRefreshAuthError({ message: 'invalid_grant', code: 'invalid_grant' })).toBe(true);
    expect(isStaleRefreshAuthError(new Error('E-mail ou senha inválidos.'))).toBe(false);
  });

  it('isLoginBlockedByStaleAuth só trata failed to fetch com auth persistida', () => {
    const netErr = new Error('Failed to fetch');
    expect(isLoginBlockedByStaleAuth(netErr, { hasPlatformAuth: false })).toBe(false);
    expect(isLoginBlockedByStaleAuth(netErr, { hasPlatformAuth: true })).toBe(true);
  });

  it('preflightLoginPageAuthStorage limpa sessão expirada no /login', () => {
    storage.setItem(PLATFORM_AUTH_STORAGE_KEY, expiredPlatformSession());
    const win = {
      localStorage: storage,
      sessionStorage: createMemoryStorage(),
      location: { pathname: '/login', search: '', hash: '' },
    };
    const result = preflightLoginPageAuthStorage(win);
    expect(result.cleared).toBe(true);
    expect(hasPersistedPlatformAuth(storage)).toBe(false);
    expect(win.sessionStorage.getItem('love-odonto-stale-auth-cleared')).toBe('1');
  });

  it('preflightLoginPageAuthStorage não limpa sessão válida ativa', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    storage.setItem(PLATFORM_AUTH_STORAGE_KEY, JSON.stringify({
      access_token: createFakeJwt(futureExp),
      refresh_token: 'valid',
      expires_at: futureExp,
      user: { id: 'u1' },
    }));
    storage.setItem(SESSION_KEY, JSON.stringify({
      authMode: 'saas',
      userId: 'u1',
      tenantId: 'tenant-1',
    }));
    expect(hasActiveSaasSessionPair(storage)).toBe(true);
    const result = preflightLoginPageAuthStorage({
      localStorage: storage,
      sessionStorage: createMemoryStorage(),
      location: { pathname: '/login', search: '', hash: '' },
    });
    expect(result.cleared).toBe(false);
    expect(hasPersistedPlatformAuth(storage)).toBe(true);
  });

  it('preflightLoginPageAuthStorage não roda fora de /login', () => {
    storage.setItem(PLATFORM_AUTH_STORAGE_KEY, expiredPlatformSession());
    const result = preflightLoginPageAuthStorage({
      localStorage: storage,
      sessionStorage: createMemoryStorage(),
      location: { pathname: '/gestao/dashboard', search: '', hash: '' },
    });
    expect(result.cleared).toBe(false);
  });

  it('isPlatformAuthExpiredInStorage identifica token expirado', () => {
    storage.setItem(PLATFORM_AUTH_STORAGE_KEY, expiredPlatformSession());
    expect(isPlatformAuthExpiredInStorage(storage)).toBe(true);
  });

  it('collectSupabaseAuthStorageKeys lista chaves relacionadas', () => {
    storage.setItem(PLATFORM_AUTH_STORAGE_KEY, '{}');
    storage.setItem(SESSION_KEY, '{}');
    storage.setItem('sb-test-auth-token', '{}');
    storage.setItem('random', '1');
    expect(collectSupabaseAuthStorageKeys(storage)).toEqual([
      PLATFORM_AUTH_STORAGE_KEY,
      SESSION_KEY,
      'sb-test-auth-token',
    ]);
  });

  it('STALE_SESSION_CLEARED_MESSAGE está definida para UX', () => {
    expect(STALE_SESSION_CLEARED_MESSAGE).toContain('sessão antiga');
  });
});

describe('saasAuthStorage — produção não alterada', () => {
  it('funções operam apenas em Storage local (sem fetch/Supabase no módulo)', () => {
    const source = collectSupabaseAuthStorageKeys.toString();
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/createClient/);
  });
});
