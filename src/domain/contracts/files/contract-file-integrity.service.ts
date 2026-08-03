/**
 * @module domain/contracts/files/contract-file-integrity.service
 * @description Verificação de integridade de artefatos e manifesto — Phase 10.7.
 */

import type { ContractBinaryArtifact, ContractFileArtifact } from './contract-file.types.js';
import type { ContractIntegrityManifest } from '../artifacts/contract-integrity-manifest.js';
import { sha256Bytes, timingSafeEqualHex } from './contract-binary-hash.js';
import type { ContractFileIntegrityResult } from './contract-private-storage.js';

export interface ContractManifestVerificationResult {
  valid: boolean;
  state: 'VALID' | 'INVALID' | 'MISSING';
  errors: string[];
}

export interface ContractFileIntegrityService {
  verifyArtifact(
    artifact: ContractBinaryArtifact,
    expectedHash: string,
  ): Promise<ContractFileIntegrityResult>;

  verifyManifest(
    manifest: ContractIntegrityManifest,
    files: ContractFileArtifact[],
  ): Promise<ContractManifestVerificationResult>;
}

export function createContractFileIntegrityService(): ContractFileIntegrityService {
  return {
    async verifyArtifact(artifact, expectedHash) {
      if (!artifact?.bytes) {
        return { fileId: '' as never, state: 'MISSING' };
      }
      const actualHash = await sha256Bytes(artifact.bytes);
      const hashOk = timingSafeEqualHex(actualHash, expectedHash);
      const sizeOk = artifact.sizeBytes === artifact.bytes.byteLength;
      return {
        fileId: '' as never,
        state: hashOk && sizeOk ? 'VALID' : 'INVALID',
        expectedHash,
        actualHash,
        sizeMatch: sizeOk,
        mimeMatch: Boolean(artifact.mimeType),
      };
    },

    async verifyManifest(manifest, files) {
      const errors: string[] = [];
      if (!manifest?.manifestHash || !manifest.documentContentHash) {
        return { valid: false, state: 'INVALID', errors: ['Manifesto incompleto.'] };
      }
      const byId = new Map(files.map((f) => [f.id, f]));
      for (const entry of manifest.files || []) {
        const file = byId.get(entry.fileId);
        if (!file || file.deletedAt) {
          errors.push(`MISSING:${entry.fileId}`);
          continue;
        }
        if (!timingSafeEqualHex(file.sha256, entry.sha256)) {
          errors.push(`HASH:${entry.fileId}`);
        }
        if (file.sizeBytes !== entry.sizeBytes) {
          errors.push(`SIZE:${entry.fileId}`);
        }
        if (file.mimeType !== entry.mimeType) {
          errors.push(`MIME:${entry.fileId}`);
        }
      }
      if (errors.some((e) => e.startsWith('MISSING:'))) {
        return { valid: false, state: 'MISSING', errors };
      }
      return {
        valid: errors.length === 0,
        state: errors.length === 0 ? 'VALID' : 'INVALID',
        errors,
      };
    },
  };
}
