/**
 * @module repositories/agenda/agendaAdminApiRepository
 * @description Leitura/escrita remota via Admin API — Phase 5.8/5.9.
 */

import type {
  AgendaListFilters,
  AppointmentCore,
  AppointmentCreateCoreDto,
  AppointmentUpdateCoreDto,
  IAgendaAdminApiClient,
} from './agendaTypes.js';

export type AgendaRemoteListFn = (
  tenantId: string,
  filters?: AgendaListFilters,
) => Promise<AppointmentCore[]>;

export type AgendaRemoteGetFn = (
  tenantId: string,
  ref: string,
) => Promise<AppointmentCore | null>;

export type AgendaRemoteCreateFn = (
  tenantId: string,
  dto: AppointmentCreateCoreDto,
) => Promise<AppointmentCore | null>;

export type AgendaRemoteUpdateFn = (
  tenantId: string,
  legacyId: string,
  dto: AppointmentUpdateCoreDto,
) => Promise<AppointmentCore | null>;

export type AgendaRemoteCancelFn = (
  tenantId: string,
  legacyId: string,
  reason?: string,
) => Promise<AppointmentCore | null>;

export function createAgendaAdminApiRepository(
  listFn: AgendaRemoteListFn,
  getFn: AgendaRemoteGetFn,
  createFn?: AgendaRemoteCreateFn,
  updateFn?: AgendaRemoteUpdateFn,
  cancelFn?: AgendaRemoteCancelFn,
): IAgendaAdminApiClient {
  return {
    async listAppointments(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid) return [];
      return listFn(tid, filters);
    },
    async getAppointment(tenantId, ref) {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle) return null;
      return getFn(tid, needle);
    },
    async createAppointment(tenantId, dto) {
      const tid = String(tenantId || '').trim();
      if (!tid || !createFn) return null;
      return createFn(tid, dto);
    },
    async updateAppointment(tenantId, legacyId, dto) {
      const tid = String(tenantId || '').trim();
      const ref = String(legacyId || '').trim();
      if (!tid || !ref || !updateFn) return null;
      return updateFn(tid, ref, dto);
    },
    async cancelAppointment(tenantId, legacyId, reason) {
      const tid = String(tenantId || '').trim();
      const ref = String(legacyId || '').trim();
      if (!tid || !ref || !cancelFn) return null;
      return cancelFn(tid, ref, reason);
    },
  };
}

let defaultListFn: AgendaRemoteListFn | null = null;
let defaultGetFn: AgendaRemoteGetFn | null = null;
let defaultCreateFn: AgendaRemoteCreateFn | null = null;
let defaultUpdateFn: AgendaRemoteUpdateFn | null = null;
let defaultCancelFn: AgendaRemoteCancelFn | null = null;

export function registerAgendaRemoteList(fn: AgendaRemoteListFn): void {
  defaultListFn = fn;
}

export function registerAgendaRemoteGet(fn: AgendaRemoteGetFn): void {
  defaultGetFn = fn;
}

export function registerAgendaRemoteCreate(fn: AgendaRemoteCreateFn): void {
  defaultCreateFn = fn;
}

export function registerAgendaRemoteUpdate(fn: AgendaRemoteUpdateFn): void {
  defaultUpdateFn = fn;
}

export function registerAgendaRemoteCancel(fn: AgendaRemoteCancelFn): void {
  defaultCancelFn = fn;
}

export function getDefaultAgendaAdminApiReader(): IAgendaAdminApiClient {
  const listFn = defaultListFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[AGENDA] remote list não registrado');
      }
      return [];
    });
  const getFn = defaultGetFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[AGENDA] remote get não registrado');
      }
      return null;
    });
  const createFn = defaultCreateFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[AGENDA] remote create não registrado');
      }
      return null;
    });
  const updateFn = defaultUpdateFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[AGENDA] remote update não registrado');
      }
      return null;
    });
  const cancelFn = defaultCancelFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[AGENDA] remote cancel não registrado');
      }
      return null;
    });
  return createAgendaAdminApiRepository(listFn, getFn, createFn, updateFn, cancelFn);
}
