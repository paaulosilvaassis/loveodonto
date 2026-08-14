/**
 * SSOT da identidade autenticada do signatário clínico.
 * Permissão/admin/master NÃO concede o direito de assinar em nome de outra pessoa.
 */
import { loadDb } from '../db/index.js';
import { CLINICAL_SIGNER_ROLE, mapLegacySignerRole } from './clinicalRequiredSigners.js';

export const SIGNER_IDENTITY_ERROR = {
  MISMATCH: 'SIGNER_IDENTITY_MISMATCH',
  UNAUTHENTICATED: 'SIGNER_UNAUTHENTICATED',
  NO_PERSON: 'SIGNER_PERSON_UNRESOLVED',
  TENANT_MISMATCH: 'SIGNER_TENANT_MISMATCH',
  CONTEXT_MISMATCH: 'SIGNER_CONTEXT_MISMATCH',
  AMBIGUOUS: 'SIGNER_IDENTITY_AMBIGUOUS',
};

export const AUTHENTICATED_IDENTITY_ROLES = new Set([
  CLINICAL_SIGNER_ROLE.PROFESSIONAL,
  CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE,
]);

export const OPERATOR_COLLECTED_ROLES = new Set([
  CLINICAL_SIGNER_ROLE.PATIENT,
  CLINICAL_SIGNER_ROLE.LEGAL_GUARDIAN,
  CLINICAL_SIGNER_ROLE.FINANCIAL_RESPONSIBLE,
  CLINICAL_SIGNER_ROLE.WITNESS,
]);

export class SignerIdentityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SignerIdentityError';
    this.code = code;
  }
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function storedEmailForUser(db, userId) {
  const userRow = (db.users || []).find((u) => u.id === userId);
  const profile = (db.users_profile || []).find((p) => p.id === userId);
  const auth = (db.userAuth || []).find((r) => r.userId === userId);
  return norm(userRow?.email || profile?.email || auth?.email || '');
}

function membershipAllowsTenant(db, userId, tenantId) {
  if (!tenantId) return true;
  const rows = (db.memberships || []).filter((m) => (m.tenant_id || m.tenantId) === tenantId);
  if (!rows.length) return true;
  const mine = rows.find((m) => (m.user_id || m.userId) === userId);
  if (!mine) return false;
  if (mine.has_system_access === false) return false;
  if (mine.status && mine.status !== 'active') return false;
  return true;
}

function isSaasSyntheticPersonId(personId, userId) {
  return Boolean(userId) && String(personId || '') === `col-saas-${userId}`;
}

/** Canonical RH + col-saas-{authUserId} no mesmo usuário = FAIL CLOSED. */
export function hasDuplicateSignerIdentityAmbiguity(userId, linkedPersonIds = []) {
  const ids = [...new Set((linkedPersonIds || []).filter(Boolean))];
  if (ids.length < 2) return false;
  return ids.some((id) => isSaasSyntheticPersonId(id, userId))
    && ids.some((id) => !isSaasSyntheticPersonId(id, userId));
}

/**
 * authenticatedUserId → membership → collaborator → canonical personIds.
 * Não confia em user.collaboratorId / email do payload sem vínculo persistido.
 */
export function resolveAuthenticatedSignerIdentity(user) {
  const userId = user?.id || user?.userId || null;
  if (!userId) {
    return { ok: false, code: SIGNER_IDENTITY_ERROR.UNAUTHENTICATED, personId: null, linkedPersonIds: [] };
  }
  const db = loadDb();
  const tenantId = user.tenantId || user.tenant_id || null;
  if (tenantId && !membershipAllowsTenant(db, userId, tenantId)) {
    return { ok: false, code: SIGNER_IDENTITY_ERROR.TENANT_MISMATCH, personId: null, linkedPersonIds: [] };
  }

  const linked = new Set();
  for (const access of db.collaboratorAccess || []) {
    if (access.userId === userId && access.collaboratorId) linked.add(access.collaboratorId);
  }
  const canonicalEmail = storedEmailForUser(db, userId);
  for (const row of db.userAuth || []) {
    const emailHit = canonicalEmail && norm(row.email) === canonicalEmail;
    if ((row.userId === userId || emailHit) && row.collaboratorId) linked.add(row.collaboratorId);
  }
  for (const col of db.collaborators || []) {
    if (col.userId === userId || col.authUserId === userId || col.user_id === userId) linked.add(col.id);
    if (canonicalEmail && norm(col.email) === canonicalEmail) linked.add(col.id);
  }
  const saas = (db.collaborators || []).find((c) => c.id === `col-saas-${userId}`);
  if (saas) linked.add(saas.id);

  const claimed = user.collaboratorId || user.collaborator_id || null;
  if (claimed && !linked.has(claimed)) {
    return {
      ok: false,
      code: SIGNER_IDENTITY_ERROR.MISMATCH,
      personId: null,
      linkedPersonIds: [],
      authenticatedUserId: userId,
      tenantId,
    };
  }

  const linkedPersonIds = [...linked];
  if (!linkedPersonIds.length) {
    return {
      ok: false,
      code: SIGNER_IDENTITY_ERROR.NO_PERSON,
      personId: null,
      linkedPersonIds: [],
      authenticatedUserId: userId,
      tenantId,
    };
  }
  if (hasDuplicateSignerIdentityAmbiguity(userId, linkedPersonIds)) {
    return {
      ok: false,
      code: SIGNER_IDENTITY_ERROR.AMBIGUOUS,
      personId: null,
      linkedPersonIds,
      authenticatedUserId: userId,
      tenantId,
    };
  }

  const primaryPersonId = claimed && linked.has(claimed) ? claimed : linkedPersonIds[0];
  const primary = (db.collaborators || []).find((c) => c.id === primaryPersonId) || null;
  const colTenant = primary?.tenant_id || primary?.tenantId || null;
  if (tenantId && colTenant && colTenant !== tenantId) {
    return { ok: false, code: SIGNER_IDENTITY_ERROR.TENANT_MISMATCH, personId: null, linkedPersonIds: [] };
  }

  return {
    ok: true,
    authenticatedUserId: userId,
    tenantId: tenantId || colTenant || null,
    collaboratorId: primaryPersonId,
    personId: primaryPersonId,
    linkedPersonIds,
    name: primary?.nomeCompleto || primary?.name || '',
  };
}

export function isAuthenticatedIdentityRole(signerRole) {
  return AUTHENTICATED_IDENTITY_ROLES.has(mapLegacySignerRole(signerRole));
}

export function isOperatorCollectedRole(signerRole) {
  return OPERATOR_COLLECTED_ROLES.has(mapLegacySignerRole(signerRole));
}

export function canAuthenticatedUserSignSlot(user, slot) {
  const role = mapLegacySignerRole(slot?.role);
  if (slot?.status === 'signed') {
    return { canSignElectronically: false, reason: 'already_signed' };
  }
  if (isOperatorCollectedRole(role)) {
    return {
      canSignElectronically: true,
      method: 'OPERATOR_COLLECTED_PRESENCE',
      waitingLabel: null,
    };
  }
  if (!isAuthenticatedIdentityRole(role)) {
    return { canSignElectronically: false, reason: 'unknown_role' };
  }
  const identity = resolveAuthenticatedSignerIdentity(user);
  const waitingLabel = role === CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE
    ? 'Aguardando assinatura do responsável técnico'
    : 'Aguardando assinatura da profissional';
  if (!identity.ok || !slot?.personId || !identity.linkedPersonIds.includes(slot.personId)) {
    return {
      canSignElectronically: false,
      code: identity.ok ? SIGNER_IDENTITY_ERROR.MISMATCH : identity.code,
      method: 'AUTHENTICATED_ELECTRONIC',
      waitingLabel,
      identity,
    };
  }
  return {
    canSignElectronically: true,
    method: 'AUTHENTICATED_ELECTRONIC',
    waitingLabel: null,
    identity,
  };
}

export function assertAuthenticatedSignerForStroke(user, {
  signerRole,
  signerPersonId,
  tenantId = null,
  expectedAppointmentId = null,
  expectedBudgetId = null,
  expectedPatientId = null,
  contract = null,
} = {}) {
  const role = mapLegacySignerRole(signerRole);
  if (expectedAppointmentId && contract?.quoteId && contract.quoteId !== expectedAppointmentId) {
    throw new SignerIdentityError(SIGNER_IDENTITY_ERROR.CONTEXT_MISMATCH, 'Contrato não pertence a este atendimento.');
  }
  if (expectedBudgetId && contract?.budgetId && contract.budgetId !== expectedBudgetId) {
    throw new SignerIdentityError(SIGNER_IDENTITY_ERROR.CONTEXT_MISMATCH, 'Contrato não pertence a este orçamento.');
  }
  if (expectedPatientId && contract?.patientId && contract.patientId !== expectedPatientId) {
    throw new SignerIdentityError(SIGNER_IDENTITY_ERROR.CONTEXT_MISMATCH, 'Contrato não pertence a este paciente.');
  }
  if (tenantId && contract?.tenant_id && contract.tenant_id !== tenantId) {
    throw new SignerIdentityError(SIGNER_IDENTITY_ERROR.TENANT_MISMATCH, 'Contrato não pertence a este tenant.');
  }

  if (isOperatorCollectedRole(role)) {
    const identity = resolveAuthenticatedSignerIdentity(user);
    return {
      ok: true,
      method: 'OPERATOR_COLLECTED_PRESENCE',
      identity: identity.ok ? identity : { authenticatedUserId: user?.id || null, linkedPersonIds: [] },
    };
  }

  if (!isAuthenticatedIdentityRole(role)) {
    throw new SignerIdentityError(SIGNER_IDENTITY_ERROR.MISMATCH, 'Papel de signatário não autorizado para assinatura eletrônica.');
  }

  const identity = resolveAuthenticatedSignerIdentity(user);
  if (!identity.ok) {
    throw new SignerIdentityError(
      identity.code || SIGNER_IDENTITY_ERROR.NO_PERSON,
      'A identidade autenticada não corresponde ao signatário exigido.',
    );
  }
  if (!signerPersonId || !identity.linkedPersonIds.includes(signerPersonId)) {
    throw new SignerIdentityError(
      SIGNER_IDENTITY_ERROR.MISMATCH,
      'A identidade autenticada não corresponde ao signatário exigido.',
    );
  }
  return { ok: true, method: 'AUTHENTICATED_ELECTRONIC', identity };
}

/**
 * Resolução/guard READ-ONLY. Não grava signature evidence.
 * decision: ALLOW | DENY | BLOCKED
 */
export function decideAuthenticatedProfessionalSignature(user, requiredSigner = {}) {
  const identity = resolveAuthenticatedSignerIdentity(user);
  const requiredPersonId = requiredSigner?.personId || null;
  const identityMatch = Boolean(
    identity.ok
    && requiredPersonId
    && (identity.linkedPersonIds || []).includes(requiredPersonId),
  );
  let decision = 'DENY';
  if (identity.code === SIGNER_IDENTITY_ERROR.AMBIGUOUS) decision = 'BLOCKED';
  else if (identityMatch) decision = 'ALLOW';
  return {
    authenticatedUserId: identity.authenticatedUserId || user?.id || user?.userId || null,
    linkedPersonIds: identity.linkedPersonIds || [],
    requiredSignerPersonId: requiredPersonId,
    identityMatch,
    decision,
    code: identity.ok ? null : (identity.code || SIGNER_IDENTITY_ERROR.NO_PERSON),
  };
}
