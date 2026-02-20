import { loadDb } from '../db/index.js';

export function getMasterDashboardMetrics() {
  const db = loadDb();
  const tenants = db.tenants || [];
  const memberships = db.memberships || [];
  const subscriptions = db.subscriptions || [];
  const invoices = db.invoices || [];
  const plans = db.plans || [];

  const activeTenants = tenants.filter((t) => t.status === 'active').length;
  const trialTenants = tenants.filter((t) => t.status === 'trial').length;
  const suspendedTenants = tenants.filter((t) => t.status === 'suspended').length;

  const activeSubs = subscriptions.filter((s) => s.status === 'active' || s.status === 'trialing');
  let mrr = 0;
  for (const s of activeSubs) {
    const plan = plans.find((p) => p.id === s.plan_id);
    if (plan) mrr += plan.price || 0;
  }

  const overdueInvoices = invoices.filter((i) => i.status === 'pending' && i.due_date && i.due_date < new Date().toISOString().slice(0, 10));
  const totalMembers = memberships.filter((m) => m.status === 'active').length;
  const uniqueTenantIds = new Set(memberships.map((m) => m.tenant_id));
  const mau = uniqueTenantIds.size;

  return {
    tenants: { total: tenants.length, active: activeTenants, trial: trialTenants, suspended: suspendedTenants },
    mrr,
    overdueInvoices: overdueInvoices.length,
    totalMembers,
    mau,
  };
}

export function getUsageByModule(tenantId, sinceDays = 30) {
  const db = loadDb();
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const events = (db.usage_events || []).filter((e) => e.tenant_id === tenantId && new Date(e.occurred_at) >= since);
  const byMetric = {};
  for (const e of events) {
    byMetric[e.metric_key] = (byMetric[e.metric_key] || 0) + (e.quantity || 1);
  }
  return byMetric;
}
