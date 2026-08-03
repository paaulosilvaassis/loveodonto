/**
 * Adapter de leitura Clinic Profile — Phase 5.5 read cutover.
 * Ponte entre clinicService e clinicProfileRepository.
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getClinicProfileRepositoryForRead,
  scheduleClinicProfileCacheRehydrate,
  shouldUseClinicProfileRepositoryRead,
} from './clinicProfileServiceRepositoryBridge.js';

function scheduleHydrateIfNeeded(sessionTenantId) {
  if (!shouldUseClinicProfileRepositoryRead()) return;
  const tenantId = normalizeTenantId(sessionTenantId)
    || getClinicProfileRepositoryForRead().getProfileSync()?.tenant_id;
  scheduleClinicProfileCacheRehydrate(tenantId);
}

/**
 * Perfil legado síncrono — READ_PRIMARY usa cache pós-hydrate, fallback IDB.
 * @returns {import('../repositories/clinicProfile/clinicProfileTypes.ts').ClinicProfileLegacyRow | null}
 */
export function readGetClinicProfile(sessionTenantId = '') {
  scheduleHydrateIfNeeded(sessionTenantId);
  if (!shouldUseClinicProfileRepositoryRead()) return null;
  return getClinicProfileRepositoryForRead().getProfileSync(sessionTenantId);
}

/**
 * Resumo síncrono para branding — READ_PRIMARY via repository.
 * Retorna null quando flags off (caller usa legado IDB).
 * @param {string} [sessionTenantId]
 */
export function readGetClinicSummary(sessionTenantId = '') {
  scheduleHydrateIfNeeded(sessionTenantId);
  if (!shouldUseClinicProfileRepositoryRead()) return null;
  return getClinicProfileRepositoryForRead().getSummarySync(sessionTenantId);
}

/**
 * Hidratação awaitable — testes e bootstrap explícito.
 * @param {string} tenantId
 */
export async function readHydrateClinicProfileCache(tenantId) {
  if (!shouldUseClinicProfileRepositoryRead()) return { hydrated: 0, skipped: true };
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return { hydrated: 0, skipped: true };
  const hydrated = await getClinicProfileRepositoryForRead().syncCacheFromRemote(normalized);
  return { hydrated, skipped: false };
}

/** Apenas testes — expõe compare shadow. */
export async function __compareClinicProfileIdbVsRemoteForTest(tenantId) {
  return getClinicProfileRepositoryForRead().compareIdbVsRemote(tenantId);
}
