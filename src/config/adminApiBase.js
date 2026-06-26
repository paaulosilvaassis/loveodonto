/**
 * URL base da Admin API (backend SaaS, porta 3001 em dev).
 * Produção: obrigatório VITE_PLATFORM_API_BASE_URL ou VITE_APP_ADMIN_API_BASE_URL (URL pública).
 * Desenvolvimento: vazio = proxy Vite em /internal/app → 127.0.0.1:3001.
 */

export const DEV_ADMIN_API_ORIGIN = 'http://127.0.0.1:3001';

/** Mensagem padrão quando a Admin API local (:3001) não está acessível. */
export const DEV_BACKEND_NOT_RUNNING_MSG =
  'Admin API local indisponível (porta 3001). Na raiz do projeto, rode npm run dev para subir o app e o backend juntos.';

export const PROD_BACKEND_MISCONFIGURED_MSG =
  'Backend SaaS não configurado em produção. Configure VITE_PLATFORM_API_BASE_URL com a URL pública do backend.';

export const PROD_BACKEND_ENV_EMPTY_MSG =
  'Variável de ambiente do backend não configurada. Defina VITE_PLATFORM_API_BASE_URL (ou VITE_APP_ADMIN_API_BASE_URL) no deploy com a URL pública da Admin API.';

function normalizeEnvString(value) {
  return String(value ?? '').trim();
}

function stripTrailingSlash(url) {
  return normalizeEnvString(url).replace(/\/+$/, '');
}

export function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isLocalhostBackendUrl(url) {
  const raw = normalizeEnvString(url);
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(raw);
  }
}

/** Valor bruto das envs (sem fallback em produção). */
export function getConfiguredAdminApiBaseUrl() {
  return stripTrailingSlash(
    import.meta.env.VITE_APP_ADMIN_API_BASE_URL
    || import.meta.env.VITE_PLATFORM_API_BASE_URL
    || '',
  );
}

const FRONTEND_DEV_PORTS = new Set(['5176', '4176', '5177']);

export function isMisconfiguredFrontendApiUrl(url) {
  const raw = normalizeEnvString(url);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    if (FRONTEND_DEV_PORTS.has(port)) return true;
    if (typeof window !== 'undefined') {
      const origin = window.location.origin.replace(/\/+$/, '');
      if (raw.replace(/\/+$/, '') === origin) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Base efetiva para montar URLs: em dev, vazio = proxy relativo. */
export function resolveAdminApiBaseUrl() {
  const configured = getConfiguredAdminApiBaseUrl();
  if (import.meta.env.DEV && isMisconfiguredFrontendApiUrl(configured)) {
    if (import.meta.env?.DEV) {
      console.warn(
        '[Admin API] VITE_PLATFORM_API_BASE_URL aponta para o frontend — usando proxy /internal/app → :3001',
      );
    }
    return '';
  }
  return configured;
}

/**
 * Erro de configuração antes de qualquer fetch em produção; null se OK.
 */
export function getAdminApiBaseConfigError() {
  const configured = getConfiguredAdminApiBaseUrl();

  if (import.meta.env.PROD) {
    if (!configured) {
      return PROD_BACKEND_ENV_EMPTY_MSG;
    }
    if (isLocalhostBackendUrl(configured)) {
      return PROD_BACKEND_MISCONFIGURED_MSG;
    }
    if (!isValidHttpUrl(configured)) {
      return 'VITE_PLATFORM_API_BASE_URL deve ser uma URL http(s) válida da Admin API em produção.';
    }
  }

  return null;
}

export function assertAdminApiFetchAllowed() {
  const configError = getAdminApiBaseConfigError();
  if (configError) {
    throw new Error(configError);
  }
}

export function buildAdminApiUrl(path) {
  const normalizedPath = String(path || '').trim();
  const suffix = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

  if (import.meta.env.PROD) {
    assertAdminApiFetchAllowed();
    const base = getConfiguredAdminApiBaseUrl();
    return `${base}${suffix}`;
  }

  const base = resolveAdminApiBaseUrl();
  if (base) {
    return `${base}${suffix}`;
  }

  return suffix;
}

/** Mensagem quando o snapshot do tenant estoura o tempo limite. */
export function getTenantSnapshotTimeoutMessage() {
  const hint = import.meta.env.PROD
    ? formatAdminApiNetworkError()
    : DEV_BACKEND_NOT_RUNNING_MSG;
  return `Tempo esgotado ao carregar dados da clínica. ${hint}`;
}

export function getDevDirectAdminApiUrl(path) {
  const normalizedPath = String(path || '').trim();
  const suffix = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${DEV_ADMIN_API_ORIGIN}${suffix}`;
}

/** Mensagem de rede; em produção não menciona localhost nem npm scripts. */
export function formatAdminApiNetworkError({ primaryUrl } = {}) {
  const configError = getAdminApiBaseConfigError();
  if (configError) return configError;

  if (import.meta.env.PROD) {
    return (
      'Não foi possível conectar ao backend SaaS. '
      + 'Verifique VITE_PLATFORM_API_BASE_URL e se a Admin API está publicada e acessível.'
    );
  }

  return DEV_BACKEND_NOT_RUNNING_MSG;
}

export function formatAdminApiServerError(status) {
  if (import.meta.env.PROD) {
    return `O backend SaaS não respondeu (HTTP ${status}). Verifique o deploy da Admin API.`;
  }
  if (status === 502 || status === 503 || status === 504) {
    return DEV_BACKEND_NOT_RUNNING_MSG;
  }
  return `O backend SaaS não respondeu (HTTP ${status}). ${DEV_BACKEND_NOT_RUNNING_MSG}`;
}

/** Indica se o erro em dev é falha de conexão com a Admin API local. */
export function isDevBackendUnreachableError(err) {
  if (!import.meta.env.DEV) return false;
  const m = String(err?.message || '').toLowerCase();
  return (
    m.includes('3001')
    || m.includes('econnrefused')
    || m.includes('failed to fetch')
    || m.includes('network')
    || m.includes('não foi possível conectar')
    || m.includes('não respondeu')
    || m.includes('backend saas')
    || m.includes('backend local')
    || m.includes('proxy /internal')
    || m === DEV_BACKEND_NOT_RUNNING_MSG.toLowerCase()
  );
}
