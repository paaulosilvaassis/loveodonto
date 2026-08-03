/**
 * @module repositories/agenda/agendaMapper
 * @description Mapeamento Admin API / Supabase ↔ core ↔ legado IDB.
 */

import type {
  AppointmentCore,
  AppointmentCreateCoreDto,
  AppointmentLegacyRow,
  AppointmentStatus,
  AppointmentUpdateCoreDto,
} from './agendaTypes.js';

const VALID_STATUSES = new Set<AppointmentStatus>([
  'agendado', 'confirmado', 'em_confirmacao', 'chegou', 'em_espera',
  'chamado', 'em_atendimento', 'finalizado', 'atendido', 'atrasado',
  'faltou', 'cancelado', 'reagendar',
]);

function normalizeTenantId(value: unknown): string {
  return String(value || '').trim();
}

function normalizeStatus(value: unknown): AppointmentStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (VALID_STATUSES.has(raw as AppointmentStatus)) return raw as AppointmentStatus;
  return 'agendado';
}

function isUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );
}

/** @param row Registro remoto (futuro Supabase). */
export function mapServerRowToCore(row: Record<string, unknown> | null | undefined): AppointmentCore | null {
  if (!row || typeof row !== 'object') return null;
  const tenantId = normalizeTenantId(row.tenant_id ?? row.tenantId);
  const legacyId = String(row.legacy_id ?? row.id ?? '').trim();
  if (!tenantId || !legacyId) return null;

  const uuid = isUuid(row.id) ? String(row.id).trim() : null;

  return {
    tenantId,
    legacyId,
    uuid,
    patientId: String(row.patient_id ?? row.patientId ?? '').trim() || null,
    leadId: String(row.lead_id ?? row.leadId ?? '').trim() || null,
    professionalId: String(row.professional_id ?? row.professionalId ?? '').trim() || null,
    roomId: String(row.room_id ?? row.roomId ?? '').trim() || null,
    date: String(row.date ?? '').trim(),
    startTime: String(row.start_time ?? row.startTime ?? '').trim(),
    endTime: String(row.end_time ?? row.endTime ?? '').trim(),
    durationMinutes: Number(row.duration_minutes ?? row.durationMinutes ?? 0) || 0,
    slotCapacity: Number(row.slot_capacity ?? row.slotCapacity ?? 1) === 2 ? 2 : 1,
    status: normalizeStatus(row.status),
    procedureName: String(row.procedure_name ?? row.procedureName ?? '').trim(),
    channel: String(row.channel ?? '').trim(),
    notes: String(row.notes ?? '').trim(),
    checkInAt: row.check_in_at ?? row.checkInAt ? String(row.check_in_at ?? row.checkInAt) : null,
    finishedAt: row.finished_at ?? row.finishedAt ? String(row.finished_at ?? row.finishedAt) : null,
  };
}

export function mapLegacyRowToCore(row: AppointmentLegacyRow | null): AppointmentCore | null {
  if (!row?.id) return null;
  const tenantId = normalizeTenantId(row.tenant_id);
  if (!tenantId) return null;

  return {
    tenantId,
    legacyId: String(row.id).trim(),
    uuid: isUuid(row.id) ? String(row.id).trim() : null,
    patientId: String(row.patientId || '').trim() || null,
    leadId: String(row.leadId || '').trim() || null,
    professionalId: String(row.professionalId || row.dentistId || '').trim() || null,
    roomId: String(row.roomId || row.consultorioId || '').trim() || null,
    date: String(row.date || '').trim(),
    startTime: String(row.startTime || '').trim(),
    endTime: String(row.endTime || '').trim(),
    durationMinutes: Number(row.durationMinutes ?? 0) || 0,
    slotCapacity: Number(row.slotCapacity ?? 1) === 2 ? 2 : 1,
    status: normalizeStatus(row.status),
    procedureName: String(row.procedureName || '').trim(),
    channel: String(row.channel || '').trim(),
    notes: String(row.notes || '').trim(),
    checkInAt: row.checkInAt ? String(row.checkInAt) : null,
    finishedAt: row.finishedAt ? String(row.finishedAt) : null,
  };
}

export function mapCoreToLegacyRow(core: AppointmentCore): AppointmentLegacyRow {
  return {
    id: core.legacyId,
    tenant_id: core.tenantId,
    patientId: core.patientId,
    leadId: core.leadId,
    professionalId: core.professionalId,
    dentistId: core.professionalId,
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

export function mapCoreListToLegacy(rows: AppointmentCore[]): AppointmentLegacyRow[] {
  return rows.map(mapCoreToLegacyRow);
}

export function mapLegacyRowToCreateDto(row: AppointmentLegacyRow): AppointmentCreateCoreDto {
  return {
    legacyId: String(row.id || '').trim(),
    patientId: String(row.patientId || '').trim() || null,
    leadId: String(row.leadId || '').trim() || null,
    professionalId: String(row.professionalId || row.dentistId || '').trim() || null,
    roomId: String(row.roomId || row.consultorioId || '').trim() || null,
    date: String(row.date || '').trim(),
    startTime: String(row.startTime || '').trim(),
    endTime: String(row.endTime || '').trim(),
    durationMinutes: Number(row.durationMinutes ?? 0) || 0,
    slotCapacity: Number(row.slotCapacity ?? 1) === 2 ? 2 : 1,
    status: String(row.status || 'agendado').trim(),
    procedureName: String(row.procedureName || '').trim(),
    channel: String(row.channel || '').trim(),
    notes: String(row.notes || '').trim(),
    insurance: String(row.insurance || '').trim(),
    isReturn: Boolean(row.isReturn),
  };
}

export function mapLegacyRowToUpdateDto(
  row: AppointmentLegacyRow,
  partial: AppointmentUpdateCoreDto = {},
): AppointmentUpdateCoreDto {
  const base = mapLegacyRowToCreateDto(row);
  return {
    patientId: partial.patientId !== undefined ? partial.patientId : base.patientId,
    leadId: partial.leadId !== undefined ? partial.leadId : base.leadId,
    professionalId: partial.professionalId !== undefined ? partial.professionalId : base.professionalId,
    roomId: partial.roomId !== undefined ? partial.roomId : base.roomId,
    date: partial.date ?? base.date,
    startTime: partial.startTime ?? base.startTime,
    endTime: partial.endTime ?? base.endTime,
    durationMinutes: partial.durationMinutes ?? base.durationMinutes,
    slotCapacity: partial.slotCapacity ?? base.slotCapacity,
    status: partial.status ?? base.status,
    procedureName: partial.procedureName ?? base.procedureName,
    channel: partial.channel ?? base.channel,
    notes: partial.notes ?? base.notes,
    insurance: partial.insurance ?? base.insurance,
    isReturn: partial.isReturn ?? base.isReturn,
    cancelReason: partial.cancelReason,
  };
}

export function mapCreateDtoToServerBody(dto: AppointmentCreateCoreDto): Record<string, unknown> {
  return {
    legacy_id: dto.legacyId,
    patient_id: dto.patientId,
    lead_id: dto.leadId,
    professional_id: dto.professionalId,
    room_id: dto.roomId,
    date: dto.date,
    start_time: dto.startTime,
    end_time: dto.endTime,
    duration_minutes: dto.durationMinutes,
    slot_capacity: dto.slotCapacity,
    status: dto.status,
    procedure_name: dto.procedureName,
    channel: dto.channel,
    notes: dto.notes,
    insurance: dto.insurance || '',
    is_return: Boolean(dto.isReturn),
  };
}

export function mapUpdateDtoToServerBody(dto: AppointmentUpdateCoreDto): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (dto.patientId !== undefined) body.patient_id = dto.patientId;
  if (dto.leadId !== undefined) body.lead_id = dto.leadId;
  if (dto.professionalId !== undefined) body.professional_id = dto.professionalId;
  if (dto.roomId !== undefined) body.room_id = dto.roomId;
  if (dto.date !== undefined) body.date = dto.date;
  if (dto.startTime !== undefined) body.start_time = dto.startTime;
  if (dto.endTime !== undefined) body.end_time = dto.endTime;
  if (dto.durationMinutes !== undefined) body.duration_minutes = dto.durationMinutes;
  if (dto.slotCapacity !== undefined) body.slot_capacity = dto.slotCapacity;
  if (dto.status !== undefined) body.status = dto.status;
  if (dto.procedureName !== undefined) body.procedure_name = dto.procedureName;
  if (dto.channel !== undefined) body.channel = dto.channel;
  if (dto.notes !== undefined) body.notes = dto.notes;
  if (dto.insurance !== undefined) body.insurance = dto.insurance;
  if (dto.isReturn !== undefined) body.is_return = dto.isReturn;
  if (dto.cancelReason !== undefined) body.cancel_reason = dto.cancelReason;
  return body;
}
