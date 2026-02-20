import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { loadDb, withDb } from '../db/index.js';
import { roles } from '../permissions/permissions.js';
import { logAction } from '../services/logService.js';
import { getDefaultTenant, getTenant } from '../services/tenantService.js';
import { getMembership } from '../services/membershipService.js';
import { ROLE_MASTER } from '../constants/tenantRoles.js';

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

const getStoredSession = () => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => getStoredSession());

  const login = ({ userId, tenantId: explicitTenantId }) => {
    const db = loadDb();
    const baseUser = db.users.find((item) => item.id === userId && item.active !== false);
    if (!baseUser) {
      throw new Error('Usuário não encontrado ou inativo.');
    }
    const tenant = explicitTenantId ? getTenant(explicitTenantId) : getDefaultTenant();
    if (!tenant) {
      throw new Error('Nenhuma clínica configurada.');
    }
    const membership = getMembership(tenant.id, userId);
    if (!membership) {
      throw new Error('Você não está vinculado a esta clínica.');
    }
    if (membership.has_system_access === false) {
      throw new Error('Acesso ao sistema desativado. Entre em contato com o administrador.');
    }
    const next = { userId: baseUser.id, tenantId: tenant.id };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    logAction('auth:login', { userId: baseUser.id, tenantId: tenant.id });
    return { ...baseUser, role: membership.role, has_system_access: membership.has_system_access, isMaster: membership.role === ROLE_MASTER };
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
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

  const user = useMemo(() => {
    if (!session) return null;
    const db = loadDb();
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
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const db = loadDb();
    const u = db.users.find((item) => item.id === session.userId);
    if (u && u.has_system_access === false) {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    }
  }, [session, user]);

  const value = useMemo(
    () => ({
      user,
      session,
      login,
      logout,
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
