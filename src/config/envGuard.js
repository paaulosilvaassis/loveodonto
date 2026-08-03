import { emitStabilityLog } from '../services/stabilityLogService.js';
import { getAdminApiBaseConfigError, getConfiguredAdminApiBaseUrl } from './adminApiBase.js';

function toTrimmed(value) {
  return String(value || '').trim();
}

function safeHost(url) {
  const raw = toTrimmed(url);
  if (!raw) return '';
  try {
    return new URL(raw).host;
  } catch {
    return '';
  }
}

function hasLikelyKey(value) {
  return toTrimmed(value).length >= 20;
}

export function collectEnvSnapshot() {
  const platformUrl = toTrimmed(import.meta.env.VITE_SUPABASE_PLATFORM_URL);
  const platformAnonKey = toTrimmed(import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY);
  const appUrl = toTrimmed(
    import.meta.env.VITE_SUPABASE_APP_URL
    || import.meta.env.VITE_SUPABASE_URL
    || platformUrl,
  );
  const appAnonKey = toTrimmed(
    import.meta.env.VITE_SUPABASE_APP_ANON_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || platformAnonKey,
  );
  const backendUrl = getConfiguredAdminApiBaseUrl();
  const consoleUrl = toTrimmed(import.meta.env.VITE_CONSOLE_SUPABASE_URL);
  const consoleAnonKey = toTrimmed(import.meta.env.VITE_CONSOLE_SUPABASE_ANON_KEY);

  return {
    appUrl,
    appAnonKey,
    platformUrl,
    platformAnonKey,
    backendUrl,
    consoleUrl,
    consoleAnonKey,
    hosts: {
      app: safeHost(appUrl),
      platform: safeHost(platformUrl),
      console: safeHost(consoleUrl),
    },
  };
}

export function validateCriticalEnv() {
  const env = collectEnvSnapshot();
  const issues = [];

  if (!env.platformUrl) issues.push('VITE_SUPABASE_PLATFORM_URL ausente.');
  if (!hasLikelyKey(env.platformAnonKey)) {
    issues.push('VITE_SUPABASE_PLATFORM_ANON_KEY ausente ou inválida.');
  }
  if (!env.appUrl) {
    issues.push('VITE_SUPABASE_APP_URL (ou VITE_SUPABASE_URL / fallback PLATFORM) ausente.');
  }
  if (!hasLikelyKey(env.appAnonKey)) {
    issues.push('VITE_SUPABASE_APP_ANON_KEY (ou VITE_SUPABASE_ANON_KEY / fallback PLATFORM) ausente ou inválida.');
  }

  if (env.hosts.console && env.hosts.app && env.hosts.console !== env.hosts.app) {
    issues.push('Supabase do App e Console apontam para hosts diferentes.');
  }
  if (env.hosts.console && env.hosts.platform && env.hosts.console !== env.hosts.platform) {
    issues.push('Supabase da plataforma e Console apontam para hosts diferentes.');
  }

  const backendConfigError = getAdminApiBaseConfigError();
  if (import.meta.env.PROD && backendConfigError) {
    issues.push(backendConfigError);
  }

  const ok = issues.length === 0;
  emitStabilityLog(ok ? 'SUPABASE_CONFIG_OK' : 'SUPABASE_CONFIG_FAILED', {
    ok,
    issues,
    hosts: env.hosts,
    hasBackendUrl: Boolean(env.backendUrl),
  });

  return { ok, issues, env };
}

