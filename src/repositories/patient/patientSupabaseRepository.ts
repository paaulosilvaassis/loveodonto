/**
 * @module repositories/patient/patientSupabaseRepository
 * @description Cliente Supabase Pacientes — implementação real Phase 9.4A Wave 2.
 *
 * Flags NÃO são checadas aqui (facade). Sem IndexedDB. Sem service_role.
 * Tenant da UI nunca é autoridade: o parâmetro `tenantId` deve vir do contexto auth.
 */

import { supabaseAppClient } from '../../lib/supabaseClients.js';
import {
  mapAccessSupabaseToCore,
  mapActivitySupabaseToCore,
  mapAddressSupabaseToCore,
  mapBirthSupabaseToCore,
  mapDocumentsSupabaseToCore,
  mapEducationSupabaseToCore,
  mapInsuranceSupabaseToCore,
  mapPhoneSupabaseToCore,
  mapRecordSupabaseToCore,
  mapRelationshipsSupabaseToCore,
  mapSupabaseRowToPatientCore,
  assertValidTenantId,
} from './patientMapper.js';
import type {
  IPatientSupabaseRepository,
  PatientAccessCore,
  PatientAccessSupabaseRow,
  PatientActivitySummaryCore,
  PatientActivitySummarySupabaseRow,
  PatientAddressCore,
  PatientAddressSupabaseRow,
  PatientBirthDetailsCore,
  PatientBirthDetailsSupabaseRow,
  PatientBundleFull,
  PatientCore,
  PatientDocumentsCore,
  PatientDocumentsSupabaseRow,
  PatientEducationCore,
  PatientEducationSupabaseRow,
  PatientInsuranceCore,
  PatientInsuranceSupabaseRow,
  PatientListFilters,
  PatientListResult,
  PatientPhoneCore,
  PatientPhoneSupabaseRow,
  PatientRecordCore,
  PatientRecordSupabaseRow,
  PatientRelationshipsCore,
  PatientRelationshipsSupabaseRow,
  PatientSupabaseRow,
  PatientSupabaseUpsertDto,
} from './patientTypes.js';
import { PatientRepositorySupabaseUnavailableError } from './patientTypes.js';

export const PATIENTS_TABLE = 'patients';

/** Cliente PostgREST mínimo (supabase-js ou mock de teste). */
export type PatientSupabaseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export interface PatientSupabaseRepositoryDeps {
  client?: PatientSupabaseClient | null;
}

function requireTenant(tenantId: string | null | undefined): string {
  return assertValidTenantId(tenantId);
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function applyPatientFilters(items: PatientCore[], filters?: PatientListFilters): PatientCore[] {
  if (!filters) return items.filter((i) => !i.deletedAt);
  let result = items;
  if (!filters.includeBlocked) {
    result = result.filter((i) => !i.blocked);
  }
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    result = result.filter((i) => statuses.includes(i.status));
  }
  if (filters.cpf) {
    const cpf = String(filters.cpf).replace(/\D/g, '');
    result = result.filter((i) => (i.cpf || '') === cpf);
  }
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      (i) =>
        i.fullName.toLowerCase().includes(q)
        || i.nickname.toLowerCase().includes(q)
        || i.socialName.toLowerCase().includes(q)
        || String(i.cpf || '').includes(q.replace(/\D/g, ''))
        || i.legacyId.toLowerCase().includes(q),
    );
  }
  return result.filter((i) => !i.deletedAt);
}

export class PatientSupabaseRepository implements IPatientSupabaseRepository {
  private readonly injected: PatientSupabaseClient | null | undefined;

  constructor(deps: PatientSupabaseRepositoryDeps = {}) {
    this.injected = deps.client;
  }

  private getClient(): PatientSupabaseClient {
    const client = this.injected ?? (supabaseAppClient as unknown as PatientSupabaseClient | null);
    if (!client) throw new PatientRepositorySupabaseUnavailableError();
    return client;
  }

  async findByUuid(tenantId: string, uuid: string): Promise<PatientCore | null> {
    return this.getPatientById(tenantId, uuid);
  }

  async findByLegacyId(tenantId: string, legacyId: string): Promise<PatientCore | null> {
    return this.getPatientByLegacyId(tenantId, legacyId);
  }

  async list(tenantId: string, filters?: PatientListFilters): Promise<PatientCore[]> {
    const result = await this.listPatients(tenantId, filters);
    return result.items;
  }

  async listPatients(tenantId: string, filters?: PatientListFilters): Promise<PatientListResult> {
    const tid = requireTenant(tenantId);
    const client = this.getClient();
    const pageSize = 500;
    let from = 0;
    const rawRows: PatientSupabaseRow[] = [];
    let total: number | null = null;

    while (true) {
      const to = from + pageSize - 1;
      const { data, error, count } = await client
        .from(PATIENTS_TABLE)
        .select('*', { count: 'exact' })
        .eq('tenant_id', tid)
        .is('deleted_at', null)
        .order('full_name', { ascending: true })
        .range(from, to);
      throwIfError(error);
      if (typeof count === 'number') total = count;
      const chunk = (data || []) as PatientSupabaseRow[];
      rawRows.push(...chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
      if (rawRows.length > 50000) break;
    }

    const items = applyPatientFilters(
      rawRows.map(mapSupabaseRowToPatientCore),
      filters,
    );
    return { items, total: total ?? items.length, source: 'supabase' };
  }

  async getPatientById(tenantId: string, uuid: string): Promise<PatientCore | null> {
    const tid = requireTenant(tenantId);
    const id = String(uuid || '').trim();
    if (!id) return null;
    const { data, error } = await this.getClient()
      .from(PATIENTS_TABLE)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    throwIfError(error);
    return data ? mapSupabaseRowToPatientCore(data as PatientSupabaseRow) : null;
  }

  async getPatientByLegacyId(tenantId: string, legacyId: string): Promise<PatientCore | null> {
    const tid = requireTenant(tenantId);
    const legacy = String(legacyId || '').trim();
    if (!legacy) return null;
    const { data, error } = await this.getClient()
      .from(PATIENTS_TABLE)
      .select('*')
      .eq('tenant_id', tid)
      .eq('legacy_id', legacy)
      .is('deleted_at', null)
      .maybeSingle();
    throwIfError(error);
    return data ? mapSupabaseRowToPatientCore(data as PatientSupabaseRow) : null;
  }

  async searchPatients(
    tenantId: string,
    query: string,
    filters?: PatientListFilters,
  ): Promise<PatientCore[]> {
    const result = await this.listPatients(tenantId, { ...filters, search: query });
    return result.items;
  }

  async createPatient(tenantId: string, dto: PatientSupabaseUpsertDto): Promise<PatientCore> {
    const tid = requireTenant(tenantId);
    requireTenant(dto.tenant_id);
    if (dto.tenant_id !== tid) {
      throw new Error('tenant_id do payload deve coincidir com o tenant autenticado.');
    }
    const payload = { ...dto, tenant_id: tid };
    const { data, error } = await this.getClient()
      .from(PATIENTS_TABLE)
      .insert(payload)
      .select('*')
      .single();
    throwIfError(error);
    return mapSupabaseRowToPatientCore(data as PatientSupabaseRow);
  }

  async updatePatient(
    tenantId: string,
    uuid: string,
    patch: Partial<PatientSupabaseRow>,
  ): Promise<PatientCore> {
    const tid = requireTenant(tenantId);
    const { tenant_id: _ignored, id: _id, ...safe } = patch as PatientSupabaseRow;
    void _ignored;
    void _id;
    const { data, error } = await this.getClient()
      .from(PATIENTS_TABLE)
      .update({ ...safe, updated_at: new Date().toISOString() })
      .eq('tenant_id', tid)
      .eq('id', uuid)
      .is('deleted_at', null)
      .select('*')
      .single();
    throwIfError(error);
    return mapSupabaseRowToPatientCore(data as PatientSupabaseRow);
  }

  async softDeletePatient(tenantId: string, uuid: string): Promise<void> {
    const tid = requireTenant(tenantId);
    const { error } = await this.getClient()
      .from(PATIENTS_TABLE)
      .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('tenant_id', tid)
      .eq('id', uuid);
    throwIfError(error);
  }

  async upsert(tenantId: string, dto: PatientSupabaseUpsertDto): Promise<PatientCore> {
    const tid = requireTenant(tenantId);
    requireTenant(dto.tenant_id);
    const existing = await this.getPatientByLegacyId(tid, dto.legacy_id);
    if (existing) return this.updatePatient(tid, existing.uuid, dto as Partial<PatientSupabaseRow>);
    return this.createPatient(tid, dto);
  }

  async softDelete(tenantId: string, uuid: string): Promise<void> {
    return this.softDeletePatient(tenantId, uuid);
  }

  // ---- Wave 1 satellites -------------------------------------------------

  async listPatientPhones(tenantId: string, patientUuid: string): Promise<PatientPhoneCore[]> {
    const tid = requireTenant(tenantId);
    const { data, error } = await this.getClient()
      .from('patient_phones')
      .select('*')
      .eq('tenant_id', tid)
      .eq('patient_id', patientUuid)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    throwIfError(error);
    return ((data || []) as PatientPhoneSupabaseRow[]).map(mapPhoneSupabaseToCore);
  }

  async createPatientPhone(
    tenantId: string,
    row: Partial<PatientPhoneSupabaseRow> & { patient_id: string; legacy_id: string },
  ): Promise<PatientPhoneCore> {
    const tid = requireTenant(tenantId);
    const { data, error } = await this.getClient()
      .from('patient_phones')
      .insert({ ...row, tenant_id: tid })
      .select('*')
      .single();
    throwIfError(error);
    return mapPhoneSupabaseToCore(data as PatientPhoneSupabaseRow);
  }

  async updatePatientPhone(
    tenantId: string,
    phoneUuid: string,
    patch: Partial<PatientPhoneSupabaseRow>,
  ): Promise<PatientPhoneCore> {
    const tid = requireTenant(tenantId);
    const { tenant_id: _t, patient_id: _p, legacy_id: _l, ...safe } = patch as PatientPhoneSupabaseRow;
    void _t; void _p; void _l;
    const { data, error } = await this.getClient()
      .from('patient_phones')
      .update(safe)
      .eq('tenant_id', tid)
      .eq('id', phoneUuid)
      .is('deleted_at', null)
      .select('*')
      .single();
    throwIfError(error);
    return mapPhoneSupabaseToCore(data as PatientPhoneSupabaseRow);
  }

  async removePatientPhone(tenantId: string, phoneUuid: string): Promise<void> {
    const tid = requireTenant(tenantId);
    const { error } = await this.getClient()
      .from('patient_phones')
      .update({ deleted_at: new Date().toISOString() })
      .eq('tenant_id', tid)
      .eq('id', phoneUuid);
    throwIfError(error);
  }

  async getPatientDocuments(
    tenantId: string,
    patientUuid: string,
  ): Promise<PatientDocumentsCore | null> {
    const tid = requireTenant(tenantId);
    const { data, error } = await this.getClient()
      .from('patient_documents')
      .select('*')
      .eq('tenant_id', tid)
      .eq('patient_id', patientUuid)
      .is('deleted_at', null)
      .maybeSingle();
    throwIfError(error);
    return data ? mapDocumentsSupabaseToCore(data as PatientDocumentsSupabaseRow) : null;
  }

  async upsertPatientDocuments(
    tenantId: string,
    row: Partial<PatientDocumentsSupabaseRow> & { patient_id: string },
  ): Promise<PatientDocumentsCore> {
    const tid = requireTenant(tenantId);
    const existing = await this.getPatientDocuments(tid, row.patient_id);
    if (existing) {
      const { data, error } = await this.getClient()
        .from('patient_documents')
        .update({ ...row, tenant_id: tid })
        .eq('tenant_id', tid)
        .eq('id', existing.uuid)
        .select('*')
        .single();
      throwIfError(error);
      return mapDocumentsSupabaseToCore(data as PatientDocumentsSupabaseRow);
    }
    const { data, error } = await this.getClient()
      .from('patient_documents')
      .insert({ ...row, tenant_id: tid })
      .select('*')
      .single();
    throwIfError(error);
    return mapDocumentsSupabaseToCore(data as PatientDocumentsSupabaseRow);
  }

  async getPatientRecord(tenantId: string, patientUuid: string): Promise<PatientRecordCore | null> {
    const tid = requireTenant(tenantId);
    const { data, error } = await this.getClient()
      .from('patient_records')
      .select('*')
      .eq('tenant_id', tid)
      .eq('patient_id', patientUuid)
      .is('deleted_at', null)
      .maybeSingle();
    throwIfError(error);
    return data ? mapRecordSupabaseToCore(data as PatientRecordSupabaseRow) : null;
  }

  async upsertPatientRecord(
    tenantId: string,
    row: Partial<PatientRecordSupabaseRow> & { patient_id: string; legacy_id: string },
  ): Promise<PatientRecordCore> {
    const tid = requireTenant(tenantId);
    const existing = await this.getPatientRecord(tid, row.patient_id);
    if (existing) {
      const { data, error } = await this.getClient()
        .from('patient_records')
        .update({ ...row, tenant_id: tid })
        .eq('tenant_id', tid)
        .eq('id', existing.uuid)
        .select('*')
        .single();
      throwIfError(error);
      return mapRecordSupabaseToCore(data as PatientRecordSupabaseRow);
    }
    const { data, error } = await this.getClient()
      .from('patient_records')
      .insert({ ...row, tenant_id: tid })
      .select('*')
      .single();
    throwIfError(error);
    return mapRecordSupabaseToCore(data as PatientRecordSupabaseRow);
  }

  // ---- Wave 2 satellites -------------------------------------------------

  private async getOneToOne<TRow, TCore>(
    table: string,
    tenantId: string,
    patientUuid: string,
    map: (row: TRow) => TCore,
  ): Promise<TCore | null> {
    const tid = requireTenant(tenantId);
    const { data, error } = await this.getClient()
      .from(table)
      .select('*')
      .eq('tenant_id', tid)
      .eq('patient_id', patientUuid)
      .is('deleted_at', null)
      .maybeSingle();
    throwIfError(error);
    return data ? map(data as TRow) : null;
  }

  private async upsertOneToOne<TRow, TCore>(
    table: string,
    tenantId: string,
    patientUuid: string,
    row: Partial<TRow> & { patient_id: string },
    getExisting: () => Promise<{ uuid: string } | null>,
    map: (row: TRow) => TCore,
  ): Promise<TCore> {
    const tid = requireTenant(tenantId);
    const existing = await getExisting();
    if (existing) {
      const { data, error } = await this.getClient()
        .from(table)
        .update({ ...row, tenant_id: tid, patient_id: patientUuid })
        .eq('tenant_id', tid)
        .eq('id', existing.uuid)
        .select('*')
        .single();
      throwIfError(error);
      return map(data as TRow);
    }
    const { data, error } = await this.getClient()
      .from(table)
      .insert({ ...row, tenant_id: tid, patient_id: patientUuid })
      .select('*')
      .single();
    throwIfError(error);
    return map(data as TRow);
  }

  async getPatientBirthDetails(tenantId: string, patientUuid: string) {
    return this.getOneToOne<PatientBirthDetailsSupabaseRow, PatientBirthDetailsCore>(
      'patient_birth_details',
      tenantId,
      patientUuid,
      mapBirthSupabaseToCore,
    );
  }

  async upsertPatientBirthDetails(
    tenantId: string,
    row: Partial<PatientBirthDetailsSupabaseRow> & { patient_id: string },
  ) {
    return this.upsertOneToOne(
      'patient_birth_details',
      tenantId,
      row.patient_id,
      row,
      () => this.getPatientBirthDetails(tenantId, row.patient_id),
      mapBirthSupabaseToCore,
    );
  }

  async getPatientEducation(tenantId: string, patientUuid: string) {
    return this.getOneToOne<PatientEducationSupabaseRow, PatientEducationCore>(
      'patient_education',
      tenantId,
      patientUuid,
      mapEducationSupabaseToCore,
    );
  }

  async upsertPatientEducation(
    tenantId: string,
    row: Partial<PatientEducationSupabaseRow> & { patient_id: string },
  ) {
    return this.upsertOneToOne(
      'patient_education',
      tenantId,
      row.patient_id,
      row,
      () => this.getPatientEducation(tenantId, row.patient_id),
      mapEducationSupabaseToCore,
    );
  }

  async listPatientAddresses(tenantId: string, patientUuid: string): Promise<PatientAddressCore[]> {
    const tid = requireTenant(tenantId);
    const { data, error } = await this.getClient()
      .from('patient_addresses')
      .select('*')
      .eq('tenant_id', tid)
      .eq('patient_id', patientUuid)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    throwIfError(error);
    return ((data || []) as PatientAddressSupabaseRow[]).map(mapAddressSupabaseToCore);
  }

  async createPatientAddress(
    tenantId: string,
    row: Partial<PatientAddressSupabaseRow> & { patient_id: string; legacy_id: string },
  ): Promise<PatientAddressCore> {
    const tid = requireTenant(tenantId);
    if (row.is_primary) {
      await this.clearPrimaryAddresses(tid, row.patient_id);
    }
    const { data, error } = await this.getClient()
      .from('patient_addresses')
      .insert({ ...row, tenant_id: tid })
      .select('*')
      .single();
    throwIfError(error);
    return mapAddressSupabaseToCore(data as PatientAddressSupabaseRow);
  }

  async updatePatientAddress(
    tenantId: string,
    addressUuid: string,
    patch: Partial<PatientAddressSupabaseRow>,
  ): Promise<PatientAddressCore> {
    const tid = requireTenant(tenantId);
    const { tenant_id: _t, patient_id: _p, legacy_id: _l, ...safe } = patch as PatientAddressSupabaseRow;
    void _t; void _p; void _l;
    if (safe.is_primary) {
      const current = await this.getClient()
        .from('patient_addresses')
        .select('*')
        .eq('tenant_id', tid)
        .eq('id', addressUuid)
        .maybeSingle();
      throwIfError(current.error);
      if (current.data) {
        await this.clearPrimaryAddresses(
          tid,
          (current.data as PatientAddressSupabaseRow).patient_id,
          addressUuid,
        );
      }
    }
    const { data, error } = await this.getClient()
      .from('patient_addresses')
      .update(safe)
      .eq('tenant_id', tid)
      .eq('id', addressUuid)
      .is('deleted_at', null)
      .select('*')
      .single();
    throwIfError(error);
    return mapAddressSupabaseToCore(data as PatientAddressSupabaseRow);
  }

  async removePatientAddress(tenantId: string, addressUuid: string): Promise<void> {
    const tid = requireTenant(tenantId);
    const { error } = await this.getClient()
      .from('patient_addresses')
      .update({ deleted_at: new Date().toISOString(), is_primary: false })
      .eq('tenant_id', tid)
      .eq('id', addressUuid);
    throwIfError(error);
  }

  private async clearPrimaryAddresses(
    tenantId: string,
    patientUuid: string,
    exceptUuid?: string,
  ): Promise<void> {
    const items = await this.listPatientAddresses(tenantId, patientUuid);
    for (const item of items) {
      if (!item.isPrimary) continue;
      if (exceptUuid && item.uuid === exceptUuid) continue;
      const { error } = await this.getClient()
        .from('patient_addresses')
        .update({ is_primary: false })
        .eq('tenant_id', tenantId)
        .eq('id', item.uuid);
      throwIfError(error);
    }
  }

  async getPatientRelationships(tenantId: string, patientUuid: string) {
    return this.getOneToOne<PatientRelationshipsSupabaseRow, PatientRelationshipsCore>(
      'patient_relationships',
      tenantId,
      patientUuid,
      mapRelationshipsSupabaseToCore,
    );
  }

  async upsertPatientRelationships(
    tenantId: string,
    row: Partial<PatientRelationshipsSupabaseRow> & { patient_id: string },
  ) {
    return this.upsertOneToOne(
      'patient_relationships',
      tenantId,
      row.patient_id,
      row,
      () => this.getPatientRelationships(tenantId, row.patient_id),
      mapRelationshipsSupabaseToCore,
    );
  }

  async listPatientInsurances(
    tenantId: string,
    patientUuid: string,
  ): Promise<PatientInsuranceCore[]> {
    const tid = requireTenant(tenantId);
    const { data, error } = await this.getClient()
      .from('patient_insurances')
      .select('*')
      .eq('tenant_id', tid)
      .eq('patient_id', patientUuid)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    throwIfError(error);
    return ((data || []) as PatientInsuranceSupabaseRow[]).map(mapInsuranceSupabaseToCore);
  }

  async createPatientInsurance(
    tenantId: string,
    row: Partial<PatientInsuranceSupabaseRow> & { patient_id: string; legacy_id: string },
  ): Promise<PatientInsuranceCore> {
    const tid = requireTenant(tenantId);
    const { data, error } = await this.getClient()
      .from('patient_insurances')
      .insert({ ...row, tenant_id: tid })
      .select('*')
      .single();
    throwIfError(error);
    return mapInsuranceSupabaseToCore(data as PatientInsuranceSupabaseRow);
  }

  async updatePatientInsurance(
    tenantId: string,
    insuranceUuid: string,
    patch: Partial<PatientInsuranceSupabaseRow>,
  ): Promise<PatientInsuranceCore> {
    const tid = requireTenant(tenantId);
    const { tenant_id: _t, patient_id: _p, legacy_id: _l, ...safe } =
      patch as PatientInsuranceSupabaseRow;
    void _t; void _p; void _l;
    const { data, error } = await this.getClient()
      .from('patient_insurances')
      .update(safe)
      .eq('tenant_id', tid)
      .eq('id', insuranceUuid)
      .is('deleted_at', null)
      .select('*')
      .single();
    throwIfError(error);
    return mapInsuranceSupabaseToCore(data as PatientInsuranceSupabaseRow);
  }

  async removePatientInsurance(tenantId: string, insuranceUuid: string): Promise<void> {
    const tid = requireTenant(tenantId);
    const { error } = await this.getClient()
      .from('patient_insurances')
      .update({ deleted_at: new Date().toISOString() })
      .eq('tenant_id', tid)
      .eq('id', insuranceUuid);
    throwIfError(error);
  }

  async getPatientAccess(tenantId: string, patientUuid: string) {
    return this.getOneToOne<PatientAccessSupabaseRow, PatientAccessCore>(
      'patient_access',
      tenantId,
      patientUuid,
      mapAccessSupabaseToCore,
    );
  }

  async upsertPatientAccess(
    tenantId: string,
    row: Partial<PatientAccessSupabaseRow> & { patient_id: string },
  ) {
    return this.upsertOneToOne(
      'patient_access',
      tenantId,
      row.patient_id,
      row,
      () => this.getPatientAccess(tenantId, row.patient_id),
      mapAccessSupabaseToCore,
    );
  }

  async getPatientActivitySummary(tenantId: string, patientUuid: string) {
    return this.getOneToOne<PatientActivitySummarySupabaseRow, PatientActivitySummaryCore>(
      'patient_activity_summary',
      tenantId,
      patientUuid,
      mapActivitySupabaseToCore,
    );
  }

  async upsertPatientActivitySummary(
    tenantId: string,
    row: Partial<PatientActivitySummarySupabaseRow> & { patient_id: string },
  ) {
    return this.upsertOneToOne(
      'patient_activity_summary',
      tenantId,
      row.patient_id,
      row,
      () => this.getPatientActivitySummary(tenantId, row.patient_id),
      mapActivitySupabaseToCore,
    );
  }

  async getPatientBundle(tenantId: string, patientUuid: string): Promise<PatientBundleFull | null> {
    const profile = await this.getPatientById(tenantId, patientUuid);
    if (!profile) return null;
    const [
      documents,
      phones,
      record,
      birth,
      education,
      addresses,
      relationships,
      insurances,
      access,
      activity,
    ] = await Promise.all([
      this.getPatientDocuments(tenantId, patientUuid),
      this.listPatientPhones(tenantId, patientUuid),
      this.getPatientRecord(tenantId, patientUuid),
      this.getPatientBirthDetails(tenantId, patientUuid),
      this.getPatientEducation(tenantId, patientUuid),
      this.listPatientAddresses(tenantId, patientUuid),
      this.getPatientRelationships(tenantId, patientUuid),
      this.listPatientInsurances(tenantId, patientUuid),
      this.getPatientAccess(tenantId, patientUuid),
      this.getPatientActivitySummary(tenantId, patientUuid),
    ]);
    return {
      profile,
      documents,
      phones,
      record,
      birth,
      education,
      addresses,
      relationships,
      insurances,
      access,
      activity,
    };
  }
}

export function createPatientSupabaseRepository(
  deps: PatientSupabaseRepositoryDeps = {},
): PatientSupabaseRepository {
  return new PatientSupabaseRepository(deps);
}

export const patientSupabaseRepository = new PatientSupabaseRepository();
