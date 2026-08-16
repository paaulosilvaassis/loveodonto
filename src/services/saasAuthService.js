import { supabasePlatformClient } from '../lib/supabaseClients.js';
import {
  buildResolvedSaasUser,
  getPlatformAccessToken,
  readPlatformAccessTokenFromStorage,
  recoverFromStalePlatformAuth,
} from '../auth/saasSessionResolver.js';
import {
  hasPersistedPlatformAuth,
  isLoginBlockedByStaleAuth,
  isStaleRefreshAuthError,
} from '../auth/saasAuthStorage.js';
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
    lower.includes('unexpected end of json')
    || lower.includes('invalid_http_response')
    || lower.includes('sem json válido')
    || lower.includes('corpo vazio')
  ) {
    const statusMatch = message.match(/HTTP\s+(\d{3})/i);
    const status = statusMatch?.[1] || error?.status || '';
    return status
      ? `Falha na autenticação Supabase (HTTP ${status}): resposta sem JSON válido.`
      : 'Falha na autenticação Supabase: resposta sem JSON válido.';
  }
  const hasPlatformConfig = Boolean(import.meta.env.VITE_SUPABASE_PLATFORM_URL)
    && Boolean(import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY);
  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('network request failed')
    || lower.includes('fetch failed')
    || lower.includes('unexpected token')
    || lower.includes('<!doctype')
  ) {
    if (hasPlatformConfig) {
      return (
        'Supabase Auth está indisponível no momento (falha de rede/data plane). '
        + 'A configuração pública do app está presente; tente novamente em instantes.'
      );
    }
    return (
      'Não foi possível conectar ao Supabase para autenticar. '
      + 'Verifique VITE_SUPABASE_PLATFORM_URL, chave pública e sua conexão de rede.'
    );
  }
  return message || 'Falha no login SaaS.';
}

/** Lê JSON de Response sem lançar em corpo vazio / non-JSON; preserva status HTTP. */
async function readResponseJsonSafe(response) {
  const status = Number(response?.status) || 0;
  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
  const raw = await response.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    const err = new Error(`Resposta HTTP ${status} com corpo vazio.`);
    err.status = status;
    err.code = 'empty_http_body';
    throw err;
  }
  const looksJson = contentType.includes('application/json')
    || trimmed.startsWith('{')
    || trimmed.startsWith('[');
  if (!looksJson) {
    const err = new Error(`Resposta HTTP ${status} sem JSON válido.`);
    err.status = status;
    err.code = 'invalid_http_response';
    throw err;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const err = new Error(`Resposta HTTP ${status} com JSON inválido.`);
    err.status = status;
    err.code = 'invalid_json_body';
    throw err;
  }
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
      let json = {};
      try {
        json = await readResponseJsonSafe(response);
      } catch (parseErr) {
        if (!response.ok) {
          throw new Error(
            `Erro HTTP ${response.status} ao carregar acesso da clínica `
            + `(${parseErr?.code || 'invalid_response'}).`,
          );
        }
        throw parseErr;
      }
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
        collaboratorId: json?.currentUser?.collaboratorId
          || json?.access?.collaboratorId
          || json?.currentUser?.collaborator_id
          || json?.access?.collaborator_id
          || null,
        has_custom_permissions: json?.currentUser?.has_custom_permissions === true,
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
        collaboratorId: row.collaborator_id || row.collaboratorId || null,
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

  // Evita refresh stale competindo com o password grant (RC-03.4/RC-03.5).
  if (hasPersistedPlatformAuth()) {
    await recoverFromStalePlatformAuth().catch(() => {});
  }

  const attemptSignIn = async () => {
    const { data: signData, error: signError } = await client.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password,
    });
    if (signError) {
      throw signError;
    }
    return signData;
  };

  let signData;
  try {
    signData = await attemptSignIn();
  } catch (error) {
    const blockedByStale = isLoginBlockedByStaleAuth(error, {
      hasPlatformAuth: hasPersistedPlatformAuth(),
    });
    if (isStaleRefreshAuthError(error) || blockedByStale) {
      await recoverFromStalePlatformAuth();
      try {
        signData = await attemptSignIn();
      } catch (retryErr) {
        throw new Error(mapSaasAuthError(retryErr));
      }
    } else {
      throw new Error(mapSaasAuthError(error));
    }
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

export function getPasswordResetRedirectUrl() {
  const explicit = String(import.meta.env.VITE_PASSWORD_RESET_REDIRECT_TO || '').trim();
  if (explicit) return explicit;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5176';
  return `${origin.replace(/\/+$/, '')}/redefinir-senha`;
}

export async function requestSelfServicePasswordReset(email) {
  const client = supabasePlatformClient;
  if (!client) {
    throw new Error('Recuperação de senha indisponível no momento.');
  }
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Informe um e-mail válido.');
  }
  const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: getPasswordResetRedirectUrl(),
  });
  if (error) {
    const lower = String(error.message || '').toLowerCase();
    if (lower.includes('rate') || lower.includes('too many')) {
      throw new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
    }
    throw new Error('Não foi possível enviar o e-mail. Tente novamente.');
  }
  return { email: normalizedEmail };
}
