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

function hasPlaceholder(value) {
  const normalized = String(value || '').toLowerCase();
  return !normalized || normalized.includes('xxx') || normalized.includes('...');
}

export const supabaseConsoleConfig = {
  url,
  hasUrl: Boolean(url),
  hasAnonKey: Boolean(anonKey),
  isUrlValid: isValidHttpUrl(url),
  usesPlaceholder: hasPlaceholder(url) || hasPlaceholder(anonKey),
};

export function getConsoleSupabaseConfigError() {
  if (!supabaseConsoleConfig.hasUrl || !supabaseConsoleConfig.hasAnonKey) {
    return 'Defina VITE_CONSOLE_SUPABASE_URL e VITE_CONSOLE_SUPABASE_ANON_KEY no ambiente da Console.';
  }
  if (!supabaseConsoleConfig.isUrlValid) {
    return 'VITE_CONSOLE_SUPABASE_URL deve ser uma URL http(s) válida.';
  }
  if (supabaseConsoleConfig.usesPlaceholder) {
    return 'Substitua os placeholders em VITE_CONSOLE_SUPABASE_URL e VITE_CONSOLE_SUPABASE_ANON_KEY pelos valores reais do projeto Supabase da Console.';
  }
  return null;
}

const supabaseReady =
  supabaseConsoleConfig.hasUrl
  && supabaseConsoleConfig.hasAnonKey
  && supabaseConsoleConfig.isUrlValid
  && !supabaseConsoleConfig.usesPlaceholder;

export const supabaseConsole = supabaseReady ? createClient(url, anonKey) : null;
