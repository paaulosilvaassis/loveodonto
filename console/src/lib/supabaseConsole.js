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
const anonKey = normalizeEnvString(import.meta.env.VITE_CONSOLE_SUPABASE_ANON_KEY);

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

const hasUrl = Boolean(url);
const hasAnonKey = Boolean(anonKey);
const isUrlValid = isValidHttpUrl(url);

export const supabaseConsoleConfig = {
  url,
  hasUrl,
  hasAnonKey,
  isUrlValid,
};

export function getConsoleSupabaseConfigError() {
  if (!supabaseConsoleConfig.hasUrl || !supabaseConsoleConfig.hasAnonKey) {
    return 'Defina VITE_CONSOLE_SUPABASE_URL e VITE_CONSOLE_SUPABASE_ANON_KEY no ambiente da Console (e faça um novo deploy após alterar).';
  }
  if (!supabaseConsoleConfig.isUrlValid) {
    return 'VITE_CONSOLE_SUPABASE_URL deve ser uma URL http(s) válida.';
  }
  return null;
}

const supabaseReady =
  supabaseConsoleConfig.hasUrl
  && supabaseConsoleConfig.hasAnonKey
  && supabaseConsoleConfig.isUrlValid;

export const supabaseConsole = supabaseReady ? createClient(url, anonKey) : null;
