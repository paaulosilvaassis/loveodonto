/**
 * Adapter de leitura Pacientes — CLOUD.3.
 * IDB permanece primary; shadow read opcional via flags.
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getPatientRepositoryForRead,
  schedulePatientShadowRead,
  shouldUsePatientRepositoryRead,
} from './patientRepositoryBridge.js';

/**
 * Agenda shadow read pós-leitura IDB (fire-and-forget).
 * @param {string} tenantId
 */
export { schedulePatientShadowRead };

/**
 * Lista síncrona legada — READ_PRIMARY via repository (futuro).
 * Retorna null quando flags off.
 * @param {import('../repositories/patient/patientTypes.ts').PatientListFilters} [filters]
 */
export function readListPatients(filters = {}) {
  schedulePatientShadowRead(filters.tenantId);
  if (!shouldUsePatientRepositoryRead()) return null;
  return getPatientRepositoryForRead().listLegacySync(filters);
}

/**
 * Detalhe síncrono legado.
 * @param {string} patientId
 * @param {string} [tenantId]
 */
export function readGetPatient(patientId, tenantId = '') {
  schedulePatientShadowRead(tenantId);
  if (!shouldUsePatientRepositoryRead()) return null;
  return getPatientRepositoryForRead().getLegacyProfileSync(patientId);
}

/** Apenas testes — expõe compare shadow. */
export async function __comparePatientIdbVsRemoteForTest(tenantId) {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return null;
  return getPatientRepositoryForRead().compareIdbVsRemote(normalized);
}
