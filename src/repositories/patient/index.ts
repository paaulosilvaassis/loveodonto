/**
 * @module repositories/patient
 * @description Barrel **público controlado** — Repository Pacientes Love Odonto V3.
 *
 * ## Phase 9.4A Wave 1 — uso restrito
 *
 * Este módulo é scaffold de fundação. **Telas, services, hooks e contexts
 * atuais NÃO devem importar daqui** até ticket explícito de integração
 * (dual-write / read cutover).
 *
 * IndexedDB permanece SSOT. Flags default = false.
 *
 * ## O que exportar (consumidores futuros autorizados)
 *
 * - Facade: `patientRepository`, `createPatientRepository`
 * - Tipos: `PatientCore`, DTOs, `IPatientRepository`
 * - Erros públicos de domínio
 *
 * ## O que NÃO é exportado (implementação interna)
 *
 * - Flags (`patientRepositoryFlags.ts`)
 * - Mapper, IndexedDB/Supabase sub-repositories
 *
 * @see supabase/migrations/025_app_patients_core.sql
 * @see supabase/migrations/027_app_patient_details.sql
 */

export {
  createPatientRepository,
  patientRepository,
} from './patientRepository.js';

export type { PatientRepositoryReadiness } from './patientRepository.js';

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
} from './patientTypes.js';

export {
  PatientNotFoundError,
  PatientRepositoryNotImplementedError,
  PatientRepositoryRemoteReadDisabledError,
  PatientRepositoryRemoteWriteDisabledError,
  PatientRepositorySupabaseUnavailableError,
} from './patientTypes.js';
