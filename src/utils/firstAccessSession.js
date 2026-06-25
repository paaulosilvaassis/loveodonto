/**
 * Bootstrap de sessão Supabase para /primeiro-acesso.
 * Suporta PKCE (?code=), implicit (hash tokens) e setSession manual.
 */

const DEFAULT_MAX_WAIT_MS = 5000;
const DEFAULT_RETRY_MS = 250;
const PLATFORM_AUTH_STORAGE_KEY = 'appgestaoodonto-platform-auth';

export const FIRST_ACCESS_PUBLIC_PATHS = [
  '/primeiro-acesso',
  '/redefinir-senha',
  '/aceitar-termos',
  '/activate',
  '/convite',
];

export const EXPIRED_LINK_MESSAGE = 'Este link já foi usado ou expirou. Solicite um novo acesso.';
export const STALE_AUTH_USER_MESSAGE = 'Este convite pertence a um usuário antigo. Gere um novo convite pela Console.';
export const NO_TOKEN_MESSAGE = 'Abra o link de primeiro acesso enviado por e-mail para definir sua senha. Esse link contém seu acesso seguro à plataforma.';

/** Bloqueia hidratação/logout destrutivo enquanto a senha não foi salva. */
let firstAccessPasswordPending = false;

export function markFirstAccessPasswordPending(active) {
  firstAccessPasswordPending = Boolean(active);
}

export function isPrimeiroAcessoPath(pathname) {
  let path = pathname;
  if (path == null && typeof window !== 'undefined' && window.location?.pathname) {
    path = window.location.pathname;
  }
  return path === '/primeiro-acesso' || path === '/redefinir-senha';
}

export function isRedefinirSenhaPath(pathname) {
  let path = pathname;
  if (path == null && typeof window !== 'undefined' && window.location?.pathname) {
    path = window.location.pathname;
  }
  return path === '/redefinir-senha';
}

/** Proteção estrita: AuthContext não pode deslogar/resolver tenant durante primeiro acesso. */
export function isFirstAccessProtected(locationLike = typeof window !== 'undefined' ? window.location : { pathname: '' }) {
  if (isPrimeiroAcessoPath(locationLike.pathname)) return true;
  return firstAccessPasswordPending;
}

export function auditFirstAccess(phase, payload = {}) {
  const onPrimeiroAcesso = typeof window !== 'undefined'
    && window.location?.pathname
    && isPrimeiroAcessoPath(window.location.pathname);
  const enabled = onPrimeiroAcesso
    || import.meta.env?.DEV
    || import.meta.env?.VITE_FIRST_ACCESS_AUDIT === '1';
  if (!enabled) return;

  const urlState = typeof window !== 'undefined' ? parseAuthCallbackFromUrl() : {};
  const entry = {
    phase,
    pathname: typeof window !== 'undefined' ? window.location?.pathname ?? null : null,
    href: urlState.href || null,
    hashPresent: Boolean(urlState.hasHash),
    searchPresent: Boolean(urlState.search && urlState.search.length > 1),
    codePresent: Boolean(urlState.code),
    sessionUserId: payload.sessionUserId ?? payload.userId ?? null,
    sessionUserEmail: payload.sessionUserEmail ?? payload.email ?? null,
    setSessionError: payload.setSessionError ?? null,
    updateUserError: payload.updateUserError ?? null,
    updateUserSuccess: payload.updateUserSuccess ?? null,
    ...payload,
  };

  if (import.meta.env?.DEV) {
    console.debug('[FIRST_ACCESS_AUDIT]', entry);
  } else {
    console.info('[FIRST_ACCESS_AUDIT]', entry);
  }
}

export function classifyFirstAccessError(error) {
  const raw = String(error?.message || error || '').trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes('user from sub claim')
    || (lower.includes('jwt') && lower.includes('does not exist'))
    || lower.includes('user not found')
  ) {
    auditFirstAccess('stale_auth_user_token', { error: raw });
    return { code: 'stale_auth_user', message: STALE_AUTH_USER_MESSAGE };
  }

  if (
    lower.includes('invalid or has expired')
    || lower.includes('link is invalid')
    || lower.includes('otp_expired')
    || lower.includes('email link')
    || lower.includes('token has expired')
    || lower.includes('one-time token')
  ) {
    return { code: 'expired_link', message: EXPIRED_LINK_MESSAGE };
  }

  return { code: 'unknown', message: raw || EXPIRED_LINK_MESSAGE };
}

export function parseAuthCallbackFromUrl(locationLike) {
  const loc = locationLike
    ?? (typeof window !== 'undefined' && window.location ? window.location : { href: '', search: '', hash: '' });
  const href = loc.href || '';
  const search = loc.search || '';
  const hash = loc.hash || '';
  const searchParams = new URLSearchParams(search);
  const hashParams = hash.startsWith('#') ? new URLSearchParams(hash.slice(1)) : new URLSearchParams();

  return {
    href,
    search,
    hash,
    hasHash: hash.length > 1,
    code: searchParams.get('code') || hashParams.get('code'),
    accessToken: hashParams.get('access_token'),
    refreshToken: hashParams.get('refresh_token'),
    type: hashParams.get('type') || searchParams.get('type'),
    error: hashParams.get('error') || searchParams.get('error'),
    errorDescription: hashParams.get('error_description') || searchParams.get('error_description'),
  };
}

export function hasSupabaseAuthCallback(locationLike = window.location) {
  const parsed = parseAuthCallbackFromUrl(locationLike);
  return Boolean(
    parsed.code
    || (parsed.accessToken && parsed.refreshToken)
    || parsed.error,
  );
}

export function isPublicAuthPath(pathname = window.location.pathname) {
  return FIRST_ACCESS_PUBLIC_PATHS.includes(pathname);
}

/** Evita hidratação SaaS destrutiva durante convite/recovery/PKCE em rotas públicas. */
export function isFirstAccessFlow(locationLike = window.location) {
  if (isPrimeiroAcessoPath(locationLike.pathname)) return true;
  if (hasSupabaseAuthCallback(locationLike)) return true;
  return firstAccessPasswordPending;
}

export function buildPrimeiroAcessoPathWithAuth(locationLike = window.location) {
  const parsed = parseAuthCallbackFromUrl(locationLike);
  const targetPath = isRedefinirSenhaPath(locationLike.pathname) ? '/redefinir-senha' : '/primeiro-acesso';
  if (parsed.hasHash) return `${targetPath}${parsed.hash}`;
  if (parsed.code || parsed.search.includes('type=')) return `${targetPath}${parsed.search}`;
  return null;
}

/** Redireciona tokens que caíram em /login (Site URL) para rota de senha correta. */
export function resolvePrimeiroAcessoRedirect(locationLike = window.location) {
  if (isPrimeiroAcessoPath(locationLike.pathname)) return null;
  if (!hasSupabaseAuthCallback(locationLike)) return null;
  const parsed = parseAuthCallbackFromUrl(locationLike);
  const isRecovery = parsed.type === 'recovery';
  if (isRecovery) {
    if (parsed.hasHash) return `/redefinir-senha${parsed.hash}`;
    if (parsed.code || parsed.search.includes('type=')) return `/redefinir-senha${parsed.search}`;
    return '/redefinir-senha';
  }
  return buildPrimeiroAcessoPathWithAuth(locationLike);
}

export function clearAuthParamsFromUrl(pathname = '/login') {
  if (typeof window === 'undefined') return;
  window.history.replaceState({}, document.title, pathname);
}

export function clearPlatformAuthStorage() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PLATFORM_AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readSession(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

async function verifySessionUser(client, session) {
  const { data, error } = await client.auth.getUser();
  auditFirstAccess('getUser validation', {
    sessionUserId: data?.user?.id || session?.user?.id || null,
    sessionUserEmail: data?.user?.email || session?.user?.email || null,
    setSessionError: error?.message || null,
    ok: !error && Boolean(data?.user?.id),
  });
  if (error) {
    return { session: null, error };
  }
  if (!data?.user?.id) {
    return { session: null, error: new Error('Sessão inválida.') };
  }
  return { session: session || { user: data.user }, error: null };
}

async function waitForSession(client, maxWaitMs, retryMs) {
  const deadline = Date.now() + maxWaitMs;
  let resolvedByEvent = null;

  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    auditFirstAccess('onAuthStateChange', {
      event,
      sessionUserId: session?.user?.id || null,
      sessionUserEmail: session?.user?.email || null,
    });
    if (session?.user) resolvedByEvent = session;
  });

  try {
    while (Date.now() < deadline) {
      if (resolvedByEvent?.user) return resolvedByEvent;

      const session = await readSession(client);
      auditFirstAccess('getSession retry', {
        sessionUserId: session?.user?.id || null,
        sessionUserEmail: session?.user?.email || null,
      });
      if (session?.user) return session;

      await sleep(retryMs);
    }
    return null;
  } finally {
    subscription.unsubscribe();
  }
}

/**
 * Estabelece sessão a partir da URL atual ou storage.
 * Não limpa hash/query — isso ocorre só após senha salva com sucesso.
 * @returns {Promise<{ session: import('@supabase/supabase-js').Session | null, urlState: object, supabaseError: Error | null, errorCode: string | null }>}
 */
export async function bootstrapFirstAccessSession(client, options = {}) {
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const urlState = parseAuthCallbackFromUrl();

  auditFirstAccess('bootstrap start', {
    href: urlState.href,
    hashPresent: urlState.hasHash,
    searchPresent: Boolean(urlState.search && urlState.search.length > 1),
    codePresent: Boolean(urlState.code),
  });

  if (urlState.error) {
    const err = new Error(urlState.errorDescription || urlState.error);
    const classified = classifyFirstAccessError(err);
    auditFirstAccess('supabase callback error', {
      setSessionError: err.message,
      errorCode: classified.code,
    });
    return { session: null, urlState, supabaseError: err, errorCode: classified.code };
  }

  const hadAuthParams = Boolean(
    urlState.code
    || (urlState.accessToken && urlState.refreshToken)
    || urlState.hasHash,
  );

  if (urlState.code) {
    const { data, error } = await client.auth.exchangeCodeForSession(urlState.code);
    auditFirstAccess('exchangeCodeForSession', {
      setSessionError: error?.message || null,
      sessionUserId: data?.session?.user?.id || null,
      sessionUserEmail: data?.session?.user?.email || null,
    });
    if (error) {
      const classified = classifyFirstAccessError(error);
      return { session: null, urlState, supabaseError: error, errorCode: classified.code };
    }
    const verified = await verifySessionUser(client, data?.session);
    if (verified.error) {
      const classified = classifyFirstAccessError(verified.error);
      return { session: null, urlState, supabaseError: verified.error, errorCode: classified.code };
    }
    return { session: verified.session, urlState, supabaseError: null, errorCode: null };
  }

  if (urlState.accessToken && urlState.refreshToken) {
    const { data, error } = await client.auth.setSession({
      access_token: urlState.accessToken,
      refresh_token: urlState.refreshToken,
    });
    auditFirstAccess('setSession from hash', {
      setSessionError: error?.message || null,
      sessionUserId: data?.session?.user?.id || null,
      sessionUserEmail: data?.session?.user?.email || null,
    });
    if (error) {
      const classified = classifyFirstAccessError(error);
      return { session: null, urlState, supabaseError: error, errorCode: classified.code };
    }
    const verified = await verifySessionUser(client, data?.session);
    if (verified.error) {
      const classified = classifyFirstAccessError(verified.error);
      return { session: null, urlState, supabaseError: verified.error, errorCode: classified.code };
    }
    return { session: verified.session, urlState, supabaseError: null, errorCode: null };
  }

  if (hadAuthParams) {
    const session = await waitForSession(client, maxWaitMs, retryMs);
    auditFirstAccess('waitForSession', {
      sessionUserId: session?.user?.id || null,
      sessionUserEmail: session?.user?.email || null,
    });
    if (!session?.user) {
      return { session: null, urlState, supabaseError: null, errorCode: 'expired_link' };
    }
    const verified = await verifySessionUser(client, session);
    if (verified.error) {
      const classified = classifyFirstAccessError(verified.error);
      return { session: null, urlState, supabaseError: verified.error, errorCode: classified.code };
    }
    return { session: verified.session, urlState, supabaseError: null, errorCode: null };
  }

  const existing = await readSession(client);
  if (existing?.user) {
    const verified = await verifySessionUser(client, existing);
    if (verified.error) {
      const classified = classifyFirstAccessError(verified.error);
      try {
        await client.auth.signOut();
      } catch {
        /* não bloqueia mensagem ao usuário */
      }
      return { session: null, urlState, supabaseError: verified.error, errorCode: classified.code };
    }
    auditFirstAccess('existing session validated', {
      sessionUserId: verified.session?.user?.id || null,
      sessionUserEmail: verified.session?.user?.email || null,
    });
    return { session: verified.session, urlState, supabaseError: null, errorCode: null };
  }

  auditFirstAccess('session absent', { sessionAbsent: true, hadAuthParams: false });
  return { session: null, urlState, supabaseError: null, errorCode: null };
}

/** Logout limpo após senha definida — não toca tenant_users. */
export async function completeFirstAccess(client, clearAppSession) {
  auditFirstAccess('completeFirstAccess start', { updateUserSuccess: true });
  if (typeof clearAppSession === 'function') {
    clearAppSession();
  }
  clearPlatformAuthStorage();
  if (client) {
    try {
      await client.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  clearAuthParamsFromUrl('/login?firstAccess=success');
  if (typeof window !== 'undefined') {
    window.location.replace('/login?firstAccess=success');
  }
}

export async function bootstrapPasswordRecoverySession(client, options = {}) {
  return bootstrapFirstAccessSession(client, options);
}

/** Logout limpo após redefinição de senha. */
export async function completePasswordRecovery(client, clearAppSession) {
  auditFirstAccess('completePasswordRecovery start', { updateUserSuccess: true });
  if (typeof clearAppSession === 'function') {
    clearAppSession();
  }
  clearPlatformAuthStorage();
  if (client) {
    try {
      await client.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  clearAuthParamsFromUrl('/login?passwordReset=success');
  if (typeof window !== 'undefined') {
    window.location.replace('/login?passwordReset=success');
  }
}

if (typeof window !== 'undefined' && import.meta.env?.MODE !== 'test') {
  const syncTarget = resolvePrimeiroAcessoRedirect(window.location);
  if (syncTarget) {
    auditFirstAccess('redirecionamento executado', {
      from: window.location.href,
      to: syncTarget,
      reason: 'tokens Supabase fora de /primeiro-acesso',
    });
    window.location.replace(syncTarget);
  }
}
