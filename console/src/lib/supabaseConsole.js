import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_CONSOLE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_CONSOLE_SUPABASE_ANON_KEY;

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

const hasUrl = Boolean(url && String(url).trim());
const hasAnonKey = Boolean(anonKey && String(anonKey).trim());
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
