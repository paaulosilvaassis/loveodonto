/**
 * @module repositories/patient/patientRepository
 * @description Facade pública Pacientes V3 — Phase 9.4A Wave 2.
 *
 * Defaults: IndexedDB authority. Flags off → erro explícito em paths remotos.
 * **Não importar de `patientService.js` / UI nesta wave.**
 */

import { patientIndexedDbRepository as defaultIdb } from './patientIndexedDbRepository.js';
import {
  getPatientRepositoryFlags,
  type PatientRepositoryFlagsInput,
} from './patientRepositoryFlags.js';
import { patientSupabaseRepository as defaultSupabase } from './patientSupabaseRepository.js';
import type {
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
import { assertValidTenantId, mapCreateDtoToSupabaseUpsert, mapUpdateDtoToSupabaseUpsert } from './patientMapper.js';

export interface PatientRepositoryDeps {
  supabase?: IPatientSupabaseRepository;
  indexedDb?: IPatientIndexedDbRepository;
  flagsInput?: PatientRepositoryFlagsInput;
}

export interface PatientRepositoryReadiness {
  wave: '9.4A-Wave2';
  supabaseRepositoryImplemented: true;
  indexedDbSsot: true;
  wiredToPatientService: false;
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

  private get flagsInput(): PatientRepositoryFlagsInput {
    return this.deps.flagsInput || {};
  }

  getFlags() {
    return getPatientRepositoryFlags(this.flagsInput);
  }

  getReadiness(): PatientRepositoryReadiness {
    const flags = this.getFlags();
    return {
      wave: '9.4A-Wave2',
      supabaseRepositoryImplemented: true,
      indexedDbSsot: true,
      wiredToPatientService: false,
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
    return this.supabase.listPatients(assertValidTenantId(tenantId), filters);
  }

  async getCore(tenantId: string, ref: PatientRef): Promise<PatientCore | null> {
    this.assertRemoteRead();
    const tid = assertValidTenantId(tenantId);
    const needle = String(ref || '').trim();
    if (!needle) return null;
    if (needle.startsWith('patient-')) {
      return this.supabase.getPatientByLegacyId(tid, needle);
    }
    return (await this.supabase.getPatientById(tid, needle))
      ?? this.supabase.getPatientByLegacyId(tid, needle);
  }

  async createCore(
    user: PatientRepositoryUser,
    dto: PatientCreateCoreDto,
  ): Promise<PatientCore> {
    this.assertRemoteWrite();
    const tenantId = assertValidTenantId(user.tenantId ?? user.tenant_id);
    const upsertDto = mapCreateDtoToSupabaseUpsert(tenantId, dto);
    return this.supabase.createPatient(tenantId, upsertDto);
  }

  async updateCore(
    user: PatientRepositoryUser,
    ref: PatientRef,
    dto: PatientUpdateCoreDto,
  ): Promise<PatientCore> {
    this.assertRemoteWrite();
    const tenantId = assertValidTenantId(user.tenantId ?? user.tenant_id);
    const needle = String(ref || '').trim();
    const core = (await this.supabase.getPatientById(tenantId, needle))
      ?? (await this.supabase.getPatientByLegacyId(tenantId, needle));
    if (!core) throw new PatientNotFoundError(ref);
    const patch = mapUpdateDtoToSupabaseUpsert(tenantId, core.legacyId, dto);
    return this.supabase.updatePatient(tenantId, core.uuid, patch);
  }

  async softDeleteCore(user: PatientRepositoryUser, ref: PatientRef): Promise<void> {
    this.assertRemoteWrite();
    const tenantId = assertValidTenantId(user.tenantId ?? user.tenant_id);
    const needle = String(ref || '').trim();
    const core = (await this.supabase.getPatientById(tenantId, needle))
      ?? (await this.supabase.getPatientByLegacyId(tenantId, needle));
    if (!core) throw new PatientNotFoundError(ref);
    await this.supabase.softDeletePatient(tenantId, core.uuid);
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
