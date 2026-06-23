import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import { getTenant } from './tenantService.js';
import {
  createDefaultModuleMap,
  isModuleEnabled,
  normalizeModuleKey,
} from '../tenant/tenantAccess.js';
import { emitStabilityLog } from './stabilityLogService.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  formatAdminApiNetworkError,
  formatAdminApiServerError,
  getConfiguredAdminApiBaseUrl,
  getDevDirectAdminApiUrl,
  isDevBackendUnreachableError,
} from '../config/adminApiBase.js';

function parseJsonSafe(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );
}

function buildModuleMap(rows = []) {
  const map = {};
  if (!Array.isArray(rows) || rows.length === 0) return createDefaultModuleMap();
  rows.forEach((row) => {
    const key = normalizeModuleKey(row?.module_key);
    if (!key) return;
    map[key] = Boolean(row?.enabled !== false);
  });
  return map;
}

function buildFeatureFlags(globalRows = [], tenantRows = []) {
  const map = {};
  globalRows.forEach((row) => {
    const key = String(row?.flag_key || '').trim();
    if (!key) return;
    map[key] = Boolean(row?.enabled);
  });
  tenantRows.forEach((row) => {
    const key = String(row?.flag_key || '').trim();
    if (!key) return;
    map[key] = Boolean(row?.enabled);
  });
  return map;
}

function getTenantContextRequestUrl() {
  return buildAdminApiUrl('/internal/app/tenant-context');
}

function isLikelyNetworkFetchFailure(error) {
  if (String(error?.name || '') === 'AbortError') return true;
  const lower = String(error?.message || '').toLowerCase();
  return (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('fetch failed')
    || lower.includes('network request failed')
    || lower.includes('load failed')
    || lower.includes('abort')
  );
}

async function runQuery(queryFactory) {
  try {
    const result = await queryFactory();
    return result;
  } catch (error) {
    throw error;
  }
}

async function fetchTenantContextViaAdminApiAttempt() {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para carregar contexto da clínica.');
  }
  const fetchOpts = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  const urls = [];
  if (import.meta.env.DEV && !getConfiguredAdminApiBaseUrl()) {
    urls.push(getDevDirectAdminApiUrl('/internal/app/tenant-context'));
  }
  urls.push(getTenantContextRequestUrl());

  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, fetchOpts);
      let json;
      try {
        json = await response.json();
      } catch (parseErr) {
        if (isTransientTenantContextError(parseErr)) throw parseErr;
        json = {};
      }
      if (!response.ok) {
        emitStabilityLog('BACKEND_FAILED', {
          status: response.status,
          url,
          backendBaseConfigured: Boolean(getConfiguredAdminApiBaseUrl()),
        });
        if (response.status === 401) {
          throw new Error(
            json?.error
            || 'Sua sessão SaaS não foi aceita pelo backend local. '
              + 'Alinhe `VITE_SUPABASE_PLATFORM_*` no app com `SUPABASE_URL` no server (mesmo projeto Supabase).',
          );
        }
        if (response.status === 404) {
          throw new Error(
            json?.error
            || 'Usuário sem vínculo em tenant_users ou clínica inexistente. '
              + 'Provisione a clínica na Platform Console (5177) antes de usar o app.',
          );
        }
        if (response.status === 502 || response.status === 503 || response.status === 504 || response.status >= 500) {
          throw new Error(json?.error || formatAdminApiServerError(response.status));
        }
        throw new Error(json?.error || `Erro HTTP ${response.status} ao carregar contexto da clínica.`);
      }
      emitStabilityLog('BACKEND_OK', {
        url,
        backendBaseConfigured: Boolean(getConfiguredAdminApiBaseUrl()),
      });
      return json;
    } catch (error) {
      lastError = error;
      if (!isTransientTenantContextError(error)) throw error;
    }
  }
  if (lastError) {
    if (isLikelyNetworkFetchFailure(lastError)) {
      throw new Error(formatAdminApiNetworkError({ primaryUrl: urls[0] }));
    }
    throw lastError;
  }
  throw new Error('Falha ao carregar contexto da clínica.');
}

function isTransientTenantContextError(err) {
  if (String(err?.name || '') === 'AbortError') return true;
  const m = String(err?.message || '').toLowerCase();
  return (
    m.includes('abort')
    || m.includes('failed to fetch')
    || m.includes('network')
    || m.includes('3001')
    || m.includes('não respondeu')
    || m.includes('502')
    || m.includes('503')
    || m.includes('504')
  );
}

async function fetchTenantContextViaAdminApiInternal() {
  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 450 * attempt));
    }
    try {
      return await fetchTenantContextViaAdminApiAttempt();
    } catch (err) {
      lastErr = err;
      if (!isTransientTenantContextError(err) || attempt === maxAttempts - 1) {
        throw err;
      }
    }
  }
  throw lastErr;
}

let inFlightTenantContextApi = null;

async function fetchTenantContextViaAdminApi() {
  if (!inFlightTenantContextApi) {
    inFlightTenantContextApi = fetchTenantContextViaAdminApiInternal().finally(() => {
      inFlightTenantContextApi = null;
    });
  }
  return inFlightTenantContextApi;
}

async function fetchOptionalTenantLimits(tenantId) {
  const client = supabasePlatformClient;
  const { data, error } = await client
    .from('tenant_limits')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    if (String(error.code || '').toUpperCase() === 'PGRST205') {
      return null;
    }
    const message = String(error.message || '').toLowerCase();
    if (message.includes('relation') && message.includes('does not exist')) {
      return null;
    }
    throw error;
  }
  return data || null;
}

function resolveLimits(limitsRow, subscription) {
  if (limitsRow) {
    return parseJsonSafe(limitsRow.limits_json, {});
  }

  const metadata = parseJsonSafe(subscription?.metadata, {});
  if (metadata?.limits && typeof metadata.limits === 'object') {
    return metadata.limits;
  }
  if (subscription?.limits_json && typeof subscription.limits_json === 'object') {
    return subscription.limits_json;
  }
  return {};
}

export async function getTenantContext(tenantId) {
  if (!tenantId) {
    throw new Error('Clínica não informada para carregar o contexto.');
  }
  if (!supabasePlatformClient || !isUuid(tenantId)) {
    const tenant = getTenant(tenantId);
    const warnings = [];
    const status = String(tenant?.status || '').toLowerCase();
    if (status === 'blocked') warnings.push('Clínica bloqueada');
    if (status === 'suspended') warnings.push('Clínica suspensa');
    if (String(tenant?.billing_status || '').toLowerCase() === 'overdue') {
      warnings.push('Existem pendências de cobrança');
    }
    return {
      tenant: tenant || null,
      modules: createDefaultModuleMap(),
      flags: {},
      limits: {},
      subscription: null,
      warnings,
    };
  }

  let apiContext;
  try {
    apiContext = await runQuery(() => fetchTenantContextViaAdminApi());
  } catch (err) {
    const useSupabaseFallback =
      isDevBackendUnreachableError(err) || isTransientTenantContextError(err);
    if (useSupabaseFallback) {
      if (import.meta.env?.DEV) {
        console.debug('[tenant-context] Admin API falhou — fallback Supabase direto:', err?.message);
      }
      apiContext = null;
    } else {
      throw err;
    }
  }
  if (apiContext?.tenant) {
    emitStabilityLog('TENANT_CONTEXT_OK', {
      source: 'backend',
      tenantId: String(apiContext?.tenant?.id || tenantId),
    });
    return {
      tenant: apiContext.tenant || null,
      modules: apiContext.modules || createDefaultModuleMap(),
      flags: apiContext.flags || {},
      limits: apiContext.limits || {},
      subscription: apiContext.subscription || null,
      warnings: Array.isArray(apiContext.warnings) ? apiContext.warnings : [],
      currentUser: apiContext.currentUser || null,
    };
  }

  const client = supabasePlatformClient;

  const [
    tenantResult,
    modulesResult,
    globalFlagsResult,
    tenantFlagsResult,
    subscriptionResult,
    limitsRow,
  ] = await Promise.all([
    runQuery(() => client.from('tenants').select('*').eq('id', tenantId).maybeSingle()),
    runQuery(() => client.from('tenant_modules').select('*').eq('tenant_id', tenantId)),
    runQuery(() => client.from('feature_flags').select('*').eq('scope_type', 'global')),
    runQuery(() => client.from('feature_flags').select('*').eq('scope_type', 'tenant').eq('scope_ref', tenantId)),
    runQuery(() => client.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(1).maybeSingle()),
    runQuery(() => fetchOptionalTenantLimits(tenantId)),
  ]);

  if (tenantResult.error) throw tenantResult.error;
  if (modulesResult.error) throw modulesResult.error;
  if (globalFlagsResult.error) throw globalFlagsResult.error;
  if (tenantFlagsResult.error) throw tenantFlagsResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;

  const tenant = tenantResult.data;
  if (!tenant) {
    return {
      tenant: null,
      modules: createDefaultModuleMap(),
      flags: {},
      limits: {},
      subscription: null,
      warnings: [],
    };
  }

  const modules = buildModuleMap(modulesResult.data || []);
  const flags = buildFeatureFlags(globalFlagsResult.data || [], tenantFlagsResult.data || []);
  const subscription = subscriptionResult.data || null;
  const limits = resolveLimits(limitsRow, subscription);
  const warnings = [];
  const status = String(tenant.status || '').toLowerCase();
  if (status === 'blocked') warnings.push('Clínica bloqueada');
  if (status === 'suspended') warnings.push('Clínica suspensa');
  if (String(tenant.billing_status || '').toLowerCase() === 'overdue') {
    warnings.push('Existem pendências de cobrança');
  }
  return {
    tenant,
    modules,
    flags,
    limits,
    subscription,
    warnings,
  };
}

export function canTenantUseModule(tenantContext, moduleName) {
  return isModuleEnabled(tenantContext?.modules, moduleName);
}

export function subscribeTenantRealtimeChanges(tenantId, onChange) {
  if (!supabasePlatformClient || !tenantId) return () => {};
  const channel = supabasePlatformClient
    .channel(`tenant-context-${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants', filter: `id=eq.${tenantId}` }, (payload) => {
      onChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_modules', filter: `tenant_id=eq.${tenantId}` }, (payload) => {
      onChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_subscriptions', filter: `tenant_id=eq.${tenantId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, onChange)
    .subscribe();

  return () => {
    supabasePlatformClient.removeChannel(channel);
  };
}
