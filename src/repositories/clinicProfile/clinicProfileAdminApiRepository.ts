/**
 * @module repositories/clinicProfile/clinicProfileAdminApiRepository
 * @description Leitura/escrita remota via Admin API (tenant-context / clinic-profile).
 */

import type {
  ClinicProfileUpdateCoreDto,
  IClinicProfileAdminApiClient,
  IClinicProfileAdminApiReader,
} from './clinicProfileTypes.js';

export type ClinicProfileRemoteFetchFn = (tenantId: string) => Promise<Record<string, unknown> | null>;

export type ClinicProfileRemoteSaveFn = (
  tenantId: string,
  payload: ClinicProfileUpdateCoreDto,
) => Promise<Record<string, unknown> | null>;

export function createClinicProfileAdminApiRepository(
  fetchProfile: ClinicProfileRemoteFetchFn,
  saveProfile?: ClinicProfileRemoteSaveFn,
): IClinicProfileAdminApiClient {
  return {
    async fetchProfile(tenantId: string): Promise<Record<string, unknown> | null> {
      const tid = String(tenantId || '').trim();
      if (!tid) return null;
      return fetchProfile(tid);
    },
    async saveProfile(
      tenantId: string,
      payload: ClinicProfileUpdateCoreDto,
    ): Promise<Record<string, unknown> | null> {
      const tid = String(tenantId || '').trim();
      if (!tid || !saveProfile) return null;
      return saveProfile(tid, payload);
    },
  };
}

let defaultFetchFn: ClinicProfileRemoteFetchFn | null = null;
let defaultSaveFn: ClinicProfileRemoteSaveFn | null = null;

export function registerClinicProfileRemoteFetch(fn: ClinicProfileRemoteFetchFn): void {
  defaultFetchFn = fn;
}

export function registerClinicProfileRemoteSave(fn: ClinicProfileRemoteSaveFn): void {
  defaultSaveFn = fn;
}

export function getDefaultClinicProfileAdminApiClient(): IClinicProfileAdminApiClient {
  const fetchFn = defaultFetchFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[CLINIC_PROFILE] remote fetch não registrado');
      }
      return null;
    });
  const saveFn = defaultSaveFn
    ?? (async () => {
      if (import.meta.env?.DEV) {
        console.debug('[CLINIC_PROFILE] remote save não registrado');
      }
      return null;
    });
  return createClinicProfileAdminApiRepository(fetchFn, saveFn);
}

/** @deprecated Use getDefaultClinicProfileAdminApiClient */
export function getDefaultClinicProfileAdminApiReader(): IClinicProfileAdminApiReader {
  return getDefaultClinicProfileAdminApiClient();
}
