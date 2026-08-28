/**
 * PHASE_10.21CO — binding explícito request/link na evidência remota.
 * Lookup por ID exato. Sem recência. Sem fallback.
 */
import { loadDb } from '../db/index.js';
import { SIGNATURE_METHOD, SIGNING_CHANNEL } from './remoteSignatureEvidence.js';

export const REMOTE_SIGNATURE_BINDING_MISSING = 'REMOTE_SIGNATURE_BINDING_MISSING';
export const REMOTE_SIGNATURE_BINDING_MISMATCH = 'REMOTE_SIGNATURE_BINDING_MISMATCH';

function bindingError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function isRemotePublicSignChannel({ signingChannel, signatureMethod } = {}) {
  return signingChannel === SIGNING_CHANNEL.PUBLIC_SIGN_LINK
    || signatureMethod === SIGNATURE_METHOD.REMOTE_ON_SCREEN;
}

/**
 * Fail-closed para public_sign_link / REMOTE_ON_SCREEN.
 * Outros canais: no-op.
 */
export function assertRemoteSignatureBinding({
  contractId,
  signingChannel,
  signatureMethod,
  signatureRequestId,
  signLinkId,
} = {}) {
  if (!isRemotePublicSignChannel({ signingChannel, signatureMethod })) {
    return { required: false, signatureRequestId: null, signLinkId: null };
  }

  const requestId = String(signatureRequestId || '').trim();
  const linkId = String(signLinkId || '').trim();
  if (!requestId || !linkId) {
    throw bindingError(
      REMOTE_SIGNATURE_BINDING_MISSING,
      'Assinatura remota exige signatureRequestId e signLinkId do fluxo.',
    );
  }

  const db = loadDb();
  const request = (db.contractSignatureRequests || []).find((row) => row?.id === requestId) || null;
  const link = (db.contractSignLinks || []).find((row) => row?.id === linkId) || null;

  if (!request) {
    throw bindingError(REMOTE_SIGNATURE_BINDING_MISSING, 'Request de assinatura remota não encontrado.');
  }
  if (!link) {
    throw bindingError(REMOTE_SIGNATURE_BINDING_MISSING, 'Link de assinatura remota não encontrado.');
  }
  if (String(request.contractId || '') !== String(contractId || '')) {
    throw bindingError(REMOTE_SIGNATURE_BINDING_MISMATCH, 'Request de assinatura não pertence a este contrato.');
  }
  if (String(link.contractId || '') !== String(contractId || '')) {
    throw bindingError(REMOTE_SIGNATURE_BINDING_MISMATCH, 'Link de assinatura não pertence a este contrato.');
  }
  if (String(link.requestId || '') !== requestId) {
    throw bindingError(REMOTE_SIGNATURE_BINDING_MISMATCH, 'Link de assinatura não pertence a este request.');
  }

  return { required: true, signatureRequestId: requestId, signLinkId: linkId };
}
