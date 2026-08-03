/**
 * Métricas e classificação financeira do Revenue Center SaaS.
 */

export function resolveFinancialStatus({
  isBlocked,
  subscriptionStatus,
  invoiceStatus,
  daysUntilDue,
  overdueDays,
}) {
  if (isBlocked) return 'blocked';
  if (overdueDays >= 11 || subscriptionStatus === 'bloqueio_recomendado') return 'block_recommended';
  if (overdueDays >= 1 || subscriptionStatus === 'inadimplente' || invoiceStatus === 'overdue') return 'overdue';
  if (daysUntilDue === 0 || subscriptionStatus === 'vencido' || invoiceStatus === 'due_today') return 'due_today';
  if (daysUntilDue != null && daysUntilDue > 0 && daysUntilDue <= 5) return 'due_soon';
  if (['active_trial', 'trial'].includes(subscriptionStatus)) return 'trial';
  return 'active';
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function lastMonths(count = 6) {
  const out = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

export function resolvePlanAmountCents(planCode, planConfig) {
  const code = String(planCode || '').trim();
  if (code && planConfig?.[code]?.priceCents != null) return planConfig[code].priceCents;
  const lower = code.toLowerCase();
  if (lower === 'start') return planConfig?.Start?.priceCents ?? 8990;
  if (lower === 'growth') return planConfig?.Growth?.priceCents ?? 14990;
  if (lower === 'scale') return planConfig?.Scale?.priceCents ?? 23990;
  return planConfig?.Start?.priceCents ?? 0;
}

export function buildRevenueMetrics({
  tenants,
  clinics,
  paidInvoices,
  openInvoices,
  planConfig,
  today,
}) {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

  let mrrCents = 0;
  let trialClinics = 0;
  let activeClinics = 0;
  let blockedClinics = 0;

  for (const row of clinics) {
    if (row.financialStatus === 'blocked') {
      blockedClinics += 1;
      continue;
    }
    if (row.financialStatus === 'trial') trialClinics += 1;
    else activeClinics += 1;
    mrrCents += resolvePlanAmountCents(row.planCode, planConfig);
  }

  const totalOpenCents = (openInvoices || []).reduce((sum, inv) => sum + (inv.amount_cents || 0), 0);
  const overdueCents = (openInvoices || [])
    .filter((inv) => (inv.overdue_days || 0) > 0 || inv.status === 'overdue')
    .reduce((sum, inv) => sum + (inv.amount_cents || 0), 0);
  const delinquencyPct = totalOpenCents > 0 ? Math.round((overdueCents / totalOpenCents) * 1000) / 10 : 0;

  const receivedThisMonthCents = (paidInvoices || [])
    .filter((inv) => {
      if (!inv.paid_at) return false;
      const paid = new Date(inv.paid_at);
      return paid >= monthStart && paid <= monthEnd;
    })
    .reduce((sum, inv) => sum + (inv.amount_cents || 0), 0);

  return {
    mrrCents,
    arrCents: mrrCents * 12,
    receivedThisMonthCents,
    forecastCents: totalOpenCents,
    openReceivableCents: totalOpenCents,
    delinquencyPct,
    activeClinics,
    trialClinics,
    blockedClinics,
    totalClinics: tenants.length,
  };
}

export function buildRevenueFunnel(clinics) {
  const funnel = {
    active: { count: 0, amountCents: 0 },
    trial: { count: 0, amountCents: 0 },
    dueSoon: { count: 0, amountCents: 0 },
    overdue: { count: 0, amountCents: 0 },
    blockRecommended: { count: 0, amountCents: 0 },
    blocked: { count: 0, amountCents: 0 },
  };

  for (const row of clinics) {
    const amount = row.monthlyAmountCents || row.amountCents || 0;
    const status = row.financialStatus;
    if (status === 'blocked') {
      funnel.blocked.count += 1;
      funnel.blocked.amountCents += amount;
    } else if (status === 'block_recommended') {
      funnel.blockRecommended.count += 1;
      funnel.blockRecommended.amountCents += amount;
    } else if (status === 'overdue' || status === 'due_today') {
      funnel.overdue.count += 1;
      funnel.overdue.amountCents += amount;
    } else if (status === 'due_soon') {
      funnel.dueSoon.count += 1;
      funnel.dueSoon.amountCents += amount;
    } else if (status === 'trial') {
      funnel.trial.count += 1;
      funnel.trial.amountCents += amount;
    } else {
      funnel.active.count += 1;
      funnel.active.amountCents += amount;
    }
  }
  return funnel;
}

export function buildRevenueCharts({ paidInvoices, tenants, subscriptions, planConfig }) {
  const months = lastMonths(6);
  const monthlyMap = Object.fromEntries(months.map((m) => [m, 0]));
  for (const inv of paidInvoices || []) {
    if (!inv.paid_at) continue;
    const key = monthKey(inv.paid_at);
    if (monthlyMap[key] != null) monthlyMap[key] += inv.amount_cents || 0;
  }
  const monthlyRevenue = months.map((month) => ({ month, amountCents: monthlyMap[month] || 0 }));

  const growthMap = Object.fromEntries(months.map((m) => [m, 0]));
  for (const t of tenants || []) {
    if (!t.created_at) continue;
    const key = monthKey(t.created_at);
    if (growthMap[key] != null) growthMap[key] += 1;
  }
  let cumulative = (tenants || []).filter((t) => {
    if (!t.created_at) return false;
    return monthKey(t.created_at) < months[0];
  }).length;
  const clientGrowth = months.map((month) => {
    cumulative += growthMap[month] || 0;
    return { month, newClients: growthMap[month] || 0, totalClients: cumulative };
  });

  const planMap = {};
  for (const sub of subscriptions || []) {
    const plan = sub.plan_code || 'Start';
    planMap[plan] = (planMap[plan] || 0) + resolvePlanAmountCents(plan, planConfig);
  }
  const revenueByPlan = Object.entries(planMap).map(([plan, amountCents]) => ({ plan, amountCents }));

  return { monthlyRevenue, clientGrowth, revenueByPlan };
}

export function formatBillingOverviewResponse(overview) {
  const m = overview?.metrics || {};
  const mrrCents = Number(m.mrrCents) || 0;
  const arrCents = Number(m.arrCents) || mrrCents * 12;
  const receivedThisMonthCents = Number(m.receivedThisMonthCents) || 0;
  const forecastCents = Number(m.forecastCents ?? m.openReceivableCents) || 0;

  return {
    ok: true,
    metrics: {
      mrrCents,
      arrCents,
      receivedThisMonthCents,
      forecastCents,
      openReceivableCents: forecastCents,
      delinquencyPct: Number(m.delinquencyPct) || 0,
      activeClinics: Number(m.activeClinics) || 0,
      trialClinics: Number(m.trialClinics) || 0,
      blockedClinics: Number(m.blockedClinics) || 0,
      totalClinics: Number(m.totalClinics) || (overview?.clinics?.length ?? 0),
      mrr: mrrCents / 100,
      arr: arrCents / 100,
      receivedThisMonth: receivedThisMonthCents / 100,
      forecastRevenue: forecastCents / 100,
      delinquencyRate: Number(m.delinquencyPct) || 0,
    },
    funnel: overview?.funnel || {},
    charts: overview?.charts || { monthlyRevenue: [], clientGrowth: [], revenueByPlan: [] },
    clinics: overview?.clinics || [],
    tenants: overview?.clinics || [],
    alerts: overview?.alerts || [],
    backfill: overview?.backfill || null,
    buckets: overview?.buckets || {},
  };
}
