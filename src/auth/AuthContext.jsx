import { useMemo, useState, useEffect } from 'react';
import { loadDb, loadDbAsync, withDb } from '../db/index.js';
import { roles } from '../permissions/permissions.js';
import { logAction } from '../services/logService.js';
import { getDefaultTenant, getTenant } from '../services/tenantService.js';
import { getMembership } from '../services/membershipService.js';
import { ROLE_MASTER } from '../constants/tenantRoles.js';
import { assertTenantAllowed } from '../services/platformAccessService.js';
import { resolveTrustedTenantId } from '../services/tenantIdentityService.js';
import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { fetchSaasAccessBootstrap, isSaasModeEnabled } from '../services/saasAuthService.js';
import { LOGOUT_REASON_KEY } from './logoutReason.js';
import { raceWithTimeout } from '../utils/promiseTimeout.js';
import { AuthContext } from './authContext.js';

/** Evita RequireAuth preso em "Carregando…" se getSession/RPC não retornarem. */
const AUTH_SAAS_HYDRATE_TIMEOUT_MS = 32000;
const AUTH_LOCAL_DB_TIMEOUT_MS = 45000;

const SESSION_KEY = 'appgestaoodonto.session';

const getStoredSession = () => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

function resolveUserFromSession(session, loadDbFn) {
  if (!session) return null;
  const db = loadDbFn();
  const u = db.users.find((item) => item.id === session.userId) || null;
  if (!u) return null;
  const tenantId = session.tenantId || (getDefaultTenant()?.id);
  if (!tenantId) return null;
  const membership = getMembership(tenantId, session.userId);
  if (!membership || membership.has_system_access === false) return null;
  return {
    ...u,
    role: membership.role,
    has_system_access: membership.has_system_access,
    isMaster: membership.role === ROLE_MASTER,
    tenantId,
  };
}

/**
 * Aceita sessão completa do Supabase Auth OU o objeto reduzido do localStorage;
 * nesse caso reidrata via supabasePlatformClient.auth.getSession() (storageKey próprio).
 */
async function getPersistedSaasSession(session) {
  if (!supabasePlatformClient) return null;
  if (session?.user?.id) return session;
  const { data, error } = await supabasePlatformClient.auth.getSession();
  if (error) {
    throw new Error(error.message || 'Falha ao obter sessão SaaS.');
  }
  return data?.session || null;
}

async function resolveSaasUserFromSession(session) {
  const persistedSession = await getPersistedSaasSession(session);
  if (!persistedSession?.user?.id) return null;
  const bootstrap = await fetchSaasAccessBootstrap(supabasePlatformClient);
  if (!bootstrap?.tenantId) return null;
  return {
    id: persistedSession.user.id,
    name: persistedSession.user.user_metadata?.full_name || persistedSession.user.email || 'Usuário',
    email: persistedSession.user.email || '',
    role: bootstrap.role,
    has_system_access: bootstrap.isActive,
    isMaster: bootstrap.role === 'admin',
    tenantId: bootstrap.tenantId,
    authMode: 'saas',
  };
}

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => getStoredSession());
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    if (!session) {
      setUser(null);
      return;
    }
    let cancelled = false;
    if (session.authMode === 'saas') {
      (async () => {
        const clearSaasSession = () => {
          try {
            localStorage.removeItem(SESSION_KEY);
          } catch (_) {
            /* ignore */
          }
          if (!cancelled) {
            setSession(null);
            setUser(null);
          }
        };
        try {
          if (!supabasePlatformClient) {
            clearSaasSession();
            return;
          }
          await raceWithTimeout(
            (async () => {
              const { data, error } = await supabasePlatformClient.auth.getSession();
              if (cancelled) return;
              if (error) throw error;
              const supa = data?.session;
              if (!supa?.user?.id) {
                clearSaasSession();
                return;
              }
              const resolved = await resolveSaasUserFromSession(supa);
              if (cancelled) return;
              if (!resolved?.tenantId) {
                clearSaasSession();
                return;
              }
              const nextStored = {
                authMode: 'saas',
                userId: supa.user.id,
                tenantId: resolved.tenantId,
              };
              localStorage.setItem(SESSION_KEY, JSON.stringify(nextStored));
              if (!cancelled) {
                setUser(resolved);
                setSession((prev) => {
                  if (
                    prev?.authMode === 'saas'
                    && prev.userId === nextStored.userId
                    && prev.tenantId === nextStored.tenantId
                  ) {
                    return prev;
                  }
                  return nextStored;
                });
              }
            })(),
            AUTH_SAAS_HYDRATE_TIMEOUT_MS,
            '__AUTH_SAAS_HYDRATE_TIMEOUT__',
          );
        } catch (e) {
          if (!cancelled) clearSaasSession();
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      raceWithTimeout(loadDbAsync(), AUTH_LOCAL_DB_TIMEOUT_MS, '__AUTH_LOCAL_DB_TIMEOUT__')
        .then(() => {
          if (cancelled) return;
          const resolved = resolveUserFromSession(session, loadDb);
          if (!cancelled) setUser(resolved);
        })
        .catch((e) => {
          if (!cancelled) {
            if (String(e?.message || '') === '__AUTH_LOCAL_DB_TIMEOUT__') {
              try {
                localStorage.removeItem(SESSION_KEY);
              } catch (_) {
                /* ignore */
              }
              setSession(null);
            }
            setUser(null);
          }
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [session]);

  /** Mantém user alinhado após refresh de token e logout do Supabase (modo SaaS). */
  useEffect(() => {
    if (!supabasePlatformClient) return undefined;
    const { data: { subscription } } = supabasePlatformClient.auth.onAuthStateChange(async (event, authSession) => {
      const stored = getStoredSession();
      if (!stored || stored.authMode !== 'saas') return;
      if (event === 'INITIAL_SESSION') return;
      if (!authSession?.user?.id) {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setUser(null);
        return;
      }
      try {
        const resolved = await raceWithTimeout(
          resolveSaasUserFromSession(authSession),
          AUTH_SAAS_HYDRATE_TIMEOUT_MS,
          '__AUTH_SAAS_ONAUTH_TIMEOUT__',
        );
        if (!resolved?.tenantId) {
          try {
            localStorage.removeItem(SESSION_KEY);
          } catch (_) {
            /* ignore */
          }
          setSession(null);
          setUser(null);
          return;
        }
        const nextStored = {
          authMode: 'saas',
          userId: authSession.user.id,
          tenantId: resolved.tenantId,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(nextStored));
        setSession(nextStored);
        setUser(resolved);
      } catch {
        try {
          localStorage.removeItem(SESSION_KEY);
        } catch (_) {
          /* ignore */
        }
        setSession(null);
        setUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const login = async ({ userId, tenantId: explicitTenantId }) => {
    if (isSaasModeEnabled()) {
      const { data, error } = await supabasePlatformClient.auth.getSession();
      if (error) {
        throw new Error(error.message || 'Falha ao obter sessão SaaS.');
      }
      const currentSession = data?.session || null;
      if (!currentSession?.user?.id) {
        throw new Error('Sessão SaaS ausente. Faça login novamente.');
      }
      const resolved = await resolveSaasUserFromSession(currentSession);
      if (!resolved?.tenantId) {
        throw new Error('Usuário SaaS sem clínica vinculada.');
      }
      await assertTenantAllowed(resolved.tenantId);
      const next = {
        authMode: 'saas',
        userId: currentSession.user.id,
        tenantId: resolved.tenantId,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      setSession(next);
      setUser(resolved);
      return resolved;
    }
    const db = loadDb();
    const baseUser = db.users.find((item) => item.id === userId && item.active !== false);
    if (!baseUser) {
      throw new Error('Usuário não encontrado ou inativo.');
    }
    const trustedTenantId = await resolveTrustedTenantId({ fallbackTenantId: explicitTenantId });
    const tenant = trustedTenantId ? getTenant(trustedTenantId) : getDefaultTenant();
    if (!tenant) {
      throw new Error('Usuário sem clínica válida vinculada. Entre em contato com o suporte.');
    }
    const membership = getMembership(tenant.id, userId);
    if (!membership) {
      throw new Error('Você não está vinculado a esta clínica.');
    }
    if (membership.has_system_access === false) {
      throw new Error('Acesso ao sistema desativado. Entre em contato com o administrador.');
    }
    await assertTenantAllowed(tenant.id);
    const next = { userId: baseUser.id, tenantId: tenant.id };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    logAction('auth:login', { userId: baseUser.id, tenantId: tenant.id });
    return { ...baseUser, role: membership.role, has_system_access: membership.has_system_access, isMaster: membership.role === ROLE_MASTER };
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    if (session?.authMode === 'saas' && supabasePlatformClient) {
      supabasePlatformClient.auth.signOut().catch(() => {});
    }
    setSession(null);
    setUser(null);
  };

  const logoutWithReason = (reason) => {
    if (reason) sessionStorage.setItem(LOGOUT_REASON_KEY, String(reason));
    logout();
  };

  const ensureSeedUser = () => {
    withDb((db) => {
      if (db.users.length === 0) {
        db.users.push({
          id: 'user-admin',
          name: 'Administrador',
          role: roles.admin,
          active: true,
          has_system_access: true,
        });
      }
      return db;
    });
  };

  useEffect(() => {
    if (!session || !user) return;
    if (session.authMode === 'saas') return;
    const db = loadDb();
    const u = db.users.find((item) => item.id === session.userId);
    if (u && u.has_system_access === false) {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
      setUser(null);
    }
  }, [session, user]);

  const value = useMemo(
    () => ({
      user,
      session,
      login,
      logout,
      logoutWithReason,
      ensureSeedUser,
    }),
    [user, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
