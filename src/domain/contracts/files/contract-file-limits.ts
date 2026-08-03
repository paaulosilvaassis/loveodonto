/**
 * @module domain/contracts/files/contract-file-limits
 * @description Limites tipados centralizados — Phase 10.7.
 */

export interface ContractFileSizeLimits {
  maxContractPdfBytes: number;
  maxEvidenceReportBytes: number;
  maxSignatureArtifactBytes: number;
  maxAttachmentBytes: number;
  maxTotalContractFilesBytes: number;
}

/** Valores conservadores e configuráveis — fonte única. */
export const DEFAULT_CONTRACT_FILE_SIZE_LIMITS: Readonly<ContractFileSizeLimits> = Object.freeze({
  maxContractPdfBytes: 8 * 1024 * 1024,
  maxEvidenceReportBytes: 2 * 1024 * 1024,
  maxSignatureArtifactBytes: 512 * 1024,
  maxAttachmentBytes: 10 * 1024 * 1024,
  maxTotalContractFilesBytes: 50 * 1024 * 1024,
});

export function resolveContractFileSizeLimits(
  overrides: Partial<ContractFileSizeLimits> = {},
): ContractFileSizeLimits {
  return { ...DEFAULT_CONTRACT_FILE_SIZE_LIMITS, ...overrides };
}

export function limitForFileType(
  fileType: string,
  limits: ContractFileSizeLimits = DEFAULT_CONTRACT_FILE_SIZE_LIMITS,
): number {
  switch (fileType) {
    case 'GENERATED_PDF':
    case 'SIGNED_PDF':
      return limits.maxContractPdfBytes;
    case 'EVIDENCE_REPORT':
    case 'INTEGRITY_MANIFEST':
      return limits.maxEvidenceReportBytes;
    case 'SIGNATURE_IMAGE':
      return limits.maxSignatureArtifactBytes;
    default:
      return limits.maxAttachmentBytes;
  }
}
