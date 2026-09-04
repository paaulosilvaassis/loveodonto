/**
 * Ponte controlada entre patientService (legado IDB) e patientRepository V3.
 * CLOUD.3 — shadow read + dual-write gated by flags (default OFF).
 */
import { normalizeTenantId } from './tenantIsolation.js';
import { createPatientRepository } from '../repositories/patient/patientRepository.ts';
import {
  getPatientRepositoryFlags,
  isPatientsDualWriteEnabled,
  isPatientsReadPrimaryEnabled,
  isPatientsWriteEnabled,
  shouldRunPatientsShadowRead,
} from '../repositories/patient/patientRepositoryFlags.ts';
import {
  registerPatientRemoteCreate,
  registerPatientRemoteGet,
  registerPatientRemoteList,
  registerPatientRemoteSoftDelete,
  registerPatientRemoteUpdate,
} from '../repositories/patient/patientAdminApiRepository.ts';
import {
  createPatientRemote,
  fetchPatientRemote,
  fetchPatientsRemote,
  softDeletePatientRemote,
  updatePatientRemote,
} from './patientPatientsApi.js';

/** @type {import('../repositories/patient/patientRepositoryFlags.ts').PatientRepositoryFlagsInput | null} */
let flagsInputOverride = null;

/** @type {(() => import('../repositories/patient/patientRepository.ts').PatientRepository) | null} */
let repositoryFactoryOverride = null;

let remoteClientsRegistered = false;

function ensureRemoteClientsRegistered() {
  if (remoteClientsRegistered) return;
  remoteClientsRegistered = true;
  registerPatientRemoteList(async (_tenantId, filters) => fetchPatientsRemote(filters));
  registerPatientRemoteGet(async (_tenantId, ref) => fetchPatientRemote(ref));
  registerPatientRemoteCreate(async (_tenantId, dto) => createPatientRemote(dto));
  registerPatientRemoteUpdate(async (_tenantId, ref, dto) => updatePatientRemote(ref, dto));
  registerPatientRemoteSoftDelete(async (_tenantId, ref) => softDeletePatientRemote(ref));
}

/**
 * Apenas testes — injeta overrides de flags.
 * @param {import('../repositories/patient/patientRepositoryFlags.ts').PatientRepositoryFlagsInput | null} input
 */
export function __setPatientServiceBridgeFlagsForTest(input) {
  flagsInputOverride = input;
}

/**
 * Apenas testes — injeta factory do repository.
 * @param {(() => import('../repositories/patient/patientRepository.ts').PatientRepository) | null} factory
 */
export function __setPatientRepositoryFactoryForTest(factory) {
  repositoryFactoryOverride = factory;
}

/** @returns {import('../repositories/patient/patientRepositoryFlags.ts').PatientRepositoryFlagsInput} */
function bridgeFlagsInput() {
  return flagsInputOverride ?? {};
}

function getRepository() {
  ensureRemoteClientsRegistered();
  const factory = repositoryFactoryOverride ?? createPatientRepository;
  return factory({ flagsInput: bridgeFlagsInput() });
}

export function getPatientRepositoryForRead() {
  return getRepository();
}

export function shouldUsePatientRepositoryRead() {
  return isPatientsReadPrimaryEnabled(bridgeFlagsInput());
}

export function shouldUsePatientRepositoryWrite() {
  return isPatientsWriteEnabled(bridgeFlagsInput())
    && isPatientsDualWriteEnabled(bridgeFlagsInput());
}

export function shouldRunPatientShadowRead() {
  return shouldRunPatientsShadowRead(bridgeFlagsInput());
}

/**
 * Shadow compare fire-and-forget. Fail closed — nunca propaga erro à UI.
 * @param {string} tenantId
 */
export function schedulePatientShadowRead(tenantId) {
  if (!shouldRunPatientShadowRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  // Fail closed: remote exige UUID SaaS
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return;
  }
  queueMicrotask(() => {
    void getRepository().compareIdbVsRemote(normalized).catch((err) => {
      if (import.meta.env?.DEV) {
        console.debug('[PATIENT_SHADOW] skipped:', err instanceof Error ? err.message : err);
      }
    });
  });
}

export function getPatientRepositoryFlagsForBridge() {
  return getPatientRepositoryFlags(bridgeFlagsInput());
}
