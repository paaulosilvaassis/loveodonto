/**
 * @module repositories/financial/financialMapper
 * @description Mapeamento Admin API / Supabase ↔ core ↔ legado IDB.
 */

import type {
  FinancingCore,
  FinancingCreateCoreDto,
  FinancingLegacyRow,
  FinancingStatus,
  FinancingUpdateCoreDto,
  PayableCore,
  PayableCreateCoreDto,
  PayableLegacyRow,
  PayableStatus,
  PayableUpdateCoreDto,
  ReceivableCore,
  ReceivableCreateCoreDto,
  ReceivableLegacyRow,
  ReceivableStatus,
  ReceivableUpdateCoreDto,
} from './financialTypes.js';

const VALID_RECEIVABLE_STATUSES = new Set<ReceivableStatus>([
  'open', 'partial', 'paid', 'overdue', 'cancelled', 'renegotiated',
]);

const VALID_PAYABLE_STATUSES = new Set<PayableStatus>([
  'open', 'paid', 'overdue', 'cancelled',
]);

const VALID_FINANCING_STATUSES = new Set<FinancingStatus>([
  'draft', 'pending_approval', 'approved', 'active', 'completed', 'cancelled', 'rejected',
]);

function normalizeTenantId(value: unknown): string {
  return String(value || '').trim();
}

function normalizeAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );
}

function normalizeReceivableStatus(value: unknown): ReceivableStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (VALID_RECEIVABLE_STATUSES.has(raw as ReceivableStatus)) return raw as ReceivableStatus;
  return 'open';
}

function normalizePayableStatus(value: unknown): PayableStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (VALID_PAYABLE_STATUSES.has(raw as PayableStatus)) return raw as PayableStatus;
  return 'open';
}

function normalizeFinancingStatus(value: unknown): FinancingStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (VALID_FINANCING_STATUSES.has(raw as FinancingStatus)) return raw as FinancingStatus;
  return 'draft';
}

/** @param row Registro remoto (futuro Supabase). */
export function mapServerRowToReceivableCore(
  row: Record<string, unknown> | null | undefined,
): ReceivableCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = String(row.legacy_id ?? row.id ?? '').trim();
  if (!tenantId || !legacyId) return null;

  const uuid = isUuid(row.id) ? String(row.id).trim() : null;

  return {
    tenantId,
    legacyId,
    uuid,
    patientId: String(row.patient_id ?? row.patientId ?? '').trim() || null,
    originType: String(row.origin_type ?? row.originType ?? '').trim(),
    originId: String(row.origin_id ?? row.originId ?? '').trim() || null,
    description: String(row.description ?? '').trim(),
    issueDate: String(row.issue_date ?? row.issueDate ?? '').trim(),
    dueDate: String(row.due_date ?? row.dueDate ?? '').trim(),
    originalAmount: normalizeAmount(row.original_amount ?? row.originalAmount),
    discountAmount: normalizeAmount(row.discount_amount ?? row.discountAmount),
    interestAmount: normalizeAmount(row.interest_amount ?? row.interestAmount),
    fineAmount: normalizeAmount(row.fine_amount ?? row.fineAmount),
    netAmount: normalizeAmount(row.net_amount ?? row.netAmount),
    paidAmount: normalizeAmount(row.paid_amount ?? row.paidAmount),
    status: normalizeReceivableStatus(row.status),
    paymentMethodExpected: String(row.payment_method_expected ?? row.paymentMethodExpected ?? '').trim(),
    contractId: String(row.contract_id ?? row.contractId ?? '').trim() || null,
    budgetId: String(row.budget_id ?? row.budgetId ?? '').trim() || null,
    financingId: String(row.financing_id ?? row.financingId ?? '').trim() || null,
    financingInstallmentId: String(row.financing_installment_id ?? row.financingInstallmentId ?? '').trim() || null,
  };
}

export function mapLegacyRowToReceivableCore(
  row: ReceivableLegacyRow | null,
): ReceivableCore | null {
  if (!row?.id) return null;
  const tenantId = normalizeTenantId(row.tenant_id);
  if (!tenantId) return null;

  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    patientId: String(row.patient_id || '').trim() || null,
    originType: String(row.origin_type || '').trim(),
    originId: String(row.origin_id || '').trim() || null,
    description: String(row.description || '').trim(),
    issueDate: String(row.issue_date || '').trim(),
    dueDate: String(row.due_date || '').trim(),
    originalAmount: normalizeAmount(row.original_amount),
    discountAmount: normalizeAmount(row.discount_amount),
    interestAmount: normalizeAmount(row.interest_amount),
    fineAmount: normalizeAmount(row.fine_amount),
    netAmount: normalizeAmount(row.net_amount),
    paidAmount: normalizeAmount(row.paid_amount),
    status: normalizeReceivableStatus(row.status),
    paymentMethodExpected: String(row.payment_method_expected || '').trim(),
    contractId: String(row.contract_id || '').trim() || null,
    budgetId: String(row.budget_id || '').trim() || null,
    financingId: String(row.financing_id || '').trim() || null,
    financingInstallmentId: String(row.financing_installment_id || '').trim() || null,
  };
}

export function mapCoreToReceivableLegacyRow(core: ReceivableCore): ReceivableLegacyRow {
  return {
    id: core.legacyId,
    tenant_id: core.tenantId,
    patient_id: core.patientId,
    origin_type: core.originType,
    origin_id: core.originId,
    description: core.description,
    issue_date: core.issueDate,
    due_date: core.dueDate,
    original_amount: core.originalAmount,
    discount_amount: core.discountAmount,
    interest_amount: core.interestAmount,
    fine_amount: core.fineAmount,
    net_amount: core.netAmount,
    paid_amount: core.paidAmount,
    status: core.status,
    payment_method_expected: core.paymentMethodExpected,
    contract_id: core.contractId,
    budget_id: core.budgetId,
    financing_id: core.financingId,
    financing_installment_id: core.financingInstallmentId,
  };
}

export function mapServerRowToPayableCore(
  row: Record<string, unknown> | null | undefined,
): PayableCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = String(row.legacy_id ?? row.id ?? '').trim();
  if (!tenantId || !legacyId) return null;

  const uuid = isUuid(row.id) ? String(row.id).trim() : null;

  return {
    tenantId,
    legacyId,
    uuid,
    supplierId: String(row.supplier_id ?? row.supplierId ?? '').trim() || null,
    categoryId: String(row.category_id ?? row.categoryId ?? '').trim() || null,
    description: String(row.description ?? '').trim(),
    dueDate: String(row.due_date ?? row.dueDate ?? '').trim(),
    amount: normalizeAmount(row.amount),
    paidAmount: normalizeAmount(row.paid_amount ?? row.paidAmount),
    status: normalizePayableStatus(row.status),
    expenseType: String(row.expense_type ?? row.expenseType ?? '').trim(),
    recurrenceFrequency: String(row.recurrence_frequency ?? row.recurrenceFrequency ?? '').trim() || null,
  };
}

export function mapLegacyRowToPayableCore(row: PayableLegacyRow | null): PayableCore | null {
  if (!row?.id) return null;
  const tenantId = normalizeTenantId(row.tenant_id);
  if (!tenantId) return null;

  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    supplierId: String(row.supplier_id ?? row.supplierId ?? '').trim() || null,
    categoryId: String(row.category_id ?? row.categoryId ?? '').trim() || null,
    description: String(row.description || '').trim(),
    dueDate: String(row.due_date ?? row.dueDate ?? '').trim(),
    amount: normalizeAmount(row.amount),
    paidAmount: normalizeAmount(row.paid_amount ?? row.paidAmount),
    status: normalizePayableStatus(row.status),
    expenseType: String(row.expense_type ?? row.expenseType ?? '').trim(),
    recurrenceFrequency: String(row.recurrence_frequency ?? row.recurrenceFrequency ?? '').trim() || null,
  };
}

export function mapCoreToPayableLegacyRow(core: PayableCore): PayableLegacyRow {
  return {
    id: core.legacyId,
    tenant_id: core.tenantId,
    supplierId: core.supplierId,
    categoryId: core.categoryId,
    description: core.description,
    dueDate: core.dueDate,
    amount: core.amount,
    paidAmount: core.paidAmount,
    status: core.status,
    expenseType: core.expenseType,
    recurrenceFrequency: core.recurrenceFrequency,
  };
}

export function mapServerRowToFinancingCore(
  row: Record<string, unknown> | null | undefined,
): FinancingCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = String(row.legacy_id ?? row.id ?? '').trim();
  if (!tenantId || !legacyId) return null;

  const uuid = isUuid(row.id) ? String(row.id).trim() : null;

  return {
    tenantId,
    legacyId,
    uuid,
    patientId: String(row.patient_id ?? row.patientId ?? '').trim() || null,
    contractId: String(row.contract_id ?? row.contractId ?? '').trim() || null,
    budgetId: String(row.budget_id ?? row.budgetId ?? '').trim() || null,
    status: normalizeFinancingStatus(row.status),
    approvalStatus: String(row.approval_status ?? row.approvalStatus ?? '').trim(),
    totalAmount: normalizeAmount(row.total_amount ?? row.totalAmount),
    entryAmount: normalizeAmount(row.entry_amount ?? row.entryAmount),
    installmentsCount: Number(row.installments_count ?? row.installmentsCount ?? 0) || 0,
    partnerId: String(row.partner_id ?? row.partnerId ?? '').trim() || null,
  };
}

export function mapLegacyRowToFinancingCore(
  row: FinancingLegacyRow | null,
): FinancingCore | null {
  if (!row?.id) return null;
  const tenantId = normalizeTenantId(row.tenant_id);
  if (!tenantId) return null;

  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    patientId: String(row.patient_id || '').trim() || null,
    contractId: String(row.contract_id || '').trim() || null,
    budgetId: String(row.budget_id || '').trim() || null,
    status: normalizeFinancingStatus(row.status),
    approvalStatus: String(row.approval_status || '').trim(),
    totalAmount: normalizeAmount(row.total_amount),
    entryAmount: normalizeAmount(row.entry_amount),
    installmentsCount: Number(row.installments_count ?? 0) || 0,
    partnerId: String(row.partner_id || '').trim() || null,
  };
}

export function mapCoreToFinancingLegacyRow(core: FinancingCore): FinancingLegacyRow {
  return {
    id: core.legacyId,
    tenant_id: core.tenantId,
    patient_id: core.patientId,
    contract_id: core.contractId,
    budget_id: core.budgetId,
    status: core.status,
    approval_status: core.approvalStatus,
    total_amount: core.totalAmount,
    entry_amount: core.entryAmount,
    installments_count: core.installmentsCount,
    partner_id: core.partnerId,
  };
}

export function mapReceivableLegacyToCreateDto(row: ReceivableLegacyRow): ReceivableCreateCoreDto {
  return {
    legacyId: String(row.id).trim(),
    patientId: String(row.patient_id || '').trim() || null,
    originType: String(row.origin_type || '').trim(),
    originId: String(row.origin_id || '').trim() || null,
    description: String(row.description || '').trim(),
    issueDate: String(row.issue_date || '').trim(),
    dueDate: String(row.due_date || '').trim(),
    originalAmount: normalizeAmount(row.original_amount),
    discountAmount: normalizeAmount(row.discount_amount),
    interestAmount: normalizeAmount(row.interest_amount),
    fineAmount: normalizeAmount(row.fine_amount),
    netAmount: normalizeAmount(row.net_amount),
    paidAmount: normalizeAmount(row.paid_amount ?? row.received_amount),
    status: String(row.status || 'open').trim(),
    paymentMethodExpected: String(row.payment_method_expected || '').trim(),
    contractId: String(row.contract_id || '').trim() || null,
    budgetId: String(row.budget_id || '').trim() || null,
    financingId: String(row.financing_id || '').trim() || null,
    financingInstallmentId: String(row.financing_installment_id || '').trim() || null,
  };
}

export function mapReceivableLegacyToUpdateDto(
  row: ReceivableLegacyRow,
  partial: Record<string, unknown> = {},
): ReceivableUpdateCoreDto {
  const base = mapReceivableLegacyToCreateDto({ ...row, ...partial });
  return { ...base };
}

export function mapPayableLegacyToCreateDto(row: PayableLegacyRow): PayableCreateCoreDto {
  return {
    legacyId: String(row.id).trim(),
    supplierId: String(row.supplier_id ?? row.supplierId ?? '').trim() || null,
    categoryId: String(row.category_id ?? row.categoryId ?? '').trim() || null,
    description: String(row.description || '').trim(),
    dueDate: String(row.due_date ?? row.dueDate ?? '').trim(),
    amount: normalizeAmount(row.amount),
    paidAmount: normalizeAmount(row.paid_amount ?? row.paidAmount),
    status: String(row.status || 'open').trim(),
    expenseType: String(row.expense_type ?? row.expenseType ?? '').trim(),
    recurrenceFrequency: String(row.recurrence_frequency ?? row.recurrenceFrequency ?? '').trim() || null,
  };
}

export function mapPayableLegacyToUpdateDto(
  row: PayableLegacyRow,
  partial: Record<string, unknown> = {},
): PayableUpdateCoreDto {
  return mapPayableLegacyToCreateDto({ ...row, ...partial });
}

export function mapFinancingLegacyToCreateDto(row: FinancingLegacyRow): FinancingCreateCoreDto {
  return {
    legacyId: String(row.id).trim(),
    patientId: String(row.patient_id || '').trim() || null,
    contractId: String(row.contract_id || '').trim() || null,
    budgetId: String(row.budget_id || '').trim() || null,
    status: String(row.status || 'draft').trim(),
    approvalStatus: String(row.approval_status || '').trim(),
    totalAmount: normalizeAmount(row.total_amount),
    entryAmount: normalizeAmount(row.entry_amount),
    installmentsCount: Number(row.installments_count ?? 0) || 0,
    partnerId: String(row.partner_id ?? row.financial_partner_id ?? '').trim() || null,
    description: String(row.description || '').trim(),
  };
}

export function mapFinancingLegacyToUpdateDto(
  row: FinancingLegacyRow,
  partial: Record<string, unknown> = {},
): FinancingUpdateCoreDto {
  return mapFinancingLegacyToCreateDto({ ...row, ...partial });
}

export function mapReceivableCreateDtoToServerBody(dto: ReceivableCreateCoreDto, meta?: { idempotencyKey?: string; correlationId?: string }) {
  return {
    legacy_id: dto.legacyId,
    patient_id: dto.patientId,
    origin_type: dto.originType,
    origin_id: dto.originId,
    description: dto.description,
    issue_date: dto.issueDate,
    due_date: dto.dueDate,
    original_amount: dto.originalAmount,
    discount_amount: dto.discountAmount,
    interest_amount: dto.interestAmount,
    fine_amount: dto.fineAmount,
    net_amount: dto.netAmount,
    paid_amount: dto.paidAmount,
    status: dto.status,
    payment_method_expected: dto.paymentMethodExpected,
    contract_id: dto.contractId,
    budget_id: dto.budgetId,
    financing_id: dto.financingId,
    financing_installment_id: dto.financingInstallmentId,
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  };
}

export function mapPayableCreateDtoToServerBody(dto: PayableCreateCoreDto, meta?: { idempotencyKey?: string; correlationId?: string }) {
  return {
    legacy_id: dto.legacyId,
    supplier_id: dto.supplierId,
    category_id: dto.categoryId,
    description: dto.description,
    due_date: dto.dueDate,
    amount: dto.amount,
    paid_amount: dto.paidAmount,
    status: dto.status,
    expense_type: dto.expenseType,
    recurrence_frequency: dto.recurrenceFrequency,
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  };
}

export function mapFinancingCreateDtoToServerBody(dto: FinancingCreateCoreDto, meta?: { idempotencyKey?: string; correlationId?: string }) {
  return {
    legacy_id: dto.legacyId,
    patient_id: dto.patientId,
    contract_id: dto.contractId,
    budget_id: dto.budgetId,
    status: dto.status,
    approval_status: dto.approvalStatus,
    total_amount: dto.totalAmount,
    entry_amount: dto.entryAmount,
    installments_count: dto.installmentsCount,
    partner_id: dto.partnerId,
    description: dto.description,
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  };
}
