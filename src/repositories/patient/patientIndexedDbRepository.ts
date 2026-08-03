/**
 * @module repositories/patient/patientIndexedDbRepository
 * @description Leitura legado IndexedDB — Pacientes (Phase 9.4A Wave 1).
 * Sem wiring em `patientService.js`. IndexedDB permanece SSOT.
 */

import { loadDb } from '../../db/index.js';
import { normalizeTenantId } from '../../services/tenantIsolation.js';
import type {
  IPatientIndexedDbRepository,
  PatientDocumentsIndexedDbRow,
  PatientIndexedDbRow,
  PatientListFilters,
  PatientPhoneIndexedDbRow,
  PatientRecordIndexedDbRow,
  PatientStatus,
} from './patientTypes.js';

function matchesTenant(row: { tenant_id?: string | null }, tenantId?: string): boolean {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return true;
  const rowTenant = normalizeTenantId(row.tenant_id);
  return !rowTenant || rowTenant === normalized;
}

function matchesStatus(
  rowStatus: unknown,
  filterStatus: PatientStatus | PatientStatus[] | undefined,
): boolean {
  if (!filterStatus) return true;
  const statuses = Array.isArray(filterStatus) ? filterStatus : [filterStatus];
  return statuses.includes((rowStatus === 'inactive' ? 'inactive' : 'active') as PatientStatus);
}

function matchesSearch(row: PatientIndexedDbRow, search?: string): boolean {
  if (!search) return true;
  const q = String(search).trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.full_name,
    row.nickname,
    row.social_name,
    row.cpf,
    row.id,
  ].map((v) => String(v || '').toLowerCase()).join(' ');
  return haystack.includes(q);
}

function matchesCpf(row: PatientIndexedDbRow, cpf?: string): boolean {
  if (!cpf) return true;
  const wanted = String(cpf).replace(/\D/g, '');
  if (!wanted) return true;
  return String(row.cpf || '').replace(/\D/g, '') === wanted;
}

function matchesPatientFilters(row: PatientIndexedDbRow, filters: PatientListFilters = {}): boolean {
  if (!matchesTenant(row, filters.tenantId)) return false;
  if (!matchesStatus(row.status, filters.status)) return false;
  if (!filters.includeBlocked && row.blocked) return false;
  if (!matchesCpf(row, filters.cpf)) return false;
  if (!matchesSearch(row, filters.search)) return false;
  return true;
}

export class PatientIndexedDbRepository implements IPatientIndexedDbRepository {
  listLegacySync(filters: PatientListFilters = {}): PatientIndexedDbRow[] {
    const db = loadDb();
    const patients = Array.isArray(db.patients) ? db.patients : [];
    return patients.filter((row) => matchesPatientFilters(row as PatientIndexedDbRow, filters)) as PatientIndexedDbRow[];
  }

  getLegacyProfileSync(patientId: string): PatientIndexedDbRow | null {
    const id = String(patientId || '').trim();
    if (!id) return null;
    const db = loadDb();
    const patients = Array.isArray(db.patients) ? db.patients : [];
    return (patients.find((row) => row?.id === id) as PatientIndexedDbRow | undefined) || null;
  }

  getLegacyDocumentsSync(patientId: string): PatientDocumentsIndexedDbRow | null {
    const id = String(patientId || '').trim();
    if (!id) return null;
    const db = loadDb();
    const docs = Array.isArray(db.patientDocuments) ? db.patientDocuments : [];
    return (
      (docs.find((row) => row?.patient_id === id) as PatientDocumentsIndexedDbRow | undefined)
      || null
    );
  }

  listLegacyPhonesSync(patientId: string): PatientPhoneIndexedDbRow[] {
    const id = String(patientId || '').trim();
    if (!id) return [];
    const db = loadDb();
    const phones = Array.isArray(db.patientPhones) ? db.patientPhones : [];
    return phones.filter((row) => row?.patient_id === id) as PatientPhoneIndexedDbRow[];
  }

  getLegacyRecordSync(patientId: string): PatientRecordIndexedDbRow | null {
    const id = String(patientId || '').trim();
    if (!id) return null;
    const db = loadDb();
    const records = Array.isArray(db.patientRecords) ? db.patientRecords : [];
    return (
      (records.find((row) => row?.patient_id === id) as PatientRecordIndexedDbRow | undefined)
      || null
    );
  }
}

export const patientIndexedDbRepository = new PatientIndexedDbRepository();
