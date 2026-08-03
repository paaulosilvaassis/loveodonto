/**
 * @module repositories/agenda/agendaTypes
 * @description Tipos da Repository Layer Agenda V3 — Phase 5.7 foundation.
 */

export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'em_confirmacao'
  | 'chegou'
  | 'em_espera'
  | 'chamado'
  | 'em_atendimento'
  | 'finalizado'
  | 'atendido'
  | 'atrasado'
  | 'faltou'
  | 'cancelado'
  | 'reagendar';

/** Perfil normalizado (futuro Supabase SSOT). */
export interface AppointmentCore {
  tenantId: string;
  legacyId: string;
  uuid: string | null;
  patientId: string | null;
  leadId: string | null;
  professionalId: string | null;
  roomId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  slotCapacity: number;
  status: AppointmentStatus;
  procedureName: string;
  channel: string;
  notes: string;
  checkInAt: string | null;
  finishedAt: string | null;
}

/** Shape legado IndexedDB (`appointments[]`). */
export interface AppointmentLegacyRow {
  id: string;
  tenant_id?: string | null;
  patientId?: string | null;
  leadId?: string | null;
  leadDisplayName?: string | null;
  professionalId?: string | null;
  dentistId?: string | null;
  roomId?: string | null;
  consultorioId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  slotCapacity?: number;
  status: string;
  procedureName?: string;
  insurance?: string;
  channel?: string;
  notes?: string;
  isReturn?: boolean;
  confirmationLogs?: unknown[];
  checkInAt?: string | null;
  calledAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

export interface AppointmentBlockLegacyRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  professionalId?: string | null;
  roomId?: string | null;
  reason?: string;
  [key: string]: unknown;
}

export interface AgendaListFilters {
  tenantId?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  professionalId?: string;
  roomId?: string;
  patientId?: string;
  status?: string | string[];
  search?: string;
}

export type AgendaReadSource =
  | 'admin-api'
  | 'indexeddb'
  | 'indexeddb-offline'
  | 'cache';

export interface AgendaListResult {
  items: AppointmentCore[];
  total: number;
  source: AgendaReadSource;
}

export interface AgendaGetResult {
  core: AppointmentCore | null;
  source: AgendaReadSource;
}

export interface IAgendaIndexedDbReader {
  listLegacySync(filters?: AgendaListFilters): AppointmentLegacyRow[];
  getLegacySync(appointmentId: string): AppointmentLegacyRow | null;
  listBlocksLegacySync(filters?: { date?: string }): AppointmentBlockLegacyRow[];
}

export interface AppointmentUpdateCoreDto {
  patientId?: string | null;
  leadId?: string | null;
  professionalId?: string | null;
  roomId?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  slotCapacity?: number;
  status?: string;
  procedureName?: string;
  channel?: string;
  notes?: string;
  insurance?: string;
  isReturn?: boolean;
  cancelReason?: string;
}

export interface AppointmentCreateCoreDto {
  legacyId: string;
  patientId: string | null;
  leadId: string | null;
  professionalId: string | null;
  roomId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  slotCapacity: number;
  status: string;
  procedureName: string;
  channel: string;
  notes: string;
  insurance?: string;
  isReturn?: boolean;
}

export interface IAgendaAdminApiReader {
  listAppointments(tenantId: string, filters?: AgendaListFilters): Promise<AppointmentCore[]>;
  getAppointment(tenantId: string, ref: string): Promise<AppointmentCore | null>;
}

export interface IAgendaAdminApiWriter {
  createAppointment(tenantId: string, dto: AppointmentCreateCoreDto): Promise<AppointmentCore | null>;
  updateAppointment(
    tenantId: string,
    legacyId: string,
    dto: AppointmentUpdateCoreDto,
  ): Promise<AppointmentCore | null>;
  cancelAppointment(
    tenantId: string,
    legacyId: string,
    reason?: string,
  ): Promise<AppointmentCore | null>;
}

export interface IAgendaAdminApiClient extends IAgendaAdminApiReader, IAgendaAdminApiWriter {}

export interface IAgendaCache {
  get(tenantId: string, ref: string): AppointmentCore | null;
  set(tenantId: string, core: AppointmentCore): void;
  delete(tenantId: string, ref: string): void;
  clearTenant(tenantId: string): void;
  invalidateTenant(tenantId: string, reason?: string): void;
}

export interface IAgendaRepository {
  listLegacySync(filters?: AgendaListFilters): AppointmentLegacyRow[];
  getLegacySync(appointmentId: string): AppointmentLegacyRow | null;
  listBlocksLegacySync(filters?: { date?: string }): AppointmentBlockLegacyRow[];
  listCore(tenantId: string, filters?: AgendaListFilters): Promise<AgendaListResult>;
  getCore(tenantId: string, ref: string): Promise<AgendaGetResult>;
  syncCacheFromRemote(tenantId: string): Promise<number>;
  compareIdbVsRemote(tenantId: string): Promise<Record<string, unknown> | null>;
  createCore(tenantId: string, dto: AppointmentCreateCoreDto): Promise<AppointmentCore>;
  updateCore(
    tenantId: string,
    legacyId: string,
    dto: AppointmentUpdateCoreDto,
  ): Promise<AppointmentCore>;
  cancelCore(tenantId: string, legacyId: string, reason?: string): Promise<AppointmentCore>;
}

export class AgendaRepositoryRemoteWriteDisabledError extends Error {
  readonly code = 'AGENDA_REMOTE_WRITE_DISABLED';

  constructor() {
    super('Escrita remota desabilitada (AGENDA_WRITE=false).');
    this.name = 'AgendaRepositoryRemoteWriteDisabledError';
  }
}

export class AgendaRepositoryRemoteReadDisabledError extends Error {
  readonly code = 'AGENDA_REMOTE_READ_DISABLED';

  constructor() {
    super('Leitura remota desabilitada (AGENDA_READ/AGENDA_READ_PRIMARY=false).');
    this.name = 'AgendaRepositoryRemoteReadDisabledError';
  }
}

export class AgendaNotFoundError extends Error {
  readonly code = 'AGENDA_APPOINTMENT_NOT_FOUND';

  constructor(ref: string) {
    super(`Agendamento não encontrado: ${ref}.`);
    this.name = 'AgendaNotFoundError';
  }
}
