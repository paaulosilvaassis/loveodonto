/**
 * Cobrança SaaS da Platform Console — isolada do financeiro interno da clínica.
 */

import {
  buildRevenueCharts,
  buildRevenueFunnel,
  buildRevenueMetrics,
  resolveFinancialStatus,
  resolvePlanAmountCents as resolvePlanAmountFromConfig,
} from './platformRevenueMetrics.js';

const MS_PER_DAY = 86_400_000;
const TRIAL_DAYS = 30;
const BILLING_CYCLE_DAYS = 30;

export const INVOICE_STATUSES = new Set(['open', 'due_today', 'overdue', 'paid', 'canceled']);
export const SUBSCRIPTION_STATUSES = new Set([
  'active_trial',
  'trial',
  'active',
  'vencido',
  'inadimplente',
  'bloqueio_recomendado',
  'canceled',
  'ended',
]);

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateOnlyString(date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(fromDate, toDate) {
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function isMissingBillingTableError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01'
    || (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('could not find the table') && message.includes('platform_'))
    || (message.includes('schema cache') && message.includes('platform_'))
  );
}

function isMissingTenantBillingColumnError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42703'
    || (message.includes('column') && message.includes('does not exist'))
    || (message.includes('schema cache') && message.includes('tenants'))
  );
}

const TENANT_BILLING_SELECT_FULL =
  'id, legal_name, trade_name, plan_code, status, billing_status, billing_blocked_at, billing_blocked_reason, billing_unblocked_at, billing_last_evaluated_at, owner_name, owner_email, created_at';

const TENANT_BILLING_SELECT_BASE =
  'id, legal_name, trade_name, plan_code, status, billing_status, owner_name, owner_email, created_at';

async function fetchTenantsForBilling(supabase) {
  const full = await supabase.from('tenants').select(TENANT_BILLING_SELECT_FULL);
  if (full.error && isMissingTenantBillingColumnError(full.error)) {
    return supabase.from('tenants').select(TENANT_BILLING_SELECT_BASE);
  }
  return full;
}

function resolvePlanAmountCents(planCode, planConfig) {
  return resolvePlanAmountFromConfig(planCode, planConfig);
}

function normalizePlanCodeForBilling(planCode) {
  const raw = String(planCode || '').trim();
  if (!raw) return 'Start';
  const lower = raw.toLowerCase();
  if (lower === 'start') return 'Start';
  if (lower === 'growth') return 'Growth';
  if (lower === 'scale') return 'Scale';
  return raw;
}

async function insertBillingEvent(supabase, { tenantId, invoiceId, eventType, message, createdBy = null }) {
  const { error } = await supabase.from('platform_billing_events').insert({
    tenant_id: tenantId,
    invoice_id: invoiceId || null,
    event_type: eventType,
    message,
    created_by: createdBy,
  });
  if (error && !isMissingBillingTableError(error)) throw error;
}

async function upsertOpenAlert(supabase, {
  tenantId,
  invoiceId,
  alertType,
  severity,
  title,
  description,
}) {
  const { data: existing, error: existingError } = await supabase
    .from('platform_billing_alerts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('alert_type', alertType)
    .is('resolved_at', null)
    .maybeSingle();
  if (existingError && !isMissingBillingTableError(existingError)) throw existingError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from('platform_billing_alerts')
    .insert({
      tenant_id: tenantId,
      invoice_id: invoiceId || null,
      alert_type: alertType,
      severity,
      title,
      description,
      is_read: false,
    })
    .select('id')
    .single();
  if (error && !isMissingBillingTableError(error)) throw error;
  return data?.id || null;
}

function resolveSubscriptionStatus({ overdueDays, daysUntilDue, currentStatus }) {
  if (overdueDays >= 11) return 'bloqueio_recomendado';
  if (overdueDays >= 1) return 'inadimplente';
  if (daysUntilDue === 0) return 'vencido';
  if (daysUntilDue > 0 && daysUntilDue <= 5) return currentStatus === 'active' ? 'active' : 'active_trial';
  return currentStatus || 'active_trial';
}

function resolveInvoiceStatus({ overdueDays, daysUntilDue, currentStatus }) {
  if (currentStatus === 'paid' || currentStatus === 'canceled') return currentStatus;
  if (overdueDays >= 1) return 'overdue';
  if (daysUntilDue === 0) return 'due_today';
  return 'open';
}

function resolveTenantBillingStatus(subscriptionStatus, tenantStatus) {
  if (tenantStatus === 'billing_blocked') return 'blocked';
  if (subscriptionStatus === 'bloqueio_recomendado') return 'block_recommended';
  if (subscriptionStatus === 'inadimplente') return 'overdue';
  if (subscriptionStatus === 'vencido') return 'due_today';
  return 'ok';
}

export function createPlatformBillingService({ supabase, planConfig, insertAuditLog }) {
  async function provisionBillingForTenant({
    tenantId,
    planCode,
    actorId = null,
    amountCents,
    startedAt = null,
  }) {
    const startDate = startedAt ? startOfDay(startedAt) : new Date();
    const dueDate = addDays(startDate, TRIAL_DAYS);
    const dueDateStr = toDateOnlyString(dueDate);
    const normalizedPlan = normalizePlanCodeForBilling(planCode);
    const resolvedAmount = Number.isFinite(Number(amountCents))
      ? Number(amountCents)
      : resolvePlanAmountCents(normalizedPlan, planConfig);

    const { data: subscription, error: subscriptionError } = await supabase
      .from('platform_subscriptions')
      .insert({
        tenant_id: tenantId,
        plan_code: normalizedPlan,
        status: 'active_trial',
        started_at: startDate.toISOString(),
        trial_ends_at: dueDate.toISOString(),
        current_period_start: startDate.toISOString(),
        current_period_end: dueDate.toISOString(),
        next_due_date: dueDateStr,
        grace_days: 10,
        block_after_days: 11,
      })
      .select('*')
      .single();
    if (subscriptionError) throw subscriptionError;

    const { data: invoice, error: invoiceError } = await supabase
      .from('platform_invoices')
      .insert({
        tenant_id: tenantId,
        subscription_id: subscription.id,
        amount_cents: resolvedAmount,
        due_date: dueDateStr,
        status: 'open',
        overdue_days: 0,
      })
      .select('*')
      .single();
    if (invoiceError) throw invoiceError;

    await insertBillingEvent(supabase, {
      tenantId,
      invoiceId: invoice.id,
      eventType: 'subscription.created',
      message: `Assinatura SaaS criada com trial de ${TRIAL_DAYS} dias. Primeira cobrança em ${dueDateStr}.`,
      createdBy: actorId,
    });

    return { subscription, invoice };
  }

  async function backfillMissingBillingForTenants() {
    const tenantsResult = await fetchTenantsForBilling(supabase);
    if (tenantsResult.error) throw tenantsResult.error;

    const { data: subscriptions, error: subsError } = await supabase
      .from('platform_subscriptions')
      .select('tenant_id');
    if (subsError) {
      if (isMissingBillingTableError(subsError)) {
        return { backfilled: 0, skipped: true };
      }
      throw subsError;
    }

    const tenantsWithSub = new Set((subscriptions || []).map((row) => row.tenant_id));
    let backfilled = 0;

    for (const tenant of tenantsResult.data || []) {
      if (tenantsWithSub.has(tenant.id)) continue;
      const planCode = normalizePlanCodeForBilling(tenant.plan_code);
      await provisionBillingForTenant({
        tenantId: tenant.id,
        planCode,
        amountCents: resolvePlanAmountCents(planCode, planConfig),
        startedAt: tenant.created_at || null,
        actorId: null,
      });
      tenantsWithSub.add(tenant.id);
      backfilled += 1;
    }

    return { backfilled, skipped: false };
  }

  async function evaluateBillingStatus({ actorId = null } = {}) {
    await backfillMissingBillingForTenants();

    const today = startOfDay();
    const todayStr = toDateOnlyString(today);

    const { data: invoices, error: invoicesError } = await supabase
      .from('platform_invoices')
      .select('*, platform_subscriptions(id, status, plan_code, grace_days, block_after_days)')
      .in('status', ['open', 'due_today', 'overdue'])
      .order('due_date', { ascending: true });
    if (invoicesError) {
      if (isMissingBillingTableError(invoicesError)) {
        return { evaluated: 0, updated: 0, alertsCreated: 0, skipped: true };
      }
      throw invoicesError;
    }

    let updated = 0;
    let alertsCreated = 0;

    for (const invoice of invoices || []) {
      const dueDate = invoice.due_date;
      const daysUntilDue = daysBetween(today, dueDate);
      const overdueDays = Math.max(0, daysBetween(dueDate, today));
      const subscription = invoice.platform_subscriptions || null;
      const subscriptionStatus = resolveSubscriptionStatus({
        overdueDays,
        daysUntilDue,
        currentStatus: subscription?.status,
      });
      const invoiceStatus = resolveInvoiceStatus({
        overdueDays,
        daysUntilDue,
        currentStatus: invoice.status,
      });

      const invoicePatch = {
        status: invoiceStatus,
        overdue_days: overdueDays,
        updated_at: new Date().toISOString(),
      };
      const { error: invoiceUpdateError } = await supabase
        .from('platform_invoices')
        .update(invoicePatch)
        .eq('id', invoice.id);
      if (invoiceUpdateError) throw invoiceUpdateError;

      if (subscription?.id) {
        const { error: subUpdateError } = await supabase
          .from('platform_subscriptions')
          .update({
            status: subscriptionStatus,
            next_due_date: dueDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);
        if (subUpdateError) throw subUpdateError;
      }

      const { data: tenantRow } = await supabase
        .from('tenants')
        .select('id, status, billing_status')
        .eq('id', invoice.tenant_id)
        .maybeSingle();

      const tenantBillingStatus = resolveTenantBillingStatus(
        subscriptionStatus,
        tenantRow?.status,
      );
      if (tenantRow?.id && tenantRow.status !== 'billing_blocked') {
        await supabase
          .from('tenants')
          .update({
            billing_status: tenantBillingStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tenantRow.id);
      }

      if (daysUntilDue === 5) {
        const alertId = await upsertOpenAlert(supabase, {
          tenantId: invoice.tenant_id,
          invoiceId: invoice.id,
          alertType: 'vencendo_em_5_dias',
          severity: 'warning',
          title: 'Cobrança vence em 5 dias',
          description: `A fatura SaaS vence em ${dueDate}. Considere notificar o responsável financeiro.`,
        });
        if (alertId) alertsCreated += 1;
        await insertBillingEvent(supabase, {
          tenantId: invoice.tenant_id,
          invoiceId: invoice.id,
          eventType: 'alert.vencendo_em_5_dias',
          message: 'Alerta: cobrança vence em 5 dias.',
          createdBy: actorId,
        });
      }

      if (daysUntilDue === 0) {
        const alertId = await upsertOpenAlert(supabase, {
          tenantId: invoice.tenant_id,
          invoiceId: invoice.id,
          alertType: 'vencido_hoje',
          severity: 'warning',
          title: 'Cobrança vencida hoje',
          description: 'A fatura SaaS vence hoje. A clínica permanece ativa até decisão administrativa.',
        });
        if (alertId) alertsCreated += 1;
        await insertBillingEvent(supabase, {
          tenantId: invoice.tenant_id,
          invoiceId: invoice.id,
          eventType: 'invoice.due_today',
          message: 'Cobrança vencida hoje — clínica permanece ativa.',
          createdBy: actorId,
        });
      }

      if (overdueDays >= 1 && overdueDays <= 10) {
        const alertId = await upsertOpenAlert(supabase, {
          tenantId: invoice.tenant_id,
          invoiceId: invoice.id,
          alertType: 'inadimplente',
          severity: 'danger',
          title: `Inadimplente — ${overdueDays} dia(s) de atraso`,
          description: 'Cliente em atraso financeiro. Acesso mantido com alerta administrativo.',
        });
        if (alertId) alertsCreated += 1;
      }

      if (overdueDays >= 11) {
        const alertId = await upsertOpenAlert(supabase, {
          tenantId: invoice.tenant_id,
          invoiceId: invoice.id,
          alertType: 'bloqueio_recomendado',
          severity: 'critical',
          title: 'Bloqueio recomendado',
          description: `Cliente com ${overdueDays} dias de atraso. Bloqueio recomendado — aguardando ação do administrador.`,
        });
        if (alertId) alertsCreated += 1;
        await insertBillingEvent(supabase, {
          tenantId: invoice.tenant_id,
          invoiceId: invoice.id,
          eventType: 'alert.bloqueio_recomendado',
          message: `Cliente com ${overdueDays} dias de atraso. Bloqueio recomendado.`,
          createdBy: actorId,
        });
      }

      updated += 1;
    }

    const evaluatedAt = new Date().toISOString();
    const { error: evalMarkError } = await supabase
      .from('tenants')
      .update({ billing_last_evaluated_at: evaluatedAt })
      .not('id', 'is', null);
    if (evalMarkError && !isMissingTenantBillingColumnError(evalMarkError)) throw evalMarkError;

    return {
      evaluated: (invoices || []).length,
      updated,
      alertsCreated,
      asOf: todayStr,
    };
  }

  async function getBillingOverview() {
    const backfillResult = await backfillMissingBillingForTenants();

    const tenantsResult = await fetchTenantsForBilling(supabase);
    if (tenantsResult.error) throw tenantsResult.error;
    const tenants = tenantsResult.data || [];

    const [
      subscriptionsResult,
      openInvoicesResult,
      paidInvoicesResult,
      alertsResult,
      legalProfilesResult,
    ] = await Promise.all([
      supabase.from('platform_subscriptions').select('id, tenant_id, plan_code, status, next_due_date, started_at'),
      supabase.from('platform_invoices').select('id, tenant_id, subscription_id, amount_cents, due_date, status, overdue_days, paid_at').in('status', ['open', 'due_today', 'overdue']),
      supabase.from('platform_invoices').select('id, tenant_id, amount_cents, paid_at, status').eq('status', 'paid').order('paid_at', { ascending: false }).limit(500),
      supabase.from('platform_billing_alerts').select('id, tenant_id, alert_type, severity, title, is_read, created_at').is('resolved_at', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('tenant_legal_profiles').select('tenant_id, billing_contact_name, billing_contact_email, legal_representative_name, legal_representative_email'),
    ]);

    if (subscriptionsResult.error && !isMissingBillingTableError(subscriptionsResult.error)) throw subscriptionsResult.error;
    if (openInvoicesResult.error && !isMissingBillingTableError(openInvoicesResult.error)) throw openInvoicesResult.error;
    if (paidInvoicesResult.error && !isMissingBillingTableError(paidInvoicesResult.error)) throw paidInvoicesResult.error;
    if (alertsResult.error && !isMissingBillingTableError(alertsResult.error)) throw alertsResult.error;
    if (legalProfilesResult.error) throw legalProfilesResult.error;

    const subscriptions = subscriptionsResult.data || [];
    const openInvoices = openInvoicesResult.data || [];
    const paidInvoices = paidInvoicesResult.data || [];
    const today = startOfDay();
    const subsByTenant = new Map(subscriptions.map((row) => [row.tenant_id, row]));
    const legalByTenant = new Map((legalProfilesResult.data || []).map((row) => [row.tenant_id, row]));

    const lastPaidByTenant = new Map();
    for (const inv of paidInvoices) {
      if (!lastPaidByTenant.has(inv.tenant_id)) lastPaidByTenant.set(inv.tenant_id, inv);
    }

    const buckets = {
      totalDue: { count: 0, amountCents: 0 },
      dueIn5Days: { count: 0, amountCents: 0 },
      dueToday: { count: 0, amountCents: 0 },
      delinquentUpTo10: { count: 0, amountCents: 0 },
      blockRecommended: { count: 0, amountCents: 0 },
      blocked: { count: 0, amountCents: 0 },
    };

    const clinics = tenants.map((tenant) => {
      const subscription = subsByTenant.get(tenant.id) || null;
      const legal = legalByTenant.get(tenant.id) || null;
      const invoice = openInvoices
        .filter((row) => row.tenant_id === tenant.id)
        .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] || null;
      const lastPaid = lastPaidByTenant.get(tenant.id) || null;

      const daysUntilDue = invoice ? daysBetween(today, invoice.due_date) : null;
      const overdueDays = invoice?.overdue_days || 0;
      const amountCents = invoice?.amount_cents || 0;
      const planCode = subscription?.plan_code || tenant.plan_code;
      const monthlyAmountCents = resolvePlanAmountCents(planCode, planConfig);
      const subscriptionStatus = subscription?.status || tenant.billing_status || 'ok';
      const isBlocked = tenant.status === 'billing_blocked' || tenant.status === 'blocked';
      const financialStatus = resolveFinancialStatus({
        isBlocked,
        subscriptionStatus,
        invoiceStatus: invoice?.status,
        daysUntilDue,
        overdueDays,
      });
      const daysRemaining = isBlocked ? null : (overdueDays > 0 ? -overdueDays : daysUntilDue);

      if (invoice && !isBlocked) {
        buckets.totalDue.count += 1;
        buckets.totalDue.amountCents += amountCents;
        if (daysUntilDue === 5) { buckets.dueIn5Days.count += 1; buckets.dueIn5Days.amountCents += amountCents; }
        if (daysUntilDue === 0) { buckets.dueToday.count += 1; buckets.dueToday.amountCents += amountCents; }
        if (overdueDays >= 1 && overdueDays <= 10) { buckets.delinquentUpTo10.count += 1; buckets.delinquentUpTo10.amountCents += amountCents; }
        if (overdueDays >= 11) { buckets.blockRecommended.count += 1; buckets.blockRecommended.amountCents += amountCents; }
      }
      if (isBlocked) {
        buckets.blocked.count += 1;
        buckets.blocked.amountCents += amountCents;
      }

      return {
        tenantId: tenant.id,
        clinicName: tenant.trade_name || tenant.legal_name,
        responsibleName: legal?.billing_contact_name || legal?.legal_representative_name || tenant.owner_name || '—',
        responsibleEmail: legal?.billing_contact_email || legal?.legal_representative_email || tenant.owner_email || '',
        planCode,
        dueDate: invoice?.due_date || subscription?.next_due_date || null,
        subscriptionStatus,
        financialStatus,
        tenantStatus: tenant.status,
        overdueDays,
        daysRemaining,
        amountCents,
        monthlyAmountCents,
        invoiceId: invoice?.id || null,
        invoiceStatus: invoice?.status || null,
        lastPaymentAt: lastPaid?.paid_at || null,
        lastPaymentCents: lastPaid?.amount_cents || null,
        isBlocked,
      };
    });

    const sortedClinics = clinics.sort((a, b) => {
      const aOverdue = a.overdueDays || 0;
      const bOverdue = b.overdueDays || 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
    });

    const metrics = buildRevenueMetrics({
      tenants,
      clinics: sortedClinics,
      paidInvoices,
      openInvoices,
      planConfig,
      today,
    });
    const funnel = buildRevenueFunnel(sortedClinics);
    const charts = buildRevenueCharts({
      paidInvoices,
      tenants,
      subscriptions,
      planConfig,
    });

    return {
      metrics,
      funnel,
      charts,
      buckets,
      clinics: sortedClinics,
      alerts: alertsResult.data || [],
      backfill: backfillResult,
    };
  }

  async function getTenantBilling(tenantId) {
    await backfillMissingBillingForTenants();

    let tenantResult = await supabase
      .from('tenants')
      .select(`${TENANT_BILLING_SELECT_FULL}, owner_email`)
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantResult.error && isMissingTenantBillingColumnError(tenantResult.error)) {
      tenantResult = await supabase
        .from('tenants')
        .select(`${TENANT_BILLING_SELECT_BASE}, owner_email`)
        .eq('id', tenantId)
        .maybeSingle();
    }
    const { data: tenant, error: tenantError } = tenantResult;
    if (tenantError) throw tenantError;
    if (!tenant?.id) return null;

    const [
      subscriptionResult,
      invoicesResult,
      eventsResult,
      alertsResult,
      legalResult,
    ] = await Promise.all([
      supabase.from('platform_subscriptions').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('platform_invoices').select('*').eq('tenant_id', tenantId).order('due_date', { ascending: false }),
      supabase.from('platform_billing_events').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(40),
      supabase.from('platform_billing_alerts').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(20),
      supabase.from('tenant_legal_profiles').select('billing_contact_name, billing_contact_email, billing_contact_phone').eq('tenant_id', tenantId).maybeSingle(),
    ]);

    if (subscriptionResult.error && !isMissingBillingTableError(subscriptionResult.error)) throw subscriptionResult.error;
    if (invoicesResult.error && !isMissingBillingTableError(invoicesResult.error)) throw invoicesResult.error;
    if (eventsResult.error && !isMissingBillingTableError(eventsResult.error)) throw eventsResult.error;
    if (alertsResult.error && !isMissingBillingTableError(alertsResult.error)) throw alertsResult.error;
    if (legalResult.error) throw legalResult.error;

    const { data: auditRows, error: auditError } = await supabase
      .from('audit_logs')
      .select('id, action, target_type, target_id, metadata, actor_role, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (auditError && !isMissingBillingTableError(auditError)) throw auditError;

    const openInvoice = (invoicesResult.data || []).find((row) => ['open', 'due_today', 'overdue'].includes(row.status)) || null;
    const isBlocked = tenant.status === 'billing_blocked' || tenant.status === 'blocked';
    const today = startOfDay();
    const daysUntilDue = openInvoice ? daysBetween(today, openInvoice.due_date) : null;
    const financialStatus = resolveFinancialStatus({
      isBlocked,
      subscriptionStatus: subscriptionResult.data?.status,
      invoiceStatus: openInvoice?.status,
      daysUntilDue,
      overdueDays: openInvoice?.overdue_days || 0,
    });

    return {
      tenant,
      subscription: subscriptionResult.data || null,
      invoices: invoicesResult.data || [],
      events: eventsResult.data || [],
      alerts: alertsResult.data || [],
      billingContact: legalResult.data || null,
      auditLogs: auditRows || [],
      financialStatus,
    };
  }

  async function markInvoicePaid({
    tenantId,
    invoiceId,
    actor,
    amountCents,
    paidAt,
    paymentMethod,
    notes,
    nextDueRule = 'from_payment',
  }) {
    const { data: invoice, error: invoiceError } = await supabase
      .from('platform_invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice?.id) throw new Error('Fatura não encontrada para esta clínica.');

    const paidDate = paidAt ? startOfDay(paidAt) : startOfDay();
    const paidIso = paidDate.toISOString();
    const resolvedAmount = Number.isFinite(Number(amountCents)) ? Number(amountCents) : invoice.amount_cents;

    const { error: paidUpdateError } = await supabase
      .from('platform_invoices')
      .update({
        status: 'paid',
        paid_at: paidIso,
        amount_cents: resolvedAmount,
        payment_method: paymentMethod || null,
        notes: notes || null,
        overdue_days: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);
    if (paidUpdateError) throw paidUpdateError;

    const baseForNextDue = nextDueRule === 'from_previous_due'
      ? startOfDay(invoice.due_date)
      : paidDate;
    const nextDueDate = addDays(baseForNextDue, BILLING_CYCLE_DAYS);
    const nextDueStr = toDateOnlyString(nextDueDate);

    const { data: subscription } = await supabase
      .from('platform_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscription?.id) {
      await supabase
        .from('platform_subscriptions')
        .update({
          status: 'active',
          current_period_start: paidIso,
          current_period_end: nextDueDate.toISOString(),
          next_due_date: nextDueStr,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);
    }

    const planCode = subscription?.plan_code;
    const planAmount = (planCode && planConfig?.[planCode]?.priceCents) ?? resolvedAmount;

    const { data: nextInvoice, error: nextInvoiceError } = await supabase
      .from('platform_invoices')
      .insert({
        tenant_id: tenantId,
        subscription_id: subscription?.id || invoice.subscription_id,
        amount_cents: planAmount,
        due_date: nextDueStr,
        status: 'open',
        overdue_days: 0,
      })
      .select('*')
      .single();
    if (nextInvoiceError) throw nextInvoiceError;

    await supabase
      .from('platform_billing_alerts')
      .update({ resolved_at: new Date().toISOString(), is_read: true })
      .eq('tenant_id', tenantId)
      .is('resolved_at', null);

    const tenantPatch = {
      billing_status: 'ok',
      updated_at: new Date().toISOString(),
    };
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('status')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantRow?.status === 'billing_blocked') {
      tenantPatch.status = 'active';
      tenantPatch.billing_blocked_at = null;
      tenantPatch.billing_blocked_reason = null;
      tenantPatch.billing_unblocked_at = new Date().toISOString();
    }
    const { error: tenantUpdateError } = await supabase.from('tenants').update(tenantPatch).eq('id', tenantId);
    if (tenantUpdateError && isMissingTenantBillingColumnError(tenantUpdateError)) {
      await supabase.from('tenants').update({
        status: tenantRow?.status === 'billing_blocked' ? 'active' : tenantRow?.status,
        billing_status: 'ok',
        updated_at: tenantPatch.updated_at,
      }).eq('id', tenantId);
    }

    await insertBillingEvent(supabase, {
      tenantId,
      invoiceId,
      eventType: 'invoice.paid',
      message: `Pagamento registrado: R$ ${(resolvedAmount / 100).toFixed(2)} em ${toDateOnlyString(paidDate)}.`,
      createdBy: actor?.id || null,
    });

    if (insertAuditLog) {
      await insertAuditLog({
        actor,
        action: 'billing.invoice.paid',
        targetType: 'platform_invoice',
        targetId: invoiceId,
        tenantId,
        metadata: { amountCents: resolvedAmount, paymentMethod, nextDueDate: nextDueStr },
      });
    }

    return { invoice: { ...invoice, status: 'paid', paid_at: paidIso }, nextInvoice };
  }

  async function blockTenantForBilling({ tenantId, actor, reason = 'atraso_financeiro' }) {
    const nowIso = new Date().toISOString();
    const patch = {
      status: 'billing_blocked',
      billing_blocked_at: nowIso,
      billing_blocked_reason: reason,
      billing_unblocked_at: null,
      billing_status: 'blocked',
      updated_at: nowIso,
    };
    let tenantResult = await supabase
      .from('tenants')
      .update(patch)
      .eq('id', tenantId)
      .select('id, legal_name, trade_name, status, billing_blocked_at, billing_blocked_reason')
      .single();
    if (tenantResult.error && isMissingTenantBillingColumnError(tenantResult.error)) {
      tenantResult = await supabase
        .from('tenants')
        .update({
          status: 'billing_blocked',
          billing_status: 'blocked',
          updated_at: nowIso,
        })
        .eq('id', tenantId)
        .select('id, legal_name, trade_name, status')
        .single();
    }
    const { data: tenant, error: tenantError } = tenantResult;
    if (tenantError) throw tenantError;

    await insertBillingEvent(supabase, {
      tenantId,
      invoiceId: null,
      eventType: 'tenant.blocked',
      message: 'Clínica bloqueada por inadimplência (ação administrativa).',
      createdBy: actor?.id || null,
    });

    if (insertAuditLog) {
      await insertAuditLog({
        actor,
        action: 'billing.tenant.blocked',
        targetType: 'tenant',
        targetId: tenantId,
        tenantId,
        metadata: { reason },
      });
    }

    return tenant;
  }

  async function unblockTenant({ tenantId, actor }) {
    const nowIso = new Date().toISOString();
    const patch = {
      status: 'active',
      billing_blocked_at: null,
      billing_blocked_reason: null,
      billing_unblocked_at: nowIso,
      billing_status: 'ok',
      updated_at: nowIso,
    };
    let tenantResult = await supabase
      .from('tenants')
      .update(patch)
      .eq('id', tenantId)
      .select('id, legal_name, trade_name, status, billing_blocked_at, billing_blocked_reason')
      .single();
    if (tenantResult.error && isMissingTenantBillingColumnError(tenantResult.error)) {
      tenantResult = await supabase
        .from('tenants')
        .update({
          status: 'active',
          billing_status: 'ok',
          updated_at: nowIso,
        })
        .eq('id', tenantId)
        .select('id, legal_name, trade_name, status')
        .single();
    }
    const { data: tenant, error: tenantError } = tenantResult;
    if (tenantError) throw tenantError;

    await insertBillingEvent(supabase, {
      tenantId,
      invoiceId: null,
      eventType: 'tenant.unblocked',
      message: 'Bloqueio financeiro removido pelo administrador.',
      createdBy: actor?.id || null,
    });

    if (insertAuditLog) {
      await insertAuditLog({
        actor,
        action: 'billing.tenant.unblocked',
        targetType: 'tenant',
        targetId: tenantId,
        tenantId,
        metadata: {},
      });
    }

    return tenant;
  }

  async function updateInvoiceDueDate({ tenantId, invoiceId, dueDate, actor }) {
    const dueDateStr = toDateOnlyString(dueDate);
    const { data: invoice, error } = await supabase
      .from('platform_invoices')
      .update({ due_date: dueDateStr, updated_at: new Date().toISOString() })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (error) throw error;
    if (invoice?.subscription_id) {
      await supabase.from('platform_subscriptions').update({
        next_due_date: dueDateStr,
        current_period_end: new Date(`${dueDateStr}T12:00:00`).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', invoice.subscription_id);
    }
    await insertBillingEvent(supabase, {
      tenantId,
      invoiceId,
      eventType: 'invoice.due_date_changed',
      message: `Vencimento alterado para ${dueDateStr}.`,
      createdBy: actor?.id || null,
    });
    if (insertAuditLog) {
      await insertAuditLog({
        actor,
        action: 'billing.invoice.due_date',
        targetType: 'platform_invoice',
        targetId: invoiceId,
        tenantId,
        metadata: { dueDate: dueDateStr },
      });
    }
    return invoice;
  }

  async function updateSubscriptionPlan({ tenantId, planCode, actor }) {
    const normalizedPlan = normalizePlanCodeForBilling(planCode);
    const amountCents = resolvePlanAmountCents(normalizedPlan, planConfig);
    const { data: subscription, error: subError } = await supabase
      .from('platform_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw subError;
    if (!subscription?.id) throw new Error('Assinatura SaaS não encontrada.');

    await supabase.from('platform_subscriptions').update({
      plan_code: normalizedPlan,
      updated_at: new Date().toISOString(),
    }).eq('id', subscription.id);

    await supabase.from('tenants').update({
      plan_code: normalizedPlan,
      updated_at: new Date().toISOString(),
    }).eq('id', tenantId);

    await supabase.from('platform_invoices')
      .update({ amount_cents: amountCents, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'due_today', 'overdue']);

    await insertBillingEvent(supabase, {
      tenantId,
      invoiceId: null,
      eventType: 'subscription.plan_changed',
      message: `Plano alterado para ${normalizedPlan}.`,
      createdBy: actor?.id || null,
    });
    if (insertAuditLog) {
      await insertAuditLog({
        actor,
        action: 'billing.plan.changed',
        targetType: 'platform_subscription',
        targetId: subscription.id,
        tenantId,
        metadata: { planCode: normalizedPlan, amountCents },
      });
    }
    return { planCode: normalizedPlan, amountCents };
  }

  async function applyInvoiceDiscount({ tenantId, invoiceId, discountCents, notes, actor }) {
    const discount = Math.max(0, Number(discountCents) || 0);
    const { data: invoice, error: fetchError } = await supabase
      .from('platform_invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!invoice?.id) throw new Error('Fatura não encontrada.');
    const newAmount = Math.max(0, (invoice.amount_cents || 0) - discount);
    const noteText = notes ? `${invoice.notes || ''}\n${notes}`.trim() : invoice.notes;

    const { data: updated, error } = await supabase
      .from('platform_invoices')
      .update({
        amount_cents: newAmount,
        notes: noteText || `Desconto de R$ ${(discount / 100).toFixed(2)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)
      .select('*')
      .single();
    if (error) throw error;

    await insertBillingEvent(supabase, {
      tenantId,
      invoiceId,
      eventType: 'invoice.discount_applied',
      message: `Desconto de R$ ${(discount / 100).toFixed(2)} aplicado. Novo valor: R$ ${(newAmount / 100).toFixed(2)}.`,
      createdBy: actor?.id || null,
    });
    if (insertAuditLog) {
      await insertAuditLog({
        actor,
        action: 'billing.invoice.discount',
        targetType: 'platform_invoice',
        targetId: invoiceId,
        tenantId,
        metadata: { discountCents: discount, newAmountCents: newAmount },
      });
    }
    return updated;
  }

  return {
    provisionBillingForTenant,
    backfillMissingBillingForTenants,
    evaluateBillingStatus,
    getBillingOverview,
    getTenantBilling,
    markInvoicePaid,
    blockTenantForBilling,
    unblockTenant,
    updateInvoiceDueDate,
    updateSubscriptionPlan,
    applyInvoiceDiscount,
    TRIAL_DAYS,
    BILLING_CYCLE_DAYS,
  };
}
