import { createClient } from '@supabase/supabase-js';

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

const url = normalizeEnvString(import.meta.env.VITE_CONSOLE_SUPABASE_URL);
/** Aceita anon JWT (eyJ…) ou publishable (sb_publishable_…); nomes alternativos no Vercel. */
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

const hasUrl = Boolean(url);
const hasAnonKey = Boolean(anonKey);
const isUrlValid = isValidHttpUrl(url);
const hasTruncatedKey = hasEllipsisPlaceholder(anonKey);
const keyKind = anonKey.startsWith('sb_publishable_') ? 'publishable' : anonKey.startsWith('eyJ') ? 'jwt' : 'other';
const keyLength = anonKey.length;
let urlHost = '';
try {
  urlHost = new URL(String(url || '')).hostname;
} catch {
  urlHost = '';
}

export const supabaseConsoleConfig = {
  url,
  hasUrl,
  hasAnonKey,
  isUrlValid,
  hasTruncatedKey,
};

export const supabaseConsoleDebug = {
  hasUrl,
  hasAnonKey,
  isUrlValid,
  keyKind,
  keyLength,
  urlHost,
};

export function getConsoleSupabaseConfigError() {
  if (!supabaseConsoleConfig.hasUrl || !supabaseConsoleConfig.hasAnonKey) {
    return (
      'Defina VITE_CONSOLE_SUPABASE_URL e uma chave pública: VITE_CONSOLE_SUPABASE_ANON_KEY '
      + '(JWT anon) ou VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…). Faça um novo deploy após alterar.'
    );
  }
  if (!supabaseConsoleConfig.isUrlValid) {
    return 'VITE_CONSOLE_SUPABASE_URL deve ser uma URL http(s) válida.';
  }
  if (supabaseConsoleConfig.hasTruncatedKey) {
    return 'A chave pública do Supabase está truncada (termina com "..."). Cole o valor completo no Vercel e faça novo deploy.';
  }
  return null;
}

const supabaseReady =
  supabaseConsoleConfig.hasUrl
  && supabaseConsoleConfig.hasAnonKey
  && supabaseConsoleConfig.isUrlValid
  && !supabaseConsoleConfig.hasTruncatedKey;

export const supabaseConsole = supabaseReady ? createClient(url, anonKey) : null;
