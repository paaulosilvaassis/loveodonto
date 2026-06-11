/**
 * Dois clientes Supabase para separar App (clínicas) e Platform (painel).
 * - App: orçamentos e dados opcionais do app (storageKey padrão)
 * - Platform: auth + dados do painel (storageKey próprio para não conflitar sessões)
 */
import { createClient } from '@supabase/supabase-js';
import { validateCriticalEnv } from '../config/envGuard.js';
import { emitStabilityLog } from '../services/stabilityLogService.js';

const appUrl = import.meta.env.VITE_SUPABASE_APP_URL || import.meta.env.VITE_SUPABASE_URL;
const appKey = import.meta.env.VITE_SUPABASE_APP_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

const platformUrl = import.meta.env.VITE_SUPABASE_PLATFORM_URL;
const platformKey = import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY;

const envValidation = validateCriticalEnv();
if (!envValidation.ok && import.meta.env?.DEV) {
  console.warn('[STABILITY] Env crítico inválido', envValidation.issues);
}

export const supabaseAppClient =
  appUrl && appKey
    ? createClient(appUrl, appKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const supabasePlatformClient =
  platformUrl && platformKey
    ? createClient(platformUrl, platformKey, {
        auth: {
          storageKey: 'appgestaoodonto-platform-auth',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

// Alias para compatibilidade com código que importa supabase (app)
export const supabase = supabaseAppClient;

if (!supabasePlatformClient || !supabaseAppClient) {
  emitStabilityLog('SUPABASE_CONFIG_FAILED', {
    hasAppClient: Boolean(supabaseAppClient),
    hasPlatformClient: Boolean(supabasePlatformClient),
  });
}
