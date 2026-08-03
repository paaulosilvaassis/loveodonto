import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

function resolveAnonKey() {
  return String(
    process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_APP_ANON_KEY
    || process.env.VITE_SUPABASE_PLATFORM_ANON_KEY
    || process.env.VITE_CONSOLE_SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || '',
  ).trim();
}

/**
 * Cliente Auth com anon key — obrigatório para resetPasswordForEmail disparar SMTP do Supabase.
 * O client service_role NÃO envia e-mails de recuperação/convite de forma confiável.
 */
export function getSupabaseAuthPublicClient() {
  if (cachedClient) return cachedClient;

  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = resolveAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      'SUPABASE_ANON_KEY ausente no backend. '
      + 'Configure SUPABASE_ANON_KEY (ou VITE_SUPABASE_APP_ANON_KEY na raiz) para envio de e-mails via Auth SMTP.',
    );
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

export function hasSupabaseAuthPublicClient() {
  return Boolean(String(process.env.SUPABASE_URL || '').trim() && resolveAnonKey());
}
