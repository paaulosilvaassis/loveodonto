/**
 * @module repositories/patient/patientRepository
 * @description Facade pública Pacientes V3 — CLOUD.3 wiring.
 *
 * Defaults: IndexedDB authority. Flags off → erro explícito em paths remotos.
 * Prefer Admin API registrada; fallback Supabase repo.
 */

import { withDb } from '../../db/index.js';
import {
  getDefaultPatientAdminApiClient,
  isPatientAdminApiRegistered,
} from './patientAdminApiRepository.js';
import { patientIndexedDbRepository as defaultIdb } from './patientIndexedDbRepository.js';
import {
  getPatientRepositoryFlags,
  isPatientsReadPrimaryEnabled,
  shouldComparePatientsIdbVsRemote,
  type PatientRepositoryFlagsInput,
} from './patientRepositoryFlags.js';
import { patientSupabaseRepository as defaultSupabase } from './patientSupabaseRepository.js';
import {
  buildPatientShadowReport,
  logPatientShadowReport,
} from './patientShadowCompare.js';
import type {
  IPatientAdminApiClient,
  IPatientIndexedDbRepository,
  IPatientRepository,
  IPatientSupabaseRepository,
  PatientCreateCoreDto,
  PatientIndexedDbRow,
  PatientListFilters,
  PatientListResult,
  PatientRef,
  PatientRepositoryUser,
  PatientCore,
  PatientUpdateCoreDto,
} from './patientTypes.js';
import {
  PatientNotFoundError,
  PatientRepositoryRemoteReadDisabledError,
  PatientRepositoryRemoteWriteDisabledError,
} from './patientTypes.js';
import {
  assertRemoteTenantId,
  assertValidTenantId,
  mapCoreToIndexedDbMirror,
  mapCreateDtoToSupabaseUpsert,
  mapLegacyRowToPatientCore,
  mapUpdateDtoToSupabaseUpsert,
} from './patientMapper.js';

export interface PatientRepositoryDeps {
  supabase?: IPatientSupabaseRepository;
  indexedDb?: IPatientIndexedDbRepository;
  adminApi?: IPatientAdminApiClient;
  flagsInput?: PatientRepositoryFlagsInput;
}

export interface PatientRepositoryReadiness {
  wave: 'CLOUD.3';
  supabaseRepositoryImplemented: true;
  indexedDbSsot: true;
  wiredToPatientService: true;
  dualWriteEnabled: boolean;
  readEnabled: boolean;
  writeEnabled: boolean;
  shadowReadEnabled: boolean;
  flags: ReturnType<typeof getPatientRepositoryFlags>;
}

export class PatientRepository implements IPatientRepository {
  private readonly deps: PatientRepositoryDeps;

  constructor(deps: PatientRepositoryDeps = {}) {
    this.deps = deps;
  }

  private get idb(): IPatientIndexedDbRepository {
    return this.deps.indexedDb || defaultIdb;
  }

  private get supabase(): IPatientSupabaseRepository {
    return this.deps.supabase || defaultSupabase;
  }

  private get adminApi(): IPatientAdminApiClient {
    return this.deps.adminApi || getDefaultPatientAdminApiClient();
  }

  private get flagsInput(): PatientRepositoryFlagsInput {
    return this.deps.flagsInput || {};
  }

  private preferAdminApi(): boolean {
    return this.deps.adminApi != null || isPatientAdminApiRegistered();
  }

  getFlags() {
    return getPatientRepositoryFlags(this.flagsInput);
  }

  getReadiness(): PatientRepositoryReadiness {
    const flags = this.getFlags();
    return {
      wave: 'CLOUD.3',
      supabaseRepositoryImplemented: true,
      indexedDbSsot: true,
      wiredToPatientService: true,
      dualWriteEnabled: flags.PATIENTS_DUAL_WRITE,
      readEnabled: flags.PATIENTS_READ,
      writeEnabled: flags.PATIENTS_WRITE,
      shadowReadEnabled: flags.PATIENTS_SHADOW,
      flags,
    };
  }

  private assertRemoteRead(): void {
    const flags = this.getFlags();
    if (!flags.PATIENTS_READ && !flags.PATIENTS_READ_PRIMARY && !flags.PATIENTS_SHADOW) {
      throw new PatientRepositoryRemoteReadDisabledError();
    }
  }

  private assertRemoteWrite(): void {
    const flags = this.getFlags();
    if (!flags.PATIENTS_WRITE) {
      throw new PatientRepositoryRemoteWriteDisabledError();
    }
  }

  async listCore(tenantId: string, filters: PatientListFilters = {}): Promise<PatientListResult> {
    this.assertRemoteRead();
    const tid = assertRemoteTenantId(tenantId);
    if (this.preferAdminApi()) {
      const items = await this.adminApi.listPatients(tid, filters);
      return { items, total: items.length, source: 'supabase' };
    }
    return this.supabase.listPatients(tid, filters);
  }

  async getCore(tenantId: string, ref: PatientRef): Promise<PatientCore | null> {
    this.assertRemoteRead();
    const tid = assertRemoteTenantId(tenantId);
    const needle = String(ref || '').trim();
    if (!needle) return null;

    if (this.preferAdminApi()) {
      return this.adminApi.getPatient(tid, needle);
    }

    if (needle.startsWith('patient-')) {
      return this.supabase.getPatientByLegacyId(tid, needle);
    }
    return (await this.supabase.getPatientById(tid, needle))
      ?? this.supabase.getPatientByLegacyId(tid, needle);
  }

  async searchCore(
    tenantId: string,
    query: string,
    filters: PatientListFilters = {},
  ): Promise<PatientCore[]> {
    this.assertRemoteRead();
    const tid = assertRemoteTenantId(tenantId);
    const q = String(query || '').trim();
    if (this.preferAdminApi()) {
      return this.adminApi.listPatients(tid, { ...filters, search: q });
    }
    return this.supabase.searchPatients(tid, q, filters);
  }

  async createCore(
    user: PatientRepositoryUser,
    dto: PatientCreateCoreDto,
  ): Promise<PatientCore> {
    this.assertRemoteWrite();
    const tenantId = assertRemoteTenantId(user.tenantId ?? user.tenant_id);

    if (this.preferAdminApi()) {
      const created = await this.adminApi.createPatient(tenantId, dto);
      if (!created) throw new Error('Admin API não retornou paciente após create.');
      return created;
    }

    const upsertDto = mapCreateDtoToSupabaseUpsert(tenantId, dto);
    return this.supabase.createPatient(tenantId, upsertDto);
  }

  async updateCore(
    user: PatientRepositoryUser,
    ref: PatientRef,
    dto: PatientUpdateCoreDto,
  ): Promise<PatientCore> {
    this.assertRemoteWrite();
    const tenantId = assertRemoteTenantId(user.tenantId ?? user.tenant_id);
    const needle = String(ref || '').trim();

    if (this.preferAdminApi()) {
      const updated = await this.adminApi.updatePatient(tenantId, needle, dto);
      if (!updated) throw new PatientNotFoundError(ref);
      return updated;
    }

    const core = (await this.supabase.getPatientById(tenantId, needle))
      ?? (await this.supabase.getPatientByLegacyId(tenantId, needle));
    if (!core) throw new PatientNotFoundError(ref);
    const patch = mapUpdateDtoToSupabaseUpsert(tenantId, core.legacyId, dto);
    return this.supabase.updatePatient(tenantId, core.uuid, patch);
  }

  async softDeleteCore(user: PatientRepositoryUser, ref: PatientRef): Promise<void> {
    this.assertRemoteWrite();
    const tenantId = assertRemoteTenantId(user.tenantId ?? user.tenant_id);
    const needle = String(ref || '').trim();

    if (this.preferAdminApi()) {
      const ok = await this.adminApi.softDeletePatient(tenantId, needle);
      if (!ok) throw new PatientNotFoundError(ref);
      return;
    }

    const core = (await this.supabase.getPatientById(tenantId, needle))
      ?? (await this.supabase.getPatientByLegacyId(tenantId, needle));
    if (!core) throw new PatientNotFoundError(ref);
    await this.supabase.softDeletePatient(tenantId, core.uuid);
  }

  /**
   * Upsert IDB por legacy_id — NÃO limpa DB / outras collections.
   * Não deve ser chamado como primary pelo service nesta phase.
   */
  async hydratePatients(
    remoteRows: PatientCore[],
    options: { tenantId: string },
  ): Promise<number> {
    const tid = assertValidTenantId(options.tenantId);
    const rows = Array.isArray(remoteRows) ? remoteRows : [];
    let upserted = 0;

    withDb((db) => {
      if (!Array.isArray(db.patients)) db.patients = [];
      for (const core of rows) {
        if (!core?.legacyId) continue;
        const mirror = mapCoreToIndexedDbMirror({ ...core, tenantId: core.tenantId || tid });
        const idx = db.patients.findIndex((row) => row?.id === mirror.id);
        if (idx >= 0) {
          db.patients[idx] = { ...db.patients[idx], ...mirror };
        } else {
          db.patients.push(mirror);
        }
        upserted += 1;
      }
      return db;
    });

    return upserted;
  }

  /**
   * CLOUD.6 — sync cache IDB a partir do remote quando READ_PRIMARY.
   * Paginação completa via Admin API / Supabase. Sem clear whole DB.
   */
  async syncCacheFromRemote(tenantId: string): Promise<number> {
    const flags = this.getFlags();
    if (!(flags.PATIENTS_READ && flags.PATIENTS_READ_PRIMARY)) return 0;
    const tid = assertRemoteTenantId(tenantId);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return this.idb.listLegacySync({ tenantId: tid }).length;
    }

    let remoteItems: PatientCore[] = [];
    try {
      this.assertRemoteRead();
      if (this.preferAdminApi()) {
        remoteItems = await this.adminApi.listPatients(tid);
      } else {
        const listed = await this.supabase.listPatients(tid);
        remoteItems = listed.items || [];
      }
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.debug(
          '[PATIENT_CACHE] sync skipped:',
          err instanceof Error ? err.message : err,
        );
      }
      return this.idb.listLegacySync({ tenantId: tid }).length;
    }

    return this.hydratePatients(remoteItems, { tenantId: tid });
  }

  async compareIdbVsRemote(tenantId: string): Promise<Record<string, unknown> | null> {
    if (!shouldComparePatientsIdbVsRemote(this.flagsInput)) return null;
    const tid = assertRemoteTenantId(tenantId);

    const idbRows = this.idb.listLegacySync({ tenantId: tid });
    const localItems = idbRows
      .map((row) => {
        try {
          return mapLegacyRowToPatientCore(row, { resolvedTenantId: tid });
        } catch {
          return null;
        }
      })
      .filter((core): core is PatientCore => Boolean(core));

    let remoteItems: PatientCore[] = [];
    try {
      this.assertRemoteRead();
      if (this.preferAdminApi()) {
        remoteItems = await this.adminApi.listPatients(tid);
      } else {
        const listed = await this.supabase.listPatients(tid);
        remoteItems = listed.items || [];
      }
    } catch (err) {
      return {
        tenantId: tid,
        skipped: true,
        reason: err instanceof Error ? err.message : String(err || 'remote-unavailable'),
      };
    }

    const report = buildPatientShadowReport({
      tenantId: tid,
      localItems,
      remoteItems,
    });
    logPatientShadowReport(report);
    return report as unknown as Record<string, unknown>;
  }

  listLegacySync(filters: PatientListFilters = {}): PatientIndexedDbRow[] {
    return this.idb.listLegacySync(filters);
  }

  getLegacyProfileSync(patientId: string): PatientIndexedDbRow | null {
    return this.idb.getLegacyProfileSync(patientId);
  }

  getSupabaseClient(): IPatientSupabaseRepository {
    return this.supabase;
  }
}

export function createPatientRepository(deps: PatientRepositoryDeps = {}): PatientRepository {
  return new PatientRepository(deps);
}

export const patientRepository = createPatientRepository();

/**
 * CLOUD.6 — hidratação inicial quando READ_PRIMARY ativo.
 */
export async function rehydratePatientCacheIfPrimary(
  tenantId: string | null | undefined,
  flagsInput: PatientRepositoryFlagsInput = {},
): Promise<number> {
  if (!isPatientsReadPrimaryEnabled(flagsInput)) return 0;
  const normalized = String(tenantId || '').trim();
  if (!normalized) return 0;
  return createPatientRepository({ flagsInput }).syncCacheFromRemote(normalized);
}
