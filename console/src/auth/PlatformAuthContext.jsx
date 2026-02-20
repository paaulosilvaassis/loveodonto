import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { supabaseConsole } from '../lib/supabaseConsole.js';

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
    if (!supabaseConsole) {
      setLoading(false);
      return;
    }
    supabaseConsole.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) fetchPlatformUser(s.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabaseConsole.auth.onAuthStateChange((_event, s) => {
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
      const { data, error } = await supabaseConsole
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
    if (!supabaseConsole) throw new Error('Supabase não configurado.');
    const { data, error } = await supabaseConsole.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await fetchPlatformUser(data.user.id);
    return data;
  };

  const logout = async () => {
    if (supabaseConsole) await supabaseConsole.auth.signOut();
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
      canManageTeam: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN].includes(platformUser?.role),
      canManageTenants: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN, PLATFORM_ROLES.SALES].includes(platformUser?.role),
      canManageBilling: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN, PLATFORM_ROLES.FINANCE].includes(platformUser?.role),
      canManageProviders: [PLATFORM_ROLES.PLATFORM_OWNER, PLATFORM_ROLES.PLATFORM_ADMIN].includes(platformUser?.role),
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
