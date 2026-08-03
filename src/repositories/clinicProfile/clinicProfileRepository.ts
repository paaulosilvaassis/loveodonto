/**
 * @module repositories/clinicProfile/clinicProfileRepository
 * @description Facade read-only Clinic Profile V3 — Phase 5.5.
 *
 * Fluxo READ_PRIMARY:
 *   Admin API → Supabase SSOT → hydrate IDB → cache memória → leitura sync
 * Fallback: IndexedDB (offline / flags off)
 */

import type {
  ClinicProfileCore,
  ClinicProfileLegacyRow,
  ClinicProfileReadResult,
  ClinicProfileSummary,
  ClinicProfileUpdateCoreDto,
  IClinicProfileAdminApiClient,
  IClinicProfileCache,
  IClinicProfileIndexedDbReader,
  IClinicProfileRepository,
} from './clinicProfileTypes.js';
import { ClinicProfileRepositoryRemoteWriteDisabledError } from './clinicProfileTypes.js';
import type { ClinicProfileRepositoryFlags } from './clinicProfileRepositoryFlags.js';
import {
  getClinicProfileRepositoryFlags,
  isClinicProfileReadPrimaryEnabled,
  shouldCompareClinicProfileIdbVsRemote,
} from './clinicProfileRepositoryFlags.js';
import type { ClinicProfileRepositoryFlagsInput } from './clinicProfileRepositoryFlags.js';
import { createClinicProfileCache } from './clinicProfileCache.js';
import { clinicProfileIndexedDbRepository } from './clinicProfileIndexedDbRepository.js';
import { getDefaultClinicProfileAdminApiClient } from './clinicProfileAdminApiRepository.js';
import {
  mapCoreToLegacyRow,
  mapCoreToSummary,
  mapLegacyRowToCore,
  mapServerProfileToCore,
} from './clinicProfileMapper.js';
import {
  compareClinicProfileShapes,
  hydrateClinicProfileIdbCache,
  isBrowserOffline,
  isRemoteReadUnavailableError,
  logClinicProfileReadDev,
  logClinicProfileWriteDev,
} from './clinicProfileRepositorySync.js';
import { invalidateClinicSummaryCache } from '../../services/clinicSummaryCache.js';

export { ClinicProfileRepositoryRemoteWriteDisabledError } from './clinicProfileTypes.js';

export interface ClinicProfileRepositoryDeps {
  indexedDb?: IClinicProfileIndexedDbReader;
  adminApi?: IClinicProfileAdminApiClient;
  cache?: IClinicProfileCache;
  flagsInput?: ClinicProfileRepositoryFlagsInput;
}

export class ClinicProfileRepository implements IClinicProfileRepository {
  private readonly deps: Required<Omit<ClinicProfileRepositoryDeps, 'flagsInput'>> & {
    flagsInput: ClinicProfileRepositoryFlagsInput;
  };

  constructor(deps: ClinicProfileRepositoryDeps = {}) {
    this.deps = {
      indexedDb: deps.indexedDb ?? clinicProfileIndexedDbRepository,
      adminApi: deps.adminApi ?? getDefaultClinicProfileAdminApiClient(),
      cache: deps.cache ?? createClinicProfileCache(),
      flagsInput: deps.flagsInput ?? {},
    };
  }

  private resolveFlags(): ClinicProfileRepositoryFlags {
    return getClinicProfileRepositoryFlags(this.deps.flagsInput);
  }

  private isReadPrimaryEnabled(flags: ClinicProfileRepositoryFlags): boolean {
    return flags.CLINIC_PROFILE_READ && flags.CLINIC_PROFILE_READ_PRIMARY;
  }

  private readFromCacheOrIdb(tenantId: string): ClinicProfileCore | null {
    const cached = this.deps.cache.get(tenantId);
    if (cached) return cached;
    const legacy = this.deps.indexedDb.getLegacyProfileSync();
    const legacyTenant = String(legacy?.tenant_id || '').trim();
    if (legacyTenant && legacyTenant !== tenantId) return null;
    return mapLegacyRowToCore(legacy);
  }

  getProfileSync(sessionTenantId = ''): ClinicProfileLegacyRow | null {
    const flags = this.resolveFlags();
    const tenantId = String(sessionTenantId || '').trim()
      || String(this.deps.indexedDb.getLegacyProfileSync()?.tenant_id || '').trim();

    if (this.isReadPrimaryEnabled(flags) && tenantId) {
      const core = this.readFromCacheOrIdb(tenantId);
      if (core) return mapCoreToLegacyRow(core);
    }

    return this.deps.indexedDb.getLegacyProfileSync();
  }

  getSummarySync(sessionTenantId = ''): ClinicProfileSummary | null {
    const flags = this.resolveFlags();
    const tenantId = String(sessionTenantId || '').trim()
      || String(this.deps.indexedDb.getLegacyProfileSync()?.tenant_id || '').trim();

    if (this.isReadPrimaryEnabled(flags) && tenantId) {
      const core = this.readFromCacheOrIdb(tenantId);
      if (core) {
        const idbSummary = this.deps.indexedDb.getSummarySync(sessionTenantId);
        return mapCoreToSummary(core, {
          cnpj: idbSummary?.cnpj || core.cnpj || '',
          phone: idbSummary?.telefonePrincipal || core.phone || '',
          address: idbSummary?.enderecoPrincipal ?? null,
        });
      }
    }

    return this.deps.indexedDb.getSummarySync(sessionTenantId);
  }

  async getCoreAsync(tenantId: string): Promise<ClinicProfileReadResult> {
    const normalized = String(tenantId || '').trim();
    if (!normalized) return { core: null, source: 'indexeddb' };

    const flags = this.resolveFlags();
    if (!this.isReadPrimaryEnabled(flags)) {
      const legacy = this.deps.indexedDb.getLegacyProfileSync();
      const core = mapLegacyRowToCore(legacy);
      return { core, source: 'indexeddb' };
    }

    if (isBrowserOffline()) {
      const core = this.readFromCacheOrIdb(normalized);
      return { core, source: 'indexeddb-offline' };
    }

    try {
      const serverProfile = await this.deps.adminApi.fetchProfile(normalized);
      const core = hydrateClinicProfileIdbCache(serverProfile, normalized, this.deps.cache);
      if (core) {
        logClinicProfileReadDev('hydrate', { tenantId: normalized, source: 'admin-api' });
        await this.maybeRunShadowCompare(normalized, flags);
        return { core, source: 'admin-api' };
      }
      const fallback = this.readFromCacheOrIdb(normalized);
      return { core: fallback, source: 'indexeddb' };
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      const core = this.readFromCacheOrIdb(normalized);
      logClinicProfileReadDev('fallback-idb', {
        tenantId: normalized,
        error: err instanceof Error ? err.message : String(err),
      });
      return { core, source: 'indexeddb-offline' };
    }
  }

  private assertRemoteWrite(flags: ClinicProfileRepositoryFlags): void {
    if (!flags.CLINIC_PROFILE_WRITE) {
      throw new ClinicProfileRepositoryRemoteWriteDisabledError();
    }
  }

  async updateCore(tenantId: string, dto: ClinicProfileUpdateCoreDto): Promise<ClinicProfileCore> {
    const normalized = String(tenantId || '').trim();
    if (!normalized) throw new Error('tenant_id ausente para updateCore.');

    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);

    const serverProfile = await this.deps.adminApi.saveProfile(normalized, dto);
    if (!serverProfile) {
      throw new Error('Admin API não retornou clinicProfile após update.');
    }

    invalidateClinicSummaryCache();
    const core = hydrateClinicProfileIdbCache(serverProfile, normalized, this.deps.cache);
    if (!core) {
      throw new Error('Falha ao hidratar clinic profile após update remoto.');
    }

    logClinicProfileWriteDev('update', { tenantId: normalized, ok: true });
    await this.maybeRunShadowCompare(normalized, flags);
    return core;
  }

  async syncCacheFromRemote(tenantId: string): Promise<number> {
    const result = await this.getCoreAsync(tenantId);
    return result.core ? 1 : 0;
  }

  async compareIdbVsRemote(tenantId: string): Promise<Record<string, unknown> | null> {
    const flags = this.resolveFlags();
    if (!shouldCompareClinicProfileIdbVsRemote(this.deps.flagsInput)) return null;

    const normalized = String(tenantId || '').trim();
    if (!normalized) return null;

    const idbCore = mapLegacyRowToCore(this.deps.indexedDb.getLegacyProfileSync());
    let remoteCore: ClinicProfileCore | null = null;

    try {
      const serverProfile = await this.deps.adminApi.fetchProfile(normalized);
      remoteCore = mapServerProfileToCore(serverProfile);
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      return { tenantId: normalized, skipped: true, reason: 'remote-unavailable' };
    }

    const comparison = compareClinicProfileShapes(idbCore, remoteCore);
    logClinicProfileReadDev('compare', { tenantId: normalized, ...comparison });
    return { tenantId: normalized, ...comparison };
  }

  private async maybeRunShadowCompare(
    tenantId: string,
    flags: ClinicProfileRepositoryFlags,
  ): Promise<void> {
    if (!flags.CLINIC_PROFILE_SHADOW_READ && !flags.CLINIC_PROFILE_COMPARE_IDB_REMOTE) return;
    try {
      await this.compareIdbVsRemote(tenantId);
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[CLINIC_PROFILE_SHADOW] skipped:', err instanceof Error ? err.message : err);
      }
    }
  }
}

export const clinicProfileRepository: IClinicProfileRepository = new ClinicProfileRepository();

let onlineSyncRegistered = false;

export function registerClinicProfileOnlineCacheSync(
  getTenantId: () => string | null | undefined,
): void {
  if (onlineSyncRegistered || typeof window === 'undefined') return;
  onlineSyncRegistered = true;

  window.addEventListener('online', () => {
    if (!isClinicProfileReadPrimaryEnabled()) return;
    const tenantId = String(getTenantId() || '').trim();
    if (!tenantId) return;
    clinicProfileRepository.syncCacheFromRemote(tenantId).catch((err) => {
      if (import.meta.env?.DEV) {
        console.debug('[CLINIC_PROFILE] online cache sync skipped:', err instanceof Error ? err.message : err);
      }
    });
  });
}

export async function rehydrateClinicProfileCacheIfPrimary(
  tenantId: string | null | undefined,
): Promise<number> {
  if (!isClinicProfileReadPrimaryEnabled()) return 0;
  const normalized = String(tenantId || '').trim();
  if (!normalized) return 0;
  return clinicProfileRepository.syncCacheFromRemote(normalized);
}

export function createClinicProfileRepository(
  deps?: ClinicProfileRepositoryDeps,
): IClinicProfileRepository {
  return new ClinicProfileRepository(deps);
}
