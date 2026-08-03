/**
 * @module repositories/collaborator/collaboratorRepository
 * @description Facade pública do Repository RH — orquestração interna (Ticket 1.4).
 */

import { buildCollaboratorCompareResult } from './collaboratorRepositoryCompare.js';
import type { ICollaboratorCache } from './collaboratorCache.js';
import { collaboratorCache as defaultCache } from './collaboratorCache.js';
import { isAgendaProfessional } from '../../constants/collaboratorRhCatalog.js';
import { normalizeTenantId } from '../../services/tenantIsolation.js';
import {
  isCollaboratorUuid,
  mapCoreToIndexedDbMirror,
  mapCreateDtoToSupabaseUpsert,
  mapUpdateDtoToSupabaseUpsert,
  toLegacyCollaboratorShape,
} from './collaboratorMapper.js';
import { CollaboratorMapperValidationError } from './collaboratorMapper.js';
import type { ICollaboratorIndexedDbRepository } from './collaboratorTypes.js';
import { collaboratorIndexedDbRepository as defaultIdb } from './collaboratorIndexedDbRepository.js';
import {
  getCollaboratorRepositoryFlags,
  isRhSupabaseReadPrimaryEnabled,
  shouldCompareIdbVsSupabase,
  type CollaboratorRepositoryFlags,
  type CollaboratorRepositoryFlagsInput,
} from './collaboratorRepositoryFlags.js';
import { requireRepositoryTenantId, requireUserTenantId } from './collaboratorRepositoryGuards.js';
import type { ICollaboratorSupabaseRepository } from './collaboratorTypes.js';
import { collaboratorSupabaseRepository as defaultSupabase } from './collaboratorSupabaseRepository.js';
import type {
  CollaboratorCompareResult,
  CollaboratorCore,
  CollaboratorCreateCoreDto,
  CollaboratorIndexedDbRow,
  CollaboratorListFilters,
  CollaboratorListResult,
  CollaboratorReadSource,
  CollaboratorRef,
  CollaboratorRepositoryUser,
  CollaboratorUpdateCoreDto,
  LegacyCollaboratorServiceListFilters,
  LegacyProfessionalOptionsFilters,
  CollaboratorLegacyAccessLink,
  CollaboratorLegacySatellitesBundle,
  ICollaboratorRepository,
} from './collaboratorTypes.js';
import {
  CollaboratorNotFoundError,
  CollaboratorRepositoryLocalWriteDisabledError,
  CollaboratorRepositoryRemoteReadDisabledError,
  CollaboratorRepositoryRemoteWriteDisabledError,
} from './collaboratorTypes.js';
import {
  assertUuidMirrorEnvironment,
  buildCollaboratorUuidMirrorPlan,
  mergeUuidMirrorPlanIntoReport,
  normalizeRemoteCollaboratorRows,
  type CollaboratorUuidMirrorRemoteRow,
  type CollaboratorUuidMirrorReport,
} from './collaboratorUuidMirror.js';
import {
  hydrateCollaboratorIdbCache,
  isBrowserOffline,
  isRemoteReadUnavailableError,
} from './collaboratorRepositorySync.js';

export interface CollaboratorRepositoryDeps {
  supabase?: ICollaboratorSupabaseRepository;
  indexedDb?: ICollaboratorIndexedDbRepository;
  cache?: ICollaboratorCache;
  flagsInput?: CollaboratorRepositoryFlagsInput;
}

function assertCreateDto(dto: CollaboratorCreateCoreDto): void {
  if (!String(dto.apelido || '').trim()) {
    throw new CollaboratorMapperValidationError('apelido é obrigatório.');
  }
  if (!String(dto.nomeCompleto || '').trim()) {
    throw new CollaboratorMapperValidationError('nomeCompleto é obrigatório.');
  }
  if (!String(dto.rhCategoria || '').trim()) {
    throw new CollaboratorMapperValidationError('rhCategoria é obrigatório.');
  }
  if (!String(dto.cargo || '').trim()) {
    throw new CollaboratorMapperValidationError('cargo é obrigatório.');
  }
  if (!String(dto.tipoVinculo || '').trim()) {
    throw new CollaboratorMapperValidationError('tipoVinculo é obrigatório.');
  }
  if (!String(dto.setor || '').trim()) {
    throw new CollaboratorMapperValidationError('setor é obrigatório.');
  }
}

export class CollaboratorRepository implements ICollaboratorRepository {
  private readonly deps: CollaboratorRepositoryDeps;

  /** Exposto para testes de shadow compare (Ticket 1.4). */
  lastShadowCompare: CollaboratorCompareResult | null = null;

  constructor(deps: CollaboratorRepositoryDeps = {}) {
    this.deps = deps;
  }

  private getSupabase(): ICollaboratorSupabaseRepository {
    return this.deps.supabase ?? defaultSupabase;
  }

  private getIdb(): ICollaboratorIndexedDbRepository {
    return this.deps.indexedDb ?? defaultIdb;
  }

  private getCache(): ICollaboratorCache {
    return this.deps.cache ?? defaultCache;
  }

  private resolveFlags(extra?: CollaboratorRepositoryFlagsInput): CollaboratorRepositoryFlags {
    return getCollaboratorRepositoryFlags({
      ...this.deps.flagsInput,
      ...extra,
      overrides: {
        ...this.deps.flagsInput?.overrides,
        ...extra?.overrides,
      },
      tenantFlags: extra?.tenantFlags ?? this.deps.flagsInput?.tenantFlags,
    });
  }

  private assertPrimarySupabaseRead(flags: CollaboratorRepositoryFlags): void {
    if (!flags.RH_SUPABASE_READ) {
      throw new CollaboratorRepositoryRemoteReadDisabledError();
    }
  }

  private assertRemoteWrite(flags: CollaboratorRepositoryFlags): void {
    if (!flags.RH_SUPABASE_WRITE) {
      throw new CollaboratorRepositoryRemoteWriteDisabledError();
    }
  }

  private assertLocalWrite(flags: CollaboratorRepositoryFlags): void {
    if (flags.RH_IDB_WRITE_DISABLED) {
      throw new CollaboratorRepositoryLocalWriteDisabledError();
    }
  }

  private canShadowSupabaseFetch(flags: CollaboratorRepositoryFlags): boolean {
    return flags.RH_SHADOW_READ || flags.RH_SUPABASE_READ || flags.RH_SUPABASE_READ_PRIMARY;
  }

  private async maybeRunShadowCompare(
    tenantId: string,
    flags: CollaboratorRepositoryFlags,
  ): Promise<void> {
    if (!shouldCompareIdbVsSupabase({ overrides: flags })) return;
    if (!this.canShadowSupabaseFetch(flags)) return;
    this.lastShadowCompare = await this.runCompareInternal(tenantId, flags);
  }

  private async runCompareInternal(
    tenantId: string,
    flags: CollaboratorRepositoryFlags,
  ): Promise<CollaboratorCompareResult> {
    const idbItems = this.getIdb().list(tenantId);
    const sbItems = await this.getSupabase().list(tenantId);
    return buildCollaboratorCompareResult(tenantId, idbItems, sbItems);
  }

  private readFromIdb(
    tenantId: string,
    ref: CollaboratorRef,
  ): CollaboratorCore | null {
    const needle = String(ref || '').trim();
    if (!needle) return null;
    if (isCollaboratorUuid(needle)) {
      return this.getIdb().findByUuid(tenantId, needle)
        ?? this.getIdb().findByLegacyId(tenantId, needle);
    }
    return this.getIdb().findByLegacyId(tenantId, needle)
      ?? this.getIdb().findByUuid(tenantId, needle);
  }

  private async readFromSupabase(
    tenantId: string,
    ref: CollaboratorRef,
  ): Promise<CollaboratorCore | null> {
    const needle = String(ref || '').trim();
    if (!needle) return null;
    if (isCollaboratorUuid(needle)) {
      return (await this.getSupabase().findByUuid(tenantId, needle))
        ?? (await this.getSupabase().findByLegacyId(tenantId, needle));
    }
    return (await this.getSupabase().findByLegacyId(tenantId, needle))
      ?? (await this.getSupabase().findByUuid(tenantId, needle));
  }

  private isReadPrimaryEnabled(flags: CollaboratorRepositoryFlags): boolean {
    return flags.RH_SUPABASE_READ && flags.RH_SUPABASE_READ_PRIMARY;
  }

  private hydrateRemoteItems(
    tenantId: string,
    items: CollaboratorCore[],
    flags: CollaboratorRepositoryFlags,
  ): number {
    return hydrateCollaboratorIdbCache(
      this.getIdb(),
      this.getCache(),
      tenantId,
      items,
      flags,
    );
  }

  private async listCoreFromSupabasePrimary(
    tenantId: string,
    filters: CollaboratorListFilters | undefined,
    flags: CollaboratorRepositoryFlags,
  ): Promise<CollaboratorListResult> {
    if (isBrowserOffline()) {
      const items = this.getIdb().list(tenantId, filters);
      return { items, total: items.length, source: 'indexeddb-offline' };
    }

    try {
      const items = await this.getSupabase().list(tenantId, filters);
      this.hydrateRemoteItems(tenantId, items, flags);
      return { items, total: items.length, source: 'supabase' };
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      const items = this.getIdb().list(tenantId, filters);
      return { items, total: items.length, source: 'indexeddb-offline' };
    }
  }

  private async getCoreFromSupabasePrimary(
    tenantId: string,
    ref: CollaboratorRef,
    flags: CollaboratorRepositoryFlags,
  ): Promise<CollaboratorCore | null> {
    if (isBrowserOffline()) {
      return this.readFromIdb(tenantId, ref);
    }

    try {
      const core = await this.readFromSupabase(tenantId, ref);
      if (core) {
        this.hydrateRemoteItems(tenantId, [core], flags);
      }
      return core;
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      return this.readFromIdb(tenantId, ref);
    }
  }

  async listCore(
    tenantId: string,
    filters?: CollaboratorListFilters,
  ): Promise<CollaboratorListResult> {
    const normalizedTenant = requireRepositoryTenantId(tenantId);
    const flags = this.resolveFlags();

    let result: CollaboratorListResult;

    if (this.isReadPrimaryEnabled(flags)) {
      this.assertPrimarySupabaseRead(flags);
      result = await this.listCoreFromSupabasePrimary(normalizedTenant, filters, flags);
    } else {
      const items = this.getIdb().list(normalizedTenant, filters);
      result = { items, total: items.length, source: 'indexeddb' };
    }

    await this.maybeRunShadowCompare(normalizedTenant, flags);

    return result;
  }

  async getCore(tenantId: string, ref: CollaboratorRef): Promise<CollaboratorCore | null> {
    const normalizedTenant = requireRepositoryTenantId(tenantId);
    const flags = this.resolveFlags();
    const cached = this.getCache().get(normalizedTenant, ref);
    if (cached) return cached;

    let core: CollaboratorCore | null;

    if (this.isReadPrimaryEnabled(flags)) {
      this.assertPrimarySupabaseRead(flags);
      core = await this.getCoreFromSupabasePrimary(normalizedTenant, ref, flags);
    } else {
      core = this.readFromIdb(normalizedTenant, ref);
      if (core) this.getCache().set(normalizedTenant, core);
    }

    await this.maybeRunShadowCompare(normalizedTenant, flags);

    return core;
  }

  async createCore(
    user: CollaboratorRepositoryUser,
    dto: CollaboratorCreateCoreDto,
  ): Promise<CollaboratorCore> {
    const tenantId = requireUserTenantId(user);
    const flags = this.resolveFlags();
    assertCreateDto(dto);
    this.assertRemoteWrite(flags);

    const upsertDto = mapCreateDtoToSupabaseUpsert(tenantId, dto);
    const core = await this.getSupabase().upsert(tenantId, upsertDto);

    if (!flags.RH_IDB_WRITE_DISABLED) {
      this.assertLocalWrite(flags);
      this.getIdb().upsertMirror(mapCoreToIndexedDbMirror(core));
    }

    this.getCache().set(tenantId, core);
    return core;
  }

  async updateCore(
    user: CollaboratorRepositoryUser,
    ref: CollaboratorRef,
    dto: CollaboratorUpdateCoreDto,
  ): Promise<CollaboratorCore> {
    const tenantId = requireUserTenantId(user);
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);

    const existing = await this.getCore(tenantId, ref);
    if (!existing) throw new CollaboratorNotFoundError(ref);

    const upsertDto = mapUpdateDtoToSupabaseUpsert(existing, dto);
    const core = await this.getSupabase().upsert(tenantId, {
      ...upsertDto,
      tenant_id: tenantId,
    });

    if (!flags.RH_IDB_WRITE_DISABLED) {
      this.assertLocalWrite(flags);
      this.getIdb().upsertMirror(mapCoreToIndexedDbMirror(core));
    }

    this.getCache().invalidate({
      tenantId,
      reason: 'core_update',
      ref,
      at: new Date().toISOString(),
    });
    this.getCache().set(tenantId, core);
    return core;
  }

  async softDeleteCore(user: CollaboratorRepositoryUser, ref: CollaboratorRef): Promise<void> {
    const tenantId = requireUserTenantId(user);
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);

    const existing = await this.getCore(tenantId, ref);
    if (!existing) throw new CollaboratorNotFoundError(ref);

    await this.getSupabase().softDelete(tenantId, existing.uuid);

    if (!flags.RH_IDB_WRITE_DISABLED) {
      this.assertLocalWrite(flags);
      this.getIdb().upsertMirror(
        mapCoreToIndexedDbMirror({
          ...existing,
          status: 'inativo',
          deletedAt: new Date().toISOString(),
        }),
      );
    }

    this.getCache().invalidate({
      tenantId,
      reason: 'core_soft_delete',
      ref,
      at: new Date().toISOString(),
    });
  }

  async resolveLegacyId(tenantId: string, uuid: string): Promise<string | null> {
    const normalizedTenant = requireRepositoryTenantId(tenantId);
    const core = await this.getCore(normalizedTenant, uuid);
    return core?.legacyId ?? null;
  }

  async resolveUuid(tenantId: string, legacyId: string): Promise<string | null> {
    const normalizedTenant = requireRepositoryTenantId(tenantId);
    const core = await this.getCore(normalizedTenant, legacyId);
    return core?.uuid ?? null;
  }

  async syncCacheFromRemote(tenantId: string): Promise<number> {
    const normalizedTenant = requireRepositoryTenantId(tenantId);
    const flags = this.resolveFlags();
    this.assertPrimarySupabaseRead(flags);

    if (isBrowserOffline()) {
      return this.getIdb().list(normalizedTenant).length;
    }

    try {
      const items = await this.getSupabase().list(normalizedTenant);
      return this.hydrateRemoteItems(normalizedTenant, items, flags);
    } catch (err) {
      if (isRemoteReadUnavailableError(err)) {
        return this.getIdb().list(normalizedTenant).length;
      }
      throw err;
    }
  }

  async compareIdbVsSupabase(tenantId: string): Promise<CollaboratorCompareResult> {
    const normalizedTenant = requireRepositoryTenantId(tenantId);
    const flags = this.resolveFlags();
    if (!shouldCompareIdbVsSupabase({ overrides: flags })) {
      throw new CollaboratorMapperValidationError(
        'RH_COMPARE_IDB_SUPABASE não está habilitado ou combinação inválida.',
      );
    }
    if (!this.canShadowSupabaseFetch(flags)) {
      throw new CollaboratorRepositoryRemoteReadDisabledError();
    }
    return this.runCompareInternal(normalizedTenant, flags);
  }

  /**
   * Leitura síncrona legada — Phase 5.2 read cutover.
   * READ_PRIMARY: IndexedDB espelho hidratado pelo Supabase (cache), nunca SSOT local.
   * Default: IndexedDB authority legado.
   */
  listLegacySync(
    filters: LegacyCollaboratorServiceListFilters,
    saasModeEnabled: boolean,
  ): CollaboratorIndexedDbRow[] {
    return this.getIdb().listLegacySync(filters, saasModeEnabled);
  }

  /**
   * Perfil síncrono legado — Phase 5.2 read cutover.
   * READ_PRIMARY: cache em memória (pós-hydrate Supabase) → fallback IDB offline.
   */
  getLegacyProfileSync(collaboratorId: string): CollaboratorIndexedDbRow | null {
    const flags = this.resolveFlags();
    const id = String(collaboratorId || '').trim();
    if (!id) return null;

    if (this.isReadPrimaryEnabled(flags)) {
      const idbRow = this.getIdb().getLegacyProfileSync(id);
      const tenantId = normalizeTenantId(
        idbRow?.tenant_id
        ?? idbRow?.tenantId
        ?? this.getIdb().getClinicProfileTenantIdSync(),
      );
      if (tenantId) {
        const cached = this.getCache().get(tenantId, id);
        if (cached) return toLegacyCollaboratorShape(cached);
      }
      return idbRow;
    }

    return this.getIdb().getLegacyProfileSync(id);
  }

  getLegacySatellitesSync(collaboratorId: string): CollaboratorLegacySatellitesBundle {
    return this.getIdb().getLegacySatellitesSync(collaboratorId);
  }

  listProfessionalOptionsLegacySync(
    filters: LegacyProfessionalOptionsFilters,
    saasModeEnabled: boolean,
  ): CollaboratorIndexedDbRow[] {
    const flags = this.resolveFlags();
    if (this.isReadPrimaryEnabled(flags)) {
      return this.listLegacySync(
        { ...filters, status: 'ativo' },
        saasModeEnabled,
      ).filter((item) => isAgendaProfessional(item));
    }
    return this.getIdb().listProfessionalOptionsLegacySync(filters, saasModeEnabled);
  }

  listCollaboratorsByTenantLegacySync(tenantId: string): CollaboratorIndexedDbRow[] {
    const normalized = requireRepositoryTenantId(tenantId);
    const flags = this.resolveFlags();
    if (this.isReadPrimaryEnabled(flags)) {
      return this.listLegacySync({ tenantId: normalized }, true);
    }
    return this.getIdb().listCollaboratorsByTenantLegacySync(normalized);
  }

  getPrimaryPhoneLegacySync(collaboratorId: string): string {
    return this.getIdb().getPrimaryPhoneLegacySync(collaboratorId);
  }

  getLegacyAccessLinkSync(collaboratorId: string): CollaboratorLegacyAccessLink | null {
    return this.getIdb().getLegacyAccessLinkSync(collaboratorId);
  }

  getClinicProfileTenantIdSync(): string | null {
    return this.getIdb().getClinicProfileTenantIdSync();
  }

  /**
   * Espelha UUID canônico Supabase → campo auxiliar `uuid` no IDB (Ticket 1.13).
   * LEGACY_RC01: preferir hidratação read-primary; remoção planejada RC-03.
   */
  mirrorCollaboratorUuidsToIndexedDb(
    tenantId: string,
    remoteCollaborators: CollaboratorUuidMirrorRemoteRow[],
  ): CollaboratorUuidMirrorReport {
    assertUuidMirrorEnvironment();
    const normalizedTenant = requireRepositoryTenantId(tenantId);
    const remoteRows = normalizeRemoteCollaboratorRows(remoteCollaborators);
    const localRows = this.getIdb().listCollaboratorsByTenantLegacySync(normalizedTenant);
    const plan = buildCollaboratorUuidMirrorPlan(normalizedTenant, localRows, remoteRows);
    const report = mergeUuidMirrorPlanIntoReport(normalizedTenant, plan);

    for (const item of plan) {
      if (item.action !== 'update') continue;
      try {
        const outcome = this.getIdb().mirrorCollaboratorUuidOnly(
          normalizedTenant,
          item.legacyId,
          item.uuid,
        );
        if (outcome === 'updated') {
          report.updated.push({
            legacyId: item.legacyId,
            uuid: item.uuid,
            previousUuid: item.previousUuid,
          });
        } else if (outcome === 'skipped') {
          report.skipped.push({ legacyId: item.legacyId, uuid: item.uuid });
        } else {
          report.notFound.push({ legacyId: item.legacyId, uuid: item.uuid });
        }
      } catch (err) {
        report.errors.push({
          legacyId: item.legacyId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return report;
  }
}

export const collaboratorRepository: ICollaboratorRepository = new CollaboratorRepository();

let rhOnlineSyncRegistered = false;

/**
 * RC-02: ao reconectar, reidrata cache IDB a partir do Supabase (read-primary).
 */
export function registerCollaboratorRhOnlineCacheSync(
  getTenantId: () => string | null | undefined,
): void {
  if (rhOnlineSyncRegistered || typeof window === 'undefined') return;
  rhOnlineSyncRegistered = true;

  window.addEventListener('online', () => {
    if (!isRhSupabaseReadPrimaryEnabled()) return;
    const tenantId = String(getTenantId() || '').trim();
    if (!tenantId) return;
    collaboratorRepository.syncCacheFromRemote(tenantId).catch((err) => {
      if (import.meta.env?.DEV) {
        console.debug('[RH] online cache sync skipped:', err instanceof Error ? err.message : err);
      }
    });
  });
}

/**
 * RC-02: hidratação inicial pós-login/bootstrap quando read-primary ativo.
 */
export async function rehydrateCollaboratorRhCacheIfPrimary(
  tenantId: string | null | undefined,
): Promise<number> {
  if (!isRhSupabaseReadPrimaryEnabled()) return 0;
  const normalized = String(tenantId || '').trim();
  if (!normalized) return 0;
  return collaboratorRepository.syncCacheFromRemote(normalized);
}

/**
 * Factory segura — preferir sobre `new CollaboratorRepository()` fora do módulo.
 * Em produção use o singleton `collaboratorRepository` salvo injeção explícita em testes.
 */
export function createCollaboratorRepository(
  deps?: CollaboratorRepositoryDeps,
): ICollaboratorRepository {
  return new CollaboratorRepository(deps);
}
