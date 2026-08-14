/**
 * Inspeção READ-ONLY do vínculo profissional autenticável.
 * Não grava signature evidence e não muta contrato.
 */
import { loadDb } from '../db/index.js';
import {
  resolveAuthenticatedSignerIdentity,
  canAuthenticatedUserSignSlot,
  SIGNER_IDENTITY_ERROR,
} from './authenticatedSignerIdentity.js';
import { CLINICAL_SIGNER_ROLE } from './clinicalRequiredSigners.js';

function inviteState(invites = []) {
  const now = Date.now();
  const accepted = invites.find((i) => i.usedAt || i.acceptedAt);
  if (accepted) return 'accepted';
  const pending = invites.find((i) => !i.usedAt && !i.acceptedAt && (!i.expiresAt || new Date(i.expiresAt).getTime() > now));
  if (pending) return 'pending';
  const expired = invites.find((i) => i.expiresAt && new Date(i.expiresAt).getTime() <= now && !i.usedAt);
  if (expired) return 'expired';
  return 'none';
}

export function inspectProfessionalAuthBinding({
  requiredPersonId,
  user = null,
  tenantId = null,
} = {}) {
  const db = loadDb();
  const collaborator = (db.collaborators || []).find((c) => c.id === requiredPersonId) || null;
  const accessRows = (db.collaboratorAccess || []).filter((a) => a.collaboratorId === requiredPersonId);
  const linkedUserId = accessRows[0]?.userId || collaborator?.userId || collaborator?.authUserId || collaborator?.user_id || null;
  const memberships = (db.memberships || []).filter((m) => (m.user_id || m.userId) === linkedUserId);
  const tenantMembership = tenantId
    ? memberships.find((m) => (m.tenant_id || m.tenantId) === tenantId)
    : memberships[0] || null;
  const invites = (db.userInvites || []).filter((i) => i.collaboratorId === requiredPersonId);
  const identity = user
    ? resolveAuthenticatedSignerIdentity(user)
    : { ok: false, code: SIGNER_IDENTITY_ERROR.UNAUTHENTICATED, linkedPersonIds: [], personId: null };
  const slot = { role: CLINICAL_SIGNER_ROLE.PROFESSIONAL, personId: requiredPersonId, status: 'pending' };
  const canSign = user
    ? canAuthenticatedUserSignSlot(user, slot)
    : { canSignElectronically: false, code: SIGNER_IDENTITY_ERROR.UNAUTHENTICATED };
  const invitationState = inviteState(invites);

  return {
    clinicalRegistration: collaborator ? 'PRESENT' : 'MISSING',
    userProvisioned: linkedUserId ? 'YES' : 'NO',
    userId: linkedUserId,
    tenantMembership: tenantMembership && tenantMembership.has_system_access !== false ? 'PASS' : 'FAIL',
    collaboratorAccessLink: accessRows.some((a) => a.userId && a.collaboratorId === requiredPersonId) ? 'PASS' : 'FAIL',
    invitationState,
    identityOk: Boolean(identity.ok),
    identityCode: identity.ok ? null : (identity.code || SIGNER_IDENTITY_ERROR.NO_PERSON),
    identityAmbiguity: identity.code === SIGNER_IDENTITY_ERROR.AMBIGUOUS ? 'YES' : 'NO',
    linkedPersonIds: identity.linkedPersonIds || [],
    signerSlotMatch: Boolean(identity.ok && (identity.linkedPersonIds || []).includes(requiredPersonId)) ? 'PASS' : 'FAIL',
    canSignElectronically: Boolean(canSign.canSignElectronically),
    pendingInviteIsNotAuthenticatedIdentity: invitationState === 'pending' && !canSign.canSignElectronically,
  };
}
