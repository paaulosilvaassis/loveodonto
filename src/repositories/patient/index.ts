/**
 * @module repositories/patient
 * @description Barrel **público controlado** — Repository Pacientes Love Odonto V3.
 *
 * ## CLOUD.3 — wiring controlado
 *
 * Facade + shadow helpers exportados. IndexedDB permanece SSOT.
 * Flags default = false + production lock. Dual-write off.
 *
 * ## O que exportar
 *
 * - Facade: `patientRepository`, `createPatientRepository`
 * - Tipos: `PatientCore`, DTOs, `IPatientRepository`
 * - Shadow: compare helpers
 * - Erros públicos de domínio
 *
 * @see supabase/migrations/025_app_patients_core.sql
 * @see supabase/migrations/027_app_patient_details.sql
 */

export {
  createPatientRepository,
  patientRepository,
} from './patientRepository.js';

export type { PatientRepositoryReadiness } from './patientRepository.js';

export {
  buildPatientShadowReport,
  comparePatientPair,
  logPatientShadowReport,
  normalizePatientForCompare,
} from './patientShadowCompare.js';

export type {
  PatientBundleCore,
  PatientBundleFull,
  PatientCore,
  PatientCreateCoreDto,
  PatientDocumentsCore,
  PatientGetResult,
  PatientIndexedDbRow,
  PatientListFilters,
  PatientListResult,
  PatientPhoneCore,
  PatientRecordCore,
  PatientRef,
  PatientRepositoryUser,
  PatientStatus,
  PatientUpdateCoreDto,
  IPatientRepository,
  IPatientAdminApiClient,
} from './patientTypes.js';

export {
  PatientNotFoundError,
  PatientRepositoryNotImplementedError,
  PatientRepositoryRemoteReadDisabledError,
  PatientRepositoryRemoteWriteDisabledError,
  PatientRepositorySupabaseUnavailableError,
} from './patientTypes.js';
