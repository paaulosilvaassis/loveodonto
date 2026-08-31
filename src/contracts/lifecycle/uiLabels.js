/**
 * Rótulos canônicos de UI. Aliases (canceled/completed/vigente/replaced)
 * não competem como estado jurídico.
 */
import {
  normalizeContractLifecycleStatus,
  normalizeLinkLifecycleStatus,
  normalizeRequestLifecycleStatus,
} from './normalize.js';
import { isAccessExpired } from './accessGuards.js';
import { LIFECYCLE_AUDIT_EVENTS } from './constants.js';

export const CONTRACT_LIFECYCLE_UI_LABELS = Object.freeze({
  draft: 'Rascunho',
  generated: 'Gerado',
  partially_signed: 'Assinatura parcial',
  signed: 'Assinado',
  cancelled: 'Cancelado',
  voided: 'Invalidado',
  superseded: 'Substituído',
});

export const SIGNING_ACCESS_UI_LABELS = Object.freeze({
  none: 'Sem acesso remoto',
  pending: 'Aguardando envio/assinatura',
  sent: 'Enviado',
  completed: 'Concluído',
  revoked: 'Revogado',
  expired: 'Expirado',
  signable: 'Enviado',
});

export const LIFECYCLE_AUDIT_UI_LABELS = Object.freeze({
  [LIFECYCLE_AUDIT_EVENTS.CONTRACT_CANCELLED]: 'Contrato cancelado',
  [LIFECYCLE_AUDIT_EVENTS.CEREMONY_ABORTED]: 'Cerimônia cancelada',
  [LIFECYCLE_AUDIT_EVENTS.SIGN_REQUEST_REVOKED]: 'Acesso revogado',
  [LIFECYCLE_AUDIT_EVENTS.SIGN_LINK_REVOKED]: 'Acesso revogado',
  [LIFECYCLE_AUDIT_EVENTS.CONTRACT_VOIDED]: 'Contrato invalidado',
  [LIFECYCLE_AUDIT_EVENTS.CONTRACT_REISSUED]: 'Contrato reemitido',
  [LIFECYCLE_AUDIT_EVENTS.CONTRACT_SUPERSEDED]: 'Contrato substituído',
  [LIFECYCLE_AUDIT_EVENTS.SIGN_LINK_ROTATED]: 'Acesso substituído',
  [LIFECYCLE_AUDIT_EVENTS.SIGN_LINK_EXPIRED]: 'Acesso expirado',
  [LIFECYCLE_AUDIT_EVENTS.SIGN_INVITE_RESENT]: 'Acesso reenviado',
  CONTRACT_GENERATED: 'Contrato gerado',
  SENT: 'Solicitação enviada',
  SIGNED: 'Assinatura registrada',
});

export function contractLifecycleUiLabel(status) {
  const normalized = normalizeContractLifecycleStatus(status);
  return CONTRACT_LIFECYCLE_UI_LABELS[normalized] || '—';
}

export function describeSigningAccessUi({ request = null, link = null, trustedNow = Date.now() } = {}) {
  if (!request && !link) {
    return { kind: 'none', label: SIGNING_ACCESS_UI_LABELS.none, expiredByClock: false };
  }
  const linkStatus = normalizeLinkLifecycleStatus(link?.status);
  const requestStatus = normalizeRequestLifecycleStatus(request?.status);
  const expiredByClock = isAccessExpired(link?.expiresAt || request?.expiresAt, trustedNow);
  if (linkStatus === 'signed' || requestStatus === 'completed') {
    return { kind: 'completed', label: SIGNING_ACCESS_UI_LABELS.completed, expiredByClock };
  }
  if (linkStatus === 'revoked' || requestStatus === 'revoked') {
    return { kind: 'revoked', label: SIGNING_ACCESS_UI_LABELS.revoked, expiredByClock };
  }
  if (linkStatus === 'expired' || requestStatus === 'expired' || expiredByClock) {
    return { kind: 'expired', label: SIGNING_ACCESS_UI_LABELS.expired, expiredByClock: true };
  }
  if (requestStatus === 'sent' || linkStatus === 'pending') {
    return { kind: 'signable', label: SIGNING_ACCESS_UI_LABELS.sent, expiredByClock: false };
  }
  return { kind: 'pending', label: SIGNING_ACCESS_UI_LABELS.pending, expiredByClock: false };
}

export function lifecycleAuditUiLabel(eventType, fallback = '') {
  return LIFECYCLE_AUDIT_UI_LABELS[eventType] || fallback || eventType || '—';
}
