/**
 * @module domain/contracts/files/contract-private-storage
 * @description Storage privado abstrato — Phase 10.7.
 * Sem bucket real / upload real / URL pública permanente.
 */

import { createContractDomainError, type ContractDomainError } from '../contract.errors.js';
import type { ContractFileId, TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractIdFactory } from '../shared/contract-id-factory.js';
import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import {
  type ContractBinaryArtifact,
  type ContractFileArtifact,
  type ContractFilePurpose,
  type ContractFileType,
} from './contract-file.types.js';
import { assertAllowedMimeType, rejectDataUrl } from './contract-file-mime.js';
import { limitForFileType, resolveContractFileSizeLimits, type ContractFileSizeLimits } from './contract-file-limits.js';
import { buildGeneratedContractFileName } from './contract-file-names.js';
import { createContractStoragePathBuilder } from './contract-storage-path.js';
import { sha256Bytes, timingSafeEqualHex } from './contract-binary-hash.js';
import { extensionForMimeType } from './contract-file-mime.js';

export type ContractAuditActor = {
  userId: string;
  displayName?: string;
  permissions?: string[];
};

export interface PutContractFileInput {
  contractId: string;
  contractVersionId: string;
  envelopeId?: string;
  fileType: ContractFileType;
  purpose: ContractFilePurpose;
  binary: ContractBinaryArtifact;
  contractNumber: string;
  versionNumber: number;
  createdBy: string;
  technicalDemo?: boolean;
  generator?: string;
}

export interface StoredContractFileResult {
  artifact: ContractFileArtifact;
  temporaryDownloadToken?: string;
}

export interface AuthorizedContractFileDownload {
  fileId: ContractFileId;
  mimeType: string;
  generatedName: string;
  sizeBytes: number;
  sha256: string;
  bytes: Uint8Array;
  temporaryToken: string;
  expiresAt: string;
}

export interface ContractFileIntegrityResult {
  fileId: ContractFileId;
  state: 'UNVERIFIED' | 'VALID' | 'INVALID' | 'MISSING' | 'UNSUPPORTED';
  expectedHash?: string;
  actualHash?: string;
  sizeMatch?: boolean;
  mimeMatch?: boolean;
}

export interface ContractPrivateStorage {
  put(tenantId: TenantId, input: PutContractFileInput): Promise<StoredContractFileResult>;
  getAuthorizedDownload(
    tenantId: TenantId,
    fileId: ContractFileId,
    actor: ContractAuditActor,
  ): Promise<AuthorizedContractFileDownload>;
  verifyIntegrity(tenantId: TenantId, fileId: ContractFileId): Promise<ContractFileIntegrityResult>;
  deleteLogical(
    tenantId: TenantId,
    fileId: ContractFileId,
    actor: ContractAuditActor,
  ): Promise<ContractFileArtifact>;
  findById(tenantId: TenantId, fileId: ContractFileId): Promise<ContractFileArtifact | null>;
  listByContract(tenantId: TenantId, contractId: string): Promise<ContractFileArtifact[]>;
}

class StorageError extends Error {
  readonly domainError: ContractDomainError;
  constructor(domainError: ContractDomainError) {
    super(domainError.message);
    this.name = 'ContractStorageError';
    this.domainError = domainError;
  }
}

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new StorageError(createContractDomainError(code, message, field));
}

function requirePerm(actor: ContractAuditActor, permission: string): void {
  if (!(actor.permissions || []).includes(permission)) {
    fail('PERMISSION_DENIED', `Permissão necessária: ${permission}.`);
  }
}

export function createUnavailableContractPrivateStorage(): ContractPrivateStorage {
  const unavailable = async () => {
    fail('CONTRACT_FILE_STORAGE_UNAVAILABLE', 'Storage privado v2 indisponível.');
  };
  return {
    put: unavailable as never,
    getAuthorizedDownload: unavailable as never,
    verifyIntegrity: unavailable as never,
    deleteLogical: unavailable as never,
    findById: async () => null,
    listByContract: async () => [],
  };
}

interface StoredBlob {
  artifact: ContractFileArtifact;
  bytes: Uint8Array;
}

export function createMemoryContractPrivateStorage(options: {
  clock?: ContractClock;
  ids?: ContractIdFactory;
  limits?: Partial<ContractFileSizeLimits>;
} = {}): ContractPrivateStorage {
  const clock = options.clock || createSystemContractClock();
  const ids = options.ids || createCryptoContractIdFactory();
  const limits = resolveContractFileSizeLimits(options.limits);
  const pathBuilder = createContractStoragePathBuilder();
  const store = new Map<string, StoredBlob>();
  const downloadTokens = new Map<string, { fileId: string; tenantId: string; expiresAt: string }>();

  function key(tenantId: string, fileId: string) {
    return `${tenantId}::${fileId}`;
  }

  return {
    async put(tenantId, input) {
      const tid = String(tenantId || '').trim();
      if (!tid) fail('TENANT_REQUIRED', 'tenantId obrigatório.');
      assertAllowedMimeType(input.binary.mimeType);
      rejectDataUrl(input.binary.mimeType);

      const max = limitForFileType(input.fileType, limits);
      if (input.binary.sizeBytes > max || input.binary.bytes.byteLength > max) {
        fail('CONTRACT_PDF_TOO_LARGE', 'Arquivo excede o limite permitido.', 'sizeBytes');
      }
      if (input.binary.sizeBytes !== input.binary.bytes.byteLength) {
        fail('CONTRACT_FILE_SIZE_MISMATCH', 'Tamanho declarado diverge dos bytes.');
      }

      const recomputed = await sha256Bytes(input.binary.bytes);
      if (!timingSafeEqualHex(recomputed, input.binary.sha256)) {
        fail('CONTRACT_FILE_HASH_MISMATCH', 'Hash do binário diverge.');
      }

      const fileId = ids.next('file') as ContractFileId;
      const path = pathBuilder.build({
        tenantId: tid,
        contractId: input.contractId,
        versionId: input.contractVersionId,
        fileType: input.fileType,
        fileId,
        mimeType: input.binary.mimeType,
        envelopeId: input.envelopeId,
      });

      const generatedName = buildGeneratedContractFileName({
        fileType: input.fileType,
        contractNumber: input.contractNumber,
        versionNumber: input.versionNumber,
        mimeExtension: extensionForMimeType(input.binary.mimeType),
      });

      const now = clock.nowIso();
      const artifact: ContractFileArtifact = {
        id: fileId,
        tenantId: tid as TenantId,
        contractId: input.contractId as never,
        contractVersionId: input.contractVersionId as never,
        envelopeId: input.envelopeId as never,
        fileType: input.fileType,
        purpose: input.purpose,
        status: 'STORED',
        mimeType: input.binary.mimeType,
        generatedName,
        sizeBytes: input.binary.sizeBytes,
        sha256: recomputed,
        storageReference: {
          storageProvider: 'memory',
          storageBucket: 'private-contracts-v2-memory',
          storagePath: path,
        },
        integrity: {
          sha256: recomputed,
          encryptionStatus: 'none',
          state: 'UNVERIFIED',
        },
        createdBy: input.createdBy,
        createdAt: now,
        generator: input.generator || 'contracts-v2-memory',
        technicalDemo: Boolean(input.technicalDemo),
      };

      store.set(key(tid, fileId), {
        artifact: { ...artifact },
        bytes: new Uint8Array(input.binary.bytes),
      });

      const token = `dl_${fileId}_${Date.now().toString(36)}`;
      downloadTokens.set(token, {
        fileId,
        tenantId: tid,
        expiresAt: new Date(clock.now().getTime() + 5 * 60_000).toISOString(),
      });

      return { artifact, temporaryDownloadToken: token };
    },

    async findById(tenantId, fileId) {
      const found = store.get(key(tenantId, fileId));
      if (!found || found.artifact.tenantId !== tenantId) return null;
      return { ...found.artifact };
    },

    async listByContract(tenantId, contractId) {
      return [...store.values()]
        .filter((s) => s.artifact.tenantId === tenantId && s.artifact.contractId === contractId)
        .map((s) => ({ ...s.artifact }));
    },

    async getAuthorizedDownload(tenantId, fileId, actor) {
      requirePerm(actor, 'contracts:download');
      const found = store.get(key(tenantId, fileId));
      if (!found || found.artifact.tenantId !== tenantId || found.artifact.deletedAt) {
        fail('CONTRACT_FILE_NOT_FOUND', 'Arquivo não encontrado.');
      }
      if (found.artifact.fileType === 'EVIDENCE_REPORT'
        && !(actor.permissions || []).includes('contracts:download_evidence')
        && !(actor.permissions || []).includes('contracts:download')) {
        fail('PERMISSION_DENIED', 'Permissão de evidência necessária.');
      }
      const token = `dl_${fileId}_${clock.now().getTime().toString(36)}`;
      const expiresAt = new Date(clock.now().getTime() + 5 * 60_000).toISOString();
      downloadTokens.set(token, { fileId, tenantId, expiresAt });
      return {
        fileId,
        mimeType: found.artifact.mimeType,
        generatedName: found.artifact.generatedName,
        sizeBytes: found.artifact.sizeBytes,
        sha256: found.artifact.sha256,
        bytes: new Uint8Array(found.bytes),
        temporaryToken: token,
        expiresAt,
      };
    },

    async verifyIntegrity(tenantId, fileId) {
      const found = store.get(key(tenantId, fileId));
      if (!found || found.artifact.tenantId !== tenantId) {
        return { fileId, state: 'MISSING' };
      }
      const actualHash = await sha256Bytes(found.bytes);
      const sizeMatch = found.bytes.byteLength === found.artifact.sizeBytes;
      const hashMatch = timingSafeEqualHex(actualHash, found.artifact.sha256);
      const mimeMatch = Boolean(found.artifact.mimeType);
      const state = hashMatch && sizeMatch && mimeMatch ? 'VALID' : 'INVALID';
      const now = clock.nowIso();
      found.artifact = {
        ...found.artifact,
        status: state === 'VALID' ? 'VERIFIED' : 'FAILED',
        verifiedAt: now,
        integrity: {
          ...found.artifact.integrity,
          sha256: found.artifact.sha256,
          verifiedAt: now,
          verificationOk: state === 'VALID',
          state,
        },
      };
      store.set(key(tenantId, fileId), found);
      return {
        fileId,
        state,
        expectedHash: found.artifact.sha256,
        actualHash,
        sizeMatch,
        mimeMatch,
      };
    },

    async deleteLogical(tenantId, fileId, actor) {
      requirePerm(actor, 'contracts:manage_attachments');
      const found = store.get(key(tenantId, fileId));
      if (!found || found.artifact.tenantId !== tenantId) {
        fail('CONTRACT_FILE_NOT_FOUND', 'Arquivo não encontrado.');
      }
      if (found.artifact.fileType === 'SIGNED_PDF') {
        fail('CONTRACT_FILE_DELETE_NOT_ALLOWED', 'PDF assinado não pode ser excluído por fluxo comum.');
      }
      const now = clock.nowIso();
      found.artifact = {
        ...found.artifact,
        status: 'DELETED',
        deletedAt: now,
      };
      store.set(key(tenantId, fileId), found);
      return { ...found.artifact };
    },
  };
}
