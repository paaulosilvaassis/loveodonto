/**
 * Chamadas à Admin API (3001): provisionamento e dados exigem o mesmo projeto Supabase
 * que `server/.env` (service role). `VITE_PLATFORM_API_KEY` deve coincidir com `PLATFORM_API_KEY` no server.
 */
import { supabaseConsole } from '../lib/supabaseConsole.js';
import { mapAuditLogForDisplay } from '../utils/auditLogDisplay.js';
import {
  ALLOWED_ONBOARDING_ROLES,
  integrationKeyToLabel,
  MODULE_CATALOG,
  PLAN_CATALOG,
  PLAN_MODULES,
  PLAN_PRICES_CENTS,
  INTEGRATION_KEYS,
  getPlanLimits,
  resolvePlanCode,
} from './platformConsoleConstants.js';

const DEV_DEFAULT_PLATFORM_API_BASE_URL = 'http://127.0.0.1:3001';

const PROD_BACKEND_MISCONFIGURED_MSG =
  'Backend SaaS não configurado em produção. Configure VITE_PLATFORM_API_BASE_URL com a URL pública do backend.';

function isLocalhostBackendUrl(url) {
  const raw = normalizeEnvString(url);
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(raw);
  }
}

function resolvePlatformApiBaseUrl() {
  const configured = normalizeEnvString(import.meta.env.VITE_PLATFORM_API_BASE_URL);
  if (import.meta.env.PROD) {
    return configured;
  }
  return configured || DEV_DEFAULT_PLATFORM_API_BASE_URL;
}

function normalizeEnvString(value) {
  return String(value ?? '').trim();
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolvePlatformApiUrl(path) {
  const baseUrl = resolvePlatformApiBaseUrl();
  const normalizedPath = String(path || '').trim();
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${base}${suffix}`;
}

export function getPlatformApiConfigError() {
  const baseUrl = resolvePlatformApiBaseUrl();
  const platformApiKey = normalizeEnvString(import.meta.env.VITE_PLATFORM_API_KEY);
  if (import.meta.env.PROD) {
    if (!normalizeEnvString(import.meta.env.VITE_PLATFORM_API_BASE_URL)) {
      return (
        'Variável de ambiente do backend não configurada. '
        + 'Defina VITE_PLATFORM_API_BASE_URL com a URL pública da Admin API.'
      );
    }
    if (isLocalhostBackendUrl(baseUrl)) {
      return PROD_BACKEND_MISCONFIGURED_MSG;
    }
  } else if (!baseUrl) {
    return 'VITE_PLATFORM_API_BASE_URL está vazio. Em dev, use http://127.0.0.1:3001 ou o proxy do Vite.';
  }
  if (!isValidHttpUrl(baseUrl)) {
    return 'VITE_PLATFORM_API_BASE_URL deve ser uma URL http(s) válida.';
  }
  if (!platformApiKey) {
    return (
      'VITE_PLATFORM_API_KEY não foi definido na Console. '
      + (import.meta.env.PROD
        ? 'Configure a chave no deploy da Console (mesmo valor que PLATFORM_API_KEY no server).'
        : 'Sem essa chave a Console não pode provisionar clínicas no backend local.')
    );
  }
  return null;
}

function getClient() {
  if (!supabaseConsole) {
    throw new Error(
      'Supabase da Console não está configurado. Defina VITE_CONSOLE_SUPABASE_URL e VITE_CONSOLE_SUPABASE_ANON_KEY ou VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return supabaseConsole;
}

function currency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePlanForProvision(planCode) {
  return resolvePlanCode(planCode);
}

function mapPlatformApiErrorMessage(error) {
  const raw = String(error?.message || error || '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('stack depth limit exceeded')) {
    return (
      'O backend local respondeu com "stack depth limit exceeded". '
      + 'Isso normalmente acontece quando SUPABASE_SERVICE_ROLE_KEY está incorreta '
      + 'ou não é a service role key do mesmo projeto Supabase.'
    );
  }
  return raw;
}

async function callPlatformApi(path, { method = 'POST', body } = {}) {
  const configError = getPlatformApiConfigError();
  if (configError) {
    throw new Error(configError);
  }
  const client = getClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message || 'Falha ao obter sessão da Console.');
  }
  const accessToken = sessionData?.session?.access_token || '';
  if (!accessToken) {
    throw new Error('Sessão expirada. Faça login novamente na Console.');
  }
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-platform-key': normalizeEnvString(import.meta.env.VITE_PLATFORM_API_KEY),
  };
  const init = { method, headers };
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(resolvePlatformApiUrl(path), init);
  } catch (error) {
    const fallback = import.meta.env.PROD
      ? 'Falha ao conectar à Admin API. Verifique VITE_PLATFORM_API_BASE_URL.'
      : 'Falha ao chamar o backend local.';
    throw new Error(mapPlatformApiErrorMessage(error) || fallback);
  }
  const text = await response.text();
  let json = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text };
    }
  }
  if (!response.ok) {
    throw new Error(
      mapPlatformApiErrorMessage(json?.error || json?.message || `Erro HTTP ${response.status}`)
      || `Erro HTTP ${response.status}`,
    );
  }
  return json;
}

function getDefaultPlanLimits(planCode) {
  return getPlanLimits(planCode);
}

function includeQuery(values, query) {
  if (!query) return true;
  const normalizedQuery = String(query).toLowerCase();
  return values.some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
}

function mapTenantRow(row) {
  const mods = Array.isArray(row.tenant_modules)
    ? row.tenant_modules.filter((m) => m.enabled).map((m) => m.module_key)
    : [];
  return {
    id: row.id,
    name: row.legal_name,
    tradeName: row.trade_name || row.legal_name,
    cnpj: row.cnpj || '',
    phone: row.phone || '',
    zipCode: row.zip_code || '',
    street: row.street || '',
    streetNumber: row.street_number || '',
    addressComplement: row.address_complement || '',
    neighborhood: row.neighborhood || '',
    city: row.city || '',
    state: row.state || '',
    ownerName: row.owner_name || '',
    ownerEmail: row.owner_email || '',
    status: row.status,
    plan: row.plan_code || '—',
    billingStatus: row.billing_status || 'ok',
    modules: mods,
    integrations: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertAudit(actor, action, targetType, targetId, metadata, tenantId = null) {
  if (!actor?.id) return;
  const client = getClient();
  const baseMeta = metadata && typeof metadata === 'object' ? { ...metadata } : { note: String(metadata || '') };
  if (actor.email) baseMeta.actor_email = actor.email;
  const payload = {
    actor_admin_id: actor.id,
    actor_role: actor.role,
    action,
    target_type: targetType,
    target_id: String(targetId),
    tenant_id: tenantId,
    metadata: baseMeta,
  };
  const { error } = await client.from('audit_logs').insert(payload);
  if (error) {
    console.warn('[Platform Console] Falha ao registrar auditoria:', error.message);
  }
}

function ensureCanCreateClinic(actor) {
  const role = String(actor?.role || '').toLowerCase();
  if (!ALLOWED_ONBOARDING_ROLES.has(role)) {
    throw new Error('Somente owner ou super_admin pode criar nova clínica.');
  }
}

function ensureCanManageMasterAccess(actor) {
  const role = String(actor?.role || '').toLowerCase();
  if (ALLOWED_ONBOARDING_ROLES.has(role)) return;
  throw new Error('Somente owner ou super_admin pode gerenciar acesso master.');
}

export function listCatalogs() {
  return {
    modules: [...MODULE_CATALOG],
    integrations: [...INTEGRATION_KEYS],
    plans: [...PLAN_CATALOG],
  };
}

export async function getPlatformDashboardSnapshot() {
  const client = getClient();
  const [
    tenantsRes,
    subsRes,
    billingRes,
    ticketsRes,
    healthRes,
    auditRes,
  ] = await Promise.all([
    client.from('tenants').select('id, status, billing_status'),
    client.from('tenant_subscriptions').select('id, status, amount_cents'),
    client.from('tenant_billing_events').select('id, status').eq('status', 'overdue'),
    client.from('support_tickets').select('id, status').eq('status', 'open'),
    client.from('system_health_checks').select('id, component, status, latency_ms, checked_at').order('checked_at', { ascending: false }).limit(40),
    client.from('audit_logs').select('id, actor_role, action, target_type, target_id, metadata, created_at').order('created_at', { ascending: false }).limit(8),
  ]);

  if (tenantsRes.error) throw new Error(tenantsRes.error.message);
  if (subsRes.error) throw new Error(subsRes.error.message);
  if (billingRes.error) throw new Error(billingRes.error.message);
  if (ticketsRes.error) throw new Error(ticketsRes.error.message);
  if (healthRes.error) throw new Error(healthRes.error.message);
  if (auditRes.error) throw new Error(auditRes.error.message);

  const tenants = tenantsRes.data || [];
  const subs = subsRes.data || [];
  const activeClinics = tenants.filter((t) => t.status === 'active').length;
  const blockedClinics = tenants.filter((t) => t.status === 'suspended').length;
  const mrrCents = subs.filter((s) => s.status === 'active').reduce((acc, s) => acc + Number(s.amount_cents || 0), 0);
  const overdue = (billingRes.data || []).length;
  const openTickets = (ticketsRes.data || []).length;
  const healthChecks = (healthRes.data || []).map((h) => ({
    id: h.id,
    component: h.component,
    status: h.status,
    latencyMs: h.latency_ms,
    checkedAt: h.checked_at,
  }));
  const incidents = healthChecks.filter((h) => h.status !== 'healthy').length;

  const overdueEventsQuery = await client
    .from('tenant_billing_events')
    .select('id, status, amount_cents, due_at, created_at, tenants(legal_name)')
    .eq('status', 'overdue')
    .order('due_at', { ascending: true })
    .limit(20);
  if (overdueEventsQuery.error) throw new Error(overdueEventsQuery.error.message);
  const overdueEvents = (overdueEventsQuery.data || []).map((row) => ({
    id: row.id,
    clinicName: row.tenants?.legal_name || '—',
    status: row.status,
    amountCents: row.amount_cents,
    dueAt: row.due_at,
    createdAt: row.created_at,
  }));

  const recentAudits = (auditRes.data || []).map(mapAuditLogForDisplay);

  return {
    cards: [
      { id: 'active_clinics', label: 'Clínicas ativas', value: activeClinics },
      { id: 'blocked_clinics', label: 'Clínicas bloqueadas', value: blockedClinics },
      { id: 'mrr', label: 'MRR', value: currency(mrrCents / 100) },
      { id: 'overdue', label: 'Inadimplentes', value: overdue },
      { id: 'tickets', label: 'Tickets abertos', value: openTickets },
      { id: 'incidents', label: 'Alertas de saúde', value: incidents },
    ],
    healthChecks,
    overdueEvents,
    recentAudits,
    hasTenants: tenants.length > 0,
    openTicketsCount: openTickets,
  };
}

export async function listClinics({ query = '', status = 'all', plan = 'all' } = {}) {
  const client = getClient();
  const { data, error } = await client
    .from('tenants')
    .select(
      'id, legal_name, trade_name, cnpj, status, billing_status, plan_code, owner_name, owner_email, city, state, created_at, updated_at, tenant_modules(module_key, enabled)',
    )
    .order('legal_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || [])
    .map(mapTenantRow)
    .filter((clinic) => (status === 'all' ? true : clinic.status === status))
    .filter((clinic) => (plan === 'all' ? true : clinic.plan === plan))
    .filter((clinic) =>
      includeQuery([clinic.name, clinic.tradeName, clinic.ownerEmail, clinic.city, clinic.state], query),
    );
}

export async function getClinicDetail(tenantId) {
  const client = getClient();
  const { data: tenant, error: tErr } = await client
    .from('tenants')
    .select(
      'id, legal_name, trade_name, cnpj, phone, zip_code, street, street_number, address_complement, neighborhood, status, billing_status, plan_code, owner_name, owner_email, city, state, created_at, updated_at, tenant_modules(module_key, enabled), tenant_integrations(integration_key, status, last_sync_at)',
    )
    .eq('id', tenantId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!tenant) return null;

  const clinic = mapTenantRow(tenant);
  const integs = Array.isArray(tenant.tenant_integrations) ? tenant.tenant_integrations : [];
  clinic.integrations = integs.map((i) => ({
    name: integrationKeyToLabel(i.integration_key),
    status: i.status,
    lastSyncAt: i.last_sync_at,
  }));

  const { data: subRows, error: sErr } = await client
    .from('tenant_subscriptions')
    .select('id, plan_code, status, amount_cents, cycle, next_billing_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (sErr) throw new Error(sErr.message);
  const sub = subRows?.[0];
  const subscription = sub
    ? {
        id: sub.id,
        tenantId,
        clinicName: clinic.name,
        plan: sub.plan_code,
        status: sub.status,
        amountCents: sub.amount_cents,
        cycle: sub.cycle,
        nextBillingAt: sub.next_billing_at,
        updatedAt: sub.updated_at,
      }
    : null;

  const { data: billRows, error: bErr } = await client
    .from('tenant_billing_events')
    .select('id, event_type, status, amount_cents, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (bErr) throw new Error(bErr.message);
  const billingHistory = (billRows || []).map((row) => ({
    id: row.id,
    type: row.event_type,
    status: row.status,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
  }));

  const { data: supRows, error: supErr } = await client
    .from('support_tickets')
    .select('id, subject, priority, status, updated_at')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (supErr) throw new Error(supErr.message);
  const supportHistory = (supRows || []).map((row) => ({
    id: row.id,
    subject: row.subject,
    priority: row.priority,
    status: row.status,
    updatedAt: row.updated_at,
  }));

  const { data: hcRows, error: hErr } = await client
    .from('system_health_checks')
    .select('id, component, status, latency_ms, checked_at')
    .neq('status', 'healthy')
    .order('checked_at', { ascending: false })
    .limit(8);
  if (hErr) throw new Error(hErr.message);
  const recentErrors = (hcRows || []).map((h) => ({
    id: h.id,
    component: h.component,
    status: h.status,
    latencyMs: h.latency_ms,
    checkedAt: h.checked_at,
  }));

  const { data: legalRow, error: legalErr } = await client
    .from('tenant_legal_profiles')
    .select(
      'legal_representative_name, legal_representative_cpf, legal_representative_email, legal_representative_phone, legal_representative_role, billing_contact_name, billing_contact_email, billing_contact_phone, billing_same_as_legal, liability_terms_version, liability_status, liability_accepted_at, liability_acceptance_expires_at, onboarding_email_sent_at, liability_accepted_by_name',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (legalErr) throw new Error(legalErr.message);
  const legalProfile = legalRow
    ? {
        legalRepresentativeName: legalRow.legal_representative_name,
        legalRepresentativeCpf: legalRow.legal_representative_cpf,
        legalRepresentativeEmail: legalRow.legal_representative_email,
        legalRepresentativePhone: legalRow.legal_representative_phone,
        legalRepresentativeRole: legalRow.legal_representative_role,
        billingContactName: legalRow.billing_contact_name,
        billingContactEmail: legalRow.billing_contact_email,
        billingContactPhone: legalRow.billing_contact_phone,
        billingSameAsLegal: legalRow.billing_same_as_legal,
        liabilityTermsVersion: legalRow.liability_terms_version,
        liabilityStatus: legalRow.liability_status,
        liabilityAcceptedAt: legalRow.liability_accepted_at,
        liabilityAcceptanceExpiresAt: legalRow.liability_acceptance_expires_at,
        onboardingEmailSentAt: legalRow.onboarding_email_sent_at,
        liabilityAcceptedByName: legalRow.liability_accepted_by_name,
      }
    : null;

  const { data: masterRows, error: masterErr } = await client
    .from('tenant_users')
    .select('id, email, full_name, role, role_slug, user_id, is_active, status, has_system_access')
    .eq('tenant_id', tenantId)
    .in('role_slug', ['master', 'owner'])
    .order('created_at', { ascending: true })
    .limit(1);
  if (masterErr) throw new Error(masterErr.message);
  const masterRow = masterRows?.[0] || null;
  const masterAccess = masterRow
    ? {
        id: masterRow.id,
        email: masterRow.email,
        fullName: masterRow.full_name,
        role: masterRow.role_slug || masterRow.role,
        authLinked: Boolean(masterRow.user_id),
        isActive: masterRow.is_active !== false,
      }
    : {
        email: legalProfile?.legalRepresentativeEmail || clinic.ownerEmail || '',
        fullName: legalProfile?.legalRepresentativeName || clinic.ownerName || '',
        role: 'master',
        authLinked: false,
        isActive: false,
      };

  return { clinic, subscription, billingHistory, supportHistory, recentErrors, legalProfile, masterAccess };
}

export async function listSubscriptions() {
  const client = getClient();
  const { data, error } = await client
    .from('tenant_subscriptions')
    .select('id, tenant_id, plan_code, status, amount_cents, cycle, next_billing_at, updated_at, tenants(legal_name)')
    .order('next_billing_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    clinicName: row.tenants?.legal_name || '—',
    plan: row.plan_code,
    status: row.status,
    amountCents: row.amount_cents,
    cycle: row.cycle,
    nextBillingAt: row.next_billing_at,
    updatedAt: row.updated_at,
  }));
}

export async function listBillingEvents() {
  const client = getClient();
  const { data, error } = await client
    .from('tenant_billing_events')
    .select('id, event_type, status, amount_cents, due_at, created_at, tenants(legal_name)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    clinicName: row.tenants?.legal_name || '—',
    type: row.event_type,
    status: row.status,
    amountCents: row.amount_cents,
    dueAt: row.due_at,
    createdAt: row.created_at,
  }));
}

export async function listConnectivityRows() {
  const client = getClient();
  const { data, error } = await client
    .from('tenant_integrations')
    .select('id, integration_key, status, last_sync_at, tenants(legal_name)')
    .order('last_sync_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    tenantId: null,
    clinicName: row.tenants?.legal_name || '—',
    integrationName: integrationKeyToLabel(row.integration_key),
    status: row.status,
    lastSyncAt: row.last_sync_at,
  }));
}

export async function listSupportTickets({ query = '', status = 'all' } = {}) {
  const client = getClient();
  const { data: tickets, error } = await client
    .from('support_tickets')
    .select('id, tenant_id, subject, priority, status, updated_at, tenants(legal_name)')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  const list = tickets || [];
  const ticketIds = list.map((t) => t.id);
  let lastByTicket = new Map();
  if (ticketIds.length) {
    const { data: msgs, error: mErr } = await client
      .from('support_messages')
      .select('ticket_id, body, created_at')
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: false });
    if (mErr) throw new Error(mErr.message);
    for (const m of msgs || []) {
      if (!lastByTicket.has(m.ticket_id)) lastByTicket.set(m.ticket_id, m.body);
    }
  }
  return list
    .map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      clinicName: row.tenants?.legal_name || '—',
      subject: row.subject,
      priority: row.priority,
      status: row.status,
      updatedAt: row.updated_at,
      lastMessage: lastByTicket.get(row.id) || '—',
    }))
    .filter((item) => (status === 'all' ? true : item.status === status))
    .filter((item) => includeQuery([item.clinicName, item.subject, item.lastMessage], query));
}

export async function listAuditLogs({ query = '' } = {}) {
  const client = getClient();
  const { data, error } = await client
    .from('audit_logs')
    .select('id, actor_role, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const rows = (data || []).map(mapAuditLogForDisplay);
  if (!query) return rows;
  return rows.filter((item) =>
    includeQuery([item.actor, item.action, item.actionCode, item.target, item.metadata], query),
  );
}

export async function listFeatureFlags() {
  const client = getClient();
  const { data, error } = await client
    .from('feature_flags')
    .select('id, flag_key, scope_type, scope_ref, enabled, updated_at')
    .order('flag_key', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    key: row.flag_key,
    scopeType: row.scope_type,
    scopeRef: row.scope_ref,
    enabled: row.enabled,
    updatedAt: row.updated_at,
  }));
}

export async function createClinicOnboarding(actor, payload) {
  ensureCanCreateClinic(actor);
  const client = getClient();
  const planCode = normalizeText(payload?.plan || payload?.planCode);
  if (!PLAN_CATALOG.includes(planCode)) throw new Error('Plano inválido.');

  const provisioned = await callPlatformApi('/internal/platform/tenants/provision', {
    method: 'POST',
    body: {
      ...payload,
      plan: normalizePlanForProvision(planCode),
      status: 'active',
    },
  });

  const tenantId = provisioned?.tenant?.id;
  const tenantUserId = provisioned?.tenantUser?.user_id;
  if (!tenantId) {
    throw new Error('Provisionamento concluído sem tenant válido.');
  }
  if (!tenantUserId) {
    throw new Error('Provisionamento incompleto: tenant_users retornou sem user_id.');
  }

  const { error: limitsErr } = await client.from('tenant_limits').upsert({
    tenant_id: tenantId,
    limits_json: getDefaultPlanLimits(planCode),
    updated_by: actor.id,
  }, { onConflict: 'tenant_id' });
  if (limitsErr) throw new Error(limitsErr.message);

  const detail = await getClinicDetail(tenantId);
  return {
    clinic: detail?.clinic || { id: tenantId, name: payload?.tradeName || payload?.legalName },
    temporaryPassword: provisioned?.temporaryPassword || null,
    onboardingEmail: provisioned?.onboarding_email || null,
    accessEmailSent: Boolean(provisioned?.access_email_sent),
    accessSetupLink: provisioned?.access_setup_link || provisioned?.onboarding_email?.setupLink || null,
    accessEmailDelivery: provisioned?.accessEmailDelivery || null,
  };
}

export async function resendClinicOwnerAccess(actor, tenantId) {
  ensureCanManageMasterAccess(actor);
  return callPlatformApi(`/internal/platform/tenants/${tenantId}/resend-access`, {
    method: 'POST',
    body: {},
  });
}

export async function toggleClinicStatus(actor, tenantId) {
  const client = getClient();
  const { data: row, error: fErr } = await client.from('tenants').select('id, status, legal_name').eq('id', tenantId).single();
  if (fErr || !row) throw new Error('Clínica não encontrada.');
  const next = row.status === 'active' ? 'suspended' : 'active';
  const { error: uErr } = await client
    .from('tenants')
    .update({ status: next, updated_by: actor.id })
    .eq('id', tenantId);
  if (uErr) throw new Error(uErr.message);

  const subStatus = next === 'active' ? 'active' : 'paused';
  await client.from('tenant_subscriptions').update({ status: subStatus, updated_by: actor.id }).eq('tenant_id', tenantId);

  await insertAudit(
    actor,
    next === 'active' ? 'tenant.unblocked' : 'tenant.blocked',
    'tenant',
    tenantId,
    { clinicName: row.legal_name },
    tenantId,
  );
  return getClinicDetail(tenantId).then((d) => d?.clinic);
}

export async function toggleClinicModule(actor, tenantId, moduleName) {
  const client = getClient();
  const { data: clinic, error: cErr } = await client.from('tenants').select('id').eq('id', tenantId).single();
  if (cErr || !clinic) throw new Error('Clínica não encontrada.');

  const { data: existing, error: eErr } = await client
    .from('tenant_modules')
    .select('id, enabled')
    .eq('tenant_id', tenantId)
    .eq('module_key', moduleName)
    .maybeSingle();
  if (eErr) throw new Error(eErr.message);

  if (existing) {
    const next = !existing.enabled;
    const { error: upErr } = await client
      .from('tenant_modules')
      .update({ enabled: next, updated_by: actor.id })
      .eq('id', existing.id);
    if (upErr) throw new Error(upErr.message);
    await insertAudit(
      actor,
      next ? 'tenant.module.enabled' : 'tenant.module.disabled',
      'tenant_module',
      tenantId,
      { moduleName, enabled: next },
      tenantId,
    );
  } else {
    const { error: insErr } = await client.from('tenant_modules').insert({
      tenant_id: tenantId,
      module_key: moduleName,
      enabled: true,
      updated_by: actor.id,
    });
    if (insErr) throw new Error(insErr.message);
    await insertAudit(actor, 'tenant.module.enabled', 'tenant_module', tenantId, { moduleName, enabled: true }, tenantId);
  }

  const detail = await getClinicDetail(tenantId);
  return detail?.clinic?.modules || [];
}

export async function changeClinicPlan(actor, tenantId, nextPlan) {
  if (!PLAN_CATALOG.includes(nextPlan)) throw new Error('Plano inválido.');
  const client = getClient();
  const { data: clinic, error: cErr } = await client.from('tenants').select('id').eq('id', tenantId).single();
  if (cErr || !clinic) throw new Error('Clínica não encontrada.');

  const { error: tErr } = await client
    .from('tenants')
    .update({ plan_code: nextPlan, updated_by: actor.id })
    .eq('id', tenantId);
  if (tErr) throw new Error(tErr.message);

  const { data: sub, error: sErr } = await client
    .from('tenant_subscriptions')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!sub) throw new Error('Assinatura da clínica não encontrada.');

  const { error: suErr } = await client
    .from('tenant_subscriptions')
    .update({
      plan_code: nextPlan,
      amount_cents: PLAN_PRICES_CENTS[nextPlan] ?? 0,
      updated_by: actor.id,
    })
    .eq('id', sub.id);
  if (suErr) throw new Error(suErr.message);

  await insertAudit(actor, 'tenant.plan.changed', 'tenant_subscription', tenantId, { nextPlan }, tenantId);

  const { data: subRow, error: rErr } = await client
    .from('tenant_subscriptions')
    .select('id, plan_code, status, amount_cents, cycle, next_billing_at, updated_at')
    .eq('id', sub.id)
    .single();
  if (rErr) throw new Error(rErr.message);
  return {
    id: subRow.id,
    tenantId,
    plan: subRow.plan_code,
    status: subRow.status,
    amountCents: subRow.amount_cents,
    cycle: subRow.cycle,
    nextBillingAt: subRow.next_billing_at,
    updatedAt: subRow.updated_at,
  };
}

export async function updateFeatureFlag(actor, flagId, enabled) {
  const client = getClient();
  const { data: flag, error: fErr } = await client.from('feature_flags').select('id, flag_key').eq('id', flagId).single();
  if (fErr || !flag) throw new Error('Funcionalidade não encontrada.');
  const { error: uErr } = await client
    .from('feature_flags')
    .update({ enabled: Boolean(enabled), updated_by: actor.id })
    .eq('id', flagId);
  if (uErr) throw new Error(uErr.message);
  await insertAudit(actor, 'feature_flag.updated', 'feature_flag', flag.id, { key: flag.flag_key, enabled }, null);
  return { ...flag, enabled: Boolean(enabled) };
}
