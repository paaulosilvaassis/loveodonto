import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { getTenant } from './tenantService.js';
import {
  createDefaultModuleMap,
  isModuleEnabled,
  normalizeModuleKey,
} from '../tenant/tenantAccess.js';

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

async function runLoggedQuery(label, hypothesisId, queryFactory, dataBuilder = null, runId = 'timeout-debug') {
  const startedAt = Date.now();
  try {
    const result = await queryFactory();
    return result;
  } catch (error) {
    throw error;
  }
}

async function fetchTenantContextViaAdminApi() {
  const { data: sessionData, error: sessionError } = await supabasePlatformClient.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message || 'Falha ao obter sessão SaaS.');
  }
  const accessToken = sessionData?.session?.access_token || '';
  // #region agent log
  fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run1',hypothesisId:'H4',location:'src/services/tenantContextService.js:fetchTenantContextViaAdminApi:session',message:'Tenant context request session snapshot',data:{hasAccessToken:Boolean(accessToken),sessionError:Boolean(sessionError)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para carregar contexto da clínica.');
  }
  let response;
  try {
    response = await fetch('/internal/app/tenant-context', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    // #region agent log
    fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run1',hypothesisId:'H4',location:'src/services/tenantContextService.js:fetchTenantContextViaAdminApi:response',message:'Tenant context response status',data:{status:Number(response?.status||0),ok:Boolean(response?.ok)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run1',hypothesisId:'H5',location:'src/services/tenantContextService.js:fetchTenantContextViaAdminApi:catch',message:'Tenant context fetch network exception',data:{name:String(error?.name||''),message:String(error?.message||'')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const lower = String(error?.message || '').toLowerCase();
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('fetch failed')) {
      throw new Error(
        'Não foi possível conectar ao backend SaaS em http://localhost:3001. '
        + 'Inicie o backend para carregar o contexto da clínica.',
      );
    }
    throw error;
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        json?.error
        || 'Sua sessão SaaS não foi aceita pelo backend local. '
          + 'Verifique se app, backend e Console usam o mesmo projeto Supabase.',
      );
    }
    if (response.status === 404) {
      throw new Error(
        json?.error
        || 'Usuário autenticado sem vínculo ativo em tenant_users. '
          + 'Faça o provisionamento da clínica pela Console antes de acessar o app.',
      );
    }
    throw new Error(json?.error || `Erro HTTP ${response.status} ao carregar contexto da clínica.`);
  }
  return json;
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

  const apiContext = await runLoggedQuery(
    'admin_api_tenant_context',
    'H12',
    () => fetchTenantContextViaAdminApi(),
    (result) => ({
      tenantId: String(result?.tenant?.id || result?.access?.tenantId || ''),
      tenantStatus: String(result?.tenant?.status || ''),
      warningCount: Array.isArray(result?.warnings) ? result.warnings.length : 0,
      moduleCount: result?.modules && typeof result.modules === 'object' ? Object.keys(result.modules).length : 0,
    }),
    'post-fix',
  );
  if (apiContext?.tenant) {
    return {
      tenant: apiContext.tenant || null,
      modules: apiContext.modules || createDefaultModuleMap(),
      flags: apiContext.flags || {},
      limits: apiContext.limits || {},
      subscription: apiContext.subscription || null,
      warnings: Array.isArray(apiContext.warnings) ? apiContext.warnings : [],
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
    runLoggedQuery(
      'tenant',
      'H7',
      () => client.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
      (result) => ({ hasError: Boolean(result?.error), hasData: Boolean(result?.data), tenantId: String(tenantId || '') }),
    ),
    runLoggedQuery(
      'tenant_modules',
      'H7',
      () => client.from('tenant_modules').select('*').eq('tenant_id', tenantId),
      (result) => ({ hasError: Boolean(result?.error), rowCount: Array.isArray(result?.data) ? result.data.length : 0, tenantId: String(tenantId || '') }),
    ),
    runLoggedQuery(
      'feature_flags_global',
      'H8',
      () => client.from('feature_flags').select('*').eq('scope_type', 'global'),
      (result) => ({ hasError: Boolean(result?.error), rowCount: Array.isArray(result?.data) ? result.data.length : 0 }),
    ),
    runLoggedQuery(
      'feature_flags_tenant',
      'H8',
      () => client.from('feature_flags').select('*').eq('scope_type', 'tenant').eq('scope_ref', tenantId),
      (result) => ({ hasError: Boolean(result?.error), rowCount: Array.isArray(result?.data) ? result.data.length : 0, tenantId: String(tenantId || '') }),
    ),
    runLoggedQuery(
      'tenant_subscriptions',
      'H9',
      () => client.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      (result) => ({ hasError: Boolean(result?.error), hasData: Boolean(result?.data), tenantId: String(tenantId || '') }),
    ),
    runLoggedQuery(
      'tenant_limits',
      'H9',
      () => fetchOptionalTenantLimits(tenantId),
      (result) => ({ hasData: Boolean(result), tenantId: String(tenantId || '') }),
    ),
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
