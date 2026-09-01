import { normalizeText } from './helpers.js';

export const PATIENT_IDENTITY_FIELDS = Object.freeze(['full_name', 'nickname', 'social_name']);
export const PATIENT_IDENTITY_SAVE_BLOCKED = 'PATIENT_IDENTITY_SAVE_BLOCKED';
export const LEGAL_IDENTITY_INCONSISTENT = 'LEGAL_IDENTITY_INCONSISTENT';

export function normalizeIdentityName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function identityError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function listDirtyIdentityFields(originalProfile, draftProfile) {
  return PATIENT_IDENTITY_FIELDS.filter((field) => (
    normalizeIdentityName(originalProfile?.[field]) !== normalizeIdentityName(draftProfile?.[field])
  ));
}

export function assertCadastroIdentitySaveAllowed({ routePatientId, draft, livePatient = null }) {
  const boundId = draft?.__patientId || null;
  const ready = draft?.__identityReady === true;
  if (routePatientId) {
    if (!ready) {
      throw identityError(
        PATIENT_IDENTITY_SAVE_BLOCKED,
        'Cadastro do paciente ainda não foi carregado. O salvamento foi bloqueado.',
      );
    }
    if (!boundId || boundId !== routePatientId) {
      throw identityError(
        PATIENT_IDENTITY_SAVE_BLOCKED,
        'O formulário não está vinculado a este paciente. O salvamento foi bloqueado.',
      );
    }
    if (!livePatient) {
      throw identityError(
        PATIENT_IDENTITY_SAVE_BLOCKED,
        'Paciente não encontrado. O salvamento foi bloqueado.',
      );
    }
    return;
  }
  if (boundId) {
    throw identityError(
      PATIENT_IDENTITY_SAVE_BLOCKED,
      'O formulário está vinculado a outro paciente. O salvamento foi bloqueado.',
    );
  }
}

export function normalizeAuditReason(reason) {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  return trimmed || null;
}

export function buildIdentityChangeAudit({
  patientId,
  actorId,
  source = null,
  reason = null,
  beforePatient,
  afterPatient,
}) {
  const changedFields = PATIENT_IDENTITY_FIELDS.filter((field) => (
    normalizeIdentityName(beforePatient?.[field]) !== normalizeIdentityName(afterPatient?.[field])
  ));
  const before = {};
  const after = {};
  for (const field of changedFields) {
    before[field] = normalizeIdentityName(beforePatient?.[field]);
    after[field] = normalizeIdentityName(afterPatient?.[field]);
  }
  return {
    patientId,
    actorId,
    userId: actorId,
    source: source || null,
    reason: normalizeAuditReason(reason),
    changedFields,
    before,
    after,
  };
}

export function resolveIdentityFieldValue(field, payload, base, dirtyIdentityFields) {
  if (Array.isArray(dirtyIdentityFields)) {
    if (!dirtyIdentityFields.includes(field)) {
      return normalizeText(base?.[field]);
    }
    return normalizeText(payload?.[field] ?? '');
  }
  return normalizeText(payload?.[field] ?? base?.[field]);
}

export function assertLegalPatientIdentityConsistency({
  patientId,
  liveFullName,
  snapshotFullName,
  recipientPatientName,
  requireLiveAndSnapshot = false,
}) {
  if (!patientId) {
    throw identityError(
      LEGAL_IDENTITY_INCONSISTENT,
      'Identidade jurídica inconsistente: patientId ausente.',
    );
  }
  const live = normalizeIdentityName(liveFullName);
  const snap = normalizeIdentityName(snapshotFullName);
  const recipientProvided = recipientPatientName !== undefined && recipientPatientName !== null;
  const recipient = recipientProvided ? normalizeIdentityName(recipientPatientName) : null;

  if (requireLiveAndSnapshot) {
    if (!live || !snap) {
      throw identityError(
        LEGAL_IDENTITY_INCONSISTENT,
        'Identidade jurídica inconsistente: nome canônico ou snapshot ausente.',
      );
    }
    if (live !== snap) {
      throw identityError(
        LEGAL_IDENTITY_INCONSISTENT,
        'Identidade jurídica inconsistente: nome canônico e snapshot divergem.',
      );
    }
    return;
  }

  if (recipientProvided && !recipient) {
    throw identityError(
      LEGAL_IDENTITY_INCONSISTENT,
      'Identidade jurídica inconsistente: nome do destinatário ausente.',
    );
  }

  const named = [];
  if (live) named.push(live);
  if (snap) named.push(snap);
  if (recipient) named.push(recipient);
  if (named.length < 2) return;
  const canonical = named[0];
  if (named.some((value) => value !== canonical)) {
    throw identityError(
      LEGAL_IDENTITY_INCONSISTENT,
      'Identidade jurídica inconsistente: fontes do mesmo fluxo divergem.',
    );
  }
}
