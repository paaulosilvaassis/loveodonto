import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  supabaseConsole,
  getConsoleSupabaseConfigError,
  supabaseConsoleConfig,
} from '../lib/supabaseConsole.js';
import { PLATFORM_ROLES } from './platformRoles.js';

const PlatformAuthContext = createContext(null);

const AUTH_DEBUG =
  import.meta.env.DEV || String(import.meta.env.VITE_CONSOLE_AUTH_DEBUG || '') === '1';

function authLog(phase, detail) {
  if (!AUTH_DEBUG) return;
  if (detail !== undefined) {
    console.info('[PlatformConsole][Auth]', phase, detail);
  } else {
    console.info('[PlatformConsole][Auth]', phase);
  }
}

const PROFILE_FETCH_TIMEOUT_MS = 15000;
const GET_SESSION_TIMEOUT_MS = 12000;
const CONSOLE_PUBLIC_KEY =
  String(import.meta.env.VITE_CONSOLE_SUPABASE_ANON_KEY || '').trim()
  || String(import.meta.env.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY || '').trim();

function withTimeout(promise, ms, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`Timeout: ${label}`), { code: 'TIMEOUT', name: 'AuthTimeout' }));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function mapRestAuthPayloadToSession(data) {
  if (!data?.access_token || !data?.refresh_token || !data?.user?.id) {
    return null;
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type || 'bearer',
    expires_in: data.expires_in ?? null,
    expires_at: data.expires_at ?? null,
    user: data.user,
  };
}

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

function mapRowToPlatformUser(data) {
  const role = normalizeRole(data.role_slug);
  return {
    id: data.id,
    email: data.email,
    name: data.full_name || data.email,
    role,
  };
}

export function PlatformAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [platformUser, setPlatformUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const configError = getConsoleSupabaseConfigError();
  const inFlightByUser = useRef(new Map());
  /** Evita que o primeiro ciclo (StrictMode) deixe `loading` preso quando o async termina após o cleanup. */
  const bootIdRef = useRef(0);

  const fetchPlatformUser = useCallback(async (authId, source = 'unknown') => {
    if (!supabaseConsole || !authId) {
      authLog('fetchPlatformUser:skipped', { reason: 'no client or id', source });
      return { ok: false, code: 'NO_CLIENT', message: 'Cliente Supabase indisponível.' };
    }

    const pending = inFlightByUser.current.get(authId);
    if (pending) {
      authLog('fetchPlatformUser:dedupe', { authId, source });
      return pending;
    }

    const job = (async () => {
      authLog('fetchPlatformUser:started', { authId, source, table: 'platform_admin_users' });
      try {
        const query = supabaseConsole
          .from('platform_admin_users')
          .select('id, email, full_name, role_slug, is_active')
          .eq('id', authId)
          .eq('is_active', true)
          .maybeSingle();

        const { data, error } = await withTimeout(
          query,
          PROFILE_FETCH_TIMEOUT_MS,
          'platform_admin_users',
        );

        if (error) {
          authLog('fetchPlatformUser:queryError', { message: error.message, code: error.code, source });
          return {
            ok: false,
            code: error.code || 'QUERY_ERROR',
            message: 'Não foi possível carregar o perfil de administrador. Verifique as políticas RLS e a tabela platform_admin_users.',
          };
        }
        if (!data) {
          authLog('fetchPlatformUser:not_found_or_inactive', { authId, source });
          return {
            ok: false,
            code: 'PROFILE_NOT_FOUND',
            message:
              'Este usuário não tem perfil ativo em platform_admin_users (ou o UUID não bate com auth.users). '
              + 'Crie a linha no Supabase com o mesmo id do usuário em Authentication.',
          };
        }
        const profile = mapRowToPlatformUser(data);
        authLog('fetchPlatformUser:success', { email: profile.email, role: profile.role, source });
        return { ok: true, profile };
      } catch (e) {
        const timedOut = e?.code === 'TIMEOUT' || String(e?.message || '').includes('Timeout');
        if (timedOut) {
          authLog('fetchPlatformUser:timeout', { authId, source });
          return {
            ok: false,
            code: 'TIMEOUT',
            message: 'Tempo esgotado ao buscar o perfil. Verifique a rede e o Supabase.',
          };
        }
        authLog('fetchPlatformUser:exception', { message: String(e?.message || e), source });
        return {
          ok: false,
          code: 'UNKNOWN',
          message: 'Erro ao validar o perfil de administrador.',
        };
      }
    })();

    inFlightByUser.current.set(authId, job);
    try {
      return await job;
    } finally {
      if (inFlightByUser.current.get(authId) === job) {
        inFlightByUser.current.delete(authId);
      }
    }
  }, []);

  useEffect(() => {
    if (configError || !supabaseConsole) {
      authLog('init:noSupabase', { configError: Boolean(configError) });
      setSession(null);
      setPlatformUser(null);
      setLoading(false);
      return;
    }

    const bootId = ++bootIdRef.current;

    const finishBoot = () => {
      if (bootIdRef.current !== bootId) {
        return;
      }
      authLog('bootstrap:loadingFalse');
      setLoading(false);
    };

    (async () => {
      authLog('bootstrap:start');
      try {
        let s = null;
        try {
          const { data, error } = await withTimeout(
            supabaseConsole.auth.getSession(),
            GET_SESSION_TIMEOUT_MS,
            'getSession',
          );
          if (error) authLog('bootstrap:getSessionError', error.message);
          s = data?.session ?? null;
        } catch (e) {
          authLog('bootstrap:getSessionTimeout', String(e?.message || e));
          s = null;
        }
        if (bootIdRef.current !== bootId) return;
        authLog('bootstrap:sessionLoaded', { hasSession: Boolean(s), userId: s?.user?.id });
        setSession(s);
        if (s?.user) {
          const res = await fetchPlatformUser(s.user.id, 'bootstrap');
          if (bootIdRef.current !== bootId) return;
          if (res.ok) {
            setPlatformUser(res.profile);
          } else {
            authLog('bootstrap:profileInvalid', res);
            setPlatformUser(null);
            await supabaseConsole.auth.signOut();
            setSession(null);
          }
        } else {
          setPlatformUser(null);
        }
      } catch (e) {
        authLog('bootstrap:error', String(e?.message || e));
        if (bootIdRef.current === bootId) {
          setPlatformUser(null);
          setSession(null);
        }
      } finally {
        finishBoot();
        authLog('bootstrap:end');
      }
    })();

    const { data: { subscription } } = supabaseConsole.auth.onAuthStateChange((event, s) => {
      authLog('onAuthStateChange', { event, userId: s?.user?.id });
      if (event === 'INITIAL_SESSION') return;

      void (async () => {
        setSession(s);
        if (s?.user) {
          const res = await fetchPlatformUser(s.user.id, event);
          if (res.ok) {
            setPlatformUser(res.profile);
          } else {
            authLog('onAuthStateChange:profileInvalid', res);
            setPlatformUser(null);
            await supabaseConsole.auth.signOut();
            setSession(null);
          }
        } else {
          setPlatformUser(null);
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [configError, fetchPlatformUser]);

  const login = useCallback(async (email, password) => {
    authLog('login:started', { email });
    if (configError || !supabaseConsole) {
      throw new Error(configError || 'Supabase da Console não está configurado.');
    }

    let connectivityProbe = { attempted: false };
    let tokenEndpointUnavailable = false;
    try {
      connectivityProbe = { attempted: true, online: navigator.onLine };
      const probeResponse = await fetch(`${supabaseConsoleConfig.url}/auth/v1/health`, {
        method: 'GET',
      });
      connectivityProbe.status = probeResponse.status;
      connectivityProbe.ok = probeResponse.ok;
    } catch (probeError) {
      connectivityProbe.errorName = probeError?.name || null;
      connectivityProbe.errorMessage = String(probeError?.message || '');
    }

    try {
      const tokenProbeResponse = await fetch(
        `${supabaseConsoleConfig.url}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: CONSOLE_PUBLIC_KEY,
          },
          body: JSON.stringify({ email: 'probe@loveodonto.invalid', password: 'invalid-probe-password' }),
        },
      );
    } catch (tokenProbeError) {
      tokenEndpointUnavailable = true;
    }

    let sdkResult;
    try {
      sdkResult = await withTimeout(
        supabaseConsole.auth.signInWithPassword({ email, password }),
        8000,
        'signInWithPassword',
      );
    } catch (sdkError) {
      try {
        const restResponse = await withTimeout(
          fetch(`${supabaseConsoleConfig.url}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: CONSOLE_PUBLIC_KEY,
            },
            body: JSON.stringify({ email, password }),
          }),
          8000,
          'directTokenFetch',
        );
        const restJson = await restResponse.json().catch(() => null);
        if (!restResponse.ok) {
          const restError = new Error(
            String(restJson?.error_description || restJson?.msg || 'Falha no login via endpoint REST do Supabase.'),
          );
          restError.code = restJson?.error_code || 'AUTH_REST_ERROR';
          throw restError;
        }

        const fallbackSession = mapRestAuthPayloadToSession(restJson);
        if (!fallbackSession) {
          const restError = new Error('Resposta de login do Supabase não trouxe sessão válida.');
          restError.code = 'AUTH_REST_INVALID_SESSION';
          throw restError;
        }

        const { error: setSessionError } = await supabaseConsole.auth.setSession({
          access_token: fallbackSession.access_token,
          refresh_token: fallbackSession.refresh_token,
        });
        if (setSessionError) {
          throw setSessionError;
        }

        sdkResult = {
          data: {
            user: fallbackSession.user,
            session: fallbackSession,
          },
          error: null,
        };
      } catch {
        // Se o fallback REST também falhar, mantemos o erro original do SDK.
      }
      if (!sdkResult) {
        throw sdkError;
      }
    }

    const { data, error } = sdkResult;
    if (error) {
      authLog('login:supabaseError', { message: error.message });
      const isFetchError =
        String(error?.message || '').toLowerCase().includes('failed to fetch')
        || error?.name === 'AuthRetryableFetchError';
      if (tokenEndpointUnavailable && isFetchError) {
        const tokenUnavailableError = new Error(
          'O endpoint de login do Supabase (/auth/v1/token) não respondeu. '
          + 'Diagnóstico: timeout 522 no edge do Supabase para este projeto.',
        );
        tokenUnavailableError.code = 'AUTH_TOKEN_ENDPOINT_UNAVAILABLE';
        throw tokenUnavailableError;
      }
      throw error;
    }
    authLog('login:supabaseSuccess', { userId: data?.user?.id });

    const res = await fetchPlatformUser(data.user.id, 'login');
    if (!res.ok) {
      authLog('login:profileFailed', res);
      await supabaseConsole.auth.signOut();
      setSession(null);
      setPlatformUser(null);
      const err = new Error(res.message);
      err.code = res.code;
      throw err;
    }

    setPlatformUser(res.profile);
    setSession(data.session);
    authLog('redirect:ready', { to: 'dashboard (via Navigate na login page)' });
    return data;
  }, [configError, fetchPlatformUser]);

  const logout = async () => {
    if (supabaseConsole) {
      await supabaseConsole.auth.signOut();
    }
    setSession(null);
    setPlatformUser(null);
  };

  const hasPermission = useCallback((permission) => {
    const role = platformUser?.role;
    if (!role) return false;
    const roleNormalized = normalizeRole(role);
    if ((DEFAULT_PERMISSIONS['*'] || []).includes(roleNormalized)) return true;
    const allowed = DEFAULT_PERMISSIONS[permission] || [];
    return allowed.includes(roleNormalized);
  }, [platformUser?.role]);

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
    [session, platformUser, loading, configError, login, hasPermission],
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
