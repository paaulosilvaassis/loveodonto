import { createClient } from '@supabase/supabase-js';

const DEV_SUPABASE_PROXY_PATH = '/__supabase';

/** Remove aspas envolventes comuns ao colar variáveis no Vercel (.env). */
function normalizeEnvString(value) {
  let s = String(value ?? '').trim();
  if (s.length >= 2) {
    const q0 = s[0];
    const q1 = s[s.length - 1];
    if ((q0 === '"' && q1 === '"') || (q0 === "'" && q1 === "'")) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}

const remoteUrl = normalizeEnvString(import.meta.env.VITE_CONSOLE_SUPABASE_URL);
/** Aceita anon JWT (eyJ…) ou publishable (sb_publishable_…). */
const anonKey = normalizeEnvString(
  import.meta.env.VITE_CONSOLE_SUPABASE_ANON_KEY
    || import.meta.env.VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY,
);

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/** Detecta chave truncada por placeholder de documentação (ex.: sb_publishable_xxx...). */
function hasEllipsisPlaceholder(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return s.endsWith('...') || s.endsWith('…');
}

const hasUrl = Boolean(remoteUrl);
const hasAnonKey = Boolean(anonKey);
const isUrlValid = isValidHttpUrl(remoteUrl);
const hasTruncatedKey = hasEllipsisPlaceholder(anonKey);

export const supabaseConsoleConfig = {
  /** URL remota do projeto (diagnóstico). */
  url: remoteUrl,
  hasUrl,
  hasAnonKey,
  isUrlValid,
  hasTruncatedKey,
};

const envHint = import.meta.env.DEV
  ? 'Arquivo: console/.env. Reinicie o Vite após alterar. Suba com: npm run console:dev'
  : 'No Vercel (Environment Variables), faça um novo deploy após alterar.';

export function getConsoleSupabaseConfigError() {
  if (!supabaseConsoleConfig.hasUrl || !supabaseConsoleConfig.hasAnonKey) {
    return (
      'Defina VITE_CONSOLE_SUPABASE_URL e uma chave pública: VITE_CONSOLE_SUPABASE_ANON_KEY '
      + '(JWT anon eyJ…) ou VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…). '
      + envHint
    );
  }
  if (!supabaseConsoleConfig.isUrlValid) {
    return 'VITE_CONSOLE_SUPABASE_URL deve ser uma URL http(s) válida.';
  }
  if (supabaseConsoleConfig.hasTruncatedKey) {
    return (
      'A chave pública do Supabase está truncada ou é placeholder (termina com "..."). '
      + 'Cole a chave completa em VITE_CONSOLE_SUPABASE_ANON_KEY (ou VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY). '
      + envHint
    );
  }
  return null;
}

export const supabaseReady =
  supabaseConsoleConfig.hasUrl
  && supabaseConsoleConfig.hasAnonKey
  && supabaseConsoleConfig.isUrlValid
  && !supabaseConsoleConfig.hasTruncatedKey;

/**
 * Base URL usada pelo browser para Auth/API.
 * Em dev, passa pelo proxy Vite (/__supabase) para evitar "Failed to fetch" no Windows.
 * O vite.config.js remove o prefixo `/__supabase` antes de encaminhar ao host remoto.
 */
export function getSupabaseConsoleRequestBaseUrl() {
  if (import.meta.env.DEV && remoteUrl && typeof window !== 'undefined') {
    return `${window.location.origin}${DEV_SUPABASE_PROXY_PATH}`;
  }
  return remoteUrl;
}

/** Mesma chave pública do `createClient` — ex. header `apikey` em login REST de fallback. */
export function getConsoleSupabasePublicKey() {
  return anonKey;
}

/**
 * Lê JSON sem lançar em corpo vazio / non-JSON. Preserva status HTTP no Error.
 * @returns {Promise<object|null>}
 */
export async function readResponseJsonSafe(response, { allowEmpty = false } = {}) {
  const status = Number(response?.status) || 0;
  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
  const raw = await response.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    if (allowEmpty) return null;
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

/**
 * Fetch para o supabase-js: evita `Unexpected end of JSON input` em 404/500 vazios.
 */
export async function supabaseConsoleSafeFetch(input, init) {
  const response = await fetch(input, init);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const raw = await response.text();
  const trimmed = raw.trim();
  const looksJson = contentType.includes('application/json')
    || trimmed.startsWith('{')
    || trimmed.startsWith('[');

  if (trimmed && looksJson) {
    return new Response(raw, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const message = trimmed
    ? `Resposta HTTP ${response.status} sem JSON válido do Supabase.`
    : `Resposta HTTP ${response.status} com corpo vazio do Supabase.`;

  return new Response(
    JSON.stringify({
      error: 'invalid_http_response',
      msg: message,
      message,
      status: response.status,
    }),
    {
      status: response.status || 502,
      statusText: response.statusText || 'Bad Gateway',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  );
}

let clientInstance = null;

export function getSupabaseConsole() {
  if (!supabaseReady) return null;
  if (!clientInstance) {
    clientInstance = createClient(getSupabaseConsoleRequestBaseUrl(), anonKey, {
      global: {
        fetch: supabaseConsoleSafeFetch,
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return clientInstance;
}

/** @deprecated Use getSupabaseConsole() — mantido para imports legados. */
export const supabaseConsole = {
  get auth() {
    return getSupabaseConsole()?.auth ?? null;
  },
};
