/**
 * @module repositories/clinicProfile/clinicProfileRepositorySync
 * @description Helpers de sync/hydrate e detecção offline.
 */

import { syncTenantClinicProfileToLocalDb } from '../../services/tenantClinicProfileSync.js';
import type { ClinicProfileCore } from './clinicProfileTypes.js';
import type { IClinicProfileCache } from './clinicProfileTypes.js';
import { mapCoreToLegacyRow, mapServerProfileToCore } from './clinicProfileMapper.js';

export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

export function isRemoteReadUnavailableError(error: unknown): boolean {
  if (isBrowserOffline()) return true;
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('fetch failed')
    || message.includes('network request failed')
    || message.includes('load failed')
    || message.includes('tempo esgotado')
    || message.includes('não foi possível conectar')
  );
}

export function hydrateClinicProfileIdbCache(
  serverProfile: Record<string, unknown> | null | undefined,
  tenantId: string,
  cache: IClinicProfileCache,
): ClinicProfileCore | null {
  const tid = String(tenantId || '').trim();
  if (!tid || !serverProfile) return null;

  syncTenantClinicProfileToLocalDb(serverProfile, tid);

  const core = mapServerProfileToCore(serverProfile);
  if (core) {
    cache.set(tid, core);
  }
  return core;
}

export function compareClinicProfileShapes(
  idbCore: ClinicProfileCore | null,
  remoteCore: ClinicProfileCore | null,
): Record<string, unknown> {
  const diffs: Array<{ field: string; indexedDb: unknown; remote: unknown }> = [];
  if (!idbCore && !remoteCore) {
    return { match: true, diffs: [] };
  }
  if (!idbCore || !remoteCore) {
    return {
      match: false,
      diffs: [{ field: 'presence', indexedDb: Boolean(idbCore), remote: Boolean(remoteCore) }],
    };
  }

  const fields: Array<keyof ClinicProfileCore> = [
    'name', 'fantasyName', 'legalName', 'email', 'logoUrl', 'status',
  ];
  for (const field of fields) {
    if (String(idbCore[field] ?? '') !== String(remoteCore[field] ?? '')) {
      diffs.push({ field, indexedDb: idbCore[field], remote: remoteCore[field] });
    }
  }

  return { match: diffs.length === 0, diffs };
}

export function logClinicProfileReadDev(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[CLINIC_PROFILE_READ]', event, payload);
}

export function logClinicProfileWriteDev(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[CLINIC_PROFILE_WRITE]', event, payload);
}

export { mapCoreToLegacyRow };
