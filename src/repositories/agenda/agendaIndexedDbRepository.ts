/**
 * @module repositories/agenda/agendaIndexedDbRepository
 * @description Leitura legado IndexedDB — Agenda (Phase 5.7 foundation).
 */

import { loadDb } from '../../db/index.js';
import { normalizeTenantId } from '../../services/tenantIsolation.js';
import type {
  AgendaListFilters,
  AppointmentBlockLegacyRow,
  AppointmentLegacyRow,
  IAgendaIndexedDbReader,
} from './agendaTypes.js';

function matchesFilters(row: AppointmentLegacyRow, filters: AgendaListFilters = {}): boolean {
  const tenantId = normalizeTenantId(filters.tenantId);
  if (tenantId) {
    const rowTenant = normalizeTenantId(row.tenant_id);
    if (rowTenant && rowTenant !== tenantId) return false;
  }
  if (filters.date && row.date !== filters.date) return false;
  if (filters.dateFrom && String(row.date) < filters.dateFrom) return false;
  if (filters.dateTo && String(row.date) > filters.dateTo) return false;
  if (filters.professionalId && row.professionalId !== filters.professionalId) return false;
  if (filters.roomId && row.roomId !== filters.roomId) return false;
  if (filters.patientId && row.patientId !== filters.patientId) return false;
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (!statuses.includes(String(row.status || ''))) return false;
  }
  if (filters.search) {
    const q = String(filters.search).trim().toLowerCase();
    const haystack = [
      row.procedureName,
      row.leadDisplayName,
      row.notes,
      row.id,
    ].map((v) => String(v || '').toLowerCase()).join(' ');
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export const agendaIndexedDbRepository: IAgendaIndexedDbReader = {
  listLegacySync(filters = {}): AppointmentLegacyRow[] {
    const db = loadDb();
    return (db.appointments || [])
      .filter((row) => matchesFilters(row as AppointmentLegacyRow, filters))
      .map((row) => ({ ...row })) as AppointmentLegacyRow[];
  },

  getLegacySync(appointmentId: string): AppointmentLegacyRow | null {
    const id = String(appointmentId || '').trim();
    if (!id) return null;
    const db = loadDb();
    const row = (db.appointments || []).find((item) => String(item.id) === id);
    return row ? { ...row } as AppointmentLegacyRow : null;
  },

  listBlocksLegacySync(filters = {}): AppointmentBlockLegacyRow[] {
    const db = loadDb();
    return (db.appointmentBlocks || [])
      .filter((block) => !filters.date || block.date === filters.date)
      .map((block) => ({ ...block })) as AppointmentBlockLegacyRow[];
  },
};

export function getAgendaTenantIdFromDbSync(): string | null {
  const db = loadDb();
  const fromAppointment = normalizeTenantId(db.appointments?.[0]?.tenant_id);
  if (fromAppointment) return fromAppointment;
  return normalizeTenantId(db.clinicProfile?.tenant_id) || null;
}
