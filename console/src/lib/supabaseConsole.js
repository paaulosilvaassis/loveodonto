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

/**
 * Detecta só placeholders óbvios de documentação.
 * NÃO usar includes('xxx') na URL completa: o ref do projeto (.supabase.co) é aleatório e pode conter "xxx".
 */
function isPlaceholderSupabaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === 'xxx.supabase.co') return true;
  } catch {
    return false;
  }
  const lower = raw.toLowerCase().replace(/\/$/, '');
  return lower === 'https://xxx.supabase.co' || lower === 'http://xxx.supabase.co';
}

/**
 * Chaves reais: JWT anon (eyJ…) ou publishable (sb_publishable_…).
 * Rejeita apenas literais de exemplo, não substrings genéricas.
 */
function isPlaceholderAnonKey(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower === 'eyj...' || lower === 'eyj…') return true;
  if (lower === 'sb_publishable_...' || lower === 'sb_publishable_…') return true;
  if (lower === 'your_anon_key' || lower === 'sua_chave_anon' || lower === 'sua-chave-anon') return true;
  return false;
}

const hasUrl = Boolean(url && String(url).trim());
const hasAnonKey = Boolean(anonKey && String(anonKey).trim());
const isUrlValid = isValidHttpUrl(url);
const usesPlaceholder = isPlaceholderSupabaseUrl(url) || isPlaceholderAnonKey(anonKey);

export const supabaseConsoleConfig = {
  url,
  hasUrl,
  hasAnonKey,
  isUrlValid,
  usesPlaceholder,
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
