import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import { getTenant } from './tenantService.js';
import {
  createDefaultModuleMap,
  isModuleEnabled,
  normalizeModuleKey,
} from '../tenant/tenantAccess.js';
import { emitStabilityLog } from './stabilityLogService.js';
import { tenantAudit, startTenantAuditTimer } from './tenantAuditLog.js';
import { normalizeClinicProfileForClient } from '../utils/clinicLogo.js';
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
    || lower.includes('tempo esgotado')
  );
}

function shouldUseSupabaseFallback(err) {
  if (isDevBackendUnreachableError(err)) return true;
  if (isTransientTenantContextError(err)) return true;
  if (String(err?.name || '') === 'AbortError') return true;
  const lower = String(err?.message || '').toLowerCase();
  return lower.includes('tempo esgotado') || lower.includes('não foi possível conectar');
}

const TENANT_CONTEXT_FETCH_TIMEOUT_MS = 8000;

function formatHttpTenantError(response, json, fallback) {
  const code = json?.code ? ` (${json.code})` : '';
  const msg = json?.error || fallback;
  return `[HTTP ${response.status}]${code} ${msg}`;
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
  const elapsed = startTenantAuditTimer();
  tenantAudit('TENANT_API', {
    source: 'tenant_users',
    status: 'start',
    extra: { endpoint: '/internal/app/tenant-context' },
  });
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
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), TENANT_CONTEXT_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...fetchOpts, signal: controller.signal });
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
          throw new Error(formatHttpTenantError(
            response,
            json,
            'Sua sessão SaaS não foi aceita pelo backend. '
              + 'Alinhe `VITE_SUPABASE_PLATFORM_*` no app com `SUPABASE_URL` no server (mesmo projeto Supabase).',
          ));
        }
        if (response.status === 404) {
          throw new Error(formatHttpTenantError(
            response,
            json,
            'Usuário sem vínculo em tenant_users ou clínica inexistente. '
              + 'Provisione a clínica na Platform Console (5177) antes de usar o app.',
          ));
        }
        if (response.status === 422 && json?.code === 'TENANT_PROFILE_MISSING') {
          const err = new Error(formatHttpTenantError(response, json, 'Clínica não configurada para este usuário.'));
          err.code = 'TENANT_PROFILE_MISSING';
          throw err;
        }
        if (response.status === 403 && json?.code === 'TENANT_PROFILE_MISMATCH') {
          const err = new Error(formatHttpTenantError(response, json, 'Perfil da clínica inconsistente com o vínculo do usuário.'));
          err.code = 'TENANT_PROFILE_MISMATCH';
          throw err;
        }
        if (response.status === 403) {
          throw new Error(formatHttpTenantError(response, json, 'Acesso negado à clínica.'));
        }
        if (response.status === 502 || response.status === 503 || response.status === 504 || response.status >= 500) {
          throw new Error(formatHttpTenantError(response, json, formatAdminApiServerError(response.status)));
        }
        throw new Error(formatHttpTenantError(response, json, 'Erro ao carregar contexto da clínica.'));
      }
      emitStabilityLog('BACKEND_OK', {
        url,
        backendBaseConfigured: Boolean(getConfiguredAdminApiBaseUrl()),
      });
      tenantAudit('TENANT_API', {
        tenant_id: json?.tenant?.id || json?.tenantId || null,
        role: json?.currentUser?.role || null,
        source: 'tenant_users',
        duration_ms: elapsed(),
        status: 'ok',
      });
      return json;
    } catch (error) {
      lastError = error;
      if (!isTransientTenantContextError(error)) {
        tenantAudit('TENANT_API', {
          source: 'tenant_users',
          duration_ms: elapsed(),
          status: 'error',
          error: String(error?.message || error),
        });
        throw error;
      }
    } finally {
      clearTimeout(abortTimer);
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

function buildClinicIdFromTenant(tenantId) {
  return `clinic-${String(tenantId || '').slice(0, 8)}`;
}

function buildClinicProfileFromTenantRow(tenantRow) {
  const tenantId = String(tenantRow?.id || '').trim();
  if (!tenantId) return null;
  const tradeName = String(tenantRow?.trade_name || '').trim();
  const legalName = String(tenantRow?.legal_name || '').trim();
  const displayName = tradeName || legalName || 'Minha Clínica';
  return {
    id: buildClinicIdFromTenant(tenantId),
    tenant_id: tenantId,
    clinic_id: buildClinicIdFromTenant(tenantId),
    name: displayName,
    fantasy_name: tradeName || displayName,
    legal_name: legalName || tradeName || displayName,
    logo_url: String(tenantRow?.logo_url || '').trim() || null,
    email: String(tenantRow?.owner_email || '').trim() || null,
    phone: String(tenantRow?.phone || '').trim() || null,
    cnpj: String(tenantRow?.cnpj || '').trim() || null,
    status: String(tenantRow?.status || 'active').trim() || 'active',
  };
}

function mapClinicProfileRow(row, tenantRow) {
  if (!row?.tenant_id) return buildClinicProfileFromTenantRow(tenantRow);
  const tenantId = String(row.tenant_id).trim();
  const name = String(row.name || row.fantasy_name || tenantRow?.trade_name || '').trim() || 'Minha Clínica';
  return {
    id: String(row.id || buildClinicIdFromTenant(tenantId)).trim(),
    tenant_id: tenantId,
    clinic_id: buildClinicIdFromTenant(tenantId),
    name,
    fantasy_name: String(row.fantasy_name || tenantRow?.trade_name || name).trim() || name,
    legal_name: String(row.legal_name || tenantRow?.legal_name || name).trim() || name,
    logo_url: String(row.logo_url || '').trim() || null,
    email: String(row.email || tenantRow?.owner_email || '').trim() || null,
    phone: String(row.phone || tenantRow?.phone || '').trim() || null,
    cnpj: String(row.cnpj || tenantRow?.cnpj || '').trim() || null,
    status: String(row.status || tenantRow?.status || 'active').trim() || 'active',
  };
}

function isMissingClinicProfilesTableError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === 'PGRST205'
    || code === '42P01'
    || (message.includes('relation') && message.includes('clinic_profiles'))
  );
}

async function fetchOptionalClinicProfile(client, tenantId, tenantRow) {
  if (!client || !tenantId || !tenantRow) return null;
  try {
    const { data, error } = await client
      .from('clinic_profiles')
      .select('id, tenant_id, name, fantasy_name, legal_name, logo_url, email, phone, cnpj, status')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error && !isMissingClinicProfilesTableError(error)) throw error;
    if (error) return buildClinicProfileFromTenantRow(tenantRow);
    return mapClinicProfileRow(data, tenantRow) || buildClinicProfileFromTenantRow(tenantRow);
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.debug('[tenant-context] clinic_profiles fallback:', err?.message);
    }
    return buildClinicProfileFromTenantRow(tenantRow);
  }
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
    if (shouldUseSupabaseFallback(err)) {
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
      clinicProfile: normalizeClinicProfileForClient(apiContext.clinicProfile),
      modules: apiContext.modules || createDefaultModuleMap(),
      flags: apiContext.flags || {},
      limits: apiContext.limits || {},
      subscription: apiContext.subscription || null,
      warnings: Array.isArray(apiContext.warnings) ? apiContext.warnings : [],
      currentUser: apiContext.currentUser || null,
      teamRoster: Array.isArray(apiContext.teamRoster) ? apiContext.teamRoster : [],
      access: apiContext.access || null,
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
  const clinicProfile = normalizeClinicProfileForClient(
    await fetchOptionalClinicProfile(client, tenantId, tenant),
  );
  return {
    tenant,
    clinicProfile,
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_profiles', filter: `tenant_id=eq.${tenantId}` }, onChange)
    .subscribe();

  return () => {
    supabasePlatformClient.removeChannel(channel);
  };
}
