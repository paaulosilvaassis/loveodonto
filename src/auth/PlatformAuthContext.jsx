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
  const [platformUser, setPlatformUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabasePlatformClient) {
      setLoading(false);
      return;
    }
    supabasePlatformClient.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) fetchPlatformUser(s.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabasePlatformClient.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) fetchPlatformUser(s.user.id);
      else {
        setPlatformUser(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchPlatformUser(authId) {
    try {
      const { data, error } = await supabasePlatformClient
        .from('platform_users')
        .select('*')
        .eq('id', authId)
        .eq('is_active', true)
        .single();
      if (error || !data) {
        setPlatformUser(null);
        return;
      }
      setPlatformUser(data);
    } catch {
      setPlatformUser(null);
    } finally {
      setLoading(false);
    }
  }

  const login = async (email, password) => {
    if (!supabasePlatformClient) throw new Error('Supabase Plataforma não configurado.');
    const { data, error } = await supabasePlatformClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await fetchPlatformUser(data.user.id);
    return data;
  };

  const logout = async () => {
    if (supabasePlatformClient) await supabasePlatformClient.auth.signOut();
    setSession(null);
    setPlatformUser(null);
  };

  const value = useMemo(
    () => ({
      session,
      platformUser,
      loading,
      login,
      logout,
      isOwner: platformUser?.role === PLATFORM_ROLES.PLATFORM_OWNER,
      isAdmin: platformUser?.role === PLATFORM_ROLES.PLATFORM_ADMIN,
      canManageTeam: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN].includes(platformUser?.role),
      canManageTenants: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN, PLATFORM_ROLES.SALES].includes(platformUser?.role),
      canManageBilling: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN, PLATFORM_ROLES.FINANCE].includes(platformUser?.role),
      canManageProviders: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN].includes(platformUser?.role),
      canManagePlans: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN].includes(platformUser?.role),
      canViewTenants: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN, PLATFORM_ROLES.SALES, PLATFORM_ROLES.SUPPORT].includes(platformUser?.role),
    }),
    [session, platformUser, loading],
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
