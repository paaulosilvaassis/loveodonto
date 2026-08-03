/**
 * Phase 4.10 Wave 3I — rotas de billing da Console.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createPlatformBillingRouteHandlers(deps) {
  const {
    platformBilling,
    normalizeDatabaseError,
    formatBillingOverviewResponse,
  } = deps;

  async function handleBillingOverview(req, res) {
    try {
      const overview = await platformBilling.getBillingOverview();
      return res.status(200).json(formatBillingOverviewResponse(overview));
    } catch (err) {
      console.error('[billing/overview]', err);
      return res.status(400).json({
        ok: false,
        error: normalizeDatabaseError(err, 'Falha ao carregar visão geral de cobrança.'),
      });
    }
  }

  async function handleTenantBilling(req, res) {
    try {
      const tenantId = normalizeText(req.params?.tenantId);
      if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório.' });
      const detail = await platformBilling.getTenantBilling(tenantId);
      if (!detail) return res.status(404).json({ error: 'Clínica não encontrada.' });
      return res.status(200).json(detail);
    } catch (err) {
      console.error('[billing/tenant]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao carregar cobrança da clínica.'),
      });
    }
  }

  async function handleMarkInvoicePaid(req, res) {
    try {
      const tenantId = normalizeText(req.params?.tenantId);
      const invoiceId = normalizeText(req.params?.invoiceId);
      if (!tenantId || !invoiceId) {
        return res.status(400).json({ error: 'tenantId e invoiceId são obrigatórios.' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const amountCents = body.amountCents != null ? Number(body.amountCents) : undefined;
      const result = await platformBilling.markInvoicePaid({
        tenantId,
        invoiceId,
        actor: req.platformActor,
        amountCents,
        paidAt: body.paidAt || body.data_pagamento || null,
        paymentMethod: normalizeText(body.paymentMethod || body.metodo || ''),
        notes: normalizeText(body.notes || body.observacao || ''),
        nextDueRule: normalizeText(body.nextDueRule || 'from_payment') === 'from_previous_due'
          ? 'from_previous_due'
          : 'from_payment',
      });
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error('[billing/mark-paid]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao registrar pagamento.'),
      });
    }
  }

  async function handleBlockForBilling(req, res) {
    try {
      const tenantId = normalizeText(req.params?.tenantId);
      if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório.' });
      const reason = normalizeText(req.body?.reason) || 'atraso_financeiro';
      const tenant = await platformBilling.blockTenantForBilling({
        tenantId,
        actor: req.platformActor,
        reason,
      });
      return res.status(200).json({ success: true, tenant });
    } catch (err) {
      console.error('[billing/block]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao bloquear clínica por cobrança.'),
      });
    }
  }

  async function handleUnblock(req, res) {
    try {
      const tenantId = normalizeText(req.params?.tenantId);
      if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório.' });
      const tenant = await platformBilling.unblockTenant({
        tenantId,
        actor: req.platformActor,
      });
      return res.status(200).json({ success: true, tenant });
    } catch (err) {
      console.error('[billing/unblock]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao desbloquear clínica.'),
      });
    }
  }

  async function handleUpdateDueDate(req, res) {
    try {
      const tenantId = normalizeText(req.params?.tenantId);
      const invoiceId = normalizeText(req.params?.invoiceId);
      const dueDate = req.body?.dueDate || req.body?.due_date;
      if (!tenantId || !invoiceId || !dueDate) {
        return res.status(400).json({ error: 'tenantId, invoiceId e dueDate são obrigatórios.' });
      }
      const invoice = await platformBilling.updateInvoiceDueDate({
        tenantId,
        invoiceId,
        dueDate,
        actor: req.platformActor,
      });
      return res.status(200).json({ success: true, invoice });
    } catch (err) {
      console.error('[billing/due-date]', err);
      return res.status(400).json({ error: normalizeDatabaseError(err, 'Falha ao alterar vencimento.') });
    }
  }

  async function handleUpdatePlan(req, res) {
    try {
      const tenantId = normalizeText(req.params?.tenantId);
      const planCode = normalizeText(req.body?.planCode || req.body?.plan);
      if (!tenantId || !planCode) {
        return res.status(400).json({ error: 'tenantId e planCode são obrigatórios.' });
      }
      const result = await platformBilling.updateSubscriptionPlan({
        tenantId,
        planCode,
        actor: req.platformActor,
      });
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error('[billing/plan]', err);
      return res.status(400).json({ error: normalizeDatabaseError(err, 'Falha ao alterar plano.') });
    }
  }

  async function handleApplyDiscount(req, res) {
    try {
      const tenantId = normalizeText(req.params?.tenantId);
      const invoiceId = normalizeText(req.params?.invoiceId);
      const discountCents = Number(req.body?.discountCents ?? req.body?.discount_cents ?? 0);
      if (!tenantId || !invoiceId) {
        return res.status(400).json({ error: 'tenantId e invoiceId são obrigatórios.' });
      }
      const invoice = await platformBilling.applyInvoiceDiscount({
        tenantId,
        invoiceId,
        discountCents,
        notes: normalizeText(req.body?.notes || ''),
        actor: req.platformActor,
      });
      return res.status(200).json({ success: true, invoice });
    } catch (err) {
      console.error('[billing/discount]', err);
      return res.status(400).json({ error: normalizeDatabaseError(err, 'Falha ao aplicar desconto.') });
    }
  }

  async function handleEvaluateBilling(req, res) {
    try {
      const result = await platformBilling.evaluateBillingStatus({
        actorId: req.platformActor?.id || null,
      });
      return res.status(200).json({
        ok: true,
        evaluated: true,
        summary: {
          evaluated: result.evaluated ?? 0,
          updated: result.updated ?? 0,
          alertsCreated: result.alertsCreated ?? 0,
          asOf: result.asOf ?? null,
          skipped: Boolean(result.skipped),
        },
      });
    } catch (err) {
      console.error('[billing/evaluate]', err);
      return res.status(400).json({
        ok: false,
        error: normalizeDatabaseError(err, 'Falha ao avaliar status de cobrança.'),
      });
    }
  }

  return {
    handleBillingOverview,
    handleTenantBilling,
    handleMarkInvoicePaid,
    handleBlockForBilling,
    handleUnblock,
    handleUpdateDueDate,
    handleUpdatePlan,
    handleApplyDiscount,
    handleEvaluateBilling,
  };
}
