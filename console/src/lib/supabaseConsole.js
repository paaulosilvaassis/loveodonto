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

let clientInstance = null;

export function getSupabaseConsole() {
  if (!supabaseReady) return null;
  if (!clientInstance) {
    clientInstance = createClient(getSupabaseConsoleRequestBaseUrl(), anonKey, {
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
