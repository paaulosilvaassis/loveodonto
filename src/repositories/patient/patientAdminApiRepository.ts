/**
 * @module repositories/patient/patientAdminApiRepository
 * @description Leitura/escrita remota via Admin API — CLOUD.3.
 */

import type {
  IPatientAdminApiClient,
  PatientCore,
  PatientCreateCoreDto,
  PatientListFilters,
  PatientUpdateCoreDto,
} from './patientTypes.js';

export type PatientRemoteListFn = (
  tenantId: string,
  filters?: PatientListFilters,
) => Promise<PatientCore[]>;

export type PatientRemoteGetFn = (
  tenantId: string,
  legacyId: string,
) => Promise<PatientCore | null>;

export type PatientRemoteCreateFn = (
  tenantId: string,
  dto: PatientCreateCoreDto,
) => Promise<PatientCore | null>;

export type PatientRemoteUpdateFn = (
  tenantId: string,
  legacyId: string,
  dto: PatientUpdateCoreDto,
) => Promise<PatientCore | null>;

export type PatientRemoteSoftDeleteFn = (
  tenantId: string,
  legacyId: string,
) => Promise<boolean>;

export function createPatientAdminApiRepository(
  listFn: PatientRemoteListFn,
  getFn: PatientRemoteGetFn,
  createFn?: PatientRemoteCreateFn,
  updateFn?: PatientRemoteUpdateFn,
  softDeleteFn?: PatientRemoteSoftDeleteFn,
): IPatientAdminApiClient {
  return {
    async listPatients(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid) return [];
      return listFn(tid, filters);
    },
    async getPatient(tenantId, legacyId) {
      const tid = String(tenantId || '').trim();
      const needle = String(legacyId || '').trim();
      if (!tid || !needle) return null;
      return getFn(tid, needle);
    },
    async createPatient(tenantId, dto) {
      const tid = String(tenantId || '').trim();
      if (!tid || !createFn) return null;
      return createFn(tid, dto);
    },
    async updatePatient(tenantId, legacyId, dto) {
      const tid = String(tenantId || '').trim();
      const ref = String(legacyId || '').trim();
      if (!tid || !ref || !updateFn) return null;
      return updateFn(tid, ref, dto);
    },
    async softDeletePatient(tenantId, legacyId) {
      const tid = String(tenantId || '').trim();
      const ref = String(legacyId || '').trim();
      if (!tid || !ref || !softDeleteFn) return false;
      return softDeleteFn(tid, ref);
    },
  };
}

let defaultListFn: PatientRemoteListFn | null = null;
let defaultGetFn: PatientRemoteGetFn | null = null;
let defaultCreateFn: PatientRemoteCreateFn | null = null;
let defaultUpdateFn: PatientRemoteUpdateFn | null = null;
let defaultSoftDeleteFn: PatientRemoteSoftDeleteFn | null = null;

export function registerPatientRemoteList(fn: PatientRemoteListFn): void {
  defaultListFn = fn;
}

export function registerPatientRemoteGet(fn: PatientRemoteGetFn): void {
  defaultGetFn = fn;
}

export function registerPatientRemoteCreate(fn: PatientRemoteCreateFn): void {
  defaultCreateFn = fn;
}

export function registerPatientRemoteUpdate(fn: PatientRemoteUpdateFn): void {
  defaultUpdateFn = fn;
}

export function registerPatientRemoteSoftDelete(fn: PatientRemoteSoftDeleteFn): void {
  defaultSoftDeleteFn = fn;
}

export function isPatientAdminApiRegistered(): boolean {
  return Boolean(defaultListFn && defaultGetFn);
}

export function __resetPatientAdminApiRegistrationForTest(): void {
  defaultListFn = null;
  defaultGetFn = null;
  defaultCreateFn = null;
  defaultUpdateFn = null;
  defaultSoftDeleteFn = null;
}

export function getDefaultPatientAdminApiClient(): IPatientAdminApiClient {
  const listFn = defaultListFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[PATIENT] remote list não registrado');
      }
      return [];
    });
  const getFn = defaultGetFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[PATIENT] remote get não registrado');
      }
      return null;
    });
  const createFn = defaultCreateFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[PATIENT] remote create não registrado');
      }
      return null;
    });
  const updateFn = defaultUpdateFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[PATIENT] remote update não registrado');
      }
      return null;
    });
  const softDeleteFn = defaultSoftDeleteFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[PATIENT] remote softDelete não registrado');
      }
      return false;
    });
  return createPatientAdminApiRepository(listFn, getFn, createFn, updateFn, softDeleteFn);
}
