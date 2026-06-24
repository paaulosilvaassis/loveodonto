import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { buildResolvedSaasUser, getPlatformAccessToken, readPlatformAccessTokenFromStorage } from '../auth/saasSessionResolver.js';
import { normalizeSaasBootstrapRole } from '../utils/rbacHelpers.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  getDevDirectAdminApiUrl,
  getConfiguredAdminApiBaseUrl,
} from '../config/adminApiBase.js';

function mapSaasAuthError(error) {
  const message = String(error?.message || error || '').trim();
  const lower = message.toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  if (
    code === 'invalid_credentials'
    || lower.includes('invalid login credentials')
    || lower.includes('email not confirmed')
  ) {
    return 'E-mail ou senha inválidos.';
  }
  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('network request failed')
    || lower.includes('fetch failed')
  ) {
    return (
      'Não foi possível conectar ao Supabase para autenticar. '
      + 'Verifique VITE_SUPABASE_PLATFORM_URL, chave pública e sua conexão de rede.'
    );
  }
  return message || 'Falha no login SaaS.';
}

function normalizeRole(value) {
  return normalizeSaasBootstrapRole(value);
}

export { normalizeRole };

export function isSaasModeEnabled() {
  const hasPlatformClient = Boolean(import.meta.env.VITE_SUPABASE_PLATFORM_URL)
    && Boolean(import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY);
  return (
    import.meta.env.VITE_ACCESS_SAAS_ENABLED === '1'
    || hasPlatformClient
  );
}

function isRetryableBootstrapError(error) {
  const name = String(error?.name || '');
  const lower = String(error?.message || error || '').toLowerCase();
  return (
    name === 'AbortError'
    || lower.includes('abort')
    || lower.includes('timeout')
    || lower.includes('tempo limite')
    || lower.includes('failed to fetch')
    || lower.includes('network')
  );
}

let inFlightBootstrap = null;

async function fetchSaasAccessBootstrapViaAdminApi(client, session = null) {
  assertAdminApiFetchAllowed();
  const accessToken =
    session?.access_token
    || readPlatformAccessTokenFromStorage()
    || await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para carregar acesso da clínica.');
  }
  const fetchOpts = {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  };
  const urls = [];
  if (import.meta.env.DEV && !getConfiguredAdminApiBaseUrl()) {
    urls.push(getDevDirectAdminApiUrl('/internal/app/tenant-context'));
  }
  urls.push(buildAdminApiUrl('/internal/app/tenant-context'));

  let lastErr;
  for (const url of urls) {
    try {
      const response = await fetch(url, fetchOpts);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || `Erro HTTP ${response.status} ao carregar acesso da clínica.`);
      }
      const tenantId = json?.tenant?.id || json?.access?.tenantId || null;
      if (!tenantId) {
        throw new Error('Seu usuário não está vinculado a nenhuma clínica ativa.');
      }
      return {
        tenantId,
        role: normalizeRole(json?.currentUser?.role || json?.access?.role),
        isActive: json?.access?.isActive !== false,
        fullName: String(json?.currentUser?.fullName || json?.currentUser?.full_name || '').trim(),
      };
    } catch (err) {
      lastErr = err;
      if (!isRetryableBootstrapError(err)) throw err;
    }
  }
  throw lastErr || new Error('Falha ao carregar acesso da clínica.');
}

async function fetchSaasAccessBootstrapViaRpc(client) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => { setTimeout(resolve, 400 * attempt); });
    }
    try {
      const { data, error } = await client.rpc('get_app_user_tenant_access');
      if (error) {
        throw new Error(error.message || 'Falha ao carregar acesso SaaS da clínica.');
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.tenant_id) {
        throw new Error('Seu usuário não está vinculado a nenhuma clínica ativa.');
      }
      return {
        tenantId: row.tenant_id,
        role: normalizeRole(row.role),
        isActive: row.is_active !== false,
      };
    } catch (err) {
      lastError = err;
      if (!isRetryableBootstrapError(err) || attempt === 2) break;
    }
  }
  throw lastError || new Error('Falha ao carregar acesso SaaS da clínica.');
}

async function fetchSaasAccessBootstrapInternal(client = supabasePlatformClient, session = null) {
  if (!client) {
    throw new Error('Supabase da plataforma não configurado para o modo SaaS.');
  }
  const activeSession = session || (await client.auth.getSession()).data?.session || null;

  if (activeSession?.access_token) {
    try {
      return await fetchSaasAccessBootstrapViaAdminApi(client, activeSession);
    } catch (adminErr) {
      if (!isRetryableBootstrapError(adminErr)) throw adminErr;
    }
  }

  try {
    return await fetchSaasAccessBootstrapViaRpc(client);
  } catch (rpcErr) {
    if (activeSession?.access_token) {
      return fetchSaasAccessBootstrapViaAdminApi(client, activeSession);
    }
    throw rpcErr;
  }
}

export async function fetchSaasAccessBootstrap(client = supabasePlatformClient, session = null) {
  if (!inFlightBootstrap) {
    inFlightBootstrap = fetchSaasAccessBootstrapInternal(client, session).finally(() => {
      inFlightBootstrap = null;
    });
  }
  return inFlightBootstrap;
}

export async function signInSaasWithPassword(email, password) {
  const client = supabasePlatformClient;
  if (!client) {
    throw new Error('Supabase da plataforma não configurado para login SaaS.');
  }
  const { data: signData, error: signError } = await client.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password,
  });
  if (signError) {
    throw new Error(mapSaasAuthError(signError));
  }
  const activeSession = signData?.session || null;
  if (!activeSession?.access_token) {
    throw new Error('Sessão SaaS ausente após login.');
  }

  let bootstrap;
  try {
    bootstrap = await fetchSaasAccessBootstrapViaAdminApi(client, activeSession);
  } catch (adminErr) {
    if (import.meta.env?.DEV) {
      console.debug('[signInSaas] bootstrap via Admin API falhou, tentando RPC:', adminErr?.message);
    }
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    bootstrap = await fetchSaasAccessBootstrapViaRpc(client);
  }

  if (!bootstrap.isActive) {
    await client.auth.signOut();
    throw new Error('Seu acesso a esta clínica está desativado.');
  }
  const resolvedUser = activeSession?.user?.id
    ? buildResolvedSaasUser(activeSession, bootstrap)
    : null;
  return {
    authUserId: signData?.user?.id || activeSession?.user?.id || '',
    email: signData?.user?.email || activeSession?.user?.email || '',
    userMetadata: signData?.user?.user_metadata || activeSession?.user?.user_metadata || {},
    tenantId: bootstrap.tenantId,
    role: bootstrap.role,
    isActive: bootstrap.isActive,
    session: activeSession,
    resolvedUser,
  };
}
