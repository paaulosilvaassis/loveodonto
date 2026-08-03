/**
 * @module repositories/crm/crmRepository
 * @description Facade CRM/Kanban V3 — Phase 6.1 foundation (IDB authority, remote preparado).
 *
 * READ_PRIMARY (futuro Phase 6.2):
 *   Admin API → Supabase SSOT → hydrate IDB → cache memória
 * Atual: sempre IndexedDB (flags default false).
 */

import type {
  CrmLeadGetResult,
  CrmLeadListResult,
  CrmLegacyFollowUpCore,
  CrmLegacyFollowUpLegacyRow,
  CrmListFilters,
  CrmTaskCore,
  CrmTaskLegacyRow,
  CrmWaveBListFilters,
  CrmWriteMeta,
  ICrmAdminApiClient,
  ICrmCache,
  ICrmIndexedDbReader,
  ICrmRepository,
  KanbanCardCore,
  KanbanCardLegacyRow,
  LeadCore,
  LeadCreateCoreDto,
  LeadEventCore,
  LeadEventLegacyRow,
  LeadLegacyRow,
  LeadMoveStageCoreDto,
  LeadUpdateCoreDto,
  PipelineStageCore,
  PipelineStageCreateCoreDto,
  PipelineStageLegacyRow,
  PipelineStageUpdateCoreDto,
  StrategicFollowUpCore,
  StrategicFollowUpLegacyRow,
} from './crmTypes.js';
import type { CrmRepositoryFlags, CrmRepositoryFlagsInput } from './crmRepositoryFlags.js';
import {
  getCrmRepositoryFlags,
  isCrmReadPrimaryEnabled,
  isCrmWritePrimaryEnabled,
  shouldCompareCrmIdbVsRemote,
  shouldCompareCrmWriteResults,
  shouldRunCrmShadowRead,
} from './crmRepositoryFlags.js';
import { createCrmCache } from './crmCache.js';
import { crmIndexedDbRepository } from './crmIndexedDbRepository.js';
import { getDefaultCrmAdminApiReader } from './crmAdminApiRepository.js';
import {
  mapCoreToLeadLegacyRow,
  mapKanbanCardCoreToLegacyRow,
  mapLeadCoreToKanbanCard,
  mapLegacyRowToCrmLegacyFollowUpCore,
  mapLegacyRowToCrmTaskCore,
  mapLegacyRowToLeadCore,
  mapLegacyRowToLeadEventCore,
  mapLegacyRowToPipelineStageCore,
  mapLegacyRowToStrategicFollowUpCore,
} from './crmMapper.js';
import {
  compareCrmWriteLegacyVsRemote,
  compareLeadShapes,
  comparePipelineStageShapes,
  hydrateCrmIdbCache,
  hydrateCrmPipelineStageIdbCache,
  isBrowserOffline,
  isRemoteReadUnavailableError,
  logCrmReadDev,
  logCrmShadowDev,
  logCrmWriteDev,
  removeCrmPipelineStageFromIdb,
  shadowReadDiscardRemote,
} from './crmRepositorySync.js';
import { runRepositoryWritePipeline } from '../shared/repositoryV3WritePipeline.js';
import { handleRepositoryWriteFallback } from '../shared/repositoryV3Fallback.js';
import {
  recordCrmWriteSoakCompareDiff,
  recordCrmWriteSoakHydrateFailed,
  recordCrmWriteSoakHydrateOk,
  recordCrmWriteSoakPrimaryFailed,
  recordCrmWriteSoakPrimaryOk,
  recordCrmWriteSoakShadowFailed,
  recordCrmWriteSoakShadowOk,
  recordCrmWriteSoakSkipped,
  recordCrmWriteSoakTotalWrite,
} from './crmWriteSoak.js';

export interface CrmRepositoryDeps {
  indexedDb?: ICrmIndexedDbReader;
  adminApi?: ICrmAdminApiClient;
  cache?: ICrmCache;
  flagsInput?: CrmRepositoryFlagsInput;
}

function requireTenantId(tenantId: string): string {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenant_id ausente para operação CRM repository.');
  return tid;
}

export class CrmRepository implements ICrmRepository {
  private readonly deps: Required<Omit<CrmRepositoryDeps, 'flagsInput'>> & {
    flagsInput: CrmRepositoryFlagsInput;
  };

  constructor(deps: CrmRepositoryDeps = {}) {
    this.deps = {
      indexedDb: deps.indexedDb ?? crmIndexedDbRepository,
      adminApi: deps.adminApi ?? getDefaultCrmAdminApiReader(),
      cache: deps.cache ?? createCrmCache(),
      flagsInput: deps.flagsInput ?? {},
    };
  }

  private resolveFlags(): CrmRepositoryFlags {
    return getCrmRepositoryFlags(this.deps.flagsInput);
  }

  private isReadPrimaryEnabled(flags: CrmRepositoryFlags): boolean {
    return flags.CRM_READ && flags.CRM_READ_PRIMARY;
  }

  private isWritePrimaryEnabled(flags: CrmRepositoryFlags): boolean {
    return flags.CRM_WRITE && flags.CRM_WRITE_PRIMARY;
  }

  private assertRemoteWrite(flags: CrmRepositoryFlags): void {
    const hasWritePath = flags.CRM_READ
      && flags.CRM_WRITE
      && (flags.CRM_DUAL_WRITE || flags.CRM_WRITE_PRIMARY);
    if (!hasWritePath) {
      throw new CrmRepositoryRemoteWriteDisabledError();
    }
  }

  private wrapCompareWrite(
    domain: 'lead' | 'pipeline-stage',
    legacy: LeadCore | PipelineStageCore | null,
    remote: LeadCore | PipelineStageCore | null,
  ): { match: boolean; diffs?: unknown[] } {
    const comparison = compareCrmWriteLegacyVsRemote(domain, legacy, remote);
    if (!comparison.match) {
      recordCrmWriteSoakCompareDiff();
    }
    return comparison as { match: boolean; diffs?: unknown[] };
  }

  private hydrateLeadPrimary(remote: LeadCore, tenantId: string): void {
    try {
      const count = hydrateCrmIdbCache([remote], tenantId, this.deps.cache);
      if (count > 0) recordCrmWriteSoakHydrateOk();
      else recordCrmWriteSoakHydrateFailed();
    } catch (err) {
      recordCrmWriteSoakHydrateFailed(err);
    }
  }

  private hydratePipelineStagePrimary(remote: PipelineStageCore, tenantId: string): void {
    try {
      const count = hydrateCrmPipelineStageIdbCache([remote], tenantId);
      if (count > 0) recordCrmWriteSoakHydrateOk();
      else recordCrmWriteSoakHydrateFailed();
    } catch (err) {
      recordCrmWriteSoakHydrateFailed(err);
    }
  }

  private hydratePipelineStageDeletePrimary(tenantId: string, legacyId: string): void {
    try {
      if (removeCrmPipelineStageFromIdb(tenantId, legacyId)) {
        recordCrmWriteSoakHydrateOk();
      } else {
        recordCrmWriteSoakHydrateFailed();
      }
    } catch (err) {
      recordCrmWriteSoakHydrateFailed(err);
    }
  }

  private recordWriteSoakOutcome(
    flags: CrmRepositoryFlags,
    syncResult: 'ok' | 'failed' | 'skipped' | 'shadow',
    skipped: boolean,
  ): void {
    recordCrmWriteSoakTotalWrite();
    if (skipped) {
      recordCrmWriteSoakSkipped();
      return;
    }
    if (this.isWritePrimaryEnabled(flags)) {
      if (syncResult === 'ok') recordCrmWriteSoakPrimaryOk();
      else if (syncResult === 'failed') recordCrmWriteSoakPrimaryFailed();
      return;
    }
    if (syncResult === 'shadow') recordCrmWriteSoakShadowOk();
    else if (syncResult === 'failed') recordCrmWriteSoakShadowFailed();
  }

  listLeadsLegacySync(filters?: CrmListFilters): LeadLegacyRow[] {
    const flags = this.resolveFlags();
    if (this.isReadPrimaryEnabled(flags)) {
      const tenantId = normalizeTenantFromFilters(filters);
      if (tenantId) {
        const cached = this.listFromCacheOrIdb(tenantId, filters);
        if (cached.length) return cached;
      }
    }
    return this.deps.indexedDb.listLeadsLegacySync(filters);
  }

  getLeadLegacySync(leadId: string): LeadLegacyRow | null {
    const flags = this.resolveFlags();
    const id = String(leadId || '').trim();
    if (!id) return null;

    if (this.isReadPrimaryEnabled(flags)) {
      const legacy = this.deps.indexedDb.getLeadLegacySync(id);
      const tenantId = String(legacy?.tenant_id || '').trim();
      if (tenantId) {
        const cached = this.deps.cache.getLead(tenantId, id);
        if (cached) return mapCoreToLeadLegacyRow(cached);
      }
    }

    return this.deps.indexedDb.getLeadLegacySync(id);
  }

  listPipelineStagesLegacySync(tenantId?: string, options?: { includeInactive?: boolean }): PipelineStageLegacyRow[] {
    const flags = this.resolveFlags();
    if (this.isReadPrimaryEnabled(flags)) {
      const normalized = String(tenantId || '').trim();
      if (normalized) {
        const cached = this.deps.indexedDb.listPipelineStagesLegacySync(normalized, options);
        if (cached.length) return cached;
      }
    }
    return this.deps.indexedDb.listPipelineStagesLegacySync(tenantId, options);
  }

  getPipelineStageLegacySync(tenantId: string, ref: string): PipelineStageLegacyRow | null {
    return this.deps.indexedDb.getPipelineStageLegacySync(tenantId, ref);
  }

  listKanbanCardsLegacySync(filters?: CrmListFilters): KanbanCardLegacyRow[] {
    const flags = this.resolveFlags();
    if (this.isReadPrimaryEnabled(flags)) {
      const tenantId = normalizeTenantFromFilters(filters);
      if (tenantId) {
        const cached = this.deps.indexedDb.listKanbanCardsLegacySync({ ...filters, tenantId });
        if (cached.length) return cached;
      }
    }
    return this.deps.indexedDb.listKanbanCardsLegacySync(filters);
  }

  getKanbanCardLegacySync(cardId: string): KanbanCardLegacyRow | null {
    const flags = this.resolveFlags();
    const id = String(cardId || '').trim();
    if (!id) return null;

    if (this.isReadPrimaryEnabled(flags)) {
      const legacy = this.deps.indexedDb.getKanbanCardLegacySync(id);
      const tenantId = String(legacy?.tenant_id || '').trim();
      if (tenantId) {
        const cached = this.deps.cache.getLead(tenantId, id);
        if (cached) return mapKanbanCardCoreToLegacyRow(mapLeadCoreToKanbanCard(cached));
      }
    }

    return this.deps.indexedDb.getKanbanCardLegacySync(id);
  }

  listLeadEventsLegacySync(leadId: string, filters: CrmWaveBListFilters = {}): LeadEventLegacyRow[] {
    return this.deps.indexedDb.listLeadEventsLegacySync(leadId, filters);
  }

  listCrmLegacyFollowUpsLegacySync(filters: CrmWaveBListFilters = {}): CrmLegacyFollowUpLegacyRow[] {
    return this.deps.indexedDb.listCrmLegacyFollowUpsLegacySync(filters);
  }

  getCrmLegacyFollowUpLegacySync(ref: string): CrmLegacyFollowUpLegacyRow | null {
    return this.deps.indexedDb.getCrmLegacyFollowUpLegacySync(ref);
  }

  listCrmTasksLegacySync(filters: CrmWaveBListFilters = {}): CrmTaskLegacyRow[] {
    return this.deps.indexedDb.listCrmTasksLegacySync(filters);
  }

  getCrmTaskLegacySync(ref: string): CrmTaskLegacyRow | null {
    return this.deps.indexedDb.getCrmTaskLegacySync(ref);
  }

  listStrategicFollowUpsLegacySync(filters: CrmWaveBListFilters = {}): StrategicFollowUpLegacyRow[] {
    return this.deps.indexedDb.listStrategicFollowUpsLegacySync(filters);
  }

  getStrategicFollowUpLegacySync(ref: string): StrategicFollowUpLegacyRow | null {
    return this.deps.indexedDb.getStrategicFollowUpLegacySync(ref);
  }

  /**
   * Wave B Core — sempre IndexedDB nesta phase (sem Read Cutover).
   * Admin API stubs existem mas não são invocados até Phase 6.6.
   */
  async listLeadEventsCore(tenantId: string, filters: CrmWaveBListFilters = {}): Promise<LeadEventCore[]> {
    const normalized = requireTenantId(tenantId);
    const legacy = this.deps.indexedDb.listLeadEventsLegacySync(filters.leadId || '', {
      ...filters,
      tenantId: normalized,
    });
    return legacy
      .map((row) => mapLegacyRowToLeadEventCore(row, normalized))
      .filter((core): core is LeadEventCore => Boolean(core));
  }

  async listCrmLegacyFollowUpsCore(
    tenantId: string,
    filters: CrmWaveBListFilters = {},
  ): Promise<CrmLegacyFollowUpCore[]> {
    const normalized = requireTenantId(tenantId);
    const legacy = this.deps.indexedDb.listCrmLegacyFollowUpsLegacySync({
      ...filters,
      tenantId: normalized,
    });
    return legacy
      .map((row) => mapLegacyRowToCrmLegacyFollowUpCore(row, normalized))
      .filter((core): core is CrmLegacyFollowUpCore => Boolean(core));
  }

  async listCrmTasksCore(tenantId: string, filters: CrmWaveBListFilters = {}): Promise<CrmTaskCore[]> {
    const normalized = requireTenantId(tenantId);
    const legacy = this.deps.indexedDb.listCrmTasksLegacySync({
      ...filters,
      tenantId: normalized,
    });
    return legacy
      .map((row) => mapLegacyRowToCrmTaskCore(row, normalized))
      .filter((core): core is CrmTaskCore => Boolean(core));
  }

  async listStrategicFollowUpsCore(
    tenantId: string,
    filters: CrmWaveBListFilters = {},
  ): Promise<StrategicFollowUpCore[]> {
    const normalized = requireTenantId(tenantId);
    const legacy = this.deps.indexedDb.listStrategicFollowUpsLegacySync({
      ...filters,
      tenantId: normalized,
    });
    return legacy
      .map((row) => mapLegacyRowToStrategicFollowUpCore(row, normalized))
      .filter((core): core is StrategicFollowUpCore => Boolean(core));
  }

  async listLeadsCore(tenantId: string, filters?: CrmListFilters): Promise<CrmLeadListResult> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();

    if (!this.isReadPrimaryEnabled(flags)) {
      const legacy = this.deps.indexedDb.listLeadsLegacySync({ ...filters, tenantId: normalized });
      const items = legacy
        .map((row) => mapLegacyRowToLeadCore(row))
        .filter((core): core is LeadCore => Boolean(core));
      return { items, total: items.length, source: 'indexeddb' };
    }

    if (isBrowserOffline()) {
      const items = this.listFromCacheOrIdb(normalized, filters)
        .map((row) => mapLegacyRowToLeadCore(row))
        .filter((core): core is LeadCore => Boolean(core));
      return { items, total: items.length, source: 'indexeddb-offline' };
    }

    try {
      const remote = await this.deps.adminApi.listLeads(normalized, filters);
      hydrateCrmIdbCache(remote, normalized, this.deps.cache);
      logCrmReadDev('listLeadsCore', { tenantId: normalized, count: remote.length, source: 'admin-api' });
      await this.maybeRunShadowCompare(normalized, flags);
      return { items: remote, total: remote.length, source: 'admin-api' };
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      const legacy = this.deps.indexedDb.listLeadsLegacySync({ ...filters, tenantId: normalized });
      const items = legacy
        .map((row) => mapLegacyRowToLeadCore(row))
        .filter((core): core is LeadCore => Boolean(core));
      logCrmReadDev('listLeadsCore-fallback', {
        tenantId: normalized,
        error: err instanceof Error ? err.message : String(err),
      });
      return { items, total: items.length, source: 'indexeddb-offline' };
    }
  }

  async getLeadCore(tenantId: string, ref: string): Promise<CrmLeadGetResult> {
    const normalized = requireTenantId(tenantId);
    const needle = String(ref || '').trim();
    if (!needle) return { core: null, source: 'indexeddb' };

    const flags = this.resolveFlags();
    const cached = this.deps.cache.getLead(normalized, needle);
    if (cached) return { core: cached, source: 'cache' };

    if (!this.isReadPrimaryEnabled(flags)) {
      const legacy = this.deps.indexedDb.getLeadLegacySync(needle);
      const core = mapLegacyRowToLeadCore(legacy);
      if (core) this.deps.cache.setLead(normalized, core);
      return { core, source: 'indexeddb' };
    }

    if (isBrowserOffline()) {
      const legacy = this.deps.indexedDb.getLeadLegacySync(needle);
      return { core: mapLegacyRowToLeadCore(legacy), source: 'indexeddb-offline' };
    }

    try {
      const remote = await this.deps.adminApi.getLead(normalized, needle);
      if (remote) {
        hydrateCrmIdbCache([remote], normalized, this.deps.cache);
        await this.maybeRunShadowCompare(normalized, flags);
        return { core: remote, source: 'admin-api' };
      }
      const legacy = this.deps.indexedDb.getLeadLegacySync(needle);
      return { core: mapLegacyRowToLeadCore(legacy), source: 'indexeddb' };
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      const legacy = this.deps.indexedDb.getLeadLegacySync(needle);
      return { core: mapLegacyRowToLeadCore(legacy), source: 'indexeddb-offline' };
    }
  }

  async syncCacheFromRemote(tenantId: string): Promise<number> {
    if (!isCrmReadPrimaryEnabled(this.deps.flagsInput)) return 0;
    const leads = await this.listLeadsCore(tenantId);
    await this.listPipelineStagesCore(tenantId, { includeInactive: true });
    return leads.total;
  }

  async listPipelineStagesCore(
    tenantId: string,
    options: { includeInactive?: boolean } = {},
  ): Promise<PipelineStageCore[]> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();

    if (!this.isReadPrimaryEnabled(flags)) {
      return this.deps.indexedDb.listPipelineStagesLegacySync(normalized, options)
        .map((row) => mapLegacyRowToPipelineStageCore(row))
        .filter((core): core is PipelineStageCore => Boolean(core));
    }

    if (isBrowserOffline()) {
      return this.deps.indexedDb.listPipelineStagesLegacySync(normalized, options)
        .map((row) => mapLegacyRowToPipelineStageCore(row))
        .filter((core): core is PipelineStageCore => Boolean(core));
    }

    try {
      const remote = await this.deps.adminApi.listPipelineStages(normalized, options);
      logCrmReadDev('listPipelineStagesCore', { tenantId: normalized, count: remote.length });
      await this.maybeRunShadowCompare(normalized, flags);
      return remote;
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      return this.deps.indexedDb.listPipelineStagesLegacySync(normalized, options)
        .map((row) => mapLegacyRowToPipelineStageCore(row))
        .filter((core): core is PipelineStageCore => Boolean(core));
    }
  }

  async getPipelineStageCore(tenantId: string, ref: string): Promise<PipelineStageCore | null> {
    const normalized = requireTenantId(tenantId);
    const needle = String(ref || '').trim();
    if (!needle) return null;
    const flags = this.resolveFlags();

    if (!this.isReadPrimaryEnabled(flags)) {
      return mapLegacyRowToPipelineStageCore(
        this.deps.indexedDb.getPipelineStageLegacySync(normalized, needle),
      );
    }

    if (isBrowserOffline()) {
      return mapLegacyRowToPipelineStageCore(
        this.deps.indexedDb.getPipelineStageLegacySync(normalized, needle),
      );
    }

    try {
      const remote = await this.deps.adminApi.getPipelineStage(normalized, needle);
      await this.maybeRunShadowCompare(normalized, flags);
      return remote ?? mapLegacyRowToPipelineStageCore(
        this.deps.indexedDb.getPipelineStageLegacySync(normalized, needle),
      );
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      return mapLegacyRowToPipelineStageCore(
        this.deps.indexedDb.getPipelineStageLegacySync(normalized, needle),
      );
    }
  }

  async listKanbanCardsCore(tenantId: string, filters?: CrmListFilters): Promise<KanbanCardCore[]> {
    const result = await this.listLeadsCore(tenantId, filters);
    return result.items.map(mapLeadCoreToKanbanCard);
  }

  async getKanbanCardCore(tenantId: string, ref: string): Promise<KanbanCardCore | null> {
    const result = await this.getLeadCore(tenantId, ref);
    return result.core ? mapLeadCoreToKanbanCard(result.core) : null;
  }

  async shadowReadDiscard(tenantId: string): Promise<void> {
    if (!shouldRunCrmShadowRead(this.deps.flagsInput)) return;
    const normalized = requireTenantId(tenantId);
    await shadowReadDiscardRemote(
      () => this.deps.adminApi.listLeads(normalized),
      'leads',
    );
    await shadowReadDiscardRemote(
      () => this.deps.adminApi.listPipelineStages(normalized, { includeInactive: true }),
      'pipeline-stages',
    );
  }

  async createLeadCore(
    tenantId: string,
    dto: LeadCreateCoreDto,
    partialMeta: CrmWriteMeta = {},
  ): Promise<LeadCore> {
    return this.runLeadWrite('create', tenantId, dto.legacyId, partialMeta, async (meta) => {
      return this.deps.adminApi.createLead(requireTenantId(tenantId), dto, meta);
    }, () => mapLegacyRowToLeadCore({
      id: dto.legacyId,
      tenant_id: tenantId,
      name: dto.name,
      phone: dto.phone,
      source: dto.source,
      stageKey: dto.stageKey,
    }));
  }

  async updateLeadCore(
    tenantId: string,
    ref: string,
    dto: LeadUpdateCoreDto,
    partialMeta: CrmWriteMeta = {},
  ): Promise<LeadCore> {
    const legacyId = String(ref || '').trim();
    return this.runLeadWrite('update', tenantId, legacyId, partialMeta, async (meta) => {
      return this.deps.adminApi.updateLead(requireTenantId(tenantId), legacyId, dto, meta);
    }, () => mapLegacyRowToLeadCore(this.deps.indexedDb.getLeadLegacySync(legacyId)));
  }

  async moveLeadStageCore(
    tenantId: string,
    ref: string,
    dto: LeadMoveStageCoreDto,
    partialMeta: CrmWriteMeta = {},
  ): Promise<LeadCore> {
    const legacyId = String(ref || '').trim();
    return this.runLeadWrite('move-stage', tenantId, legacyId, partialMeta, async (meta) => {
      return this.deps.adminApi.moveLeadStage(requireTenantId(tenantId), legacyId, dto, meta);
    }, () => mapLegacyRowToLeadCore(this.deps.indexedDb.getLeadLegacySync(legacyId)));
  }

  async createPipelineStageCore(
    tenantId: string,
    dto: PipelineStageCreateCoreDto,
    partialMeta: CrmWriteMeta = {},
  ): Promise<PipelineStageCore> {
    return this.runPipelineWrite('create', tenantId, dto.legacyId, partialMeta, async (meta) => {
      return this.deps.adminApi.createPipelineStage(requireTenantId(tenantId), dto, meta);
    }, () => mapLegacyRowToPipelineStageCore({
      id: dto.legacyId,
      tenant_id: tenantId,
      key: dto.key,
      label: dto.label,
      order: dto.order,
      color: dto.color,
      isActive: dto.isActive,
      stageType: dto.stageType,
    }));
  }

  async updatePipelineStageCore(
    tenantId: string,
    ref: string,
    dto: PipelineStageUpdateCoreDto,
    partialMeta: CrmWriteMeta = {},
  ): Promise<PipelineStageCore> {
    const legacyId = String(ref || '').trim();
    return this.runPipelineWrite('update', tenantId, legacyId, partialMeta, async (meta) => {
      return this.deps.adminApi.updatePipelineStage(requireTenantId(tenantId), legacyId, dto, meta);
    }, () => {
      const row = this.deps.indexedDb.getPipelineStageLegacySync(tenantId, legacyId);
      return mapLegacyRowToPipelineStageCore(row);
    });
  }

  async deletePipelineStageCore(
    tenantId: string,
    ref: string,
    partialMeta: CrmWriteMeta = {},
  ): Promise<void> {
    const normalized = requireTenantId(tenantId);
    const legacyId = String(ref || '').trim();
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);

    try {
      const result = await runRepositoryWritePipeline({
        domain: 'pipeline-stage',
        tenantId: normalized,
        legacyId,
        operation: 'delete',
        partialMeta,
        isWritePrimary: this.isWritePrimaryEnabled(flags),
        writeCompare: shouldCompareCrmWriteResults(this.deps.flagsInput),
        executeRemote: async (meta) => {
          await this.deps.adminApi.deletePipelineStage(normalized, legacyId, meta);
          return true;
        },
        extractRemoteId: () => null,
      });

      this.recordWriteSoakOutcome(flags, result.syncResult, result.skipped);

      if (this.isWritePrimaryEnabled(flags) && result.syncResult === 'ok') {
        this.hydratePipelineStageDeletePrimary(normalized, legacyId);
      }

      logCrmWriteDev('deletePipelineStage', {
        tenantId: normalized,
        legacyId,
        syncResult: result.syncResult,
        primary: this.isWritePrimaryEnabled(flags),
      });
    } catch (err) {
      handleRepositoryWriteFallback({
        domain: 'pipeline-stage',
        tenantId: normalized,
        legacyId,
        correlationId: partialMeta.correlationId || legacyId,
        writeSource: partialMeta.writeSource || 'legacy-dual-write',
        retryCount: partialMeta.retryCount,
        event: 'deletePipelineStageCore',
        error: err,
      });
      throw err;
    }
  }

  private async runLeadWrite(
    operation: string,
    tenantId: string,
    legacyId: string,
    partialMeta: CrmWriteMeta,
    executeRemote: (meta: import('../shared/repositoryV3Idempotency.js').RepositoryWriteMeta & {
      correlationId: string;
      idempotencyKey: string;
      retryCount: number;
      writeSource: string;
    }) => Promise<LeadCore>,
    getLegacyCore: () => LeadCore | null,
  ): Promise<LeadCore> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);
    const legacyCore = getLegacyCore();

    try {
      const result = await runRepositoryWritePipeline({
        domain: 'lead',
        tenantId: normalized,
        legacyId,
        operation,
        partialMeta,
        isWritePrimary: this.isWritePrimaryEnabled(flags),
        writeCompare: shouldCompareCrmWriteResults(this.deps.flagsInput),
        getLegacyCore: () => legacyCore,
        compareWrite: (legacy, remote) => this.wrapCompareWrite('lead', legacy, remote),
        executeRemote,
        extractRemoteId: (remote) => remote?.uuid ?? remote?.legacyId ?? null,
        onPrimarySuccess: (remote) => {
          this.hydrateLeadPrimary(remote, normalized);
        },
      });

      this.recordWriteSoakOutcome(flags, result.syncResult, result.skipped);

      logCrmWriteDev(`${operation}Lead`, {
        tenantId: normalized,
        legacyId,
        syncResult: result.syncResult,
        primary: this.isWritePrimaryEnabled(flags),
      });

      if (result.skipped) {
        throw new Error(`Write idempotente ignorado (lead ${operation}).`);
      }
      return legacyCore!;
    } catch (err) {
      handleRepositoryWriteFallback({
        domain: 'lead',
        tenantId: normalized,
        legacyId,
        correlationId: partialMeta.correlationId || legacyId,
        writeSource: partialMeta.writeSource || 'legacy-dual-write',
        retryCount: partialMeta.retryCount,
        event: `${operation}LeadCore`,
        error: err,
      });
      throw err;
    }
  }

  private async runPipelineWrite(
    operation: string,
    tenantId: string,
    legacyId: string,
    partialMeta: CrmWriteMeta,
    executeRemote: (meta: import('../shared/repositoryV3Idempotency.js').RepositoryWriteMeta & {
      correlationId: string;
      idempotencyKey: string;
      retryCount: number;
      writeSource: string;
    }) => Promise<PipelineStageCore>,
    getLegacyCore: () => PipelineStageCore | null,
  ): Promise<PipelineStageCore> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);
    const legacyCore = getLegacyCore();

    try {
      const result = await runRepositoryWritePipeline({
        domain: 'pipeline-stage',
        tenantId: normalized,
        legacyId,
        operation,
        partialMeta,
        isWritePrimary: this.isWritePrimaryEnabled(flags),
        writeCompare: shouldCompareCrmWriteResults(this.deps.flagsInput),
        getLegacyCore: () => legacyCore,
        compareWrite: (legacy, remote) => this.wrapCompareWrite('pipeline-stage', legacy, remote),
        executeRemote,
        extractRemoteId: (remote) => remote?.uuid ?? remote?.legacyId ?? null,
        onPrimarySuccess: (remote) => {
          this.hydratePipelineStagePrimary(remote, normalized);
        },
      });

      this.recordWriteSoakOutcome(flags, result.syncResult, result.skipped);

      logCrmWriteDev(`${operation}PipelineStage`, {
        tenantId: normalized,
        legacyId,
        syncResult: result.syncResult,
        primary: this.isWritePrimaryEnabled(flags),
      });

      if (result.skipped) {
        throw new Error(`Write idempotente ignorado (pipeline ${operation}).`);
      }
      return legacyCore!;
    } catch (err) {
      handleRepositoryWriteFallback({
        domain: 'pipeline-stage',
        tenantId: normalized,
        legacyId,
        correlationId: partialMeta.correlationId || legacyId,
        writeSource: partialMeta.writeSource || 'legacy-dual-write',
        retryCount: partialMeta.retryCount,
        event: `${operation}PipelineStageCore`,
        error: err,
      });
      throw err;
    }
  }

  async compareIdbVsRemote(tenantId: string): Promise<Record<string, unknown> | null> {
    if (!shouldCompareCrmIdbVsRemote(this.deps.flagsInput)) return null;
    const normalized = requireTenantId(tenantId);

    const idbRows = this.deps.indexedDb.listLeadsLegacySync({ tenantId: normalized });
    let remoteRows: LeadCore[] = [];

    try {
      remoteRows = await this.deps.adminApi.listLeads(normalized);
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      return { tenantId: normalized, skipped: true, reason: 'remote-unavailable' };
    }

    const idbMap = new Map(
      idbRows
        .map((row) => mapLegacyRowToLeadCore(row))
        .filter((core): core is LeadCore => Boolean(core))
        .map((core) => [core.legacyId, core]),
    );
    const remoteMap = new Map(remoteRows.map((core) => [core.legacyId, core]));

    const leadDiffs: Record<string, unknown>[] = [];
    for (const [id, idbCore] of idbMap) {
      const remoteCore = remoteMap.get(id) ?? null;
      const comparison = compareLeadShapes(idbCore, remoteCore);
      if (!comparison.match) {
        leadDiffs.push({ entity: 'lead', ref: id, ...comparison });
      }
    }

    const idbStages = this.deps.indexedDb.listPipelineStagesLegacySync(normalized, { includeInactive: true })
      .map((row) => mapLegacyRowToPipelineStageCore(row))
      .filter((core): core is PipelineStageCore => Boolean(core));
    let remoteStages: PipelineStageCore[] = [];
    try {
      remoteStages = await this.deps.adminApi.listPipelineStages(normalized, { includeInactive: true });
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
    }

    const stageIdbMap = new Map(idbStages.map((core) => [core.legacyId, core]));
    const stageRemoteMap = new Map(remoteStages.map((core) => [core.legacyId, core]));
    const stageDiffs: Record<string, unknown>[] = [];
    for (const [id, idbCore] of stageIdbMap) {
      const remoteCore = stageRemoteMap.get(id) ?? null;
      const comparison = comparePipelineStageShapes(idbCore, remoteCore);
      if (!comparison.match) {
        stageDiffs.push({ entity: 'pipeline-stage', ref: id, ...comparison });
      }
    }

    const diffs = [...leadDiffs, ...stageDiffs];

    const report = {
      tenantId: normalized,
      comparedAt: new Date().toISOString(),
      matchCount: (idbMap.size + stageIdbMap.size) - diffs.length,
      mismatchCount: diffs.length,
      diffs,
    };
    logCrmShadowDev('compare', report);
    return report;
  }

  private listFromCacheOrIdb(
    tenantId: string,
    filters?: CrmListFilters,
  ): LeadLegacyRow[] {
    return this.deps.indexedDb.listLeadsLegacySync({ ...filters, tenantId });
  }

  private async maybeRunShadowCompare(
    tenantId: string,
    flags: CrmRepositoryFlags,
  ): Promise<void> {
    if (!shouldRunCrmShadowRead(this.deps.flagsInput) && !flags.CRM_COMPARE) return;
    try {
      await this.compareIdbVsRemote(tenantId);
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[CRM_SHADOW] skipped:', err instanceof Error ? err.message : err);
      }
    }
  }
}

function normalizeTenantFromFilters(filters?: CrmListFilters): string {
  return String(filters?.tenantId || '').trim();
}

export const crmRepository: ICrmRepository = new CrmRepository();

export async function rehydrateCrmCacheIfPrimary(
  tenantId: string | null | undefined,
): Promise<number> {
  if (!isCrmReadPrimaryEnabled()) return 0;
  const normalized = String(tenantId || '').trim();
  if (!normalized) return 0;
  return crmRepository.syncCacheFromRemote(normalized);
}

export function createCrmRepository(deps?: CrmRepositoryDeps): ICrmRepository {
  return new CrmRepository(deps);
}

export type { CrmRepositoryRemoteReadDisabledError, CrmRepositoryRemoteWriteDisabledError };
