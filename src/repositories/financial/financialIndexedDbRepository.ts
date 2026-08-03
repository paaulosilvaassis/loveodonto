/**
 * @module repositories/financial/financialIndexedDbRepository
 * @description Leitura legado IndexedDB — Financeiro (Phase 5.11 foundation).
 */

import { loadDb } from '../../db/index.js';
import { normalizeTenantId } from '../../services/tenantIsolation.js';
import type {
  FinancingLegacyRow,
  FinancialListFilters,
  IFinancialIndexedDbReader,
  PayableLegacyRow,
  ReceivableLegacyRow,
} from './financialTypes.js';

function matchesStatus(rowStatus: unknown, filterStatus: string | string[] | undefined): boolean {
  if (!filterStatus) return true;
  const statuses = Array.isArray(filterStatus) ? filterStatus : [filterStatus];
  return statuses.includes(String(rowStatus || ''));
}

function matchesTenant(row: { tenant_id?: string | null }, tenantId?: string): boolean {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return true;
  const rowTenant = normalizeTenantId(row.tenant_id);
  return !rowTenant || rowTenant === normalized;
}

function matchesSearch(row: Record<string, unknown>, search?: string): boolean {
  if (!search) return true;
  const q = String(search).trim().toLowerCase();
  const haystack = [
    row.description,
    row.id,
    row.patient_id,
    row.origin_id,
  ].map((v) => String(v || '').toLowerCase()).join(' ');
  return haystack.includes(q);
}

function matchesReceivableFilters(row: ReceivableLegacyRow, filters: FinancialListFilters = {}): boolean {
  if (!matchesTenant(row, filters.tenantId)) return false;
  if (filters.patientId && row.patient_id !== filters.patientId) return false;
  if (!matchesStatus(row.status, filters.status)) return false;
  if (filters.dueDateFrom && String(row.due_date) < filters.dueDateFrom) return false;
  if (filters.dueDateTo && String(row.due_date) > filters.dueDateTo) return false;
  if (!matchesSearch(row, filters.search)) return false;
  return true;
}

function matchesPayableFilters(row: PayableLegacyRow, filters: FinancialListFilters = {}): boolean {
  if (!matchesTenant(row, filters.tenantId)) return false;
  if (!matchesStatus(row.status, filters.status)) return false;
  const dueDate = String(row.due_date ?? row.dueDate ?? '');
  if (filters.dueDateFrom && dueDate < filters.dueDateFrom) return false;
  if (filters.dueDateTo && dueDate > filters.dueDateTo) return false;
  if (!matchesSearch(row, filters.search)) return false;
  return true;
}

function matchesFinancingFilters(row: FinancingLegacyRow, filters: FinancialListFilters = {}): boolean {
  if (!matchesTenant(row, filters.tenantId)) return false;
  if (filters.patientId && row.patient_id !== filters.patientId) return false;
  if (!matchesStatus(row.status, filters.status)) return false;
  if (!matchesSearch(row, filters.search)) return false;
  return true;
}

export const financialIndexedDbRepository: IFinancialIndexedDbReader = {
  listReceivablesLegacySync(filters = {}): ReceivableLegacyRow[] {
    const db = loadDb();
    return (db.accountsReceivable || [])
      .filter((row) => matchesReceivableFilters(row as ReceivableLegacyRow, filters))
      .map((row) => ({ ...row })) as ReceivableLegacyRow[];
  },

  getReceivableLegacySync(receivableId: string): ReceivableLegacyRow | null {
    const id = String(receivableId || '').trim();
    if (!id) return null;
    const db = loadDb();
    const row = (db.accountsReceivable || []).find((item) => String(item.id) === id);
    return row ? { ...row } as ReceivableLegacyRow : null;
  },

  listPayablesLegacySync(filters = {}): PayableLegacyRow[] {
    const db = loadDb();
    return (db.payables || [])
      .filter((row) => matchesPayableFilters(row as PayableLegacyRow, filters))
      .map((row) => ({ ...row })) as PayableLegacyRow[];
  },

  getPayableLegacySync(payableId: string): PayableLegacyRow | null {
    const id = String(payableId || '').trim();
    if (!id) return null;
    const db = loadDb();
    const row = (db.payables || []).find((item) => String(item.id) === id);
    return row ? { ...row } as PayableLegacyRow : null;
  },

  listFinancingsLegacySync(filters = {}): FinancingLegacyRow[] {
    const db = loadDb();
    return (db.financings || [])
      .filter((row) => matchesFinancingFilters(row as FinancingLegacyRow, filters))
      .map((row) => ({ ...row })) as FinancingLegacyRow[];
  },

  getFinancingLegacySync(financingId: string): FinancingLegacyRow | null {
    const id = String(financingId || '').trim();
    if (!id) return null;
    const db = loadDb();
    const row = (db.financings || []).find((item) => String(item.id) === id);
    return row ? { ...row } as FinancingLegacyRow : null;
  },
};

export function getFinancialTenantIdFromDbSync(): string | null {
  const db = loadDb();
  const fromReceivable = normalizeTenantId(db.accountsReceivable?.[0]?.tenant_id);
  if (fromReceivable) return fromReceivable;
  const fromPayable = normalizeTenantId(db.payables?.[0]?.tenant_id);
  if (fromPayable) return fromPayable;
  return normalizeTenantId(db.clinicProfile?.tenant_id) || null;
}
