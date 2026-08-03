/**
 * @module domain/contracts/files/contract-file-mime
 * @description Allowlist MIME — Phase 10.7.
 */

import { createContractDomainError } from '../contract.errors.js';

export const ALLOWED_CONTRACT_MIME_TYPES = [
  'application/pdf',
  'application/json',
  'text/html',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type AllowedContractMimeType = (typeof ALLOWED_CONTRACT_MIME_TYPES)[number];

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/json': 'json',
  'text/html': 'html',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function isAllowedContractMimeType(mimeType: string): mimeType is AllowedContractMimeType {
  return (ALLOWED_CONTRACT_MIME_TYPES as readonly string[]).includes(String(mimeType || '').toLowerCase());
}

export function extensionForMimeType(mimeType: string): string {
  const ext = MIME_TO_EXT[String(mimeType || '').toLowerCase()];
  if (!ext) {
    throw Object.assign(new Error('MIME não permitido.'), {
      domainError: createContractDomainError(
        'CONTRACT_FILE_MIME_NOT_ALLOWED',
        'MIME type não permitido.',
        'mimeType',
      ),
    });
  }
  return ext;
}

export function assertAllowedMimeType(mimeType: string): AllowedContractMimeType {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (!normalized || normalized.startsWith('data:')) {
    throw Object.assign(new Error('MIME inválido.'), {
      domainError: createContractDomainError(
        'CONTRACT_FILE_MIME_NOT_ALLOWED',
        'MIME type inválido ou data URL.',
        'mimeType',
      ),
    });
  }
  if (!isAllowedContractMimeType(normalized)) {
    throw Object.assign(new Error('MIME não permitido.'), {
      domainError: createContractDomainError(
        'CONTRACT_FILE_MIME_NOT_ALLOWED',
        `MIME type não permitido: ${normalized}.`,
        'mimeType',
      ),
    });
  }
  return normalized;
}

export function rejectDataUrl(value: string | undefined): void {
  if (value && /^data:/i.test(value)) {
    throw Object.assign(new Error('data URL não permitido.'), {
      domainError: createContractDomainError(
        'CONTRACT_FILE_MIME_NOT_ALLOWED',
        'data URL não é permitido como storage.',
        'storagePath',
      ),
    });
  }
}
