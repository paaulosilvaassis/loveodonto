/**
 * Barrel público — Phase 9.4A Wave 3A Patient Data Readiness Audit.
 */
export {
  PATIENT_COLLECTIONS,
  LINK_COLLECTIONS,
  CLASSIFICATION,
  mapCollectionInventory,
  auditPatientSnapshot,
  buildBackfillStrategy,
  determineGate,
  isUuid,
  isPatientLegacyId,
  isCpfValid,
  isPlaceholderCpf,
} from './patientDataAuditEngine.mjs';

export {
  onlyDigits,
  hashId,
  maskName,
  maskCpf,
  maskPhone,
  maskEmail,
  sanitizeForReport,
  assertNoRawPiiLeak,
} from './patientDataAuditMask.mjs';

export const AUDIT_CONFIRMATION_ENV = 'LOVE_ODONTO_PATIENT_AUDIT_CONFIRMATION';
export const AUDIT_CONFIRMATION_VALUE = 'LOCAL_READ_ONLY';
export const WAVE3A_REMOTE_ACTIONS_EXECUTED = false;
