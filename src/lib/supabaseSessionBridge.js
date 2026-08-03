/**
 * Bridge de sessão Platform → App (mesmo projeto Supabase).
 *
 * Motivo: login SaaS vive em `supabasePlatformClient` (storageKey próprio).
 * Repositories (`collaborators`, etc.) usam `supabaseAppClient`. Sem sync,
 * PostgREST recebe role `anon` → 42501 (permission denied).
 *
 * Regras:
 * - Só sincroniza quando APP e PLATFORM são o mesmo project ref.
 * - Nunca concede privilégios a `anon`.
 * - Idempotente (não reaplica o mesmo access_token).
 * - Em projetos diferentes: no-op explícito.
 */

import { emitStabilityLog } from '../services/stabilityLogService.js';

/** @type {string | null} */
let lastSyncedAccessToken = null;
/** @type {Promise<object> | null} */
let syncInFlight = null;
let bridgeStarted = false;
/** @type {{ unsubscribe?: () => void } | null} */
let bridgeSubscription = null;

export function extractSupabaseProjectRefFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

export function getClientSupabaseUrl(client) {
  if (!client) return '';
  return String(client.supabaseUrl || client.restUrl || '').trim();
}

export function areClientsSameSupabaseProject(platformClient, appClient) {
  if (!platformClient || !appClient) return false;
  const platformRef = extractSupabaseProjectRefFromUrl(getClientSupabaseUrl(platformClient));
  const appRef = extractSupabaseProjectRefFromUrl(getClientSupabaseUrl(appClient));
  return Boolean(platformRef && appRef && platformRef === appRef);
}

/**
 * Propaga sessão do platform client para o app client (setSession).
 * @param {{
 *   platformClient?: import('@supabase/supabase-js').SupabaseClient | null,
 *   appClient?: import('@supabase/supabase-js').SupabaseClient | null,
 *   session?: { access_token?: string, refresh_token?: string } | null,
 *   reason?: string,
 * }} [options]
 */
export async function propagatePlatformSessionToAppClient(options = {}) {
  const {
    platformClient,
    appClient,
    session: sessionHint = null,
    reason = 'manual',
  } = options;

  if (!platformClient || !appClient) {
    return { ok: false, skipped: true, reason: 'missing_client' };
  }

  if (!areClientsSameSupabaseProject(platformClient, appClient)) {
    return {
      ok: false,
      skipped: true,
      reason: 'different_project',
      platformRef: extractSupabaseProjectRefFromUrl(getClientSupabaseUrl(platformClient)),
      appRef: extractSupabaseProjectRefFromUrl(getClientSupabaseUrl(appClient)),
    };
  }

  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    try {
      let session = sessionHint;
      if (!session?.access_token || !session?.refresh_token) {
        const { data, error } = await platformClient.auth.getSession();
        if (error) {
          return { ok: false, skipped: false, reason: 'get_session_error', message: error.message };
        }
        session = data?.session || null;
      }

      if (!session?.access_token || !session?.refresh_token) {
        lastSyncedAccessToken = null;
        return { ok: true, skipped: true, reason: 'no_platform_session' };
      }

      if (lastSyncedAccessToken === session.access_token) {
        return { ok: true, skipped: true, reason: 'already_synced', syncReason: reason };
      }

      const { data: appData } = await appClient.auth.getSession();
      const appToken = appData?.session?.access_token || null;
      if (appToken && appToken === session.access_token) {
        lastSyncedAccessToken = session.access_token;
        return { ok: true, skipped: true, reason: 'app_already_has_token', syncReason: reason };
      }

      const { error: setError } = await appClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (setError) {
        emitStabilityLog('SUPABASE_SESSION_BRIDGE_FAILED', {
          reason,
          message: setError.message,
        });
        return { ok: false, skipped: false, reason: 'set_session_error', message: setError.message };
      }

      lastSyncedAccessToken = session.access_token;
      emitStabilityLog('SUPABASE_SESSION_BRIDGE_OK', { reason });
      return { ok: true, skipped: false, reason: 'synced', syncReason: reason };
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/**
 * Limpa sessão do app client quando no mesmo projeto (logout / SIGNED_OUT).
 */
export async function clearAppClientSessionIfSameProject(options = {}) {
  const { platformClient, appClient, reason = 'logout' } = options;
  if (!areClientsSameSupabaseProject(platformClient, appClient)) {
    return { ok: true, skipped: true, reason: 'different_project' };
  }
  lastSyncedAccessToken = null;
  if (!appClient) return { ok: true, skipped: true, reason: 'missing_app_client' };
  await appClient.auth.signOut({ scope: 'local' }).catch(() => {});
  emitStabilityLog('SUPABASE_SESSION_BRIDGE_CLEARED', { reason });
  return { ok: true, skipped: false, reason: 'cleared' };
}

/**
 * Inicia listener único Platform → App. Idempotente.
 * @returns {{ started: boolean, skipped?: boolean, reason?: string }}
 */
export function startSupabaseSessionBridge({ platformClient, appClient } = {}) {
  if (bridgeStarted) {
    return { started: true, alreadyStarted: true };
  }
  if (!platformClient || !appClient) {
    return { started: false, skipped: true, reason: 'missing_client' };
  }
  if (!areClientsSameSupabaseProject(platformClient, appClient)) {
    emitStabilityLog('SUPABASE_SESSION_BRIDGE_SKIPPED', {
      reason: 'different_project',
      platformRef: extractSupabaseProjectRefFromUrl(getClientSupabaseUrl(platformClient)),
      appRef: extractSupabaseProjectRefFromUrl(getClientSupabaseUrl(appClient)),
    });
    return { started: false, skipped: true, reason: 'different_project' };
  }

  bridgeStarted = true;

  void propagatePlatformSessionToAppClient({
    platformClient,
    appClient,
    reason: 'bootstrap',
  });

  const { data: { subscription } } = platformClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      void clearAppClientSessionIfSameProject({
        platformClient,
        appClient,
        reason: 'SIGNED_OUT',
      });
      return;
    }
    if (
      event === 'INITIAL_SESSION'
      || event === 'SIGNED_IN'
      || event === 'TOKEN_REFRESHED'
      || event === 'USER_UPDATED'
    ) {
      void propagatePlatformSessionToAppClient({
        platformClient,
        appClient,
        session,
        reason: event,
      });
    }
  });

  bridgeSubscription = subscription;
  return { started: true, skipped: false };
}

/** Somente testes — reseta estado do singleton do bridge. */
export function __resetSupabaseSessionBridgeForTests() {
  bridgeStarted = false;
  lastSyncedAccessToken = null;
  syncInFlight = null;
  if (bridgeSubscription?.unsubscribe) {
    try {
      bridgeSubscription.unsubscribe();
    } catch {
      /* ignore */
    }
  }
  bridgeSubscription = null;
}
