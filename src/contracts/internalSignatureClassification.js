/**
 * Classificação juridicamente verdadeira do tipo de assinatura INTERNAL.
 * Link público on-screen ≠ ICP-Brasil. Não altera requests históricas.
 */
import { LEGAL_SIGNATURE_TYPES, SIGNATURE_PROVIDERS } from './contractConstants.js';

export function isInternalSignatureProvider(settings = {}) {
  const provider = settings.signatureProvider || SIGNATURE_PROVIDERS.INTERNAL;
  return provider === SIGNATURE_PROVIDERS.INTERNAL;
}

/**
 * INTERNAL nunca declara icp_qualified: não há certificado ICP-Brasil neste canal.
 * ADVANCED permanece para regras de financiamento/alto valor.
 */
export function coerceInternalSignatureType(signatureType, settings = {}) {
  const requested = signatureType || settings.defaultSignatureType || LEGAL_SIGNATURE_TYPES.SIMPLE;
  if (!isInternalSignatureProvider(settings)) return requested;
  if (requested === LEGAL_SIGNATURE_TYPES.QUALIFIED) return LEGAL_SIGNATURE_TYPES.SIMPLE;
  return requested;
}
