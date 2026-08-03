/**
 * Phase 5.13 — Escrita core financeira via Admin API.
 * POST/PUT/DELETE /internal/app/financial/*
 *
 * Tenant exclusivamente via Core Tenant — nunca via body/query do frontend.
 */

import {
  FINANCINGS_LIST_SELECT,
  FORBIDDEN_TENANT_IDS,
  PAYABLES_LIST_SELECT,
  RECEIVABLES_LIST_SELECT,
} from './financialApiList.js';

export class FinancialWriteValidationError extends Error {
  constructor(message, code = 'INVALID_BODY') {
    super(message);
    this.name = 'FinancialWriteValidationError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeAmount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function assertNoTenantIdInFinancialBody(body = {}) {
  const tenantFromBody = normalizeText(body?.tenant_id ?? body?.tenantId);
  if (tenantFromBody) {
    throw new FinancialWriteValidationError(
      'tenant_id não é aceito no body. O tenant é resolvido pelo contexto autenticado.',
      'TENANT_BODY_FORBIDDEN',
    );
  }
}

function isMissingFinancialTableError(error, tableHint) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const hint = String(tableHint || '').toLowerCase();
  return (
    code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('relation')
    || (hint && message.includes(hint))
  );
}

function assertTenantId(tenantId) {
  const normalized = normalizeText(tenantId);
  if (!normalized || FORBIDDEN_TENANT_IDS.has(normalized.toLowerCase())) {
    throw new FinancialWriteValidationError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }
  return normalized;
}

async function findRowByRef(supabase, table, select, tenantId, ref) {
  const needle = normalizeText(ref);
  if (!needle) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
  let query = supabase.from(table).select(select).eq('tenant_id', tenantId);
  query = isUuid
    ? query.or(`id.eq.${needle},legacy_id.eq.${needle}`)
    : query.or(`legacy_id.eq.${needle},id.eq.${needle}`);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingFinancialTableError(error, table)) {
      throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'FINANCIAL_TABLE_MISSING' });
    }
    throw error;
  }
  return data;
}

function mapReceivableWriteBody(body = {}, tenantId) {
  const legacyId = normalizeText(body.legacy_id ?? body.legacyId ?? body.id);
  if (!legacyId) throw new FinancialWriteValidationError('legacy_id é obrigatório.', 'LEGACY_ID_REQUIRED');
  return {
    tenant_id: tenantId,
    legacy_id: legacyId,
    patient_id: normalizeText(body.patient_id ?? body.patientId) || null,
    origin_type: normalizeText(body.origin_type ?? body.originType) || 'manual_entry',
    origin_id: normalizeText(body.origin_id ?? body.originId) || null,
    description: normalizeText(body.description) || '',
    issue_date: normalizeText(body.issue_date ?? body.issueDate) || null,
    due_date: normalizeText(body.due_date ?? body.dueDate) || null,
    original_amount: normalizeAmount(body.original_amount ?? body.originalAmount),
    discount_amount: normalizeAmount(body.discount_amount ?? body.discountAmount),
    interest_amount: normalizeAmount(body.interest_amount ?? body.interestAmount),
    fine_amount: normalizeAmount(body.fine_amount ?? body.fineAmount),
    net_amount: normalizeAmount(body.net_amount ?? body.netAmount),
    paid_amount: normalizeAmount(body.paid_amount ?? body.paidAmount),
    status: normalizeText(body.status) || 'open',
    payment_method_expected: normalizeText(body.payment_method_expected ?? body.paymentMethodExpected) || '',
    contract_id: normalizeText(body.contract_id ?? body.contractId) || null,
    budget_id: normalizeText(body.budget_id ?? body.budgetId) || null,
    financing_id: normalizeText(body.financing_id ?? body.financingId) || null,
    financing_installment_id: normalizeText(body.financing_installment_id ?? body.financingInstallmentId) || null,
    updated_at: new Date().toISOString(),
  };
}

function mapPayableWriteBody(body = {}, tenantId) {
  const legacyId = normalizeText(body.legacy_id ?? body.legacyId ?? body.id);
  if (!legacyId) throw new FinancialWriteValidationError('legacy_id é obrigatório.', 'LEGACY_ID_REQUIRED');
  return {
    tenant_id: tenantId,
    legacy_id: legacyId,
    supplier_id: normalizeText(body.supplier_id ?? body.supplierId) || null,
    category_id: normalizeText(body.category_id ?? body.categoryId) || null,
    description: normalizeText(body.description) || '',
    due_date: normalizeText(body.due_date ?? body.dueDate) || null,
    amount: normalizeAmount(body.amount),
    paid_amount: normalizeAmount(body.paid_amount ?? body.paidAmount),
    status: normalizeText(body.status) || 'open',
    expense_type: normalizeText(body.expense_type ?? body.expenseType) || '',
    recurrence_frequency: normalizeText(body.recurrence_frequency ?? body.recurrenceFrequency) || null,
    updated_at: new Date().toISOString(),
  };
}

function mapFinancingWriteBody(body = {}, tenantId) {
  const legacyId = normalizeText(body.legacy_id ?? body.legacyId ?? body.id);
  if (!legacyId) throw new FinancialWriteValidationError('legacy_id é obrigatório.', 'LEGACY_ID_REQUIRED');
  return {
    tenant_id: tenantId,
    legacy_id: legacyId,
    patient_id: normalizeText(body.patient_id ?? body.patientId) || null,
    contract_id: normalizeText(body.contract_id ?? body.contractId) || null,
    budget_id: normalizeText(body.budget_id ?? body.budgetId) || null,
    status: normalizeText(body.status) || 'draft',
    approval_status: normalizeText(body.approval_status ?? body.approvalStatus) || '',
    total_amount: normalizeAmount(body.total_amount ?? body.totalAmount),
    entry_amount: normalizeAmount(body.entry_amount ?? body.entryAmount),
    installments_count: Number(body.installments_count ?? body.installmentsCount ?? 0) || 0,
    partner_id: normalizeText(body.partner_id ?? body.partnerId) || null,
    updated_at: new Date().toISOString(),
  };
}

async function upsertFinancialRow(supabase, table, select, tableHint, tenantId, body, mapBody) {
  const row = mapBody(body, tenantId);
  const existing = await findRowByRef(supabase, table, select, tenantId, row.legacy_id);
  if (existing?.id) {
    const { data, error } = await supabase
      .from(table)
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)
      .select(select)
      .single();
    if (error) {
      if (isMissingFinancialTableError(error, tableHint)) {
        throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'FINANCIAL_TABLE_MISSING' });
      }
      throw error;
    }
    return data;
  }

  const { data, error } = await supabase
    .from(table)
    .insert({ ...row, created_at: new Date().toISOString() })
    .select(select)
    .single();
  if (error) {
    if (isMissingFinancialTableError(error, tableHint)) {
      throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'FINANCIAL_TABLE_MISSING' });
    }
    throw error;
  }
  return data;
}

async function updateFinancialRow(supabase, table, select, tableHint, tenantId, ref, body, mapBody) {
  const existing = await findRowByRef(supabase, table, select, tenantId, ref);
  if (!existing) {
    throw new FinancialWriteValidationError('Registro financeiro não encontrado.', 'FINANCIAL_NOT_FOUND');
  }
  const patch = mapBody(body, tenantId);
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq('id', existing.id)
    .eq('tenant_id', tenantId)
    .select(select)
    .single();
  if (error) {
    if (isMissingFinancialTableError(error, tableHint)) {
      throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'FINANCIAL_TABLE_MISSING' });
    }
    throw error;
  }
  return data;
}

async function deleteFinancialRow(supabase, table, select, tableHint, tenantId, ref) {
  const existing = await findRowByRef(supabase, table, select, tenantId, ref);
  if (!existing) {
    throw new FinancialWriteValidationError('Registro financeiro não encontrado.', 'FINANCIAL_NOT_FOUND');
  }
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', existing.id)
    .eq('tenant_id', tenantId);
  if (error) {
    if (isMissingFinancialTableError(error, tableHint)) {
      throw Object.assign(new Error(`Tabela ${table} indisponível.`), { code: 'FINANCIAL_TABLE_MISSING' });
    }
    throw error;
  }
  return true;
}

export async function upsertReceivableForTenant(supabase, tenantId, body) {
  const tid = assertTenantId(tenantId);
  return upsertFinancialRow(
    supabase,
    'financial_accounts_receivable',
    RECEIVABLES_LIST_SELECT,
    'financial_accounts_receivable',
    tid,
    body,
    mapReceivableWriteBody,
  );
}

export async function updateReceivableForTenant(supabase, tenantId, ref, body) {
  const tid = assertTenantId(tenantId);
  return updateFinancialRow(
    supabase,
    'financial_accounts_receivable',
    RECEIVABLES_LIST_SELECT,
    'financial_accounts_receivable',
    tid,
    ref,
    body,
    mapReceivableWriteBody,
  );
}

export async function upsertPayableForTenant(supabase, tenantId, body) {
  const tid = assertTenantId(tenantId);
  return upsertFinancialRow(
    supabase,
    'financial_payables',
    PAYABLES_LIST_SELECT,
    'financial_payables',
    tid,
    body,
    mapPayableWriteBody,
  );
}

export async function updatePayableForTenant(supabase, tenantId, ref, body) {
  const tid = assertTenantId(tenantId);
  return updateFinancialRow(
    supabase,
    'financial_payables',
    PAYABLES_LIST_SELECT,
    'financial_payables',
    tid,
    ref,
    body,
    mapPayableWriteBody,
  );
}

export async function deletePayableForTenant(supabase, tenantId, ref) {
  const tid = assertTenantId(tenantId);
  return deleteFinancialRow(
    supabase,
    'financial_payables',
    PAYABLES_LIST_SELECT,
    'financial_payables',
    tid,
    ref,
  );
}

export async function upsertFinancingForTenant(supabase, tenantId, body) {
  const tid = assertTenantId(tenantId);
  return upsertFinancialRow(
    supabase,
    'financial_financings',
    FINANCINGS_LIST_SELECT,
    'financial_financings',
    tid,
    body,
    mapFinancingWriteBody,
  );
}

export async function updateFinancingForTenant(supabase, tenantId, ref, body) {
  const tid = assertTenantId(tenantId);
  return updateFinancialRow(
    supabase,
    'financial_financings',
    FINANCINGS_LIST_SELECT,
    'financial_financings',
    tid,
    ref,
    body,
    mapFinancingWriteBody,
  );
}

function resolveTenantId(req) {
  return req.tenantContext?.tenantId || null;
}

function handleFinancialWriteError(res, err) {
  if (err?.code === 'FINANCIAL_TABLE_MISSING') {
    return res.status(503).json({ ok: false, error: err.message, code: 'FINANCIAL_TABLE_MISSING' });
  }
  if (err instanceof FinancialWriteValidationError) {
    return res.status(400).json({ ok: false, error: err.message, code: err.code });
  }
  return res.status(500).json({ ok: false, error: 'Erro ao processar escrita financeira.' });
}

function createWriteHandler(deps, runner) {
  const { supabase } = deps;
  return async function financialWriteHandler(req, res) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }
      assertNoTenantIdInFinancialBody(req.body || {});
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(403).json({ ok: false, error: 'Tenant não resolvido.', code: 'TENANT_MISSING' });
      }
      const data = await runner(supabase, tenantId, req);
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return handleFinancialWriteError(res, err);
    }
  };
}

export function createReceivableCreateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    upsertReceivableForTenant(supabase, tenantId, req.body || {}));
}

export function createReceivableUpdateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    updateReceivableForTenant(supabase, tenantId, req.params.id, req.body || {}));
}

export function createPayableCreateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    upsertPayableForTenant(supabase, tenantId, req.body || {}));
}

export function createPayableUpdateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    updatePayableForTenant(supabase, tenantId, req.params.id, req.body || {}));
}

export function createPayableDeleteHandler(deps) {
  return createWriteHandler(deps, async (supabase, tenantId, req) => {
    await deletePayableForTenant(supabase, tenantId, req.params.id);
    return { deleted: true };
  });
}

export function createFinancingCreateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    upsertFinancingForTenant(supabase, tenantId, req.body || {}));
}

export function createFinancingUpdateHandler(deps) {
  return createWriteHandler(deps, (supabase, tenantId, req) =>
    updateFinancingForTenant(supabase, tenantId, req.params.id, req.body || {}));
}
