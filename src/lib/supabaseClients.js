/**
 * Dois clientes Supabase para separar App (clínicas) e Platform (painel).
 * - App: orçamentos e dados opcionais do app (storageKey padrão)
 * - Platform: auth + dados do painel (storageKey próprio para não conflitar sessões)
 *
 * Dev e produção usam a URL pública absoluta (`VITE_SUPABASE_*`).
 * Não há proxy `/__supabase` no app — evita 404 por path sem rewrite.
 */
import { createClient } from '@supabase/supabase-js';
import { validateCriticalEnv } from '../config/envGuard.js';
import { emitStabilityLog } from '../services/stabilityLogService.js';
import { extractSupabaseProjectRefFromUrl } from './supabaseSessionBridge.js';

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

/**
 * Evita `Unexpected end of JSON input` quando a borda devolve 404/500 com corpo vazio.
 * Devolve Response JSON tipada para o supabase-js consumir sem quebrar o parse.
 */
export async function supabaseSafeFetch(input, init) {
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

const platformUrl = normalizeEnvString(import.meta.env.VITE_SUPABASE_PLATFORM_URL);
const platformKey = normalizeEnvString(import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY);

const appUrl = normalizeEnvString(
  import.meta.env.VITE_SUPABASE_APP_URL
  || import.meta.env.VITE_SUPABASE_URL
  || platformUrl,
);
const appKey = normalizeEnvString(
  import.meta.env.VITE_SUPABASE_APP_ANON_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || platformKey,
);

const envValidation = validateCriticalEnv();
if (!envValidation.ok && import.meta.env?.DEV) {
  console.warn('[STABILITY] Env crítico inválido', envValidation.issues);
}

const sharedClientOptions = {
  global: {
    fetch: supabaseSafeFetch,
  },
};

export const supabaseAppClient =
  appUrl && appKey
    ? createClient(appUrl, appKey, {
        ...sharedClientOptions,
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
        ...sharedClientOptions,
        auth: {
          storageKey: 'appgestaoodonto-platform-auth',
          persistSession: true,
          autoRefreshToken: true,
          // Tokens de convite/recovery são processados manualmente em firstAccessSession.js.
          // Evita corrida com AuthContext/hydrateSaasUser que consumiria o link antes da senha.
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null;

// Alias para compatibilidade com código que importa supabase (app)
export const supabase = supabaseAppClient;

export const supabasePlatformProjectRef = extractSupabaseProjectRefFromUrl(platformUrl);
export const supabaseAppProjectRef = extractSupabaseProjectRefFromUrl(appUrl);
export const supabaseClientsSameProject =
  Boolean(supabasePlatformProjectRef)
  && Boolean(supabaseAppProjectRef)
  && supabasePlatformProjectRef === supabaseAppProjectRef;

if (!supabasePlatformClient && !supabaseAppClient) {
  emitStabilityLog('SUPABASE_CONFIG_FAILED', {
    hasAppClient: Boolean(supabaseAppClient),
    hasPlatformClient: Boolean(supabasePlatformClient),
  });
} else if (
  import.meta.env?.DEV
  && supabasePlatformClient
  && supabaseAppClient
  && !supabaseClientsSameProject
) {
  emitStabilityLog('SUPABASE_CLIENTS_HOST_MISMATCH', {
    platformRef: supabasePlatformProjectRef,
    appRef: supabaseAppProjectRef,
    hint: 'Session bridge Platform→App fica desligado até alinhar VITE_SUPABASE_APP_URL ao PLATFORM.',
  });
}
