/**
 * Evidência de assinatura remota (link público) — PHASE_10.21BU.
 * Não backfilla registros históricos. Não declara ICP-Brasil.
 */

export const SIGNATURE_METHOD = {
  AUTHENTICATED_ELECTRONIC: 'AUTHENTICATED_ELECTRONIC',
  OPERATOR_COLLECTED_PRESENCE: 'OPERATOR_COLLECTED_PRESENCE',
  REMOTE_ON_SCREEN: 'REMOTE_ON_SCREEN',
};

export const SIGNING_CHANNEL = {
  CLINIC_APP: 'clinic_app',
  PUBLIC_SIGN_LINK: 'public_sign_link',
};

export const AUTH_METHOD = {
  ON_SCREEN_LINK: 'on_screen_link',
  AUTHENTICATED_SESSION: 'authenticated_session',
  OPERATOR_PRESENCE: 'operator_presence',
};

export const IMMUTABLE_PILOT_CONTRACT_IDS = new Set([
  'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a',
]);

export const IMMUTABLE_PILOT_CONTRACT_NUMBERS = new Set([
  'CTR-2026-00003',
]);

export function isImmutablePilotContract(contract) {
  if (!contract) return false;
  return IMMUTABLE_PILOT_CONTRACT_IDS.has(contract.id)
    || IMMUTABLE_PILOT_CONTRACT_NUMBERS.has(String(contract.contractNumber || ''));
}

/** Compatível com evidência legada: hash era o document hash. */
export function readEvidenceDocumentHash(evidence) {
  if (!evidence || typeof evidence !== 'object') return null;
  return evidence.documentHash || evidence.hash || null;
}

export function simpleEvidenceHash(text) {
  let h = 5381;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return `h${(h >>> 0).toString(16)}`;
}

export function normalizeComparableName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function namesDiverge(registeredName, typedName) {
  const a = normalizeComparableName(registeredName);
  const b = normalizeComparableName(typedName);
  if (!a || !b) return false;
  return a !== b;
}

export function collectPresentedConsents(privacy) {
  return [
    ...(privacy?.requiredConsents || []),
    ...(privacy?.optionalConsents || []),
  ].filter((item) => item?.id);
}

/**
 * Persiste exatamente o que a UI apresentou. Não inventa aceite.
 * acceptedAt só existe quando accepted === true.
 */
export function buildConsentAcceptances({
  presentedConsents = [],
  acceptanceMap = {},
  acceptedAtById = {},
  acceptedAt = null,
} = {}) {
  const now = acceptedAt || new Date().toISOString();
  return (presentedConsents || []).map((item) => {
    const accepted = acceptanceMap[item.id] === true;
    const stamped = acceptedAtById[item.id] || (accepted ? now : null);
    return {
      id: item.id,
      version: item.version || item.code || '1',
      accepted,
      acceptedAt: accepted ? stamped : null,
    };
  });
}

export function assertRequiredConsentsAccepted({
  presentedConsents = [],
  acceptanceMap = {},
  requireConsent = false,
} = {}) {
  if (!requireConsent) return;
  const required = (presentedConsents || []).filter((item) => item.required);
  if (!required.length) {
    const err = new Error('Consentimentos obrigatórios não foram apresentados.');
    err.code = 'CONSENT_NOT_PRESENTED';
    throw err;
  }
  const missing = required.filter((item) => acceptanceMap[item.id] !== true);
  if (missing.length) {
    const err = new Error('Marque os consentimentos obrigatórios, incluindo o aviso de privacidade, para continuar.');
    err.code = 'CONSENT_REQUIRED';
    throw err;
  }
}

export function canonicalEvidencePayload(fields) {
  const payload = {
    contractId: fields.contractId || null,
    documentHash: fields.documentHash || null,
    contractVersion: fields.contractVersion || 1,
    signerPersonId: fields.signerPersonId || null,
    signerRole: fields.signerRole || null,
    signedAt: fields.signedAt || null,
    signatureMethod: fields.signatureMethod || null,
    signingChannel: fields.signingChannel || null,
    authMethod: fields.authMethod || null,
    registeredSignerName: fields.registeredSignerName || null,
    typedSignerName: fields.typedSignerName || null,
    consentAcceptances: fields.consentAcceptances || [],
    clientIp: fields.clientIp || null,
  };
  if (
    fields.signingChannel === SIGNING_CHANNEL.PUBLIC_SIGN_LINK
    || fields.signatureRequestId
    || fields.signLinkId
  ) {
    payload.signatureRequestId = fields.signatureRequestId || null;
    payload.signLinkId = fields.signLinkId || null;
  }
  return JSON.stringify(payload);
}

export function computeEvidenceHash(fields) {
  return simpleEvidenceHash(canonicalEvidencePayload(fields));
}

export function isLikelyHumanDocumentView({
  visibilityState = typeof document !== 'undefined' ? document.visibilityState : 'visible',
  webdriver = typeof navigator !== 'undefined' ? Boolean(navigator.webdriver) : false,
  prefetch = false,
} = {}) {
  if (prefetch) return false;
  if (webdriver) return false;
  if (visibilityState && visibilityState !== 'visible') return false;
  return true;
}
