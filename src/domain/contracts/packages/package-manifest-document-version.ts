/**
 * Validação fail-closed de documentVersion no freeze jurídico.
 * Sem fallback para '1', templateVersion, manifestVersion ou primaryContractVersionId.
 */

export const PACKAGE_DOCUMENT_VERSION_MISSING = 'PACKAGE_DOCUMENT_VERSION_MISSING';

function failMissing(message = 'documentVersion ausente.'): never {
  throw Object.assign(new Error(message), {
    code: PACKAGE_DOCUMENT_VERSION_MISSING,
  });
}

/**
 * Normaliza documentVersion para string semântica.
 * Aceita "1" e 1. Recusa undefined, null, "", whitespace e tipos não documentais.
 */
export function requireFreezeDocumentVersion(value: unknown): string {
  if (value === undefined || value === null) {
    failMissing();
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 1) {
      failMissing('documentVersion inválido.');
    }
    return String(value);
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) failMissing();
    return normalized;
  }
  failMissing('documentVersion inválido.');
}
