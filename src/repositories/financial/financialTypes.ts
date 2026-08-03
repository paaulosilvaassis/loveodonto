/**
 * @module repositories/financial/financialTypes
 * @description Tipos da Repository Layer Financeiro V3 — Phase 5.11 foundation.
 */

export type FinancialDomain =
  | 'receivable'
  | 'payable'
  | 'financing'
  | 'boleto'
  | 'cash_register'
  | 'cash_transaction'
  | 'receivable_payment';

export type ReceivableStatus =
  | 'open'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'renegotiated';

export type PayableStatus =
  | 'open'
  | 'paid'
  | 'overdue'
  | 'cancelled';

export type FinancingStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'rejected';

/** Perfil normalizado contas a receber (futuro Supabase SSOT). */
export interface ReceivableCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  patientId: string | null;
  originType: string;
  originId: string | null;
  description: string;
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  discountAmount: number;
  interestAmount: number;
  fineAmount: number;
  netAmount: number;
  paidAmount: number;
  status: ReceivableStatus;
  paymentMethodExpected: string;
  contractId: string | null;
  budgetId: string | null;
  financingId: string | null;
  financingInstallmentId: string | null;
}

/** Perfil normalizado contas a pagar. */
export interface PayableCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  supplierId: string | null;
  categoryId: string | null;
  description: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: PayableStatus;
  expenseType: string;
  recurrenceFrequency: string | null;
}

/** Perfil normalizado financiamento. */
export interface FinancingCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  patientId: string | null;
  contractId: string | null;
  budgetId: string | null;
  status: FinancingStatus;
  approvalStatus: string;
  totalAmount: number;
  entryAmount: number;
  installmentsCount: number;
  partnerId: string | null;
}

/** Shape legado IndexedDB (`accountsReceivable[]`). */
export interface ReceivableLegacyRow {
  id: string;
  tenant_id?: string | null;
  patient_id?: string | null;
  origin_type?: string;
  origin_id?: string | null;
  description?: string;
  issue_date?: string;
  due_date?: string;
  original_amount?: number;
  discount_amount?: number;
  interest_amount?: number;
  fine_amount?: number;
  net_amount?: number;
  paid_amount?: number;
  status?: string;
  payment_method_expected?: string;
  contract_id?: string | null;
  budget_id?: string | null;
  financing_id?: string | null;
  financing_installment_id?: string | null;
  [key: string]: unknown;
}

/** Shape legado IndexedDB (`payables[]`). */
export interface PayableLegacyRow {
  id: string;
  tenant_id?: string | null;
  supplier_id?: string | null;
  category_id?: string | null;
  description?: string;
  due_date?: string;
  amount?: number;
  paid_amount?: number;
  status?: string;
  expense_type?: string;
  recurrence_frequency?: string | null;
  [key: string]: unknown;
}

/** Shape legado IndexedDB (`financings[]`). */
export interface FinancingLegacyRow {
  id: string;
  tenant_id?: string | null;
  patient_id?: string | null;
  contract_id?: string | null;
  budget_id?: string | null;
  status?: string;
  approval_status?: string;
  total_amount?: number;
  entry_amount?: number;
  installments_count?: number;
  partner_id?: string | null;
  [key: string]: unknown;
}

export interface FinancialListFilters {
  tenantId?: string;
  patientId?: string;
  status?: string | string[];
  dateFrom?: string;
  dateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  search?: string;
}

export type FinancialReadSource =
  | 'admin-api'
  | 'indexeddb'
  | 'indexeddb-offline'
  | 'cache';

export interface FinancialListResult<T> {
  items: T[];
  total: number;
  source: FinancialReadSource;
  domain: FinancialDomain;
}

export interface FinancialGetResult<T> {
  core: T | null;
  source: FinancialReadSource;
  domain: FinancialDomain;
}

export interface IFinancialIndexedDbReader {
  listReceivablesLegacySync(filters?: FinancialListFilters): ReceivableLegacyRow[];
  getReceivableLegacySync(receivableId: string): ReceivableLegacyRow | null;
  listPayablesLegacySync(filters?: FinancialListFilters): PayableLegacyRow[];
  getPayableLegacySync(payableId: string): PayableLegacyRow | null;
  listFinancingsLegacySync(filters?: FinancialListFilters): FinancingLegacyRow[];
  getFinancingLegacySync(financingId: string): FinancingLegacyRow | null;
}

export interface IFinancialAdminApiReader {
  listReceivables(tenantId: string, filters?: FinancialListFilters): Promise<ReceivableCore[]>;
  getReceivable(tenantId: string, ref: string): Promise<ReceivableCore | null>;
  listPayables(tenantId: string, filters?: FinancialListFilters): Promise<PayableCore[]>;
  getPayable(tenantId: string, ref: string): Promise<PayableCore | null>;
  listFinancings(tenantId: string, filters?: FinancialListFilters): Promise<FinancingCore[]>;
  getFinancing(tenantId: string, ref: string): Promise<FinancingCore | null>;
}

export interface IFinancialCache {
  getReceivable(tenantId: string, ref: string): ReceivableCore | null;
  setReceivable(tenantId: string, core: ReceivableCore): void;
  deleteReceivable(tenantId: string, ref: string): void;
  getPayable(tenantId: string, ref: string): PayableCore | null;
  setPayable(tenantId: string, core: PayableCore): void;
  deletePayable(tenantId: string, ref: string): void;
  getFinancing(tenantId: string, ref: string): FinancingCore | null;
  setFinancing(tenantId: string, core: FinancingCore): void;
  deleteFinancing(tenantId: string, ref: string): void;
  clearTenant(tenantId: string): void;
  invalidateTenant(tenantId: string, reason?: string): void;
}

export interface IFinancialRepository {
  listReceivablesLegacySync(filters?: FinancialListFilters): ReceivableLegacyRow[];
  getReceivableLegacySync(receivableId: string): ReceivableLegacyRow | null;
  listPayablesLegacySync(filters?: FinancialListFilters): PayableLegacyRow[];
  getPayableLegacySync(payableId: string): PayableLegacyRow | null;
  listFinancingsLegacySync(filters?: FinancialListFilters): FinancingLegacyRow[];
  getFinancingLegacySync(financingId: string): FinancingLegacyRow | null;
  listReceivablesCore(
    tenantId: string,
    filters?: FinancialListFilters,
  ): Promise<FinancialListResult<ReceivableCore>>;
  getReceivableCore(tenantId: string, ref: string): Promise<FinancialGetResult<ReceivableCore>>;
  listPayablesCore(
    tenantId: string,
    filters?: FinancialListFilters,
  ): Promise<FinancialListResult<PayableCore>>;
  getPayableCore(tenantId: string, ref: string): Promise<FinancialGetResult<PayableCore>>;
  listFinancingsCore(
    tenantId: string,
    filters?: FinancialListFilters,
  ): Promise<FinancialListResult<FinancingCore>>;
  getFinancingCore(tenantId: string, ref: string): Promise<FinancialGetResult<FinancingCore>>;
  syncCacheFromRemote(tenantId: string): Promise<number>;
  compareIdbVsRemote(tenantId: string, domain?: FinancialDomain): Promise<Record<string, unknown> | null>;
  createReceivableCore(tenantId: string, dto: ReceivableCreateCoreDto, meta?: FinancialWriteMeta): Promise<ReceivableCore>;
  updateReceivableCore(tenantId: string, legacyId: string, dto: ReceivableUpdateCoreDto, meta?: FinancialWriteMeta): Promise<ReceivableCore>;
  createPayableCore(tenantId: string, dto: PayableCreateCoreDto, meta?: FinancialWriteMeta): Promise<PayableCore>;
  updatePayableCore(tenantId: string, legacyId: string, dto: PayableUpdateCoreDto, meta?: FinancialWriteMeta): Promise<PayableCore>;
  deletePayableCore(tenantId: string, legacyId: string, meta?: FinancialWriteMeta): Promise<void>;
  createFinancingCore(tenantId: string, dto: FinancingCreateCoreDto, meta?: FinancialWriteMeta): Promise<FinancingCore>;
  updateFinancingCore(tenantId: string, legacyId: string, dto: FinancingUpdateCoreDto, meta?: FinancialWriteMeta): Promise<FinancingCore>;
}

export interface FinancialWriteMeta {
  correlationId?: string;
  idempotencyKey?: string;
  retryCount?: number;
  writeSource?: string;
}

export interface ReceivableCreateCoreDto {
  legacyId: string;
  patientId: string | null;
  originType: string;
  originId: string | null;
  description: string;
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  discountAmount: number;
  interestAmount: number;
  fineAmount: number;
  netAmount: number;
  paidAmount: number;
  status: string;
  paymentMethodExpected: string;
  contractId?: string | null;
  budgetId?: string | null;
  financingId?: string | null;
  financingInstallmentId?: string | null;
}

export interface ReceivableUpdateCoreDto extends Partial<ReceivableCreateCoreDto> {}

export interface PayableCreateCoreDto {
  legacyId: string;
  supplierId: string | null;
  categoryId: string | null;
  description: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  expenseType: string;
  recurrenceFrequency?: string | null;
}

export interface PayableUpdateCoreDto extends Partial<PayableCreateCoreDto> {}

export interface FinancingCreateCoreDto {
  legacyId: string;
  patientId: string | null;
  contractId: string | null;
  budgetId: string | null;
  status: string;
  approvalStatus: string;
  totalAmount: number;
  entryAmount: number;
  installmentsCount: number;
  partnerId?: string | null;
  description?: string;
}

export interface FinancingUpdateCoreDto extends Partial<FinancingCreateCoreDto> {}

export interface IFinancialAdminApiWriter {
  createReceivable(tenantId: string, dto: ReceivableCreateCoreDto, meta?: FinancialWriteMeta): Promise<ReceivableCore | null>;
  updateReceivable(tenantId: string, legacyId: string, dto: ReceivableUpdateCoreDto, meta?: FinancialWriteMeta): Promise<ReceivableCore | null>;
  createPayable(tenantId: string, dto: PayableCreateCoreDto, meta?: FinancialWriteMeta): Promise<PayableCore | null>;
  updatePayable(tenantId: string, legacyId: string, dto: PayableUpdateCoreDto, meta?: FinancialWriteMeta): Promise<PayableCore | null>;
  deletePayable(tenantId: string, legacyId: string, meta?: FinancialWriteMeta): Promise<boolean>;
  createFinancing(tenantId: string, dto: FinancingCreateCoreDto, meta?: FinancialWriteMeta): Promise<FinancingCore | null>;
  updateFinancing(tenantId: string, legacyId: string, dto: FinancingUpdateCoreDto, meta?: FinancialWriteMeta): Promise<FinancingCore | null>;
}

export interface IFinancialAdminApiClient extends IFinancialAdminApiReader, IFinancialAdminApiWriter {}

export interface FinancialWriteAuditRecord {
  writeSource: string;
  legacyId: string;
  remoteId: string | null;
  correlationId: string;
  tenantId: string;
  timestamp: string;
  retryCount: number;
  syncResult: 'ok' | 'failed' | 'skipped' | 'shadow';
  domain: FinancialDomain;
  error?: string;
}

export class FinancialRepositoryRemoteWriteDisabledError extends Error {
  readonly code = 'FINANCIAL_REMOTE_WRITE_DISABLED';

  constructor() {
    super('Escrita remota desabilitada (FINANCIAL_DUAL_WRITE=false).');
    this.name = 'FinancialRepositoryRemoteWriteDisabledError';
  }
}

export class FinancialRepositoryRemoteReadDisabledError extends Error {
  readonly code = 'FINANCIAL_REMOTE_READ_DISABLED';

  constructor() {
    super('Leitura remota desabilitada (FINANCIAL_READ/FINANCIAL_READ_PRIMARY=false).');
    this.name = 'FinancialRepositoryRemoteReadDisabledError';
  }
}

export class FinancialNotFoundError extends Error {
  readonly code = 'FINANCIAL_ENTITY_NOT_FOUND';

  constructor(domain: FinancialDomain, ref: string) {
    super(`Registro financeiro não encontrado (${domain}): ${ref}.`);
    this.name = 'FinancialNotFoundError';
  }
}
