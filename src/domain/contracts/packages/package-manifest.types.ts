/**
 * @module domain/contracts/packages/package-manifest.types
 * @description Tipos de manifesto criptográfico do package — Phase 10.21T (design/OPTION_C).
 * Sem persistência / migration aplicada nesta fase.
 */

import type {
  ContractId,
  ContractPackageId,
  ContractVersionId,
  SignatureEnvelopeId,
  SignatureSignerId,
  TenantId,
} from '../contract.ids.js';
import type { ContractDocumentType } from '../contract.constants.js';
import type { SignatureAcceptanceCode } from '../signatures/signature.types.js';

/** Versão do algoritmo de canonicalização — nunca mudar silenciosamente. */
export const PACKAGE_MANIFEST_CANONICALIZATION_VERSION = 'pkg_manifest_v1' as const;

export type PackageManifestCanonicalizationVersion =
  typeof PACKAGE_MANIFEST_CANONICALIZATION_VERSION;

/**
 * Lifecycle do manifesto (design).
 * Não confundir com CONTRACT_PACKAGE_STATUSES (DRAFT/PENDING/…).
 */
export const PACKAGE_MANIFEST_STATUSES = [
  'DRAFT',
  'FROZEN',
  'SIGNING',
  'SIGNED',
  'SUPERSEDED',
  'CANCELLED',
] as const;

export type PackageManifestStatus = (typeof PACKAGE_MANIFEST_STATUSES)[number];

/** Origem do conteúdo congelado. */
export const PACKAGE_MANIFEST_SOURCE_KINDS = [
  'CONTRACT_VERSION',
  'DOCUMENT_RECORD',
  'CLINIC_POLICY',
  'INLINE_SNAPSHOT',
] as const;

export type PackageManifestSourceKind = (typeof PACKAGE_MANIFEST_SOURCE_KINDS)[number];

/** Encoding do contentHash. */
export const PACKAGE_CONTENT_HASH_ENCODINGS = [
  'utf8_canonical_v1',
  'binary_sha256_v1',
] as const;

export type PackageContentHashEncoding = (typeof PACKAGE_CONTENT_HASH_ENCODINGS)[number];

export type PackageManifestId = string;
export type PackageManifestDocumentId = string;
export type PackageDocumentAcceptanceId = string;

/**
 * Item do manifesto — identidade jurídica de um documento apresentado.
 * `contentHash` = hash do conteúdo efetivamente mostrado (não só metadata).
 */
export interface PackageManifestDocument {
  id: PackageManifestDocumentId;
  tenantId: TenantId;
  manifestId: PackageManifestId;
  /** Chave estável no manifesto (ex.: `contract`, `tcle:tcle_implante`, `lgpd`). */
  documentKey: string;
  /** Taxonomia oficial `CONTRACT_DOCUMENT_TYPES`. */
  documentType: ContractDocumentType;
  sourceKind: PackageManifestSourceKind;
  /** contractVersionId / documentRecordId / clinicPolicyId / etc. */
  sourceId: string;
  documentVersion: string;
  title: string;
  required: boolean;
  displayOrder: number;
  contentMimeType: string;
  contentHash: string;
  contentHashEncoding: PackageContentHashEncoding;
  snapshotStorageProvider?: string;
  snapshotStorageBucket?: string;
  snapshotStoragePath?: string;
  /** Código de aceite alinhado a SIGNATURE_ACCEPTANCE_CODES quando aplicável. */
  acceptanceCode?: SignatureAcceptanceCode | string;
  acceptanceLabel?: string;
  createdAt: string;
}

export interface PackageManifest {
  id: PackageManifestId;
  tenantId: TenantId;
  /** FK opcional ao package V2 — null até bridge operacional↔V2. */
  packageId?: ContractPackageId;
  /** Chave operacional estável (`pkg_${budgetId}` / package_number). */
  sourcePackageKey: string;
  manifestVersion: number;
  status: PackageManifestStatus;
  canonicalizationVersion: PackageManifestCanonicalizationVersion | string;
  /** Null até freeze. */
  manifestHash?: string;
  primaryContractId: ContractId;
  primaryContractVersionId: ContractVersionId;
  createdBy: string;
  createdAt: string;
  frozenAt?: string;
  frozenBy?: string;
  idempotencyKey?: string;
  rowVersion?: number;
  metadata?: Record<string, unknown>;
  documents: PackageManifestDocument[];
}

/** Aceite individual por documento do manifesto (por signer). */
export interface PackageDocumentAcceptance {
  id: PackageDocumentAcceptanceId;
  tenantId: TenantId;
  manifestId: PackageManifestId;
  manifestDocumentId: PackageManifestDocumentId;
  envelopeId: SignatureEnvelopeId;
  signerId: SignatureSignerId;
  documentKey: string;
  /** Deve bater com o item frozen no momento do aceite. */
  contentHash: string;
  acceptanceVersion: string;
  viewedAt?: string;
  acceptedAt?: string;
  createdAt: string;
}

/** Payload canônico para hash do manifesto (sem storage paths / labels). */
export interface PackageManifestHashInput {
  canonicalizationVersion: string;
  tenantId: string;
  sourcePackageKey: string;
  packageId?: string | null;
  manifestVersion: number;
  primaryContractId: string;
  primaryContractVersionId: string;
  documents: Array<{
    documentKey: string;
    documentType: string;
    documentVersion: string;
    required: boolean;
    displayOrder: number;
    contentHash: string;
    contentMimeType: string;
  }>;
}

/** Extensão planejada de SignatureEvidenceSnapshot (não altera tipo legado ainda). */
export interface PackageAwareEvidenceExtension {
  packageManifestId?: PackageManifestId;
  packageManifestHash?: string;
  documentAcceptances?: Array<{
    documentKey: string;
    documentType: string;
    documentVersion: string;
    contentHash: string;
    required: boolean;
    viewedAt?: string;
    acceptedAt?: string;
  }>;
}
