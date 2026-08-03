/**
 * @module domain/contracts/signatures/signature-evidence.hash
 * @description Hash de evidências de assinatura — Phase 10.6.
 */

import { createContractContentHasher } from '../hash/contract-content-hasher.js';
import type { SignatureEvidenceSnapshot } from './signature.types.js';

export async function hashSignatureEvidence(
  evidence: SignatureEvidenceSnapshot,
): Promise<string> {
  const hasher = createContractContentHasher();
  return hasher.hash({
    tenantId: String(evidence.envelopeId || 'evidence'),
    contractId: String(evidence.contractId || ''),
    versionNumber: 1,
    templateVersionId: String(evidence.contractVersionId || ''),
    generationReason: 'SIGNATURE_EVIDENCE',
    previousVersionHash: evidence.documentHash || evidence.documentHashAtSign,
    renderedHtml: JSON.stringify({
      signerId: evidence.signerId,
      authenticationMethod: evidence.authenticationMethod,
      authenticationCompletedAt: evidence.authenticationCompletedAt || evidence.authenticatedAt,
      viewedAt: evidence.viewedAt,
      signedAt: evidence.signedAt,
      declinedAt: evidence.declinedAt,
      acceptedTerms: (evidence.acceptedTerms || []).map((t) => ({
        code: t.code,
        required: t.required,
        acceptedAt: t.acceptedAt,
        contentHash: t.contentHash,
      })),
      artifact: evidence.signatureArtifact
        ? {
          temporaryArtifactId: evidence.signatureArtifact.temporaryArtifactId,
          sha256: evidence.signatureArtifact.sha256,
          mimeType: evidence.signatureArtifact.mimeType,
        }
        : null,
      sessionTokenId: evidence.sessionTokenId,
      challengeId: evidence.challengeId,
      ipAddress: evidence.ipAddress || null,
      userAgent: evidence.userAgent || null,
      geolocation: evidence.geolocation || null,
    }),
    snapshots: {},
  });
}

export function createMemorySignatureArtifact(
  input: { mimeType?: string; width?: number; height?: number; seed?: string } = {},
): { reference: import('./signature.types.js').SignatureArtifactReference; bytesLength: number } {
  const seed = input.seed || `artifact_${Date.now()}`;
  // Não armazena base64/data URL — apenas referência + hash sintético do seed
  const sha256PromisePlaceholder = seed; // hash preenchido async pelo caller quando necessário
  return {
    reference: {
      temporaryArtifactId: `art_${seed}`,
      mimeType: input.mimeType || 'image/png',
      width: input.width || 300,
      height: input.height || 100,
      sha256: undefined,
    },
    bytesLength: 0,
  };
}

export async function finalizeArtifactReference(
  seed: string,
  meta: { mimeType?: string; width?: number; height?: number } = {},
): Promise<import('./signature.types.js').SignatureArtifactReference> {
  const hasher = createContractContentHasher();
  const sha256 = await hasher.hash({
    tenantId: 'artifact',
    contractId: 'sig',
    versionNumber: 1,
    generationReason: 'ARTIFACT',
    renderedHtml: seed,
    snapshots: {},
  });
  return {
    temporaryArtifactId: `art_${sha256.slice(0, 12)}`,
    sha256,
    mimeType: meta.mimeType || 'image/png',
    width: meta.width || 300,
    height: meta.height || 100,
  };
}
