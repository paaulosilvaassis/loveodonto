/**
 * @module repositories/financial/financialRepository
 * @description Facade Financeiro V3 — Phase 5.11 foundation (IDB authority, remote preparado).
 *
 * READ_PRIMARY (futuro Phase 5.12):
 *   Admin API → Supabase SSOT → hydrate IDB → cache memória
 * Atual: sempre IndexedDB (flags default false).
 */

import type {
  FinancingCore,
  FinancingLegacyRow,
  FinancialDomain,
  FinancialGetResult,
  FinancialListFilters,
  FinancialListResult,
  IFinancialAdminApiClient,
  IFinancialCache,
  IFinancialIndexedDbReader,
  IFinancialRepository,
  FinancingCreateCoreDto,
  FinancingUpdateCoreDto,
  FinancialRepositoryRemoteWriteDisabledError,
  FinancialWriteMeta,
  PayableCreateCoreDto,
  PayableUpdateCoreDto,
  ReceivableCreateCoreDto,
  ReceivableUpdateCoreDto,
  PayableCore,
  PayableLegacyRow,
  ReceivableCore,
  ReceivableLegacyRow,
} from './financialTypes.js';
import type { FinancialRepositoryFlags, FinancialRepositoryFlagsInput } from './financialRepositoryFlags.js';
import {
  getFinancialRepositoryFlags,
  isFinancialReadPrimaryEnabled,
  shouldCompareFinancialIdbVsRemote,
  shouldCompareFinancialWriteResults,
} from './financialRepositoryFlags.js';
import { createFinancialCache } from './financialCache.js';
import { financialIndexedDbRepository } from './financialIndexedDbRepository.js';
import { getDefaultFinancialAdminApiClient } from './financialAdminApiRepository.js';
import {
  mapCoreToReceivableLegacyRow,
  mapLegacyRowToFinancingCore,
  mapLegacyRowToPayableCore,
  mapLegacyRowToReceivableCore,
} from './financialMapper.js';
import {
  compareFinancialWriteLegacyVsRemote,
  compareFinancingShapes,
  comparePayableShapes,
  compareReceivableShapes,
  hydrateFinancialIdbCache,
  isBrowserOffline,
  isRemoteReadUnavailableError,
  logFinancialReadDev,
  logFinancialShadowDev,
  logFinancialWriteDev,
} from './financialRepositorySync.js';
import {
  markFinancialWriteIdempotent,
  resolveFinancialWriteMeta,
  shouldSkipDuplicateFinancialWrite,
} from './financialWriteIdempotency.js';
import { createFinancialWriteAuditEntry } from './financialWriteAudit.js';
import {
  recordFinancialWriteSoakPrimaryFailed,
  recordFinancialWriteSoakPrimaryOk,
  recordFinancialWriteSoakShadowFailed,
  recordFinancialWriteSoakShadowOk,
  recordFinancialWriteSoakSkipped,
} from './financialWriteSoak.js';

export interface FinancialRepositoryDeps {
  indexedDb?: IFinancialIndexedDbReader;
  adminApi?: IFinancialAdminApiClient;
  cache?: IFinancialCache;
  flagsInput?: FinancialRepositoryFlagsInput;
}

function requireTenantId(tenantId: string): string {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenant_id ausente para operação Financial repository.');
  return tid;
}

export class FinancialRepository implements IFinancialRepository {
  private readonly deps: Required<Omit<FinancialRepositoryDeps, 'flagsInput'>> & {
    flagsInput: FinancialRepositoryFlagsInput;
  };

  constructor(deps: FinancialRepositoryDeps = {}) {
    this.deps = {
      indexedDb: deps.indexedDb ?? financialIndexedDbRepository,
      adminApi: deps.adminApi ?? getDefaultFinancialAdminApiClient(),
      cache: deps.cache ?? createFinancialCache(),
      flagsInput: deps.flagsInput ?? {},
    };
  }

  private resolveFlags(): FinancialRepositoryFlags {
    return getFinancialRepositoryFlags(this.deps.flagsInput);
  }

  private isReadPrimaryEnabled(flags: FinancialRepositoryFlags): boolean {
    return flags.FINANCIAL_READ && flags.FINANCIAL_READ_PRIMARY;
  }

  private isWritePrimaryEnabled(flags: FinancialRepositoryFlags): boolean {
    return flags.FINANCIAL_WRITE && flags.FINANCIAL_WRITE_PRIMARY;
  }

  private assertRemoteWrite(flags: FinancialRepositoryFlags): void {
    const hasWritePath = flags.FINANCIAL_READ
      && flags.FINANCIAL_WRITE
      && (flags.FINANCIAL_DUAL_WRITE || flags.FINANCIAL_WRITE_PRIMARY);
    if (!hasWritePath) {
      throw new FinancialRepositoryRemoteWriteDisabledError();
    }
  }

  private completeRemoteWrite(
    domain: FinancialDomain,
    tenantId: string,
    legacyId: string,
    flags: FinancialRepositoryFlags,
    meta: ReturnType<typeof resolveFinancialWriteMeta>,
    remote: ReceivableCore | PayableCore | FinancingCore | null,
    legacyCore: ReceivableCore | PayableCore | FinancingCore | null,
  ): void {
    markFinancialWriteIdempotent(meta.idempotencyKey);
    this.maybeCompareWriteResult(domain, legacyCore, remote);
    if (this.isWritePrimaryEnabled(flags)) {
      if (remote) {
        hydrateFinancialIdbCache(domain, [remote], tenantId, this.deps.cache);
      }
      this.auditWrite(
        domain,
        meta,
        legacyId,
        tenantId,
        remote ? 'ok' : 'failed',
        remote?.uuid ?? remote?.legacyId ?? null,
        remote ? undefined : 'remote-empty',
      );
      if (remote) recordFinancialWriteSoakPrimaryOk();
      else recordFinancialWriteSoakPrimaryFailed();
      return;
    }
    this.auditWrite(
      domain,
      meta,
      legacyId,
      tenantId,
      'shadow',
      remote?.uuid ?? remote?.legacyId ?? null,
    );
    if (remote) recordFinancialWriteSoakShadowOk();
    else recordFinancialWriteSoakShadowFailed();
  }

  private completeRemoteDelete(
    domain: FinancialDomain,
    tenantId: string,
    legacyId: string,
    flags: FinancialRepositoryFlags,
    meta: ReturnType<typeof resolveFinancialWriteMeta>,
    ok: boolean,
  ): void {
    markFinancialWriteIdempotent(meta.idempotencyKey);
    if (this.isWritePrimaryEnabled(flags)) {
      this.auditWrite(domain, meta, legacyId, tenantId, ok ? 'ok' : 'failed', null, ok ? undefined : 'remote-delete-failed');
      if (ok) recordFinancialWriteSoakPrimaryOk();
      else recordFinancialWriteSoakPrimaryFailed();
      return;
    }
    this.auditWrite(domain, meta, legacyId, tenantId, 'shadow', null);
    if (ok) recordFinancialWriteSoakShadowOk();
    else recordFinancialWriteSoakShadowFailed();
  }

  private maybeCompareWriteResult(
    domain: FinancialDomain,
    legacyCore: ReceivableCore | PayableCore | FinancingCore | null,
    remoteCore: ReceivableCore | PayableCore | FinancingCore | null,
  ): void {
    if (!shouldCompareFinancialWriteResults(this.deps.flagsInput)) return;
    const comparison = compareFinancialWriteLegacyVsRemote(domain, legacyCore, remoteCore);
    if (!comparison.match) {
      logFinancialWriteDev('compare-mismatch', { domain, comparison });
    }
  }

  private auditWrite(
    domain: FinancialDomain,
    meta: ReturnType<typeof resolveFinancialWriteMeta>,
    legacyId: string,
    tenantId: string,
    syncResult: 'ok' | 'failed' | 'skipped' | 'shadow',
    remoteId?: string | null,
    error?: string,
  ): void {
    createFinancialWriteAuditEntry({
      writeSource: meta.writeSource,
      legacyId,
      remoteId: remoteId ?? null,
      correlationId: meta.correlationId,
      tenantId,
      retryCount: meta.retryCount,
      syncResult,
      domain,
      error,
    });
  }

  async createReceivableCore(
    tenantId: string,
    dto: ReceivableCreateCoreDto,
    partialMeta: FinancialWriteMeta = {},
  ): Promise<ReceivableCore> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);
    const meta = resolveFinancialWriteMeta('receivable', normalized, dto.legacyId, 'create', partialMeta);
    if (shouldSkipDuplicateFinancialWrite(meta.idempotencyKey)) {
      this.auditWrite('receivable', meta, dto.legacyId, normalized, 'skipped');
      recordFinancialWriteSoakSkipped();
      throw new Error('Write idempotente ignorado (receivable create).');
    }

    const legacyCore = mapLegacyRowToReceivableCore({
      id: dto.legacyId,
      tenant_id: normalized,
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
    });

    const remote = await this.deps.adminApi.createReceivable(normalized, dto, meta);
    this.completeRemoteWrite('receivable', normalized, dto.legacyId, flags, meta, remote, legacyCore);
    logFinancialWriteDev('createReceivable', {
      tenantId: normalized,
      legacyId: dto.legacyId,
      ok: Boolean(remote),
      primary: this.isWritePrimaryEnabled(flags),
    });
    if (!remote) throw new Error('Admin API não retornou receivable após escrita remota.');
    return remote;
  }

  async updateReceivableCore(
    tenantId: string,
    legacyId: string,
    dto: ReceivableUpdateCoreDto,
    partialMeta: FinancialWriteMeta = {},
  ): Promise<ReceivableCore> {
    const normalized = requireTenantId(tenantId);
    const ref = String(legacyId || '').trim();
    if (!ref) throw new Error('legacyId ausente para updateReceivableCore.');
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);
    const meta = resolveFinancialWriteMeta('receivable', normalized, ref, 'update', partialMeta);
    if (shouldSkipDuplicateFinancialWrite(meta.idempotencyKey)) {
      this.auditWrite('receivable', meta, ref, normalized, 'skipped');
      throw new Error('Write idempotente ignorado (receivable update).');
    }

    const legacyRow = this.deps.indexedDb.getReceivableLegacySync(ref);
    const legacyCore = mapLegacyRowToReceivableCore(legacyRow);
    const remote = await this.deps.adminApi.updateReceivable(normalized, ref, dto, meta);
    this.completeRemoteWrite('receivable', normalized, ref, flags, meta, remote, legacyCore);
    logFinancialWriteDev('updateReceivable', {
      tenantId: normalized,
      legacyId: ref,
      ok: Boolean(remote),
      primary: this.isWritePrimaryEnabled(flags),
    });
    if (!remote) throw new Error('Admin API não retornou receivable após update remoto.');
    return remote;
  }

  async createPayableCore(
    tenantId: string,
    dto: PayableCreateCoreDto,
    partialMeta: FinancialWriteMeta = {},
  ): Promise<PayableCore> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);
    const meta = resolveFinancialWriteMeta('payable', normalized, dto.legacyId, 'create', partialMeta);
    if (shouldSkipDuplicateFinancialWrite(meta.idempotencyKey)) {
      this.auditWrite('payable', meta, dto.legacyId, normalized, 'skipped');
      throw new Error('Write idempotente ignorado (payable create).');
    }

    const legacyCore = mapLegacyRowToPayableCore({
      id: dto.legacyId,
      tenant_id: normalized,
      supplierId: dto.supplierId,
      categoryId: dto.categoryId,
      description: dto.description,
      dueDate: dto.dueDate,
      amount: dto.amount,
      paidAmount: dto.paidAmount,
      status: dto.status,
      expenseType: dto.expenseType,
      recurrenceFrequency: dto.recurrenceFrequency,
    });

    const remote = await this.deps.adminApi.createPayable(normalized, dto, meta);
    this.completeRemoteWrite('payable', normalized, dto.legacyId, flags, meta, remote, legacyCore);
    logFinancialWriteDev('createPayable', {
      tenantId: normalized,
      legacyId: dto.legacyId,
      ok: Boolean(remote),
      primary: this.isWritePrimaryEnabled(flags),
    });
    if (!remote) throw new Error('Admin API não retornou payable após escrita remota.');
    return remote;
  }

  async updatePayableCore(
    tenantId: string,
    legacyId: string,
    dto: PayableUpdateCoreDto,
    partialMeta: FinancialWriteMeta = {},
  ): Promise<PayableCore> {
    const normalized = requireTenantId(tenantId);
    const ref = String(legacyId || '').trim();
    if (!ref) throw new Error('legacyId ausente para updatePayableCore.');
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);
    const meta = resolveFinancialWriteMeta('payable', normalized, ref, 'update', partialMeta);
    if (shouldSkipDuplicateFinancialWrite(meta.idempotencyKey)) {
      this.auditWrite('payable', meta, ref, normalized, 'skipped');
      throw new Error('Write idempotente ignorado (payable update).');
    }

    const legacyCore = mapLegacyRowToPayableCore(this.deps.indexedDb.getPayableLegacySync(ref));
    const remote = await this.deps.adminApi.updatePayable(normalized, ref, dto, meta);
    this.completeRemoteWrite('payable', normalized, ref, flags, meta, remote, legacyCore);
    logFinancialWriteDev('updatePayable', {
      tenantId: normalized,
      legacyId: ref,
      ok: Boolean(remote),
      primary: this.isWritePrimaryEnabled(flags),
    });
    if (!remote) throw new Error('Admin API não retornou payable após update remoto.');
    return remote;
  }

  async deletePayableCore(
    tenantId: string,
    legacyId: string,
    partialMeta: FinancialWriteMeta = {},
  ): Promise<void> {
    const normalized = requireTenantId(tenantId);
    const ref = String(legacyId || '').trim();
    if (!ref) throw new Error('legacyId ausente para deletePayableCore.');
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);
    const meta = resolveFinancialWriteMeta('payable', normalized, ref, 'delete', partialMeta);
    if (shouldSkipDuplicateFinancialWrite(meta.idempotencyKey)) {
      this.auditWrite('payable', meta, ref, normalized, 'skipped');
      return;
    }

    const deleted = await this.deps.adminApi.deletePayable(normalized, ref, meta);
    this.completeRemoteDelete('payable', normalized, ref, flags, meta, Boolean(deleted));
    logFinancialWriteDev('deletePayable', {
      tenantId: normalized,
      legacyId: ref,
      ok: Boolean(deleted),
      primary: this.isWritePrimaryEnabled(flags),
    });
  }

  async createFinancingCore(
    tenantId: string,
    dto: FinancingCreateCoreDto,
    partialMeta: FinancialWriteMeta = {},
  ): Promise<FinancingCore> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);
    const meta = resolveFinancialWriteMeta('financing', normalized, dto.legacyId, 'create', partialMeta);
    if (shouldSkipDuplicateFinancialWrite(meta.idempotencyKey)) {
      this.auditWrite('financing', meta, dto.legacyId, normalized, 'skipped');
      throw new Error('Write idempotente ignorado (financing create).');
    }

    const legacyCore = mapLegacyRowToFinancingCore({
      id: dto.legacyId,
      tenant_id: normalized,
      patient_id: dto.patientId,
      contract_id: dto.contractId,
      budget_id: dto.budgetId,
      status: dto.status,
      approval_status: dto.approvalStatus,
      total_amount: dto.totalAmount,
      entry_amount: dto.entryAmount,
      installments_count: dto.installmentsCount,
      partner_id: dto.partnerId,
    });

    const remote = await this.deps.adminApi.createFinancing(normalized, dto, meta);
    this.completeRemoteWrite('financing', normalized, dto.legacyId, flags, meta, remote, legacyCore);
    logFinancialWriteDev('createFinancing', {
      tenantId: normalized,
      legacyId: dto.legacyId,
      ok: Boolean(remote),
      primary: this.isWritePrimaryEnabled(flags),
    });
    if (!remote) throw new Error('Admin API não retornou financing após escrita remota.');
    return remote;
  }

  async updateFinancingCore(
    tenantId: string,
    legacyId: string,
    dto: FinancingUpdateCoreDto,
    partialMeta: FinancialWriteMeta = {},
  ): Promise<FinancingCore> {
    const normalized = requireTenantId(tenantId);
    const ref = String(legacyId || '').trim();
    if (!ref) throw new Error('legacyId ausente para updateFinancingCore.');
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);
    const meta = resolveFinancialWriteMeta('financing', normalized, ref, 'update', partialMeta);
    if (shouldSkipDuplicateFinancialWrite(meta.idempotencyKey)) {
      this.auditWrite('financing', meta, ref, normalized, 'skipped');
      throw new Error('Write idempotente ignorado (financing update).');
    }

    const legacyCore = mapLegacyRowToFinancingCore(this.deps.indexedDb.getFinancingLegacySync(ref));
    const remote = await this.deps.adminApi.updateFinancing(normalized, ref, dto, meta);
    this.completeRemoteWrite('financing', normalized, ref, flags, meta, remote, legacyCore);
    logFinancialWriteDev('updateFinancing', {
      tenantId: normalized,
      legacyId: ref,
      ok: Boolean(remote),
      primary: this.isWritePrimaryEnabled(flags),
    });
    if (!remote) throw new Error('Admin API não retornou financing após update remoto.');
    return remote;
  }

  listReceivablesLegacySync(filters?: FinancialListFilters): ReceivableLegacyRow[] {
    return this.deps.indexedDb.listReceivablesLegacySync(filters);
  }

  getReceivableLegacySync(receivableId: string): ReceivableLegacyRow | null {
    const flags = this.resolveFlags();
    const id = String(receivableId || '').trim();
    if (!id) return null;

    if (this.isReadPrimaryEnabled(flags)) {
      const legacy = this.deps.indexedDb.getReceivableLegacySync(id);
      const tenantId = String(legacy?.tenant_id || '').trim();
      if (tenantId) {
        const cached = this.deps.cache.getReceivable(tenantId, id);
        if (cached) return mapCoreToReceivableLegacyRow(cached);
      }
    }

    return this.deps.indexedDb.getReceivableLegacySync(id);
  }

  listPayablesLegacySync(filters?: FinancialListFilters): PayableLegacyRow[] {
    return this.deps.indexedDb.listPayablesLegacySync(filters);
  }

  getPayableLegacySync(payableId: string): PayableLegacyRow | null {
    return this.deps.indexedDb.getPayableLegacySync(payableId);
  }

  listFinancingsLegacySync(filters?: FinancialListFilters): FinancingLegacyRow[] {
    return this.deps.indexedDb.listFinancingsLegacySync(filters);
  }

  getFinancingLegacySync(financingId: string): FinancingLegacyRow | null {
    return this.deps.indexedDb.getFinancingLegacySync(financingId);
  }

  async listReceivablesCore(
    tenantId: string,
    filters?: FinancialListFilters,
  ): Promise<FinancialListResult<ReceivableCore>> {
    return this.listCoreForDomain('receivable', tenantId, filters);
  }

  async getReceivableCore(
    tenantId: string,
    ref: string,
  ): Promise<FinancialGetResult<ReceivableCore>> {
    return this.getCoreForDomain('receivable', tenantId, ref);
  }

  async listPayablesCore(
    tenantId: string,
    filters?: FinancialListFilters,
  ): Promise<FinancialListResult<PayableCore>> {
    return this.listCoreForDomain('payable', tenantId, filters);
  }

  async getPayableCore(
    tenantId: string,
    ref: string,
  ): Promise<FinancialGetResult<PayableCore>> {
    return this.getCoreForDomain('payable', tenantId, ref);
  }

  async listFinancingsCore(
    tenantId: string,
    filters?: FinancialListFilters,
  ): Promise<FinancialListResult<FinancingCore>> {
    return this.listCoreForDomain('financing', tenantId, filters);
  }

  async getFinancingCore(
    tenantId: string,
    ref: string,
  ): Promise<FinancialGetResult<FinancingCore>> {
    return this.getCoreForDomain('financing', tenantId, ref);
  }

  async syncCacheFromRemote(tenantId: string): Promise<number> {
    if (!isFinancialReadPrimaryEnabled(this.deps.flagsInput)) return 0;
    const [receivables, payables, financings] = await Promise.all([
      this.listReceivablesCore(tenantId),
      this.listPayablesCore(tenantId),
      this.listFinancingsCore(tenantId),
    ]);
    return receivables.total + payables.total + financings.total;
  }

  async compareIdbVsRemote(
    tenantId: string,
    domain: FinancialDomain = 'receivable',
  ): Promise<Record<string, unknown> | null> {
    const flags = this.resolveFlags();
    if (!flags.FINANCIAL_SHADOW && !flags.FINANCIAL_COMPARE) return null;
    const normalized = requireTenantId(tenantId);

    if (domain === 'receivable') {
      return this.compareReceivables(normalized);
    }
    if (domain === 'payable') {
      return this.comparePayables(normalized);
    }
    if (domain === 'financing') {
      return this.compareFinancings(normalized);
    }
    return { tenantId: normalized, domain, skipped: true, reason: 'domain-not-supported' };
  }

  private async listCoreForDomain<T extends ReceivableCore | PayableCore | FinancingCore>(
    domain: FinancialDomain,
    tenantId: string,
    filters?: FinancialListFilters,
  ): Promise<FinancialListResult<T>> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();
    const mergedFilters = { ...filters, tenantId: normalized };

    if (!this.isReadPrimaryEnabled(flags)) {
      return this.listFromIdb(domain, mergedFilters) as FinancialListResult<T>;
    }

    if (isBrowserOffline()) {
      return {
        ...this.listFromIdb(domain, mergedFilters),
        source: 'indexeddb-offline',
      } as FinancialListResult<T>;
    }

    try {
      const remote = await this.fetchRemoteList(domain, normalized, mergedFilters);
      hydrateFinancialIdbCache(domain, remote, normalized, this.deps.cache);
      logFinancialReadDev(`listCore:${domain}`, {
        tenantId: normalized,
        count: remote.length,
        source: 'admin-api',
      });
      await this.maybeRunShadowCompare(normalized, flags, domain);
      return {
        items: remote as T[],
        total: remote.length,
        source: 'admin-api',
        domain,
      };
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      logFinancialReadDev(`listCore-fallback:${domain}`, {
        tenantId: normalized,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ...this.listFromIdb(domain, mergedFilters),
        source: 'indexeddb-offline',
      } as FinancialListResult<T>;
    }
  }

  private async getCoreForDomain<T extends ReceivableCore | PayableCore | FinancingCore>(
    domain: FinancialDomain,
    tenantId: string,
    ref: string,
  ): Promise<FinancialGetResult<T>> {
    const normalized = requireTenantId(tenantId);
    const needle = String(ref || '').trim();
    if (!needle) return { core: null, source: 'indexeddb', domain };

    const flags = this.resolveFlags();
    const cached = this.getCachedCore(domain, normalized, needle);
    if (cached) return { core: cached as T, source: 'cache', domain };

    if (!this.isReadPrimaryEnabled(flags)) {
      const core = this.mapLegacyGet(domain, needle);
      if (core) this.setCachedCore(domain, normalized, core);
      return { core: core as T | null, source: 'indexeddb', domain };
    }

    if (isBrowserOffline()) {
      const core = this.mapLegacyGet(domain, needle);
      return { core: core as T | null, source: 'indexeddb-offline', domain };
    }

    try {
      const remote = await this.fetchRemoteGet(domain, normalized, needle);
      if (remote) {
        hydrateFinancialIdbCache(domain, [remote], normalized, this.deps.cache);
        await this.maybeRunShadowCompare(normalized, flags, domain);
        return { core: remote as T, source: 'admin-api', domain };
      }
      const core = this.mapLegacyGet(domain, needle);
      return { core: core as T | null, source: 'indexeddb', domain };
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      const core = this.mapLegacyGet(domain, needle);
      return { core: core as T | null, source: 'indexeddb-offline', domain };
    }
  }

  private listFromIdb(
    domain: FinancialDomain,
    filters: FinancialListFilters,
  ): FinancialListResult<ReceivableCore | PayableCore | FinancingCore> {
    if (domain === 'receivable') {
      const legacy = this.deps.indexedDb.listReceivablesLegacySync(filters);
      const items = legacy
        .map((row) => mapLegacyRowToReceivableCore(row))
        .filter((core): core is ReceivableCore => Boolean(core));
      return { items, total: items.length, source: 'indexeddb', domain };
    }
    if (domain === 'payable') {
      const legacy = this.deps.indexedDb.listPayablesLegacySync(filters);
      const items = legacy
        .map((row) => mapLegacyRowToPayableCore(row))
        .filter((core): core is PayableCore => Boolean(core));
      return { items, total: items.length, source: 'indexeddb', domain };
    }
    const legacy = this.deps.indexedDb.listFinancingsLegacySync(filters);
    const items = legacy
      .map((row) => mapLegacyRowToFinancingCore(row))
      .filter((core): core is FinancingCore => Boolean(core));
    return { items, total: items.length, source: 'indexeddb', domain };
  }

  private mapLegacyGet(
    domain: FinancialDomain,
    ref: string,
  ): ReceivableCore | PayableCore | FinancingCore | null {
    if (domain === 'receivable') {
      return mapLegacyRowToReceivableCore(this.deps.indexedDb.getReceivableLegacySync(ref));
    }
    if (domain === 'payable') {
      return mapLegacyRowToPayableCore(this.deps.indexedDb.getPayableLegacySync(ref));
    }
    return mapLegacyRowToFinancingCore(this.deps.indexedDb.getFinancingLegacySync(ref));
  }

  private getCachedCore(
    domain: FinancialDomain,
    tenantId: string,
    ref: string,
  ): ReceivableCore | PayableCore | FinancingCore | null {
    if (domain === 'receivable') return this.deps.cache.getReceivable(tenantId, ref);
    if (domain === 'payable') return this.deps.cache.getPayable(tenantId, ref);
    return this.deps.cache.getFinancing(tenantId, ref);
  }

  private setCachedCore(
    domain: FinancialDomain,
    tenantId: string,
    core: ReceivableCore | PayableCore | FinancingCore,
  ): void {
    if (domain === 'receivable') this.deps.cache.setReceivable(tenantId, core as ReceivableCore);
    else if (domain === 'payable') this.deps.cache.setPayable(tenantId, core as PayableCore);
    else this.deps.cache.setFinancing(tenantId, core as FinancingCore);
  }

  private async fetchRemoteList(
    domain: FinancialDomain,
    tenantId: string,
    filters: FinancialListFilters,
  ): Promise<Array<ReceivableCore | PayableCore | FinancingCore>> {
    if (domain === 'receivable') return this.deps.adminApi.listReceivables(tenantId, filters);
    if (domain === 'payable') return this.deps.adminApi.listPayables(tenantId, filters);
    return this.deps.adminApi.listFinancings(tenantId, filters);
  }

  private async fetchRemoteGet(
    domain: FinancialDomain,
    tenantId: string,
    ref: string,
  ): Promise<ReceivableCore | PayableCore | FinancingCore | null> {
    if (domain === 'receivable') return this.deps.adminApi.getReceivable(tenantId, ref);
    if (domain === 'payable') return this.deps.adminApi.getPayable(tenantId, ref);
    return this.deps.adminApi.getFinancing(tenantId, ref);
  }

  private async compareReceivables(tenantId: string): Promise<Record<string, unknown>> {
    const idbRows = this.deps.indexedDb.listReceivablesLegacySync({ tenantId });
    let remoteRows: ReceivableCore[] = [];
    try {
      remoteRows = await this.deps.adminApi.listReceivables(tenantId);
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      return { tenantId, domain: 'receivable', skipped: true, reason: 'remote-unavailable' };
    }

    const idbMap = new Map(
      idbRows
        .map((row) => mapLegacyRowToReceivableCore(row))
        .filter((core): core is ReceivableCore => Boolean(core))
        .map((core) => [core.legacyId, core]),
    );
    const remoteMap = new Map(remoteRows.map((core) => [core.legacyId, core]));
    const diffs: Record<string, unknown>[] = [];

    for (const [id, idbCore] of idbMap) {
      const comparison = compareReceivableShapes(idbCore, remoteMap.get(id) ?? null);
      if (!comparison.match) diffs.push({ ref: id, ...comparison });
    }

    const report = {
      tenantId,
      domain: 'receivable',
      comparedAt: new Date().toISOString(),
      matchCount: idbMap.size - diffs.length,
      mismatchCount: diffs.length,
      diffs,
    };
    logFinancialShadowDev('compare', report);
    return report;
  }

  private async comparePayables(tenantId: string): Promise<Record<string, unknown>> {
    const idbRows = this.deps.indexedDb.listPayablesLegacySync({ tenantId });
    let remoteRows: PayableCore[] = [];
    try {
      remoteRows = await this.deps.adminApi.listPayables(tenantId);
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      return { tenantId, domain: 'payable', skipped: true, reason: 'remote-unavailable' };
    }

    const idbMap = new Map(
      idbRows
        .map((row) => mapLegacyRowToPayableCore(row))
        .filter((core): core is PayableCore => Boolean(core))
        .map((core) => [core.legacyId, core]),
    );
    const remoteMap = new Map(remoteRows.map((core) => [core.legacyId, core]));
    const diffs: Record<string, unknown>[] = [];

    for (const [id, idbCore] of idbMap) {
      const comparison = comparePayableShapes(idbCore, remoteMap.get(id) ?? null);
      if (!comparison.match) diffs.push({ ref: id, ...comparison });
    }

    const report = {
      tenantId,
      domain: 'payable',
      comparedAt: new Date().toISOString(),
      matchCount: idbMap.size - diffs.length,
      mismatchCount: diffs.length,
      diffs,
    };
    logFinancialShadowDev('compare', report);
    return report;
  }

  private async compareFinancings(tenantId: string): Promise<Record<string, unknown>> {
    const idbRows = this.deps.indexedDb.listFinancingsLegacySync({ tenantId });
    let remoteRows: FinancingCore[] = [];
    try {
      remoteRows = await this.deps.adminApi.listFinancings(tenantId);
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      return { tenantId, domain: 'financing', skipped: true, reason: 'remote-unavailable' };
    }

    const idbMap = new Map(
      idbRows
        .map((row) => mapLegacyRowToFinancingCore(row))
        .filter((core): core is FinancingCore => Boolean(core))
        .map((core) => [core.legacyId, core]),
    );
    const remoteMap = new Map(remoteRows.map((core) => [core.legacyId, core]));
    const diffs: Record<string, unknown>[] = [];

    for (const [id, idbCore] of idbMap) {
      const comparison = compareFinancingShapes(idbCore, remoteMap.get(id) ?? null);
      if (!comparison.match) diffs.push({ ref: id, ...comparison });
    }

    const report = {
      tenantId,
      domain: 'financing',
      comparedAt: new Date().toISOString(),
      matchCount: idbMap.size - diffs.length,
      mismatchCount: diffs.length,
      diffs,
    };
    logFinancialShadowDev('compare', report);
    return report;
  }

  private async maybeRunShadowCompare(
    tenantId: string,
    flags: FinancialRepositoryFlags,
    domain: FinancialDomain,
  ): Promise<void> {
    if (!flags.FINANCIAL_SHADOW && !flags.FINANCIAL_COMPARE) return;
    try {
      await this.compareIdbVsRemote(tenantId, domain);
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[FINANCIAL_SHADOW] skipped:', err instanceof Error ? err.message : err);
      }
    }
  }
}

export const financialRepository: IFinancialRepository = new FinancialRepository();

export async function rehydrateFinancialCacheIfPrimary(
  tenantId: string | null | undefined,
): Promise<number> {
  if (!isFinancialReadPrimaryEnabled()) return 0;
  const normalized = String(tenantId || '').trim();
  if (!normalized) return 0;
  return financialRepository.syncCacheFromRemote(normalized);
}

export function createFinancialRepository(deps?: FinancialRepositoryDeps): IFinancialRepository {
  return new FinancialRepository(deps);
}
