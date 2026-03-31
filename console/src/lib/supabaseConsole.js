import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_CONSOLE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_CONSOLE_SUPABASE_ANON_KEY;
const authMode = (import.meta.env.VITE_CONSOLE_AUTH_MODE || 'supabase').toLowerCase();

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
  authMode,
  url,
  hasUrl: Boolean(url),
  hasAnonKey: Boolean(anonKey),
  isUrlValid: isValidHttpUrl(url),
  usesPlaceholder: hasPlaceholder(url) || hasPlaceholder(anonKey),
};

const shouldUseSupabase = authMode !== 'local'
  && supabaseConsoleConfig.hasUrl
  && supabaseConsoleConfig.hasAnonKey
  && supabaseConsoleConfig.isUrlValid
  && !supabaseConsoleConfig.usesPlaceholder;

export const supabaseConsole = shouldUseSupabase
  ? createClient(url, anonKey)
  : null;
