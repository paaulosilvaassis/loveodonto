/**
 * @module domain/contracts/files/contract-binary-hash
 * @description SHA-256 de bytes — Phase 10.7.
 */

import { createContractDomainError } from '../contract.errors.js';

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw Object.assign(new Error('Hash indisponível.'), {
      domainError: createContractDomainError(
        'HASH_UNAVAILABLE',
        'API criptográfica indisponível para hash SHA-256.',
        'sha256',
      ),
    });
  }
  // Cópia para ArrayBuffer estrito (compatível com SubtleCrypto)
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Utf8(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}
