/**
 * @module domain/contracts/packages/package-manifest-hash
 * @description Canonicalização + hash de documentos/manifesto — Phase 10.21T (puro).
 *
 * Reutiliza:
 * - `canonicalizeJsonValue` (ordenamento de chaves)
 * - `sha256Utf8` / `sha256Bytes`
 *
 * canonicalizationVersion = pkg_manifest_v1
 * Nunca alterar silenciosamente este algoritmo.
 */

import { canonicalizeJsonValue } from '../hash/contract-content-hasher.js';
import { sha256Bytes, sha256Utf8 } from '../files/contract-binary-hash.js';
import {
  PACKAGE_MANIFEST_CANONICALIZATION_VERSION,
  type PackageManifest,
  type PackageManifestDocument,
  type PackageManifestHashInput,
} from './package-manifest.types.js';

/**
 * Normalização UTF-8 v1 para conteúdo textual apresentado ao paciente.
 * - Remove BOM
 * - Normaliza newlines para `\n`
 * - NÃO colapsa whitespace interno (juridicamente relevante)
 * - NÃO altera casing
 */
export function canonicalizePresentedTextV1(raw: string): string {
  let text = String(raw ?? '');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Hash SHA-256 hex do texto canônico (utf8_canonical_v1). */
export async function hashPresentedTextContentV1(raw: string): Promise<string> {
  const canonical = canonicalizePresentedTextV1(raw);
  return sha256Utf8(canonical);
}

/** Hash SHA-256 hex de bytes brutos (PDF etc.) — binary_sha256_v1. */
export async function hashPresentedBinaryContentV1(bytes: Uint8Array): Promise<string> {
  return sha256Bytes(bytes);
}

function sortDocumentsForHash(
  documents: PackageManifestHashInput['documents'],
): PackageManifestHashInput['documents'] {
  return [...documents].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return String(a.documentKey).localeCompare(String(b.documentKey));
  });
}

/**
 * Monta input canônico a partir do manifesto de domínio.
 * Exclui paths de storage, labels e ids internos de linha (exceto documentKey).
 */
export function buildPackageManifestHashInput(
  manifest: Pick<
    PackageManifest,
    | 'tenantId'
    | 'sourcePackageKey'
    | 'packageId'
    | 'manifestVersion'
    | 'primaryContractId'
    | 'primaryContractVersionId'
    | 'canonicalizationVersion'
    | 'documents'
  >,
): PackageManifestHashInput {
  return {
    canonicalizationVersion:
      String(manifest.canonicalizationVersion || PACKAGE_MANIFEST_CANONICALIZATION_VERSION),
    tenantId: String(manifest.tenantId || ''),
    sourcePackageKey: String(manifest.sourcePackageKey || ''),
    packageId: manifest.packageId || null,
    manifestVersion: Number(manifest.manifestVersion) || 0,
    primaryContractId: String(manifest.primaryContractId || ''),
    primaryContractVersionId: String(manifest.primaryContractVersionId || ''),
    documents: (manifest.documents || []).map((d: PackageManifestDocument) => ({
      documentKey: String(d.documentKey || ''),
      documentType: String(d.documentType || ''),
      documentVersion: String(d.documentVersion || ''),
      required: Boolean(d.required),
      displayOrder: Number(d.displayOrder) || 0,
      contentHash: String(d.contentHash || ''),
      contentMimeType: String(d.contentMimeType || ''),
    })),
  };
}

export function canonicalizePackageManifestHashInput(
  input: PackageManifestHashInput,
): string {
  const documents = sortDocumentsForHash(input.documents || []).map((d) => ({
    documentKey: String(d.documentKey || ''),
    documentType: String(d.documentType || ''),
    documentVersion: String(d.documentVersion || ''),
    required: Boolean(d.required),
    displayOrder: Number(d.displayOrder) || 0,
    contentHash: String(d.contentHash || ''),
    contentMimeType: String(d.contentMimeType || ''),
  }));

  const canonical = canonicalizeJsonValue({
    canonicalizationVersion:
      String(input.canonicalizationVersion || PACKAGE_MANIFEST_CANONICALIZATION_VERSION),
    tenantId: String(input.tenantId || ''),
    sourcePackageKey: String(input.sourcePackageKey || ''),
    packageId: input.packageId || null,
    manifestVersion: Number(input.manifestVersion) || 0,
    primaryContractId: String(input.primaryContractId || ''),
    primaryContractVersionId: String(input.primaryContractVersionId || ''),
    documents,
  });

  return JSON.stringify(canonical);
}

export async function hashPackageManifest(
  input: PackageManifestHashInput,
): Promise<string> {
  const canonical = canonicalizePackageManifestHashInput(input);
  return sha256Utf8(canonical);
}

export async function hashPackageManifestEntity(
  manifest: Parameters<typeof buildPackageManifestHashInput>[0],
): Promise<string> {
  return hashPackageManifest(buildPackageManifestHashInput(manifest));
}

/** Verifica se contentHash do item bate com o conteúdo textual apresentado. */
export async function verifyPresentedTextContentHash(input: {
  rawContent: string;
  expectedContentHash: string;
}): Promise<boolean> {
  const actual = await hashPresentedTextContentV1(input.rawContent);
  return actual === String(input.expectedContentHash || '');
}
