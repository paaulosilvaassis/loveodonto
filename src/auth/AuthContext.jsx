import { createContext, useContext, useMemo, useState, useEffect } from 'react';
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

const AUTH_CONTEXT_KEY = '__appgestaoodonto_auth_context__';
const getAuthContext = () => {
  if (typeof globalThis === 'undefined') return createContext(null);
  if (!globalThis[AUTH_CONTEXT_KEY]) {
    globalThis[AUTH_CONTEXT_KEY] = createContext(null);
  }
  return globalThis[AUTH_CONTEXT_KEY];
};

const AuthContext = getAuthContext();

const SESSION_KEY = 'appgestaoodonto.session';
const LOGOUT_REASON_KEY = 'appgestaoodonto.logout_reason';

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
  // #region agent log
  fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run3',hypothesisId:'H14',location:'src/auth/AuthContext.jsx:resolveSaasUserFromSession:start',message:'Resolve SaaS user from session started',data:{hasSession:Boolean(session),hasUserId:Boolean(session?.user?.id),hasPlatformClient:Boolean(supabasePlatformClient)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const persistedSession = await getPersistedSaasSession(session);
  if (!persistedSession?.user?.id) return null;
  const bootstrap = await fetchSaasAccessBootstrap(supabasePlatformClient);
  // #region agent log
  fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run3',hypothesisId:'H14',location:'src/auth/AuthContext.jsx:resolveSaasUserFromSession:bootstrap',message:'Resolve SaaS user bootstrap result',data:{hasTenantId:Boolean(bootstrap?.tenantId),isActive:Boolean(bootstrap?.isActive),role:String(bootstrap?.role||'')},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      if (session.authMode === 'saas') {
        resolveSaasUserFromSession(session).then((resolved) => {
          if (!cancelled) setUser(resolved);
        }).catch(() => {
          if (!cancelled) setUser(null);
        });
        return;
      }
      loadDbAsync().then(() => {
        if (cancelled) return;
        const resolved = resolveUserFromSession(session, loadDb);
        if (!cancelled) setUser(resolved);
      }).catch(() => {
        if (!cancelled) setUser(null);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [session]);

  const login = async ({ userId, tenantId: explicitTenantId }) => {
    // #region agent log
    fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run3',hypothesisId:'H15',location:'src/auth/AuthContext.jsx:login:start',message:'AuthContext login started',data:{saasMode:Boolean(isSaasModeEnabled()),hasUserId:Boolean(userId),hasTenantId:Boolean(explicitTenantId)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return ctx;
};

export function consumeLogoutReason() {
  const raw = sessionStorage.getItem(LOGOUT_REASON_KEY);
  if (raw) sessionStorage.removeItem(LOGOUT_REASON_KEY);
  return raw || '';
}
