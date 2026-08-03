/**
 * @module domain/contracts/files/signature-graphic-artifact.service
 * @description Persistência de grafismo de assinatura (PNG/WebP) — Phase 10.10.
 */

import { createContractDomainError, type ContractDomainError } from '../contract.errors.js';
import type { ContractFileId, SignatureSignerId, TenantId } from '../contract.ids.js';
import type { SignatureArtifactReference } from '../signatures/signature.types.js';
import type {
  ContractPrivateStorage,
  PutContractFileInput,
} from './contract-private-storage.js';
import type { ContractBinaryArtifact } from './contract-file.types.js';
import { sha256Bytes, timingSafeEqualHex } from './contract-binary-hash.js';
import { assertAllowedMimeType, rejectDataUrl } from './contract-file-mime.js';
import { DEFAULT_CONTRACT_FILE_SIZE_LIMITS } from './contract-file-limits.js';

const MAX_SIGNATURE_GRAPHIC_BYTES = DEFAULT_CONTRACT_FILE_SIZE_LIMITS.maxSignatureArtifactBytes;

export interface StoreSignatureGraphicInput {
  tenantId: TenantId;
  contractId: string;
  contractVersionId: string;
  envelopeId?: string;
  signerId?: SignatureSignerId;
  contractNumber: string;
  versionNumber: number;
  createdBy: string;
  binary: ContractBinaryArtifact;
  /** Validação opcional de escopo. */
  expectedTenantId?: TenantId;
  expectedSignerId?: SignatureSignerId;
}

export type StoredSignatureGraphicReference = SignatureArtifactReference & {
  sizeBytes: number;
};

export interface SignatureGraphicArtifactService {
  store(input: StoreSignatureGraphicInput): Promise<StoredSignatureGraphicReference>;
}

class GraphicArtifactError extends Error {
  readonly domainError: ContractDomainError;
  constructor(domainError: ContractDomainError) {
    super(domainError.message);
    this.name = 'SignatureGraphicArtifactError';
    this.domainError = domainError;
  }
}

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new GraphicArtifactError(createContractDomainError(code, message, field));
}

function rejectSvgAndBase64(mimeType: string, bytes: Uint8Array): void {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (normalized === 'image/svg+xml' || normalized.includes('svg')) {
    fail('CONTRACT_FILE_MIME_NOT_ALLOWED', 'SVG não permitido para assinatura gráfica.', 'mimeType');
  }
  rejectDataUrl(normalized);
  const head = new TextDecoder().decode(bytes.slice(0, Math.min(64, bytes.byteLength)));
  if (/^data:/i.test(head) || /^<svg/i.test(head)) {
    fail('CONTRACT_FILE_MIME_NOT_ALLOWED', 'data URL/base64/SVG embutido rejeitado.', 'binary');
  }
}

export function createSignatureGraphicArtifactService(
  storage: ContractPrivateStorage,
): SignatureGraphicArtifactService {
  return {
    async store(input) {
      if (input.expectedTenantId && input.expectedTenantId !== input.tenantId) {
        fail('CONTRACT_FILE_TENANT_MISMATCH', 'Tenant diverge do escopo esperado.');
      }
      if (input.expectedSignerId && input.signerId && input.expectedSignerId !== input.signerId) {
        fail('SIGNATURE_SIGNER_NOT_FOUND', 'Signer diverge do escopo esperado.');
      }

      const mime = String(input.binary.mimeType || '').toLowerCase();
      if (mime !== 'image/png' && mime !== 'image/webp') {
        fail('CONTRACT_FILE_MIME_NOT_ALLOWED', 'Apenas PNG ou WebP permitidos.', 'mimeType');
      }
      assertAllowedMimeType(mime);
      rejectSvgAndBase64(mime, input.binary.bytes);

      if (input.binary.sizeBytes > MAX_SIGNATURE_GRAPHIC_BYTES
        || input.binary.bytes.byteLength > MAX_SIGNATURE_GRAPHIC_BYTES) {
        fail('CONTRACT_PDF_TOO_LARGE', 'Grafismo excede 512KB.', 'sizeBytes');
      }
      if (input.binary.sizeBytes !== input.binary.bytes.byteLength) {
        fail('CONTRACT_FILE_SIZE_MISMATCH', 'Tamanho declarado diverge dos bytes.');
      }

      const recomputed = await sha256Bytes(input.binary.bytes);
      if (!timingSafeEqualHex(recomputed, input.binary.sha256)) {
        fail('CONTRACT_FILE_HASH_MISMATCH', 'Hash do grafismo diverge.');
      }

      const putInput: PutContractFileInput = {
        contractId: input.contractId,
        contractVersionId: input.contractVersionId,
        envelopeId: input.envelopeId,
        fileType: 'SIGNATURE_IMAGE',
        purpose: 'SIGNATURE_EVIDENCE',
        binary: {
          ...input.binary,
          mimeType: mime,
          sha256: recomputed,
        },
        contractNumber: input.contractNumber,
        versionNumber: input.versionNumber,
        createdBy: input.createdBy,
        generator: 'signature-graphic-artifact',
      };

      const { artifact } = await storage.put(input.tenantId, putInput);
      return {
        fileId: artifact.id as ContractFileId,
        sha256: artifact.sha256,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
      };
    },
  };
}
