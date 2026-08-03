/**
 * @module repositories/agenda/agendaRepository
 * @description Facade Agenda V3 — Phase 5.7 foundation (IDB authority, remote preparado).
 *
 * READ_PRIMARY (futuro Phase 5.8):
 *   Admin API → Supabase SSOT → hydrate IDB → cache memória
 * Atual: sempre IndexedDB (flags default false).
 */

import type {
  AgendaGetResult,
  AgendaListFilters,
  AgendaListResult,
  AppointmentBlockLegacyRow,
  AppointmentCore,
  AppointmentCreateCoreDto,
  AppointmentLegacyRow,
  AppointmentUpdateCoreDto,
  IAgendaAdminApiClient,
  IAgendaCache,
  IAgendaIndexedDbReader,
  IAgendaRepository,
  AgendaRepositoryRemoteWriteDisabledError,
} from './agendaTypes.js';
import type { AgendaRepositoryFlags, AgendaRepositoryFlagsInput } from './agendaRepositoryFlags.js';
import {
  getAgendaRepositoryFlags,
  isAgendaReadPrimaryEnabled,
  isAgendaWriteEnabled,
  shouldCompareAgendaIdbVsRemote,
} from './agendaRepositoryFlags.js';
import { createAgendaCache } from './agendaCache.js';
import { agendaIndexedDbRepository } from './agendaIndexedDbRepository.js';
import { getDefaultAgendaAdminApiReader } from './agendaAdminApiRepository.js';
import { mapLegacyRowToCore } from './agendaMapper.js';
import {
  compareAgendaShapes,
  hydrateAgendaIdbCache,
  isBrowserOffline,
  isRemoteReadUnavailableError,
  logAgendaReadDev,
  logAgendaShadowDev,
  logAgendaWriteDev,
} from './agendaRepositorySync.js';

export interface AgendaRepositoryDeps {
  indexedDb?: IAgendaIndexedDbReader;
  adminApi?: IAgendaAdminApiClient;
  cache?: IAgendaCache;
  flagsInput?: AgendaRepositoryFlagsInput;
}

function requireTenantId(tenantId: string): string {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenant_id ausente para operação Agenda repository.');
  return tid;
}

export class AgendaRepository implements IAgendaRepository {
  private readonly deps: Required<Omit<AgendaRepositoryDeps, 'flagsInput'>> & {
    flagsInput: AgendaRepositoryFlagsInput;
  };

  constructor(deps: AgendaRepositoryDeps = {}) {
    this.deps = {
      indexedDb: deps.indexedDb ?? agendaIndexedDbRepository,
      adminApi: deps.adminApi ?? getDefaultAgendaAdminApiReader(),
      cache: deps.cache ?? createAgendaCache(),
      flagsInput: deps.flagsInput ?? {},
    };
  }

  private resolveFlags(): AgendaRepositoryFlags {
    return getAgendaRepositoryFlags(this.deps.flagsInput);
  }

  private isReadPrimaryEnabled(flags: AgendaRepositoryFlags): boolean {
    return flags.AGENDA_READ && flags.AGENDA_READ_PRIMARY;
  }

  private assertRemoteWrite(flags: AgendaRepositoryFlags): void {
    if (!flags.AGENDA_WRITE) {
      throw new AgendaRepositoryRemoteWriteDisabledError();
    }
  }

  private hydrateRemoteCore(tenantId: string, core: AppointmentCore | null): AppointmentCore {
    if (!core) throw new Error('Admin API não retornou agendamento após escrita remota.');
    hydrateAgendaIdbCache([core], tenantId, this.deps.cache);
    return core;
  }

  listLegacySync(filters?: AgendaListFilters): AppointmentLegacyRow[] {
    const flags = this.resolveFlags();
    if (this.isReadPrimaryEnabled(flags)) {
      const tenantId = normalizeTenantFromFilters(filters);
      if (tenantId) {
        const cached = this.listFromCacheOrIdb(tenantId, filters);
        if (cached.length) return cached;
      }
    }
    return this.deps.indexedDb.listLegacySync(filters);
  }

  getLegacySync(appointmentId: string): AppointmentLegacyRow | null {
    const flags = this.resolveFlags();
    const id = String(appointmentId || '').trim();
    if (!id) return null;

    if (this.isReadPrimaryEnabled(flags)) {
      const legacy = this.deps.indexedDb.getLegacySync(id);
      const tenantId = String(legacy?.tenant_id || '').trim();
      if (tenantId) {
        const cached = this.deps.cache.get(tenantId, id);
        if (cached) return mapCoreToLegacyFromCache(cached);
      }
    }

    return this.deps.indexedDb.getLegacySync(id);
  }

  listBlocksLegacySync(filters?: { date?: string }): AppointmentBlockLegacyRow[] {
    return this.deps.indexedDb.listBlocksLegacySync(filters);
  }

  async listCore(tenantId: string, filters?: AgendaListFilters): Promise<AgendaListResult> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();

    if (!this.isReadPrimaryEnabled(flags)) {
      const legacy = this.deps.indexedDb.listLegacySync({ ...filters, tenantId: normalized });
      const items = legacy
        .map((row) => mapLegacyRowToCore(row))
        .filter((core): core is AppointmentCore => Boolean(core));
      return { items, total: items.length, source: 'indexeddb' };
    }

    if (isBrowserOffline()) {
      const items = this.listFromCacheOrIdb(normalized, filters)
        .map((row) => mapLegacyRowToCore(row))
        .filter((core): core is AppointmentCore => Boolean(core));
      return { items, total: items.length, source: 'indexeddb-offline' };
    }

    try {
      const remote = await this.deps.adminApi.listAppointments(normalized, filters);
      hydrateAgendaIdbCache(remote, normalized, this.deps.cache);
      logAgendaReadDev('listCore', { tenantId: normalized, count: remote.length, source: 'admin-api' });
      await this.maybeRunShadowCompare(normalized, flags);
      return { items: remote, total: remote.length, source: 'admin-api' };
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      const legacy = this.deps.indexedDb.listLegacySync({ ...filters, tenantId: normalized });
      const items = legacy
        .map((row) => mapLegacyRowToCore(row))
        .filter((core): core is AppointmentCore => Boolean(core));
      logAgendaReadDev('listCore-fallback', {
        tenantId: normalized,
        error: err instanceof Error ? err.message : String(err),
      });
      return { items, total: items.length, source: 'indexeddb-offline' };
    }
  }

  async getCore(tenantId: string, ref: string): Promise<AgendaGetResult> {
    const normalized = requireTenantId(tenantId);
    const needle = String(ref || '').trim();
    if (!needle) return { core: null, source: 'indexeddb' };

    const flags = this.resolveFlags();
    const cached = this.deps.cache.get(normalized, needle);
    if (cached) return { core: cached, source: 'cache' };

    if (!this.isReadPrimaryEnabled(flags)) {
      const legacy = this.deps.indexedDb.getLegacySync(needle);
      const core = mapLegacyRowToCore(legacy);
      if (core) this.deps.cache.set(normalized, core);
      return { core, source: 'indexeddb' };
    }

    if (isBrowserOffline()) {
      const legacy = this.deps.indexedDb.getLegacySync(needle);
      const core = mapLegacyRowToCore(legacy);
      return { core, source: 'indexeddb-offline' };
    }

    try {
      const remote = await this.deps.adminApi.getAppointment(normalized, needle);
      if (remote) {
        hydrateAgendaIdbCache([remote], normalized, this.deps.cache);
        await this.maybeRunShadowCompare(normalized, flags);
        return { core: remote, source: 'admin-api' };
      }
      const legacy = this.deps.indexedDb.getLegacySync(needle);
      return { core: mapLegacyRowToCore(legacy), source: 'indexeddb' };
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      const legacy = this.deps.indexedDb.getLegacySync(needle);
      return { core: mapLegacyRowToCore(legacy), source: 'indexeddb-offline' };
    }
  }

  async syncCacheFromRemote(tenantId: string): Promise<number> {
    if (!isAgendaReadPrimaryEnabled(this.deps.flagsInput)) return 0;
    const result = await this.listCore(tenantId);
    return result.total;
  }

  async createCore(tenantId: string, dto: AppointmentCreateCoreDto): Promise<AppointmentCore> {
    const normalized = requireTenantId(tenantId);
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);

    const remote = await this.deps.adminApi.createAppointment(normalized, dto);
    const core = this.hydrateRemoteCore(normalized, remote);
    logAgendaWriteDev('create', { tenantId: normalized, legacyId: core.legacyId, ok: true });
    await this.maybeRunShadowCompare(normalized, flags);
    return core;
  }

  async updateCore(
    tenantId: string,
    legacyId: string,
    dto: AppointmentUpdateCoreDto,
  ): Promise<AppointmentCore> {
    const normalized = requireTenantId(tenantId);
    const ref = String(legacyId || '').trim();
    if (!ref) throw new Error('legacyId ausente para updateCore.');
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);

    const remote = await this.deps.adminApi.updateAppointment(normalized, ref, dto);
    const core = this.hydrateRemoteCore(normalized, remote);
    logAgendaWriteDev('update', { tenantId: normalized, legacyId: ref, ok: true });
    await this.maybeRunShadowCompare(normalized, flags);
    return core;
  }

  async cancelCore(tenantId: string, legacyId: string, reason = ''): Promise<AppointmentCore> {
    const normalized = requireTenantId(tenantId);
    const ref = String(legacyId || '').trim();
    if (!ref) throw new Error('legacyId ausente para cancelCore.');
    const flags = this.resolveFlags();
    this.assertRemoteWrite(flags);

    const remote = await this.deps.adminApi.cancelAppointment(normalized, ref, reason);
    const core = this.hydrateRemoteCore(normalized, remote);
    logAgendaWriteDev('cancel', { tenantId: normalized, legacyId: ref, ok: true });
    await this.maybeRunShadowCompare(normalized, flags);
    return core;
  }

  async compareIdbVsRemote(tenantId: string): Promise<Record<string, unknown> | null> {
    if (!shouldCompareAgendaIdbVsRemote(this.deps.flagsInput)) return null;
    const normalized = requireTenantId(tenantId);

    const idbRows = this.deps.indexedDb.listLegacySync({ tenantId: normalized });
    let remoteRows: AppointmentCore[] = [];

    try {
      remoteRows = await this.deps.adminApi.listAppointments(normalized);
    } catch (err) {
      if (!isRemoteReadUnavailableError(err)) throw err;
      return { tenantId: normalized, skipped: true, reason: 'remote-unavailable' };
    }

    const idbMap = new Map(
      idbRows
        .map((row) => mapLegacyRowToCore(row))
        .filter((core): core is AppointmentCore => Boolean(core))
        .map((core) => [core.legacyId, core]),
    );
    const remoteMap = new Map(remoteRows.map((core) => [core.legacyId, core]));

    const diffs: Record<string, unknown>[] = [];
    for (const [id, idbCore] of idbMap) {
      const remoteCore = remoteMap.get(id) ?? null;
      const comparison = compareAgendaShapes(idbCore, remoteCore);
      if (!comparison.match) {
        diffs.push({ ref: id, ...comparison });
      }
    }

    const report = {
      tenantId: normalized,
      comparedAt: new Date().toISOString(),
      matchCount: idbMap.size - diffs.length,
      mismatchCount: diffs.length,
      diffs,
    };
    logAgendaShadowDev('compare', report);
    return report;
  }

  private listFromCacheOrIdb(
    tenantId: string,
    filters?: AgendaListFilters,
  ): AppointmentLegacyRow[] {
    const legacy = this.deps.indexedDb.listLegacySync({ ...filters, tenantId });
    return legacy;
  }

  private async maybeRunShadowCompare(
    tenantId: string,
    flags: AgendaRepositoryFlags,
  ): Promise<void> {
    if (!flags.AGENDA_SHADOW && !flags.AGENDA_COMPARE) return;
    try {
      await this.compareIdbVsRemote(tenantId);
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug('[AGENDA_SHADOW] skipped:', err instanceof Error ? err.message : err);
      }
    }
  }
}

function normalizeTenantFromFilters(filters?: AgendaListFilters): string {
  return String(filters?.tenantId || '').trim();
}

function mapCoreToLegacyFromCache(core: AppointmentCore): AppointmentLegacyRow {
  return {
    id: core.legacyId,
    tenant_id: core.tenantId,
    patientId: core.patientId,
    leadId: core.leadId,
    professionalId: core.professionalId,
    roomId: core.roomId,
    date: core.date,
    startTime: core.startTime,
    endTime: core.endTime,
    durationMinutes: core.durationMinutes,
    slotCapacity: core.slotCapacity,
    status: core.status,
    procedureName: core.procedureName,
    channel: core.channel,
    notes: core.notes,
    checkInAt: core.checkInAt,
    finishedAt: core.finishedAt,
  };
}

export const agendaRepository: IAgendaRepository = new AgendaRepository();

export async function rehydrateAgendaCacheIfPrimary(
  tenantId: string | null | undefined,
): Promise<number> {
  if (!isAgendaReadPrimaryEnabled()) return 0;
  const normalized = String(tenantId || '').trim();
  if (!normalized) return 0;
  return agendaRepository.syncCacheFromRemote(normalized);
}

export function createAgendaRepository(deps?: AgendaRepositoryDeps): IAgendaRepository {
  return new AgendaRepository(deps);
}
