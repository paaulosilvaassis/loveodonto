/**
 * Cerimônia clínica multi-signer — progresso e conclusão.
 * Não muta contratos legados já SIGNED sem ceremony version.
 */

import { loadDb, withDb } from '../db/index.js';
import { CONTRACT_STATUS } from './contractConstants.js';
import {
  CEREMONY_VERSION,
  CLINICAL_SIGNER_ROLE,
  CLINICAL_SIGNING_ORDER,
  mapLegacySignerRole,
  resolveRequiredSigners,
} from './clinicalRequiredSigners.js';

export const CEREMONY_STATUS = {
  BLOCKED: 'blocked',
  READY_TO_SIGN: 'ready_to_sign',
  PARTIALLY_SIGNED: 'partially_signed',
  AWAITING_REQUIRED_SIGNERS: 'awaiting_required_signers',
  SIGNED: 'signed',
  LEGACY_SIGNED: 'legacy_signed',
};

const FULLY_SIGNED = new Set([
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.COMPLETED,
  CONTRACT_STATUS.VIGENTE,
]);

function signaturesOf(contractId) {
  return (loadDb().contractSignatures || []).filter((s) => s.contractId === contractId);
}

function slotRoles(slot) {
  return slot.dedupedRoles || slot.roles || [slot.role];
}

function signatureSatisfies(sig, slot) {
  const role = mapLegacySignerRole(sig.signerRole);
  const roles = Array.isArray(sig.rolesSatisfied)
    ? sig.rolesSatisfied.map(mapLegacySignerRole)
    : [role];
  const wanted = slotRoles(slot);
  const roleHit = wanted.some((r) => roles.includes(r));
  if (!roleHit) return false;
  if (slot.personId && sig.signerPersonId && slot.personId !== sig.signerPersonId) return false;
  return true;
}

export function isLegacyClinicalSignature(contract) {
  if (!contract) return false;
  if (!FULLY_SIGNED.has(String(contract.status || '').toLowerCase())) return false;
  return contract.metadata?.signatureCeremony?.version !== CEREMONY_VERSION;
}

export function evaluateSignatureCeremony({
  tenantId = null,
  patientId = null,
  appointmentId = null,
  budgetId = null,
  contractId = null,
} = {}) {
  const resolved = resolveRequiredSigners({
    tenantId,
    patientId,
    appointmentId,
    budgetId,
    contractId,
  });
  const db = loadDb();
  const contract = (db.generatedContracts || []).find((c) => c.id === (contractId || resolved.identity.contractId)) || null;
  const sigs = contract?.id ? signaturesOf(contract.id) : [];
  const required = (resolved.requiredSigners || []).filter((s) => s.required);
  const enriched = (resolved.requiredSigners || []).map((slot) => {
    const hit = sigs.find((sig) => signatureSatisfies(sig, slot));
    return {
      ...slot,
      status: hit ? 'signed' : 'pending',
      signedAt: hit?.signedAt || null,
      signatureId: hit?.id || null,
      satisfiedBySameProfessional: Boolean(
        slot.dedupedRoles?.includes(CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE)
        && hit
        && mapLegacySignerRole(hit.signerRole) === CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      ),
    };
  });

  const satisfied = required.filter((slot) => enriched.find((e) => e.role === slot.role && e.personId === slot.personId && e.status === 'signed')
    || enriched.some((e) => e.status === 'signed' && slotRoles(e).includes(slot.role) && (!slot.personId || e.personId === slot.personId)));
  const requiredCount = required.length;
  const satisfiedCount = required.filter((slot) => enriched.some((e) => e.status === 'signed' && slotRoles(e).includes(slot.role) && (!slot.personId || !e.personId || e.personId === slot.personId))).length;
  const allRequiredSatisfied = requiredCount > 0 && satisfiedCount >= requiredCount;
  const anySigned = enriched.some((e) => e.status === 'signed');
  const legacy = isLegacyClinicalSignature(contract);
  const sent = [CONTRACT_STATUS.SENT, CONTRACT_STATUS.VIEWED].includes(String(contract?.status || '').toLowerCase());

  let status = CEREMONY_STATUS.READY_TO_SIGN;
  if (resolved.rejected) status = CEREMONY_STATUS.BLOCKED;
  else if (legacy) status = CEREMONY_STATUS.LEGACY_SIGNED;
  else if (allRequiredSatisfied || (FULLY_SIGNED.has(String(contract?.status || '').toLowerCase()) && allRequiredSatisfied)) {
    status = CEREMONY_STATUS.SIGNED;
  } else if (anySigned) status = CEREMONY_STATUS.PARTIALLY_SIGNED;
  else if (sent) status = CEREMONY_STATUS.AWAITING_REQUIRED_SIGNERS;
  else if ((resolved.blockers || []).length) status = CEREMONY_STATUS.BLOCKED;

  return {
    ...resolved,
    requiredSigners: enriched,
    requiredCount,
    satisfiedCount,
    allRequiredSatisfied,
    status,
    legacy,
    contract,
    progressLabel: `${satisfiedCount} de ${requiredCount} assinaturas obrigatórias concluídas`,
  };
}

export function assertSignerAllowed(ceremony, { signerRole, signerPersonId, tenantId } = {}) {
  if (ceremony.rejected) {
    throw new Error(ceremony.blockers[0]?.message || 'Identidade inválida.');
  }
  if (ceremony.identity?.tenantId && tenantId && ceremony.identity.tenantId !== tenantId) {
    throw new Error('Contrato não pertence a este tenant.');
  }
  const role = mapLegacySignerRole(signerRole);
  const slot = (ceremony.requiredSigners || []).find((s) => slotRoles(s).includes(role)
    && (!signerPersonId || !s.personId || s.personId === signerPersonId));
  if (!slot) throw new Error('Signatário não pertence a esta cerimônia.');
  if (slot.personId) {
    if (!signerPersonId) throw new Error('Signatário não identificado.');
    if (slot.personId !== signerPersonId) {
      throw new Error('Signatário não corresponde ao papel exigido.');
    }
  }
  if (slot.status === 'signed') throw new Error('Este signatário já assinou.');
  if (ceremony.signingOrder === CLINICAL_SIGNING_ORDER.SEQUENTIAL) {
    const pendingBefore = (ceremony.requiredSigners || [])
      .filter((s) => s.required && s.signingOrder < slot.signingOrder && s.status !== 'signed');
    if (pendingBefore.length) {
      throw new Error('Assinatura sequencial: há signatário anterior pendente.');
    }
  }
  return { slot, rolesSatisfied: slotRoles(slot) };
}

export function nextContractStatusAfterStroke(ceremony, { justSignedRole } = {}) {
  const role = mapLegacySignerRole(justSignedRole);
  const simulated = {
    ...ceremony,
    requiredSigners: (ceremony.requiredSigners || []).map((s) => (
      slotRoles(s).includes(role) ? { ...s, status: 'signed' } : s
    )),
  };
  const required = simulated.requiredSigners.filter((s) => s.required);
  const done = required.every((s) => s.status === 'signed');
  if (done) return CONTRACT_STATUS.SIGNED;
  if (role === CLINICAL_SIGNER_ROLE.PATIENT || role === CLINICAL_SIGNER_ROLE.LEGAL_GUARDIAN) {
    return CONTRACT_STATUS.SIGNED_BY_PATIENT;
  }
  return CONTRACT_STATUS.SIGNED_BY_CLINIC;
}

export function buildCeremonySnapshot(ceremony, extra = {}) {
  return {
    version: CEREMONY_VERSION,
    status: ceremony.status,
    requiredCount: ceremony.requiredCount,
    satisfiedCount: ceremony.satisfiedCount,
    signingOrder: ceremony.signingOrder,
    dentistRtDeduped: Boolean(ceremony.dentistRtDeduped),
    witnesses: ceremony.requiredSigners
      .filter((s) => s.role === CLINICAL_SIGNER_ROLE.WITNESS)
      .map((s) => ({ personId: s.personId, name: s.name })),
    ...extra,
  };
}

export function addOptionalWitness({
  user,
  contractId,
  patientId,
  appointmentId,
  budgetId,
  name,
} = {}) {
  const tenantId = user?.tenantId || user?.tenant_id || loadDb().clinicProfile?.tenant_id;
  const ceremony = evaluateSignatureCeremony({
    tenantId,
    patientId,
    appointmentId,
    budgetId,
    contractId,
  });
  if (ceremony.rejected) throw new Error(ceremony.blockers[0]?.message || 'Identidade inválida.');
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Nome da testemunha é obrigatório.');
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === (contractId || ceremony.identity.contractId));
    if (idx < 0) throw new Error('Contrato não encontrado.');
    const prev = arr[idx];
    const witnesses = [...(prev.metadata?.signatureCeremony?.witnesses || []), { name: trimmed, addedAt: new Date().toISOString() }];
    arr[idx] = {
      ...prev,
      metadata: {
        ...(prev.metadata || {}),
        signatureCeremony: {
          ...(prev.metadata?.signatureCeremony || {}),
          version: CEREMONY_VERSION,
          witnesses,
        },
      },
    };
    return arr[idx];
  });
}

export function formatCeremonyAdminProgress(contract) {
  const snap = contract?.metadata?.signatureCeremony;
  if (snap?.requiredCount != null) {
    const waiting = snap.satisfiedCount < snap.requiredCount
      ? (snap.status === CEREMONY_STATUS.PARTIALLY_SIGNED ? 'Aguardando signatários' : null)
      : 'Assinado';
    return {
      label: `${snap.satisfiedCount || 0}/${snap.requiredCount} assinaturas`,
      waiting,
    };
  }
  if (FULLY_SIGNED.has(String(contract?.status || '').toLowerCase())) {
    return { label: 'Assinado', waiting: null, legacy: true };
  }
  return { label: '—', waiting: null };
}
