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

async function fetchOptionalTenantLimits(tenantId) {
  const client = supabasePlatformClient;
  const { data, error } = await client
    .from('tenant_limits')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
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
  if (!supabasePlatformClient) {
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

  const client = supabasePlatformClient;

  const [
    tenantResult,
    modulesResult,
    globalFlagsResult,
    tenantFlagsResult,
    subscriptionResult,
    limitsRow,
  ] = await Promise.all([
    client.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
    client.from('tenant_modules').select('*').eq('tenant_id', tenantId),
    client.from('feature_flags').select('*').eq('scope_type', 'global'),
    client.from('feature_flags').select('*').eq('scope_type', 'tenant').eq('scope_ref', tenantId),
    client.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    fetchOptionalTenantLimits(tenantId),
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants', filter: `id=eq.${tenantId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_modules', filter: `tenant_id=eq.${tenantId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_subscriptions', filter: `tenant_id=eq.${tenantId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, onChange)
    .subscribe();

  return () => {
    supabasePlatformClient.removeChannel(channel);
  };
}
