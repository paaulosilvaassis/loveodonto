/**
 * @module domain/contracts/files/supabase-contract-private-storage
 * @description Storage privado Supabase local — Phase 10.10.
 * Saga: PENDING → upload → STORED → verify → VERIFIED.
 */

import { createContractDomainError, type ContractDomainError } from '../contract.errors.js';
import type { ContractFileId, TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractIdFactory } from '../shared/contract-id-factory.js';
import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import {
  type ContractFileArtifact,
  type ContractFileStatus,
} from './contract-file.types.js';
import { assertAllowedMimeType, extensionForMimeType, rejectDataUrl } from './contract-file-mime.js';
import {
  limitForFileType,
  resolveContractFileSizeLimits,
  type ContractFileSizeLimits,
} from './contract-file-limits.js';
import { buildGeneratedContractFileName } from './contract-file-names.js';
import { createContractStoragePathBuilder } from './contract-storage-path.js';
import { sha256Bytes, timingSafeEqualHex } from './contract-binary-hash.js';
import type { ContractObjectStorageDriver } from './contract-object-storage-driver.js';
const CONTRACTS_V2_PRIVATE_LOCAL_BUCKET = 'contracts-v2-private-local';
import type {
  AuthorizedContractFileDownload,
  ContractAuditActor,
  ContractFileIntegrityResult,
  ContractPrivateStorage,
  PutContractFileInput,
  StoredContractFileResult,
} from './contract-private-storage.js';

export interface ContractFilePersistenceCallbacks {
  create(tenantId: TenantId, file: ContractFileArtifact): Promise<ContractFileArtifact>;
  findById(tenantId: TenantId, fileId: ContractFileId): Promise<ContractFileArtifact | null>;
  updateStatus(
    tenantId: TenantId,
    fileId: ContractFileId,
    patch: Partial<Pick<
      ContractFileArtifact,
      'status' | 'sha256' | 'sizeBytes' | 'mimeType' | 'verifiedAt' | 'integrity' | 'storageReference'
    >> & { deletedAt?: string },
    expectedRowVersion?: number,
  ): Promise<ContractFileArtifact>;
  listByContract(tenantId: TenantId, contractId: string): Promise<ContractFileArtifact[]>;
  softDelete(
    tenantId: TenantId,
    fileId: ContractFileId,
    deletedAt: string,
  ): Promise<ContractFileArtifact>;
}

export interface ContractStorageOpsLedger {
  append(entry: {
    tenantId: TenantId;
    contractId?: string;
    fileId?: ContractFileId;
    eventType: string;
    actorType?: string;
    actorId?: string;
    payload?: Record<string, unknown>;
    occurredAt?: string;
  }): Promise<void>;
}

class StorageError extends Error {
  readonly domainError: ContractDomainError;
  constructor(domainError: ContractDomainError) {
    super(domainError.message);
    this.name = 'SupabaseContractStorageError';
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

async function appendOp(
  ledger: ContractStorageOpsLedger | undefined,
  entry: Parameters<ContractStorageOpsLedger['append']>[0],
): Promise<void> {
  if (!ledger) return;
  try {
    await ledger.append(entry);
  } catch {
    // best-effort — não bloqueia fluxo principal
  }
}

export function createSupabaseContractPrivateStorage(options: {
  mode: 'local-test';
  bucket: string;
  driver: ContractObjectStorageDriver;
  fileRepository: ContractFilePersistenceCallbacks;
  opsLedger?: ContractStorageOpsLedger;
  clock?: ContractClock;
  ids?: ContractIdFactory;
  limits?: Partial<ContractFileSizeLimits>;
}): ContractPrivateStorage {
  if (options.mode !== 'local-test') {
    fail('CONTRACTS_V2_LOCAL_STORAGE_REQUIRED', 'Modo local-test obrigatório.');
  }
  if (options.bucket !== CONTRACTS_V2_PRIVATE_LOCAL_BUCKET) {
    fail('CONTRACT_STORAGE_BUCKET_UNAVAILABLE', 'Bucket fora do allowlist local.');
  }

  const clock = options.clock || createSystemContractClock();
  const ids = options.ids || createCryptoContractIdFactory();
  const limits = resolveContractFileSizeLimits(options.limits);
  const pathBuilder = createContractStoragePathBuilder();
  const { driver, fileRepository, opsLedger } = options;
  const bucket = options.bucket;
  const storageProvider = 'supabase-local';

  async function compensationDelete(
    tenantId: TenantId,
    path: string,
    fileId: ContractFileId,
    contractId: string,
  ): Promise<void> {
    try {
      await driver.remove(path);
    } catch {
      // compensação best-effort
    }
    await appendOp(opsLedger, {
      tenantId,
      contractId,
      fileId,
      eventType: 'FILE_RECONCILIATION_REQUIRED',
      payload: { reason: 'metadata_after_upload_failed', storagePath: path },
      occurredAt: clock.nowIso(),
    });
  }

  const storage: ContractPrivateStorage = {
    async put(tenantId, input: PutContractFileInput): Promise<StoredContractFileResult> {
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
      let artifact: ContractFileArtifact = {
        id: fileId,
        tenantId: tid as TenantId,
        contractId: input.contractId as never,
        contractVersionId: input.contractVersionId as never,
        envelopeId: input.envelopeId as never,
        fileType: input.fileType,
        purpose: input.purpose,
        status: 'PENDING',
        mimeType: input.binary.mimeType,
        generatedName,
        sizeBytes: input.binary.sizeBytes,
        sha256: recomputed,
        storageReference: {
          storageProvider,
          storageBucket: bucket,
          storagePath: path,
        },
        integrity: {
          sha256: recomputed,
          encryptionStatus: 'at_rest',
          state: 'UNVERIFIED',
        },
        createdBy: input.createdBy,
        createdAt: now,
        generator: input.generator || 'contracts-v2-supabase-local',
        technicalDemo: Boolean(input.technicalDemo),
      };

      await appendOp(opsLedger, {
        tenantId: tid as TenantId,
        contractId: input.contractId,
        fileId,
        eventType: 'FILE_UPLOAD_STARTED',
        occurredAt: now,
      });

      try {
        artifact = await fileRepository.create(tid as TenantId, artifact);
      } catch (err) {
        fail(
          'CONTRACT_STORAGE_METADATA_INCONSISTENT',
          String((err as Error).message || 'Falha ao criar metadata PENDING.'),
        );
      }

      try {
        await driver.upload(path, input.binary.bytes, {
          mimeType: input.binary.mimeType,
          upsert: false,
        });
      } catch {
        try {
          artifact = await fileRepository.updateStatus(
            tid as TenantId,
            fileId,
            { status: 'FAILED' },
          );
        } catch {
          // best-effort
        }
        await appendOp(opsLedger, {
          tenantId: tid as TenantId,
          contractId: input.contractId,
          fileId,
          eventType: 'FILE_UPLOAD_FAILED',
          occurredAt: clock.nowIso(),
        });
        fail('CONTRACT_FILE_STORAGE_UNAVAILABLE', 'Upload falhou.');
      }

      try {
        artifact = await fileRepository.updateStatus(
          tid as TenantId,
          fileId,
          { status: 'STORED' },
        );
      } catch (err) {
        await compensationDelete(tid as TenantId, path, fileId, input.contractId);
        fail(
          'CONTRACT_STORAGE_COMPENSATION_REQUIRED',
          String((err as Error).message || 'Metadata pós-upload falhou.'),
        );
      }

      await appendOp(opsLedger, {
        tenantId: tid as TenantId,
        contractId: input.contractId,
        fileId,
        eventType: 'FILE_UPLOAD_COMPLETED',
        occurredAt: clock.nowIso(),
      });

      const verified = await storage.verifyIntegrity(tid as TenantId, fileId);
      if (verified.state === 'VALID') {
        artifact = (await fileRepository.findById(tid as TenantId, fileId)) || artifact;
      } else if (verified.state === 'INVALID') {
        fail('CONTRACT_STORAGE_OBJECT_HASH_CONFLICT', 'Hash pós-upload diverge.');
      }

      const token = `dl_${fileId}_${clock.now().getTime().toString(36)}`;
      return { artifact, temporaryDownloadToken: token };
    },

    async findById(tenantId, fileId) {
      return fileRepository.findById(tenantId, fileId);
    },

    async listByContract(tenantId, contractId) {
      return fileRepository.listByContract(tenantId, contractId);
    },

    async getAuthorizedDownload(tenantId, fileId, actor) {
      requirePerm(actor, 'contracts:download');
      const found = await fileRepository.findById(tenantId, fileId);
      if (!found || found.tenantId !== tenantId || found.deletedAt) {
        fail('CONTRACT_FILE_NOT_FOUND', 'Arquivo não encontrado.');
      }
      if (found.fileType === 'EVIDENCE_REPORT'
        && !(actor.permissions || []).includes('contracts:download_evidence')
        && !(actor.permissions || []).includes('contracts:download')) {
        fail('PERMISSION_DENIED', 'Permissão de evidência necessária.');
      }
      const path = found.storageReference?.storagePath;
      if (!path) fail('CONTRACT_STORAGE_OBJECT_NOT_FOUND', 'Path ausente.');

      await appendOp(opsLedger, {
        tenantId,
        contractId: found.contractId,
        fileId,
        eventType: 'FILE_DOWNLOAD_AUTHORIZED',
        actorType: 'USER',
        actorId: actor.userId,
        occurredAt: clock.nowIso(),
      });

      const bytes = await driver.download(path);
      const token = `dl_${fileId}_${clock.now().getTime().toString(36)}`;
      const expiresAt = new Date(clock.now().getTime() + 5 * 60_000).toISOString();
      // Signed URL apenas transitória interna — não expor/logar
      void driver.createSignedUrl(path, 300).catch(() => undefined);

      await appendOp(opsLedger, {
        tenantId,
        contractId: found.contractId,
        fileId,
        eventType: 'FILE_DOWNLOAD_COMPLETED',
        occurredAt: clock.nowIso(),
      });

      const result: AuthorizedContractFileDownload = {
        fileId,
        mimeType: found.mimeType,
        generatedName: found.generatedName,
        sizeBytes: found.sizeBytes,
        sha256: found.sha256,
        bytes,
        temporaryToken: token,
        expiresAt,
      };
      return result;
    },

    async verifyIntegrity(tenantId, fileId) {
      const found = await fileRepository.findById(tenantId, fileId);
      if (!found || found.tenantId !== tenantId) {
        return { fileId, state: 'MISSING' };
      }
      const path = found.storageReference?.storagePath;
      if (!path) return { fileId, state: 'MISSING' };

      let bytes: Uint8Array;
      try {
        bytes = await driver.download(path);
      } catch {
        return { fileId, state: 'MISSING' };
      }

      const actualHash = await sha256Bytes(bytes);
      const sizeMatch = bytes.byteLength === found.sizeBytes;
      const hashMatch = timingSafeEqualHex(actualHash, found.sha256);
      const mimeMatch = Boolean(found.mimeType);
      const state = hashMatch && sizeMatch && mimeMatch ? 'VALID' : 'INVALID';
      const now = clock.nowIso();
      const nextStatus: ContractFileStatus = state === 'VALID' ? 'VERIFIED' : 'FAILED';

      await fileRepository.updateStatus(tenantId, fileId, {
        status: nextStatus,
        verifiedAt: now,
        integrity: {
          ...found.integrity,
          sha256: found.sha256,
          verifiedAt: now,
          verificationOk: state === 'VALID',
          state,
        },
      });

      if (state === 'VALID') {
        await appendOp(opsLedger, {
          tenantId,
          contractId: found.contractId,
          fileId,
          eventType: 'FILE_VERIFIED',
          occurredAt: now,
        });
      }

      return {
        fileId,
        state,
        expectedHash: found.sha256,
        actualHash,
        sizeMatch,
        mimeMatch,
      } satisfies ContractFileIntegrityResult;
    },

    async deleteLogical(tenantId, fileId, actor) {
      requirePerm(actor, 'contracts:manage_attachments');
      const found = await fileRepository.findById(tenantId, fileId);
      if (!found || found.tenantId !== tenantId) {
        fail('CONTRACT_FILE_NOT_FOUND', 'Arquivo não encontrado.');
      }
      if (found.fileType === 'SIGNED_PDF') {
        fail('CONTRACT_FILE_DELETE_NOT_ALLOWED', 'PDF assinado não pode ser excluído por fluxo comum.');
      }
      await appendOp(opsLedger, {
        tenantId,
        contractId: found.contractId,
        fileId,
        eventType: 'FILE_DELETE_REQUESTED',
        actorType: 'USER',
        actorId: actor.userId,
        occurredAt: clock.nowIso(),
      });
      return fileRepository.softDelete(tenantId, fileId, clock.nowIso());
    },
  };

  return storage;
}
