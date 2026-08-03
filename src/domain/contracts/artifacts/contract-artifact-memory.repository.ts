/**
 * @module domain/contracts/artifacts/contract-artifact-memory.repository
 * @description Repositories in-memory de artefatos — Phase 10.7.
 */

import type { TenantId } from '../contract.ids.js';
import type { ContractFileArtifact } from '../files/contract-file.types.js';
import type { ContractIntegrityManifest } from './contract-integrity-manifest.js';
import type { SignatureEvidenceReport } from './signature-evidence-report.js';
import { rejectDataUrl } from '../files/contract-file-mime.js';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface ContractArtifactRepository {
  save(tenantId: TenantId, artifact: ContractFileArtifact): Promise<ContractFileArtifact>;
  findById(tenantId: TenantId, fileId: string): Promise<ContractFileArtifact | null>;
  listByContract(tenantId: TenantId, contractId: string): Promise<ContractFileArtifact[]>;
  listByEnvelope(tenantId: TenantId, envelopeId: string): Promise<ContractFileArtifact[]>;
}

export interface ContractIntegrityManifestRepository {
  save(tenantId: TenantId, manifest: ContractIntegrityManifest): Promise<ContractIntegrityManifest>;
  findByVersion(tenantId: TenantId, contractVersionId: string): Promise<ContractIntegrityManifest | null>;
}

export interface SignatureEvidenceReportRepository {
  save(tenantId: TenantId, report: SignatureEvidenceReport): Promise<SignatureEvidenceReport>;
  findByEnvelope(tenantId: TenantId, envelopeId: string): Promise<SignatureEvidenceReport | null>;
}

export class ContractArtifactMemoryRepository implements ContractArtifactRepository {
  private store = new Map<string, ContractFileArtifact>();

  private key(tenantId: string, id: string) {
    return `${tenantId}::${id}`;
  }

  async save(tenantId: TenantId, artifact: ContractFileArtifact) {
    if (artifact.tenantId !== tenantId) {
      throw Object.assign(new Error('TENANT_MISMATCH'), { code: 'CONTRACT_FILE_TENANT_MISMATCH' });
    }
    rejectDataUrl(artifact.storageReference?.storagePath);
    if (artifact.status === 'VERIFIED') {
      const existing = this.store.get(this.key(tenantId, artifact.id));
      if (existing?.status === 'VERIFIED' && existing.sha256 !== artifact.sha256) {
        throw Object.assign(new Error('Já verificado.'), { code: 'CONTRACT_FILE_ALREADY_VERIFIED' });
      }
    }
    this.store.set(this.key(tenantId, artifact.id), clone(artifact));
    return clone(artifact);
  }

  async findById(tenantId: TenantId, fileId: string) {
    const found = this.store.get(this.key(tenantId, fileId));
    return found && found.tenantId === tenantId ? clone(found) : null;
  }

  async listByContract(tenantId: TenantId, contractId: string) {
    return [...this.store.values()]
      .filter((a) => a.tenantId === tenantId && a.contractId === contractId)
      .map(clone);
  }

  async listByEnvelope(tenantId: TenantId, envelopeId: string) {
    return [...this.store.values()]
      .filter((a) => a.tenantId === tenantId && a.envelopeId === envelopeId)
      .map(clone);
  }
}

export class ContractIntegrityManifestMemoryRepository
implements ContractIntegrityManifestRepository {
  private store = new Map<string, ContractIntegrityManifest>();

  async save(tenantId: TenantId, manifest: ContractIntegrityManifest) {
    if (manifest.tenantId !== tenantId) {
      throw Object.assign(new Error('TENANT_MISMATCH'), { code: 'TENANT_MISMATCH' });
    }
    this.store.set(`${tenantId}::${manifest.contractVersionId}`, clone(manifest));
    return clone(manifest);
  }

  async findByVersion(tenantId: TenantId, contractVersionId: string) {
    const found = this.store.get(`${tenantId}::${contractVersionId}`);
    return found && found.tenantId === tenantId ? clone(found) : null;
  }
}

export class SignatureEvidenceReportMemoryRepository
implements SignatureEvidenceReportRepository {
  private store = new Map<string, SignatureEvidenceReport>();

  async save(tenantId: TenantId, report: SignatureEvidenceReport) {
    if (report.tenantId !== tenantId) {
      throw Object.assign(new Error('TENANT_MISMATCH'), { code: 'TENANT_MISMATCH' });
    }
    this.store.set(`${tenantId}::${report.envelopeId}`, clone(report));
    return clone(report);
  }

  async findByEnvelope(tenantId: TenantId, envelopeId: string) {
    const found = this.store.get(`${tenantId}::${envelopeId}`);
    return found && found.tenantId === tenantId ? clone(found) : null;
  }
}
