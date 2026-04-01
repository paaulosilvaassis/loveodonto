import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { supabaseConsole, getConsoleSupabaseConfigError } from '../lib/supabaseConsole.js';

export const PLATFORM_ROLES = {
  OWNER: 'owner',
  SUPER_ADMIN: 'super_admin',
  SUPORTE: 'suporte',
  FINANCEIRO: 'financeiro',
  OPERACOES: 'operacoes',
  LEITURA: 'leitura',
};

const PlatformAuthContext = createContext(null);

const DEFAULT_PERMISSIONS = {
  '*': [PLATFORM_ROLES.OWNER, PLATFORM_ROLES.SUPER_ADMIN],
  'dashboard:view': [PLATFORM_ROLES.OWNER, PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.SUPORTE, PLATFORM_ROLES.FINANCEIRO, PLATFORM_ROLES.OPERACOES, PLATFORM_ROLES.LEITURA],
  'clinics:write': [PLATFORM_ROLES.OWNER, PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.OPERACOES],
  'billing:write': [PLATFORM_ROLES.OWNER, PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.FINANCEIRO],
  'support:write': [PLATFORM_ROLES.OWNER, PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.SUPORTE],
  'flags:write': [PLATFORM_ROLES.OWNER, PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.OPERACOES],
  'audit:view': [PLATFORM_ROLES.OWNER, PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.LEITURA, PLATFORM_ROLES.OPERACOES],
};

function normalizeRole(value) {
  return String(value || '').toLowerCase();
}

export function PlatformAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [platformUser, setPlatformUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const configError = getConsoleSupabaseConfigError();

  useEffect(() => {
    if (configError || !supabaseConsole) {
      setSession(null);
      setPlatformUser(null);
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
  }, [configError]);

  async function fetchPlatformUser(authId) {
    try {
      const { data, error } = await supabaseConsole
        .from('platform_admin_users')
        .select('id, email, full_name, role_slug, is_active')
        .eq('id', authId)
        .eq('is_active', true)
        .single();
      if (error || !data) {
        setPlatformUser(null);
        await supabaseConsole.auth.signOut();
        setSession(null);
        return;
      }
      const role = normalizeRole(data.role_slug);
      setPlatformUser({
        id: data.id,
        email: data.email,
        name: data.full_name || data.email,
        role,
      });
    } catch {
      setPlatformUser(null);
      await supabaseConsole.auth.signOut();
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  const login = async (email, password) => {
    if (configError || !supabaseConsole) {
      throw new Error(configError || 'Supabase da Console não está configurado.');
    }
    const { data, error } = await supabaseConsole.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await fetchPlatformUser(data.user.id);
    return data;
  };

  const logout = async () => {
    if (supabaseConsole) {
      await supabaseConsole.auth.signOut();
    }
    setSession(null);
    setPlatformUser(null);
  };

  const hasPermission = (permission) => {
    const role = platformUser?.role;
    if (!role) return false;
    const roleNormalized = normalizeRole(role);
    if ((DEFAULT_PERMISSIONS['*'] || []).includes(roleNormalized)) return true;
    const allowed = DEFAULT_PERMISSIONS[permission] || [];
    return allowed.includes(roleNormalized);
  };

  const value = useMemo(
    () => ({
      session,
      platformUser,
      loading,
      login,
      logout,
      hasPermission,
      configError,
      supabaseReady: Boolean(supabaseConsole && !configError),
      isOwner: platformUser?.role === PLATFORM_ROLES.OWNER,
    }),
    [session, platformUser, loading, configError],
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
