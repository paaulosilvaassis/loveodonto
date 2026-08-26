/**
 * @module domain/contracts/packages/package-manifest-freeze.design
 * @description Contrato de API de domínio para freeze — Phase 10.21T (design only).
 * NÃO implementa persistência / envelope / storage nesta fase.
 */

import type {
  ContractId,
  ContractPackageId,
  ContractVersionId,
  SignatureEnvelopeId,
  TenantId,
} from '../contract.ids.js';
import type { PackageManifest, PackageManifestId } from './package-manifest.types.js';

export interface FreezePackageDocumentInput {
  /** OPERATIONAL: CONTRACT_SERVICES | TCLE | LGPD | IMAGE_USE */
  operationalType: string;
  tcleId?: string | null;
  title: string;
  required: boolean;
  displayOrder: number;
  /** Conteúdo efetivamente apresentado (texto/HTML) OU referência binária. */
  presentedText?: string;
  presentedBytes?: Uint8Array;
  contentMimeType: string;
  sourceKind: 'CONTRACT_VERSION' | 'DOCUMENT_RECORD' | 'CLINIC_POLICY' | 'INLINE_SNAPSHOT';
  sourceId: string;
  /** Versão documental real. Ausência é fail-closed — sem fallback para '1'. */
  documentVersion: string | number;
}

export interface FreezePackageForSignatureInput {
  tenantId: TenantId;
  actorUserId: string;
  sourcePackageKey: string;
  packageId?: ContractPackageId;
  primaryContractId: ContractId;
  primaryContractVersionId: ContractVersionId;
  documents: FreezePackageDocumentInput[];
  /** Idempotency — retorna manifesto existente se mesma chave. */
  idempotencyKey: string;
}

export interface FreezePackageForSignatureResult {
  ok: boolean;
  duplicate: boolean;
  manifestId?: PackageManifestId;
  manifestHash?: string;
  manifest?: PackageManifest;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Design da operação freezePackageForSignature():
 *
 * 1. Validar prerequisites (docs required presentes, CRO/clinic se aplicável no caller)
 * 2. Resolver documentos obrigatórios
 * 3. Canonicalizar + hashear cada conteúdo apresentado
 * 4. Persistir snapshots imutáveis (private storage)
 * 5. Inserir manifesto DRAFT → FROZEN com manifestHash
 * 6. Impedir UPDATE/DELETE do manifesto frozen (trigger + API)
 * 7. Associar envelope: package_manifest_id + package_manifest_hash
 *
 * Após FROZEN: mutação = novo manifestVersion + SUPERSEDED do anterior.
 */
export type FreezePackageForSignature = (
  input: FreezePackageForSignatureInput,
) => Promise<FreezePackageForSignatureResult>;

export interface BindManifestToEnvelopeInput {
  tenantId: TenantId;
  envelopeId: SignatureEnvelopeId;
  manifestId: PackageManifestId;
  expectedManifestHash: string;
}

/**
 * Regra: sign() exige
 * - envelope.packageManifestHash === manifest.manifestHash (se manifesto presente)
 * - todos required documents com acceptance.acceptedAt
 * - cada acceptance.contentHash === document.contentHash
 */
export interface PackageManifestSignGate {
  hasManifest: boolean;
  manifestHashMatches: boolean;
  missingRequiredAcceptances: string[];
  contentHashMismatches: string[];
  canSign: boolean;
}
