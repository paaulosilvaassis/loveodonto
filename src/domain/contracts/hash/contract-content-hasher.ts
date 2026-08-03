/**
 * @module domain/contracts/hash/contract-content-hasher
 * @description Canonicalização + SHA-256 — Phase 10.5.
 */

import { createContractDomainError } from '../contract.errors.js';

export interface ContractVersionHashInput {
  tenantId: string;
  contractId: string;
  versionNumber: number;
  templateVersionId?: string;
  generationReason: string;
  previousVersionHash?: string;
  renderedHtml: string;
  plainText?: string;
  /** Snapshots relevantes — serializados canonicamente. */
  snapshots: Record<string, unknown>;
}

export interface ContractContentHasher {
  canonicalize(input: ContractVersionHashInput): string;
  hash(input: ContractVersionHashInput): Promise<string>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Ordena chaves recursivamente para estabilidade. */
export function canonicalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (!isPlainObject(value)) {
    // Sem classes / Date / Map — apenas primitivos e plain objects
    return String(value);
  }
  const keys = Object.keys(value).sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const v = value[key];
    if (v === undefined) continue;
    out[key] = canonicalizeJsonValue(v);
  }
  return out;
}

export function canonicalizeContractVersionHashInput(
  input: ContractVersionHashInput,
): string {
  const canonical = canonicalizeJsonValue({
    tenantId: String(input.tenantId || ''),
    contractId: String(input.contractId || ''),
    versionNumber: Number(input.versionNumber) || 0,
    templateVersionId: input.templateVersionId || null,
    generationReason: String(input.generationReason || ''),
    previousVersionHash: input.previousVersionHash || null,
    renderedHtml: String(input.renderedHtml || ''),
    plainText: input.plainText != null ? String(input.plainText) : null,
    snapshots: input.snapshots || {},
  });
  return JSON.stringify(canonical);
}

async function sha256Hex(canonical: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder === 'undefined') {
    throw Object.assign(
      new Error('API criptográfica indisponível para hash SHA-256.'),
      {
        domainError: createContractDomainError(
          'HASH_UNAVAILABLE',
          'API criptográfica indisponível para hash SHA-256.',
          'documentHash',
        ),
      },
    );
  }
  const data = new TextEncoder().encode(canonical);
  const digest = await subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createContractContentHasher(): ContractContentHasher {
  return {
    canonicalize: canonicalizeContractVersionHashInput,
    async hash(input) {
      const canonical = canonicalizeContractVersionHashInput(input);
      return sha256Hex(canonical);
    },
  };
}
