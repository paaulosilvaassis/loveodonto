/**
 * Auth legado do módulo /platform embutido no app (5176).
 * NÃO consulta platform_users — tabela do console antigo, ausente no projeto SaaS atual.
 * O app da clínica usa AuthContext + tenant-context (tenant_users via backend).
 * O Console oficial fica em console/ (5177) com PlatformAuthContext próprio.
 */
import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { supabasePlatformClient } from '../lib/supabaseClients.js';

export const PLATFORM_ROLES = {
  PLATFORM_OWNER: 'PLATFORM_OWNER',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  SALES: 'SALES',
  SUPPORT: 'SUPPORT',
  FINANCE: 'FINANCE',
};

const PlatformAuthContext = createContext(null);

export function PlatformAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabasePlatformClient) {
      setLoading(false);
      return undefined;
    }
    supabasePlatformClient.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const { data: { subscription } } = supabasePlatformClient.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    if (!supabasePlatformClient) throw new Error('Supabase Plataforma não configurado.');
    const { data, error } = await supabasePlatformClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setSession(data.session);
    return data;
  };

  const logout = async () => {
    if (supabasePlatformClient) await supabasePlatformClient.auth.signOut();
    setSession(null);
  };

  /** Módulo /platform legado — sem platform_users; use Console 5177 para admin SaaS. */
  const platformUser = null;

  const value = useMemo(
    () => ({
      session,
      platformUser,
      loading,
      login,
      logout,
      isOwner: false,
      isAdmin: false,
      canManageTeam: false,
      canManageTenants: false,
      canManageBilling: false,
      canManageProviders: false,
      canManagePlans: false,
      canViewTenants: false,
    }),
    [session, loading],
  );

  return (
    <PlatformAuthContext.Provider value={value}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export const usePlatformAuth = () => {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error('usePlatformAuth deve ser usado dentro de PlatformAuthProvider.');
  return ctx;
};
