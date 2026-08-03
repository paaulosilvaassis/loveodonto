/**
 * @module domain/contracts/files/contract-file.types
 * @description Tipos de arquivo e artefatos — Phase 10.2 + extensões Phase 10.7.
 */

import type {
  ContractFileId,
  ContractId,
  ContractVersionId,
  SignatureEnvelopeId,
  TenantId,
} from '../contract.ids.js';

export const CONTRACT_FILE_TYPES = [
  'GENERATED_PDF',
  'SIGNED_PDF',
  'EVIDENCE_REPORT',
  'INTEGRITY_MANIFEST',
  'SIGNATURE_IMAGE',
  'ODONTOGRAM_IMAGE',
  'ATTACHMENT',
  'IDENTIFICATION',
  'CLINICAL_IMAGE',
  'FINANCIAL_ATTACHMENT',
  'OTHER',
] as const;

export type ContractFileType = (typeof CONTRACT_FILE_TYPES)[number];

export const CONTRACT_FILE_STATUSES = [
  'PENDING',
  'GENERATED',
  'STORED',
  'VERIFIED',
  'FAILED',
  'QUARANTINED',
  'DELETED',
] as const;

export type ContractFileStatus = (typeof CONTRACT_FILE_STATUSES)[number];

export const CONTRACT_FILE_PURPOSES = [
  'DOCUMENT_SOURCE',
  'DOCUMENT_OUTPUT',
  'SIGNATURE_EVIDENCE',
  'AUDIT_EVIDENCE',
  'CLINICAL_ATTACHMENT',
  'ADMINISTRATIVE_ATTACHMENT',
] as const;

export type ContractFilePurpose = (typeof CONTRACT_FILE_PURPOSES)[number];

export const CONTRACT_FILE_INTEGRITY_STATES = [
  'UNVERIFIED',
  'VALID',
  'INVALID',
  'MISSING',
  'UNSUPPORTED',
] as const;

export type ContractFileIntegrityState = (typeof CONTRACT_FILE_INTEGRITY_STATES)[number];

export interface ContractFileStorageReference {
  storageProvider: string;
  storageBucket: string;
  storagePath: string;
}

export interface ContractFileIntegrity {
  sha256?: string;
  encryptionStatus?: 'none' | 'at_rest' | 'unknown';
  verifiedAt?: string;
  verificationOk?: boolean;
  state?: ContractFileIntegrityState;
}

/** Artefato canônico por referência — sem bytes persistidos no domínio. */
export interface ContractFileArtifact {
  id: ContractFileId;
  tenantId: TenantId;
  contractId: ContractId;
  contractVersionId?: ContractVersionId;
  envelopeId?: SignatureEnvelopeId;

  fileType: ContractFileType;
  purpose: ContractFilePurpose;
  status: ContractFileStatus;

  mimeType: string;
  originalName?: string;
  generatedName: string;
  sizeBytes: number;
  sha256: string;

  storageReference?: ContractFileStorageReference;
  integrity: ContractFileIntegrity;

  createdBy: string;
  createdAt: string;
  verifiedAt?: string;
  deletedAt?: string;
  retentionPolicy?: string;
  generator?: string;
  /** true quando artefato de demonstração técnica. */
  technicalDemo?: boolean;
}

/** Binário transitório — não serializar em JSON de domínio persistente. */
export interface ContractBinaryArtifact {
  bytes: Uint8Array;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Compatibilidade Phase 10.2/10.3 — mapeável para ContractFileArtifact.
 * Domínio canônico NÃO trata data URL como storage definitivo.
 */
export interface ContractFile {
  id: ContractFileId;
  tenantId: TenantId;
  contractId: ContractId;
  contractVersionId?: ContractVersionId;
  fileType: ContractFileType;
  storage: ContractFileStorageReference;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  integrity: ContractFileIntegrity;
  retentionPolicy?: string;
  uploadedBy: string;
  createdAt: string;
  deletedAt?: string;
  legacyDataUrlPresent?: boolean;
}

export function toContractFileArtifact(file: ContractFile): ContractFileArtifact {
  return {
    id: file.id,
    tenantId: file.tenantId,
    contractId: file.contractId,
    contractVersionId: file.contractVersionId,
    fileType: file.fileType,
    purpose: 'DOCUMENT_OUTPUT',
    status: file.deletedAt ? 'DELETED' : (file.integrity.verificationOk ? 'VERIFIED' : 'STORED'),
    mimeType: file.mimeType,
    originalName: file.originalName,
    generatedName: file.originalName,
    sizeBytes: file.sizeBytes,
    sha256: file.integrity.sha256 || '',
    storageReference: file.storage,
    integrity: file.integrity,
    createdBy: file.uploadedBy,
    createdAt: file.createdAt,
    verifiedAt: file.integrity.verifiedAt,
    deletedAt: file.deletedAt,
    retentionPolicy: file.retentionPolicy,
  };
}
