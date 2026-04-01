import { supabaseConsole } from '../lib/supabaseConsole.js';
import {
  ALLOWED_ONBOARDING_ROLES,
  integrationKeyToLabel,
  MODULE_CATALOG,
  PLAN_CATALOG,
  PLAN_MODULES,
  PLAN_PRICES_CENTS,
  INTEGRATION_KEYS,
} from './platformConsoleConstants.js';

function getClient() {
  if (!supabaseConsole) {
    throw new Error(
      'Supabase da Console não está configurado. Defina VITE_CONSOLE_SUPABASE_URL e VITE_CONSOLE_SUPABASE_ANON_KEY com valores reais do projeto.',
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

  const recentAudits = (auditRes.data || []).map((log) => {
    const meta = log.metadata && typeof log.metadata === 'object' ? log.metadata : {};
    const actorLabel = meta.actor_email || log.actor_role || '—';
    return {
      id: log.id,
      actor: actorLabel,
      actorRole: log.actor_role,
      action: log.action,
      targetType: log.target_type,
      targetId: log.target_id,
      metadata: typeof log.metadata === 'object' ? JSON.stringify(log.metadata) : String(log.metadata || ''),
      createdAt: log.created_at,
    };
  });

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
      'id, legal_name, trade_name, cnpj, status, billing_status, plan_code, owner_name, owner_email, city, state, created_at, updated_at, tenant_modules(module_key, enabled), tenant_integrations(integration_key, status, last_sync_at)',
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

  return { clinic, subscription, billingHistory, supportHistory, recentErrors };
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
  const rows = (data || []).map((log) => {
    const meta = log.metadata && typeof log.metadata === 'object' ? log.metadata : {};
    return {
      id: log.id,
      actor: meta.actor_email || log.actor_role || '—',
      actorRole: log.actor_role,
      action: log.action,
      targetType: log.target_type,
      targetId: log.target_id,
      metadata: typeof log.metadata === 'object' ? JSON.stringify(log.metadata) : String(log.metadata || ''),
      createdAt: log.created_at,
    };
  });
  if (!query) return rows;
  return rows.filter((item) =>
    includeQuery([item.actor, item.action, item.targetType, item.targetId, item.metadata], query),
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

  const clinicName = normalizeText(payload?.clinicName);
  const city = normalizeText(payload?.city);
  const ownerName = normalizeText(payload?.ownerName);
  const adminName = normalizeText(payload?.adminName);
  const adminEmail = normalizeEmail(payload?.adminEmail);
  const planCode = normalizeText(payload?.planCode);

  if (!clinicName) throw new Error('Nome da clínica é obrigatório.');
  if (!adminName) throw new Error('Nome do administrador é obrigatório.');
  if (!adminEmail) throw new Error('E-mail do administrador é obrigatório.');
  if (!PLAN_CATALOG.includes(planCode)) throw new Error('Plano inválido.');

  const { data: dupOwner } = await client.from('tenants').select('id').eq('owner_email', adminEmail).maybeSingle();
  if (dupOwner) throw new Error('Este e-mail já está em uso como responsável de uma clínica.');

  const { data: dupTu } = await client.from('tenant_users').select('id').eq('email', adminEmail).maybeSingle();
  if (dupTu) throw new Error('Este e-mail já está vinculado a uma clínica.');

  const modulesFromPlan = PLAN_MODULES[planCode] || [];

  const { data: tenantRow, error: tInsErr } = await client
    .from('tenants')
    .insert({
      legal_name: clinicName,
      trade_name: clinicName,
      status: 'active',
      billing_status: 'ok',
      plan_code: planCode,
      owner_name: ownerName || adminName,
      owner_email: adminEmail,
      city: city || null,
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select('id')
    .single();
  if (tInsErr) throw new Error(tInsErr.message);
  const tenantId = tenantRow.id;

  const { error: subErr } = await client.from('tenant_subscriptions').insert({
    tenant_id: tenantId,
    plan_code: planCode,
    status: 'active',
    amount_cents: PLAN_PRICES_CENTS[planCode] ?? 0,
    cycle: 'monthly',
    next_billing_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    updated_by: actor.id,
  });
  if (subErr) throw new Error(subErr.message);

  if (modulesFromPlan.length) {
    const modRows = modulesFromPlan.map((module_key) => ({
      tenant_id: tenantId,
      module_key,
      enabled: true,
      updated_by: actor.id,
    }));
    const { error: modErr } = await client.from('tenant_modules').insert(modRows);
    if (modErr) throw new Error(modErr.message);
  }

  const { error: tuErr } = await client.from('tenant_users').insert({
    tenant_id: tenantId,
    user_id: null,
    full_name: adminName,
    email: adminEmail,
    role_slug: 'admin',
    status: 'active',
  });
  if (tuErr) throw new Error(tuErr.message);

  await insertAudit(actor, 'tenant.onboarding.created', 'tenant', tenantId, {
    clinicName,
    adminEmail,
    planCode,
    modules: modulesFromPlan,
  }, tenantId);

  const detail = await getClinicDetail(tenantId);
  return detail?.clinic || { id: tenantId, name: clinicName };
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
