/**
 * @module domain/contracts/artifacts/contract-integrity-manifest
 * @description Manifesto de integridade — Phase 10.7.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { ContractFileArtifact, ContractFileType } from '../files/contract-file.types.js';
import { canonicalizeJsonValue } from '../hash/contract-content-hasher.js';
import { sha256Utf8 } from '../files/contract-binary-hash.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';

export interface ContractIntegrityManifest {
  manifestVersion: number;
  tenantId: string;
  contractId: string;
  contractVersionId: string;
  envelopeId?: string;
  documentContentHash: string;
  unsignedPdfHash?: string;
  signedPdfHash?: string;
  evidenceReportHash?: string;
  files: Array<{
    fileId: string;
    fileType: ContractFileType;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
  }>;
  generatedAt: string;
  manifestHash: string;
  technicalDemo: true;
}

export async function buildContractIntegrityManifest(input: {
  tenantId: string;
  contractId: string;
  contractVersionId: string;
  envelopeId?: string;
  documentContentHash: string;
  files: ContractFileArtifact[];
  clock?: ContractClock;
}): Promise<ContractIntegrityManifest> {
  if (!input.documentContentHash) {
    throw Object.assign(new Error('Hash documental ausente.'), {
      domainError: createContractDomainError(
        'CONTRACT_INTEGRITY_MANIFEST_INVALID',
        'documentContentHash obrigatório.',
      ),
    });
  }
  for (const f of input.files) {
    if (!f.sha256 || !f.id) {
      throw Object.assign(new Error('Arquivo sem hash.'), {
        domainError: createContractDomainError(
          'CONTRACT_INTEGRITY_MANIFEST_INVALID',
          'Arquivo referenciado sem hash.',
        ),
      });
    }
  }

  const clock = input.clock || createSystemContractClock();
  const files = [...input.files]
    .filter((f) => !f.deletedAt)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f) => ({
      fileId: f.id,
      fileType: f.fileType,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mimeType: f.mimeType,
    }));

  const unsigned = files.find((f) => f.fileType === 'GENERATED_PDF');
  const signed = files.find((f) => f.fileType === 'SIGNED_PDF');
  const evidence = files.find((f) => f.fileType === 'EVIDENCE_REPORT');

  const base = {
    manifestVersion: 1,
    tenantId: input.tenantId,
    contractId: input.contractId,
    contractVersionId: input.contractVersionId,
    envelopeId: input.envelopeId,
    documentContentHash: input.documentContentHash,
    unsignedPdfHash: unsigned?.sha256,
    signedPdfHash: signed?.sha256,
    evidenceReportHash: evidence?.sha256,
    files,
    generatedAt: clock.nowIso(),
    technicalDemo: true as const,
  };

  const canonical = JSON.stringify(canonicalizeJsonValue(base));
  if (/https?:\/\/|data:/i.test(canonical)) {
    throw Object.assign(new Error('Manifesto com URL.'), {
      domainError: createContractDomainError(
        'CONTRACT_INTEGRITY_MANIFEST_INVALID',
        'Manifesto não pode conter URLs.',
      ),
    });
  }
  const manifestHash = await sha256Utf8(canonical);
  return { ...base, manifestHash };
}
