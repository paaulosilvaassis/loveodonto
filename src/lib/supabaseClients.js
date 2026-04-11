/**
 * Dois clientes Supabase para separar App (clínicas) e Platform (painel).
 * - App: orçamentos e dados opcionais do app (storageKey padrão)
 * - Platform: auth + dados do painel (storageKey próprio para não conflitar sessões)
 */
import { createClient } from '@supabase/supabase-js';

const appUrl = import.meta.env.VITE_SUPABASE_APP_URL || import.meta.env.VITE_SUPABASE_URL;
const appKey = import.meta.env.VITE_SUPABASE_APP_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

const platformUrl = import.meta.env.VITE_SUPABASE_PLATFORM_URL;
const platformKey = import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY;

export const supabaseAppClient =
  appUrl && appKey
    ? createClient(appUrl, appKey)
    : null;

export const supabasePlatformClient =
  platformUrl && platformKey
    ? createClient(platformUrl, platformKey, {
        auth: {
          storageKey: 'appgestaoodonto-platform-auth',
          persistSession: true,
        },
      })
    : null;

// #region agent log
fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run2',hypothesisId:'H12',location:'src/lib/supabaseClients.js:module',message:'Supabase clients config snapshot',data:{hasAppUrl:Boolean(appUrl),hasAppKey:Boolean(appKey),hasPlatformUrl:Boolean(platformUrl),hasPlatformKey:Boolean(platformKey),hasPlatformClient:Boolean(supabasePlatformClient)},timestamp:Date.now()})}).catch(()=>{});
// #endregion

// Alias para compatibilidade com código que importa supabase (app)
export const supabase = supabaseAppClient;
