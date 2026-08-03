/**
 * @module domain/contracts/files/contract-file-reconciliation.service
 * @description Inspeção de inconsistências metadata↔object — Phase 10.10.
 * Sem auto-repair destrutivo.
 */

import { createContractDomainError, type ContractDomainError } from '../contract.errors.js';
import type { ContractFileId, ContractId, TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractFileArtifact } from './contract-file.types.js';
import type { ContractObjectStorageDriver } from './contract-object-storage-driver.js';
import { sha256Bytes, timingSafeEqualHex } from './contract-binary-hash.js';

export type ContractFileReconciliationIssueCode =
  | 'METADATA_WITHOUT_OBJECT'
  | 'OBJECT_WITHOUT_METADATA'
  | 'HASH_DIVERGENCE'
  | 'SIZE_DIVERGENCE'
  | 'MIME_DIVERGENCE'
  | 'PENDING_STALE'
  | 'STORED_UNVERIFIED'
  | 'INCOMPLETE_SIGNATURE_ARTIFACT'
  | 'STATUS_OBJECT_MISMATCH';

export interface ContractFileReconciliationIssue {
  code: ContractFileReconciliationIssueCode;
  fileId?: ContractFileId;
  storagePath?: string;
  details?: string;
}

export interface ContractFileRepairAction {
  code: string;
  action: string;
  autoExecuted: false;
  fileId?: ContractFileId;
}

export interface ContractFileReconciliationReport {
  tenantId: TenantId;
  contractId?: ContractId;
  issues: ContractFileReconciliationIssue[];
  repairPlan: ContractFileRepairAction[];
  errors: ContractDomainError[];
}

export interface ContractFileReconciliationService {
  inspect(
    tenantId: TenantId,
    contractId?: ContractId,
  ): Promise<ContractFileReconciliationReport>;

  planRepair(report: ContractFileReconciliationReport): ContractFileRepairAction[];
}

const STALE_PENDING_MS = 15 * 60_000;
const STORED_UNVERIFIED_MS = 60 * 60_000;

export function createMemoryContractFileReconciliationService(deps: {
  listFiles: (tenantId: TenantId, contractId?: ContractId) => Promise<ContractFileArtifact[]>;
  listOrphanPaths?: (tenantId: TenantId) => Promise<string[]>;
  driver?: ContractObjectStorageDriver;
  clock?: ContractClock;
  stalePendingMs?: number;
  storedUnverifiedMs?: number;
}): ContractFileReconciliationService {
  return createContractFileReconciliationService(deps);
}

export function createContractFileReconciliationService(deps: {
  listFiles: (tenantId: TenantId, contractId?: ContractId) => Promise<ContractFileArtifact[]>;
  listOrphanPaths?: (tenantId: TenantId) => Promise<string[]>;
  driver?: ContractObjectStorageDriver;
  clock?: ContractClock;
  stalePendingMs?: number;
  storedUnverifiedMs?: number;
}): ContractFileReconciliationService {
  const clock = deps.clock || createSystemContractClock();
  const stalePendingMs = deps.stalePendingMs ?? STALE_PENDING_MS;
  const storedUnverifiedMs = deps.storedUnverifiedMs ?? STORED_UNVERIFIED_MS;

  async function inspectObject(
    artifact: ContractFileArtifact,
    issues: ContractFileReconciliationIssue[],
  ): Promise<void> {
    const path = artifact.storageReference?.storagePath;
    if (!path || !deps.driver) return;
    const exists = await deps.driver.exists(path);
    if (!exists) {
      issues.push({
        code: 'METADATA_WITHOUT_OBJECT',
        fileId: artifact.id,
        storagePath: path,
      });
      return;
    }
    try {
      const bytes = await deps.driver.download(path);
      const actualHash = await sha256Bytes(bytes);
      if (!timingSafeEqualHex(actualHash, artifact.sha256)) {
        issues.push({
          code: 'HASH_DIVERGENCE',
          fileId: artifact.id,
          details: 'sha256 diverge do objeto.',
        });
      }
      if (bytes.byteLength !== artifact.sizeBytes) {
        issues.push({
          code: 'SIZE_DIVERGENCE',
          fileId: artifact.id,
          details: `expected=${artifact.sizeBytes} actual=${bytes.byteLength}`,
        });
      }
    } catch {
      issues.push({
        code: 'METADATA_WITHOUT_OBJECT',
        fileId: artifact.id,
        storagePath: path,
        details: 'download falhou.',
      });
    }
  }

  function inspectStatusTiming(
    artifact: ContractFileArtifact,
    issues: ContractFileReconciliationIssue[],
  ): void {
    const now = clock.now().getTime();
    const created = Date.parse(artifact.createdAt);
    if (artifact.status === 'PENDING' && now - created > stalePendingMs) {
      issues.push({ code: 'PENDING_STALE', fileId: artifact.id });
    }
    if (artifact.status === 'STORED') {
      const ref = artifact.verifiedAt || artifact.createdAt;
      if (now - Date.parse(ref) > storedUnverifiedMs) {
        issues.push({ code: 'STORED_UNVERIFIED', fileId: artifact.id });
      }
    }
    if (artifact.fileType === 'SIGNATURE_IMAGE' && artifact.status === 'VERIFIED') {
      if (!artifact.sha256 || !artifact.mimeType.startsWith('image/')) {
        issues.push({ code: 'INCOMPLETE_SIGNATURE_ARTIFACT', fileId: artifact.id });
      }
    }
  }

  const service: ContractFileReconciliationService = {
    async inspect(tenantId, contractId) {
      const errors: ContractDomainError[] = [];
      const issues: ContractFileReconciliationIssue[] = [];
      let files: ContractFileArtifact[] = [];
      try {
        files = await deps.listFiles(tenantId, contractId);
      } catch (err) {
        errors.push(createContractDomainError(
          'CONTRACT_FILE_STORAGE_UNAVAILABLE',
          String((err as Error).message || 'Falha ao listar arquivos.'),
        ));
      }

      const knownPaths = new Set<string>();
      for (const file of files) {
        if (file.deletedAt) continue;
        const path = file.storageReference?.storagePath;
        if (path) knownPaths.add(path);
        if (['STORED', 'VERIFIED'].includes(file.status) && path && deps.driver) {
          await inspectObject(file, issues);
        } else if (['STORED', 'VERIFIED'].includes(file.status) && !path) {
          issues.push({ code: 'METADATA_WITHOUT_OBJECT', fileId: file.id });
        }
        inspectStatusTiming(file, issues);
        if (file.status === 'PENDING' && path) {
          issues.push({
            code: 'STATUS_OBJECT_MISMATCH',
            fileId: file.id,
            details: 'PENDING com storagePath.',
          });
        }
      }

      if (deps.listOrphanPaths && deps.driver) {
        try {
          const orphans = await deps.listOrphanPaths(tenantId);
          for (const storagePath of orphans) {
            if (!knownPaths.has(storagePath)) {
              issues.push({ code: 'OBJECT_WITHOUT_METADATA', storagePath });
            }
          }
        } catch {
          errors.push(createContractDomainError(
            'CONTRACT_STORAGE_BUCKET_UNAVAILABLE',
            'Falha ao listar objetos órfãos.',
          ));
        }
      }

      const report: ContractFileReconciliationReport = {
        tenantId,
        contractId,
        issues,
        repairPlan: [],
        errors,
      };
      report.repairPlan = service.planRepair(report);
      return report;
    },

    planRepair(report) {
      const plan: ContractFileRepairAction[] = [];
      for (const issue of report.issues) {
        switch (issue.code) {
          case 'METADATA_WITHOUT_OBJECT':
            plan.push({
              code: issue.code,
              action: 'MANUAL_REVIEW_OR_MARK_FAILED',
              autoExecuted: false,
              fileId: issue.fileId,
            });
            break;
          case 'OBJECT_WITHOUT_METADATA':
            plan.push({
              code: issue.code,
              action: 'MANUAL_REVIEW_OR_COMPENSATION_DELETE',
              autoExecuted: false,
            });
            break;
          case 'HASH_DIVERGENCE':
          case 'SIZE_DIVERGENCE':
          case 'MIME_DIVERGENCE':
            plan.push({
              code: issue.code,
              action: 'MANUAL_REVIEW_REUPLOAD_OR_QUARANTINE',
              autoExecuted: false,
              fileId: issue.fileId,
            });
            break;
          case 'PENDING_STALE':
            plan.push({
              code: issue.code,
              action: 'MANUAL_REVIEW_OR_MARK_FAILED',
              autoExecuted: false,
              fileId: issue.fileId,
            });
            break;
          case 'STORED_UNVERIFIED':
            plan.push({
              code: issue.code,
              action: 'RUN_VERIFY_INTEGRITY',
              autoExecuted: false,
              fileId: issue.fileId,
            });
            break;
          case 'INCOMPLETE_SIGNATURE_ARTIFACT':
            plan.push({
              code: issue.code,
              action: 'MANUAL_REVIEW_SIGNATURE_ARTIFACT',
              autoExecuted: false,
              fileId: issue.fileId,
            });
            break;
          default:
            plan.push({
              code: issue.code,
              action: 'MANUAL_REVIEW_REQUIRED',
              autoExecuted: false,
              fileId: issue.fileId,
            });
        }
      }
      return plan;
    },
  };

  return service;
}
