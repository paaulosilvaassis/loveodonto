/**
 * Adapter de leitura Financeiro — Phase 5.12 read cutover.
 * Ponte entre services financeiros e financialRepository.
 * Retorna null quando READ_PRIMARY off — callers legados permanecem inalterados.
 */
import { loadDb } from '../db/index.js';
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getFinancialRepositoryForRead,
  scheduleFinancialCacheRehydrate,
  scheduleFinancialShadowRead,
  shouldUseFinancialRepositoryRead,
} from './financialRepositoryBridge.js';

export function resolveFinancialTenantHint() {
  const db = loadDb();
  return normalizeTenantId(db.accountsReceivable?.[0]?.tenant_id)
    || normalizeTenantId(db.payables?.[0]?.tenant_id)
    || normalizeTenantId(db.financings?.[0]?.tenant_id)
    || normalizeTenantId(db.clinicProfile?.tenant_id)
    || '';
}

function scheduleHydrateIfNeeded(tenantId) {
  if (!shouldUseFinancialRepositoryRead()) return;
  scheduleFinancialCacheRehydrate(tenantId);
}

function mapServiceFiltersToRepository(filters = {}) {
  return {
    tenantId: filters.tenantId || filters.tenant_id || resolveFinancialTenantHint() || undefined,
    patientId: filters.patientId || filters.patient_id,
    status: filters.status,
    dueDateFrom: filters.dueDateFrom || filters.startDate,
    dueDateTo: filters.dueDateTo || filters.endDate,
    search: filters.search,
  };
}

/**
 * Lista síncrona legada contas a receber — READ_PRIMARY via repository.
 * Retorna null quando flags off.
 * @param {object} [filters]
 */
export function readListReceivables(filters = {}) {
  const mapped = mapServiceFiltersToRepository(filters);
  scheduleHydrateIfNeeded(mapped.tenantId);
  if (!shouldUseFinancialRepositoryRead()) {
    scheduleFinancialShadowRead(mapped.tenantId, 'receivable', 'listReceivables');
    return null;
  }
  const rows = getFinancialRepositoryForRead().listReceivablesLegacySync(mapped);
  scheduleFinancialShadowRead(mapped.tenantId, 'receivable', 'listReceivables');
  return rows;
}

/**
 * Detalhe síncrono legado contas a receber.
 * @param {string} receivableId
 * @param {string} [tenantId]
 */
export function readGetReceivable(receivableId, tenantId = '') {
  const normalizedTenant = tenantId || resolveFinancialTenantHint();
  scheduleHydrateIfNeeded(normalizedTenant);
  if (!shouldUseFinancialRepositoryRead()) {
    scheduleFinancialShadowRead(normalizedTenant, 'receivable', 'getReceivable');
    return null;
  }
  const row = getFinancialRepositoryForRead().getReceivableLegacySync(receivableId);
  scheduleFinancialShadowRead(normalizedTenant, 'receivable', 'getReceivable');
  return row;
}

/**
 * Lista síncrona legada contas a pagar.
 * @param {object} [filters]
 */
export function readListPayables(filters = {}) {
  const mapped = mapServiceFiltersToRepository(filters);
  scheduleHydrateIfNeeded(mapped.tenantId);
  if (!shouldUseFinancialRepositoryRead()) {
    scheduleFinancialShadowRead(mapped.tenantId, 'payable', 'listPayables');
    return null;
  }
  const rows = getFinancialRepositoryForRead().listPayablesLegacySync(mapped);
  scheduleFinancialShadowRead(mapped.tenantId, 'payable', 'listPayables');
  return rows;
}

/**
 * Detalhe síncrono legado contas a pagar.
 * @param {string} payableId
 * @param {string} [tenantId]
 */
export function readGetPayable(payableId, tenantId = '') {
  const normalizedTenant = tenantId || resolveFinancialTenantHint();
  if (!shouldUseFinancialRepositoryRead()) {
    scheduleFinancialShadowRead(normalizedTenant, 'payable', 'getPayable');
    return null;
  }
  const row = getFinancialRepositoryForRead().getPayableLegacySync(payableId);
  scheduleFinancialShadowRead(normalizedTenant, 'payable', 'getPayable');
  return row;
}

/**
 * Lista síncrona legada financiamentos.
 * @param {object} [filters]
 */
export function readListFinancings(filters = {}) {
  const mapped = mapServiceFiltersToRepository(filters);
  scheduleHydrateIfNeeded(mapped.tenantId);
  if (!shouldUseFinancialRepositoryRead()) {
    scheduleFinancialShadowRead(mapped.tenantId, 'financing', 'listFinancings');
    return null;
  }
  const rows = getFinancialRepositoryForRead().listFinancingsLegacySync(mapped);
  scheduleFinancialShadowRead(mapped.tenantId, 'financing', 'listFinancings');
  return rows;
}

/**
 * Detalhe síncrono legado financiamento.
 * @param {string} financingId
 * @param {string} [tenantId]
 */
export function readGetFinancing(financingId, tenantId = '') {
  const normalizedTenant = tenantId || resolveFinancialTenantHint();
  if (!shouldUseFinancialRepositoryRead()) {
    scheduleFinancialShadowRead(normalizedTenant, 'financing', 'getFinancing');
    return null;
  }
  const row = getFinancialRepositoryForRead().getFinancingLegacySync(financingId);
  scheduleFinancialShadowRead(normalizedTenant, 'financing', 'getFinancing');
  return row;
}

/**
 * Hidratação awaitable — testes e bootstrap explícito.
 * @param {string} tenantId
 */
export async function readHydrateFinancialCache(tenantId) {
  if (!shouldUseFinancialRepositoryRead()) return { hydrated: 0, skipped: true };
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return { hydrated: 0, skipped: true };
  const hydrated = await getFinancialRepositoryForRead().syncCacheFromRemote(normalized);
  return { hydrated, skipped: false };
}

/** Apenas testes — expõe compare shadow. */
export async function __compareFinancialIdbVsRemoteForTest(tenantId, domain = 'receivable') {
  return getFinancialRepositoryForRead().compareIdbVsRemote(tenantId, domain);
}

/** Apenas testes — shadow read em background. */
export function __scheduleFinancialShadowReadForTest(tenantId, domain = 'receivable', context = 'test') {
  scheduleFinancialShadowRead(tenantId, domain, context);
}
