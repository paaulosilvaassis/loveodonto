/**
 * Bootstrap de sessão Supabase para /primeiro-acesso.
 * Suporta PKCE (?code=), implicit (hash tokens) e setSession manual.
 */

const DEFAULT_MAX_WAIT_MS = 5000;
const DEFAULT_RETRY_MS = 250;

export const FIRST_ACCESS_PUBLIC_PATHS = [
  '/primeiro-acesso',
  '/aceitar-termos',
  '/activate',
  '/convite',
];

export function auditFirstAccess(phase, payload = {}) {
  const enabled = import.meta.env?.DEV || import.meta.env?.VITE_FIRST_ACCESS_AUDIT === '1';
  if (!enabled) return;
  const urlState = typeof window !== 'undefined' ? parseAuthCallbackFromUrl() : {};
  if (import.meta.env?.DEV) {
    console.debug('[FIRST_ACCESS_AUDIT]', phase, {
      pathname: typeof window !== 'undefined' ? window.location.pathname : null,
      href: urlState.href || null,
      search: urlState.search || null,
      hasHash: urlState.hasHash || false,
      hasAccessToken: Boolean(urlState.accessToken),
      hasRefreshToken: Boolean(urlState.refreshToken),
      hasCode: Boolean(urlState.code),
      type: urlState.type || null,
      ...payload,
    });
  }
}

export function parseAuthCallbackFromUrl(locationLike = window.location) {
  const href = locationLike.href || '';
  const search = locationLike.search || '';
  const hash = locationLike.hash || '';
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

/** Evita hidratação SaaS destrutiva durante convite/recovery/PKCE. */
export function isFirstAccessFlow(locationLike = window.location) {
  if (locationLike.pathname === '/primeiro-acesso') return true;
  if (hasSupabaseAuthCallback(locationLike)) return true;
  return false;
}

export function buildPrimeiroAcessoPathWithAuth(locationLike = window.location) {
  const parsed = parseAuthCallbackFromUrl(locationLike);
  if (parsed.hasHash) return `/primeiro-acesso${parsed.hash}`;
  if (parsed.code || parsed.search.includes('type=')) return `/primeiro-acesso${parsed.search}`;
  return null;
}

/** Redireciona tokens que caíram em /login (Site URL) para /primeiro-acesso. */
export function resolvePrimeiroAcessoRedirect(locationLike = window.location) {
  if (locationLike.pathname === '/primeiro-acesso') return null;
  if (!hasSupabaseAuthCallback(locationLike)) return null;
  return buildPrimeiroAcessoPathWithAuth(locationLike);
}

export function clearAuthParamsFromUrl() {
  if (typeof window === 'undefined') return;
  window.history.replaceState({}, document.title, `${window.location.pathname}`);
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

async function waitForSession(client, maxWaitMs, retryMs) {
  const deadline = Date.now() + maxWaitMs;
  let resolvedByEvent = null;

  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    auditFirstAccess('onAuthStateChange', {
      event,
      sessionCreated: Boolean(session?.user),
    });
    if (session?.user) resolvedByEvent = session;
  });

  try {
    while (Date.now() < deadline) {
      if (resolvedByEvent?.user) return resolvedByEvent;

      const session = await readSession(client);
      auditFirstAccess('getSession retry', { sessionCreated: Boolean(session?.user) });
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
 * @returns {Promise<{ session: import('@supabase/supabase-js').Session | null, urlState: object, supabaseError: Error | null }>}
 */
export async function bootstrapFirstAccessSession(client, options = {}) {
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const urlState = parseAuthCallbackFromUrl();

  auditFirstAccess('bootstrapFirstAccessSession start', {
    redirectExecuted: false,
  });

  if (urlState.error) {
    const err = new Error(urlState.errorDescription || urlState.error);
    auditFirstAccess('supabase callback error', { error: err.message, sessionCreated: false });
    return { session: null, urlState, supabaseError: err };
  }

  if (urlState.code) {
    const { data, error } = await client.auth.exchangeCodeForSession(urlState.code);
    auditFirstAccess('exchangeCodeForSession', {
      ok: !error,
      sessionCreated: Boolean(data?.session),
      error: error?.message || null,
    });
    if (error) return { session: null, urlState, supabaseError: error };
    if (data?.session) clearAuthParamsFromUrl();
    return { session: data?.session || null, urlState, supabaseError: null };
  }

  if (urlState.accessToken && urlState.refreshToken) {
    const { data, error } = await client.auth.setSession({
      access_token: urlState.accessToken,
      refresh_token: urlState.refreshToken,
    });
    auditFirstAccess('setSession from hash', {
      ok: !error,
      sessionCreated: Boolean(data?.session),
      error: error?.message || null,
    });
    if (error) return { session: null, urlState, supabaseError: error };
    if (data?.session) clearAuthParamsFromUrl();
    return { session: data?.session || null, urlState, supabaseError: null };
  }

  const existing = await readSession(client);
  if (existing?.user) {
    auditFirstAccess('existing session in storage', { sessionCreated: true });
    return { session: existing, urlState, supabaseError: null };
  }

  if (urlState.hasHash || urlState.code) {
    const session = await waitForSession(client, maxWaitMs, retryMs);
    auditFirstAccess('waitForSession', { sessionCreated: Boolean(session?.user) });
    if (session) clearAuthParamsFromUrl();
    return { session, urlState, supabaseError: null };
  }

  const session = await waitForSession(client, retryMs, retryMs);
  auditFirstAccess('final getSession', {
    sessionCreated: Boolean(session?.user),
    sessionAbsent: !session?.user,
  });
  return { session, urlState, supabaseError: null };
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
