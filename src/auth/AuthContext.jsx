import { useMemo, useState, useEffect, useRef } from 'react';
import { loadDb, loadDbAsync, withDb } from '../db/index.js';
import { roles } from '../permissions/permissions.js';
import { logAction } from '../services/logService.js';
import { getDefaultTenant, getTenant } from '../services/tenantService.js';
import { getMembership } from '../services/membershipService.js';
import { ROLE_MASTER } from '../constants/tenantRoles.js';
import { assertTenantAllowed } from '../services/platformAccessService.js';
import { resolveTrustedTenantId } from '../services/tenantIdentityService.js';
import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { isSaasModeEnabled } from '../services/saasAuthService.js';
import { LOGOUT_REASON_KEY } from './logoutReason.js';
import { raceWithTimeout } from '../utils/promiseTimeout.js';
import { AuthContext } from './authContext.js';
import { ensureSaasUserInLocalDb } from '../services/saasUserSeedService.js';
import { reconcileOwnInvitationAcceptance } from '../services/collaboratorAccessProvisionService.js';
import { emitStabilityLog } from '../services/stabilityLogService.js';
import {
  authDebug,
  readStoredSession,
  writeStoredSession,
  clearStoredSession,
  sanitizeCachedUser,
  isTransientAuthError,
  getPlatformSession,
  resolveSaasUser,
} from './saasSessionResolver.js';
import {
  auditFirstAccess,
  isFirstAccessProtected,
} from '../utils/firstAccessSession.js';

const AUTH_LOCAL_DB_TIMEOUT_MS = 20000;
const PLATFORM_AUTH_STORAGE_KEY = 'appgestaoodonto-platform-auth';

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

/** Persiste sessão reduzida + cache de usuário e dispara sincronizações não bloqueantes. */
function persistResolvedSaasUser(resolved) {
  writeStoredSession({
    authMode: 'saas',
    userId: resolved.id,
    tenantId: resolved.tenantId,
    cachedUser: sanitizeCachedUser(resolved),
  });
  try { ensureSaasUserInLocalDb(resolved); } catch { /* non-blocking */ }
  window.setTimeout(() => {
    reconcileOwnInvitationAcceptance().catch(() => {});
  }, 2500);
}

/**
 * Hidrata o usuário SaaS na inicialização/refresh.
 * Garantia central: TODO caminho termina em onUser(user) ou onLogout(reason)
 * — o loading inicial nunca fica preso.
 */
async function hydrateSaasUser({ stored, isCancelled, onUser, onLogout }) {
  authDebug('hydrate: início da validação de sessão');
  if (!supabasePlatformClient) {
    onLogout('Configuração do Supabase ausente. Contate o suporte.');
    return;
  }

  let supaSession = null;
  try {
    supaSession = await getPlatformSession();
  } catch (err) {
    authDebug('hydrate: falha ao obter sessão Supabase —', err?.message);
    const cached = stored.cachedUser;
    if (isTransientAuthError(err) && cached?.id && cached.id === stored.userId) {
      // Falha transitória com cache válido: libera o app; revalidação ocorre depois.
      authDebug('hydrate: liberando com usuário em cache (rede instável)');
      onUser(cached);
      return;
    }
    onLogout('Não foi possível validar sua sessão. Faça login novamente.');
    return;
  }
  if (isCancelled()) return;

  if (!supaSession?.user?.id) {
    authDebug('hydrate: nenhuma sessão Supabase encontrada → login');
    onLogout(null);
    return;
  }
  authDebug('hydrate: sessão encontrada para usuário', supaSession.user.id);

  const cached = stored.cachedUser;
  if (cached?.id === supaSession.user.id && cached?.tenantId) {
    // Fast-path: libera o app imediatamente e revalida acesso em segundo plano.
    authDebug('hydrate: fast-path (cache) — app liberado; revalidando em background');
    onUser(cached);
    try {
      const fresh = await resolveSaasUser(supaSession);
      if (isCancelled()) return;
      if (!fresh?.tenantId) {
        onLogout('Seu acesso à clínica foi revogado. Faça login novamente.');
        return;
      }
      persistResolvedSaasUser(fresh);
      onUser(fresh);
      authDebug('hydrate: acesso revalidado em segundo plano');
    } catch (err) {
      if (isCancelled()) return;
      if (isTransientAuthError(err)) {
        authDebug('hydrate: revalidação adiada (erro transitório) —', err?.message);
        return; // mantém cache; servidor continua sendo a autoridade nas APIs
      }
      onLogout('Não foi possível validar seu acesso. Faça login novamente.');
    }
    return;
  }

  // Caminho completo (primeiro acesso neste navegador ou cache ausente).
  try {
    const resolved = await resolveSaasUser(supaSession);
    if (isCancelled()) return;
    if (!resolved?.tenantId) {
      onLogout('Seu usuário não está vinculado a nenhuma clínica ativa.');
      return;
    }
    persistResolvedSaasUser(resolved);
    onUser(resolved);
    authDebug('hydrate: usuário e tenant resolvidos — fim do loading');
  } catch (err) {
    if (isCancelled()) return;
    authDebug('hydrate: falha na resolução —', err?.message);
    onLogout('Não foi possível validar sua sessão (rede ou serviço indisponível). Faça login novamente.');
  }
}

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => readStoredSession());
  const [user, setUser] = useState(undefined);
  const userRef = useRef(undefined);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!session) {
      setUser(null);
      return undefined;
    }
    let cancelled = false;

    if (session.authMode === 'saas') {
      if (isFirstAccessProtected()) {
        auditFirstAccess('AuthContext hydrate skipped', {
          reason: 'fluxo de primeiro acesso — sem tenant-context/hydrateSaasUser',
        });
        setUser(null);
        return () => {
          cancelled = true;
        };
      }
      hydrateSaasUser({
        stored: session,
        isCancelled: () => cancelled,
        onUser: (resolved) => {
          if (!cancelled) setUser(resolved);
        },
        onLogout: (reason) => {
          if (cancelled) return; // execução abortada não pode apagar sessão válida
          if (isFirstAccessProtected()) {
            auditFirstAccess('AuthContext onLogout suppressed', { reason: reason || null });
            return;
          }
          clearStoredSession();
          if (reason) {
            try { sessionStorage.setItem(LOGOUT_REASON_KEY, reason); } catch { /* ignore */ }
            emitStabilityLog('AUTH_FAILED', { reason });
          }
          setSession(null);
          setUser(null);
        },
      });
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
          authDebug('hydrate(local): usuário', resolved ? 'encontrado' : 'não encontrado');
          if (!cancelled) setUser(resolved);
        })
        .catch((e) => {
          if (!cancelled) {
            if (String(e?.message || '') === '__AUTH_LOCAL_DB_TIMEOUT__') {
              clearStoredSession();
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

  /**
   * Eventos do Supabase Auth (modo SaaS).
   * - SIGNED_OUT: limpa tudo.
   * - TOKEN_REFRESHED/USER_UPDATED: o client já persiste o token; tenant/role não mudam — sem refetch.
   * - SIGNED_IN de outro usuário (ex.: outra aba): re-hidrata via efeito de sessão.
   * Callback síncrono (await em métodos auth dentro do callback pode causar deadlock no supabase-js).
   */
  useEffect(() => {
    if (!supabasePlatformClient) return undefined;
    const { data: { subscription } } = supabasePlatformClient.auth.onAuthStateChange((event, authSession) => {
      if (isFirstAccessProtected()) {
        auditFirstAccess('AuthContext onAuthStateChange ignored', { event });
        return;
      }
      const stored = readStoredSession();
      if (!stored || stored.authMode !== 'saas') return;
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT') {
        authDebug('onAuthStateChange: SIGNED_OUT');
        clearStoredSession();
        try { localStorage.removeItem(PLATFORM_AUTH_STORAGE_KEY); } catch { /* ignore */ }
        setSession(null);
        setUser(null);
        emitStabilityLog('AUTH_FAILED', { reason: 'SIGNED_OUT_EVENT' });
        return;
      }

      if (event !== 'SIGNED_IN' || !authSession?.user?.id) return;
      if (userRef.current?.id === authSession.user.id) return;
      authDebug('onAuthStateChange: SIGNED_IN de novo usuário — re-hidratando');
      setSession(readStoredSession());
    });
    return () => subscription.unsubscribe();
  }, []);

  const login = async ({
    userId,
    tenantId: explicitTenantId,
    saasResolvedUser,
    saasSession,
  }) => {
    if (isSaasModeEnabled()) {
      const currentSession = saasSession || await getPlatformSession();
      if (!currentSession?.user?.id) {
        throw new Error('Sessão SaaS ausente. Faça login novamente.');
      }
      let resolved = saasResolvedUser?.tenantId ? saasResolvedUser : null;
      if (!resolved) {
        resolved = await resolveSaasUser(currentSession);
      }
      if (!resolved?.tenantId) {
        throw new Error('Usuário SaaS sem clínica vinculada.');
      }
      if (!saasResolvedUser?.tenantId) {
        await assertTenantAllowed(resolved.tenantId);
      } else if (saasResolvedUser.has_system_access === false) {
        throw new Error('Seu acesso a esta clínica está desativado.');
      }
      const next = {
        authMode: 'saas',
        userId: currentSession.user.id,
        tenantId: resolved.tenantId,
        cachedUser: sanitizeCachedUser(resolved),
      };
      writeStoredSession(next);
      try { ensureSaasUserInLocalDb(resolved); } catch { /* non-blocking */ }
      window.setTimeout(() => {
        reconcileOwnInvitationAcceptance().catch(() => {});
      }, 2500);
      setSession(next);
      setUser(resolved);
      emitStabilityLog('AUTH_OK', { mode: 'saas', tenantId: resolved.tenantId });
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
    writeStoredSession(next);
    setSession(next);
    logAction('auth:login', { userId: baseUser.id, tenantId: tenant.id });
    emitStabilityLog('AUTH_OK', { mode: 'local', tenantId: tenant.id });
    return { ...baseUser, role: membership.role, has_system_access: membership.has_system_access, isMaster: membership.role === ROLE_MASTER };
  };

  const logout = () => {
    if (isFirstAccessProtected()) {
      auditFirstAccess('AuthContext logout suppressed', { reason: 'manual logout during first access' });
      return;
    }
    clearStoredSession();
    try { localStorage.removeItem(PLATFORM_AUTH_STORAGE_KEY); } catch { /* ignore */ }
    if (session?.authMode === 'saas' && supabasePlatformClient) {
      supabasePlatformClient.auth.signOut().catch(() => {});
    }
    setSession(null);
    setUser(null);
    emitStabilityLog('AUTH_FAILED', { reason: 'LOGOUT_MANUAL' });
  };

  const logoutWithReason = (reason) => {
    if (isFirstAccessProtected()) {
      auditFirstAccess('AuthContext logoutWithReason suppressed', { reason: reason || null });
      return;
    }
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
      clearStoredSession();
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
