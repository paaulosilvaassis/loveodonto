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
  getConsoleSupabasePublicKey,
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
/** Mesma chave pública usada em createClient (respeita prioridade publishable vs anon). */
const CONSOLE_PUBLIC_KEY = getConsoleSupabasePublicKey();

/** Erros típicos de refresh/access token corrompido ou projeto trocado no .env. */
function isInvalidJwtSessionMessage(msg) {
  const lower = String(msg || '').toLowerCase();
  return lower.includes('jwt') && (lower.includes('invalid') || lower.includes('malformed'));
}

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

/** Backend 3001 com service role — não passa por RLS do PostgREST (evita 54001). */
function getConsoleProfileApiUrl() {
  const raw = String(import.meta.env.VITE_PLATFORM_API_BASE_URL || '').trim();
  const base = raw.replace(/\/$/, '');
  const path = '/internal/platform/console-profile';
  if (!base) {
    return path;
  }
  // Em dev, fetch direto para http://localhost:3001 pode falhar (IPv4 vs IPv6, CORS em edge cases).
  // O proxy do Vite (`console/vite.config.js`) encaminha `/internal/platform` → mesmo backend.
  if (import.meta.env.DEV) {
    try {
      const u = new URL(base);
      const h = u.hostname.toLowerCase();
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1') {
        return path;
      }
    } catch {
      /* ignore */
    }
  }
  return `${base}${path}`;
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
      authLog('fetchPlatformUser:started', { authId, source, via: 'admin-api' });
      try {
        const { data: sessionData, error: sessionErr } = await supabaseConsole.auth.getSession();
        if (sessionErr) {
          return { ok: false, code: 'SESSION', message: sessionErr.message || 'Sessão inválida.' };
        }
        const accessToken = sessionData?.session?.access_token || '';
        const sessionUserId = sessionData?.session?.user?.id || '';
        if (!accessToken || sessionUserId !== authId) {
          return {
            ok: false,
            code: 'SESSION',
            message: 'Sessão inconsistente. Faça login novamente.',
          };
        }

        let response;
        try {
          response = await withTimeout(
            fetch(getConsoleProfileApiUrl(), {
              method: 'GET',
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            PROFILE_FETCH_TIMEOUT_MS,
            'console-profile',
          );
        } catch (netErr) {
          const m = String(netErr?.message || '').toLowerCase();
          const looksLikeNetworkFailure =
            m.includes('failed to fetch')
            || m.includes('networkerror')
            || m.includes('network request failed')
            || m.includes('load failed');
          if (looksLikeNetworkFailure) {
            return {
              ok: false,
              code: 'BACKEND_DOWN',
              message:
                'Backend da plataforma (porta 3001) não respondeu. Na raiz do projeto: npm run server:restart '
                + '(ou npm run stack:start). Em dev, o perfil usa o proxy do Vite para /internal/platform; '
                + 'garanta o server em ADMIN_API_PORT (padrão 3001).',
            };
          }
          throw netErr;
        }

        const json = await response.json().catch(() => ({}));
        if (response.status === 404) {
          authLog('fetchPlatformUser:not_found', { source });
          return {
            ok: false,
            code: 'PROFILE_NOT_FOUND',
            message:
              json?.error
              || 'Sem perfil em platform_admin_users. No Supabase: Authentication → UUID do usuário → Table Editor → '
                + 'crie linha com esse id, role_slug = super_admin, is_active = true.',
          };
        }
        if (response.status === 401) {
          const serverMsg = String(json?.error || '').toLowerCase();
          const looksLikeJwtMismatch =
            serverMsg.includes('invalid jwt')
            || serverMsg.includes('jwt')
            || serverMsg.includes('signature')
            || serverMsg.includes('token');
          return {
            ok: false,
            code: 'UNAUTHORIZED',
            message:
              json?.error
              && looksLikeJwtMismatch
                ? `${json.error} Verifique se server/.env (SUPABASE_URL) é o mesmo projeto Supabase que console/.env (VITE_CONSOLE_SUPABASE_URL) e se SUPABASE_SERVICE_ROLE_KEY é desse projeto.`
                : json?.error || 'Sessão não aceita pelo backend. Mesmo projeto Supabase no server/.env e na Console.',
          };
        }
        if (!response.ok) {
          return {
            ok: false,
            code: 'API_ERROR',
            message: json?.error || `Erro HTTP ${response.status} ao carregar perfil.`,
          };
        }

        const profile = mapRowToPlatformUser(json);
        authLog('fetchPlatformUser:success', { email: profile.email, role: profile.role, source, via: 'admin-api' });
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
          if (error) {
            authLog('bootstrap:getSessionError', error.message);
            if (isInvalidJwtSessionMessage(error.message)) {
              try {
                await supabaseConsole.auth.signOut({ scope: 'local' });
                authLog('bootstrap:clearedStaleAuthStorage');
              } catch {
                /* ignore */
              }
            }
            s = null;
          } else {
            s = data?.session ?? null;
          }
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

    try {
      await supabaseConsole.auth.signOut({ scope: 'local' });
    } catch {
      /* evita sessão/refresh token antigo atrapalhar o próximo login */
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
