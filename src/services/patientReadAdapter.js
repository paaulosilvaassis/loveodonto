/**
 * Adapter de leitura Pacientes — CLOUD.3 / CLOUD.6.
 * Defaults: IDB primary. Com READ_PRIMARY: hidrata cache a partir do remote.
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getPatientRepositoryForRead,
  schedulePatientCacheRehydrate,
  schedulePatientShadowRead,
  shouldUsePatientRepositoryRead,
} from './patientRepositoryBridge.js';

/**
 * Agenda shadow read pós-leitura IDB (fire-and-forget).
 * @param {string} tenantId
 */
export { schedulePatientShadowRead, schedulePatientCacheRehydrate };

function scheduleReadPrimaryHydrateIfNeeded(tenantId) {
  if (!shouldUsePatientRepositoryRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  schedulePatientCacheRehydrate(normalized);
}

/**
 * Lista síncrona legada — READ_PRIMARY via cache IDB hidratado do remote.
 * Retorna null quando flags off (caller usa caminho IDB legado).
 * @param {import('../repositories/patient/patientTypes.ts').PatientListFilters} [filters]
 */
export function readListPatients(filters = {}) {
  const tenantId = filters.tenantId || filters.tenant_id;
  scheduleReadPrimaryHydrateIfNeeded(tenantId);
  schedulePatientShadowRead(tenantId);
  if (!shouldUsePatientRepositoryRead()) return null;
  return getPatientRepositoryForRead().listLegacySync(filters);
}

/**
 * Detalhe síncrono legado.
 * @param {string} patientId
 * @param {string} [tenantId]
 */
export function readGetPatient(patientId, tenantId = '') {
  scheduleReadPrimaryHydrateIfNeeded(tenantId);
  schedulePatientShadowRead(tenantId);
  if (!shouldUsePatientRepositoryRead()) return null;
  return getPatientRepositoryForRead().getLegacyProfileSync(patientId);
}

/** Apenas testes — expõe compare shadow. */
export async function __comparePatientsIdbVsRemoteForTest(tenantId) {
  return getPatientRepositoryForRead().compareIdbVsRemote(tenantId);
}
