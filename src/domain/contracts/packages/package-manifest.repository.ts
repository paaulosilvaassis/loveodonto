/**
 * @module domain/contracts/packages/package-manifest.repository
 * @description Persistência de manifesto criptográfico — Phase 10.21U.
 */

import type { TenantId } from '../contract.ids.js';
import type {
  PackageDocumentAcceptance,
  PackageDocumentAcceptanceId,
  PackageManifest,
  PackageManifestDocument,
  PackageManifestDocumentId,
  PackageManifestId,
} from './package-manifest.types.js';

export interface PackageManifestRepository {
  findById(tenantId: TenantId, manifestId: PackageManifestId): Promise<PackageManifest | null>;
  findByIdempotencyKey(
    tenantId: TenantId,
    idempotencyKey: string,
  ): Promise<PackageManifest | null>;
  findLatestBySourcePackageKey(
    tenantId: TenantId,
    sourcePackageKey: string,
  ): Promise<PackageManifest | null>;
  create(tenantId: TenantId, manifest: PackageManifest): Promise<PackageManifest>;
  update(tenantId: TenantId, manifest: PackageManifest): Promise<PackageManifest>;
}

export interface PackageDocumentAcceptanceRepository {
  findById(
    tenantId: TenantId,
    acceptanceId: PackageDocumentAcceptanceId,
  ): Promise<PackageDocumentAcceptance | null>;
  findBySignerAndDocument(
    tenantId: TenantId,
    signerId: string,
    manifestDocumentId: PackageManifestDocumentId,
  ): Promise<PackageDocumentAcceptance | null>;
  listByEnvelope(
    tenantId: TenantId,
    envelopeId: string,
  ): Promise<PackageDocumentAcceptance[]>;
  listBySigner(
    tenantId: TenantId,
    signerId: string,
  ): Promise<PackageDocumentAcceptance[]>;
  upsert(
    tenantId: TenantId,
    acceptance: PackageDocumentAcceptance,
  ): Promise<{ acceptance: PackageDocumentAcceptance; created: boolean }>;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class PackageManifestMemoryRepository implements PackageManifestRepository {
  private store = new Map<string, PackageManifest>();

  private key(tenantId: string, id: string) {
    return `${tenantId}::${id}`;
  }

  async findById(tenantId: TenantId, manifestId: PackageManifestId) {
    const found = this.store.get(this.key(tenantId, manifestId));
    return found ? clone(found) : null;
  }

  async findByIdempotencyKey(tenantId: TenantId, idempotencyKey: string) {
    const key = String(idempotencyKey || '').trim();
    if (!key) return null;
    for (const m of this.store.values()) {
      if (m.tenantId === tenantId && m.idempotencyKey === key) return clone(m);
    }
    return null;
  }

  async findLatestBySourcePackageKey(tenantId: TenantId, sourcePackageKey: string) {
    const matches = [...this.store.values()]
      .filter((m) => m.tenantId === tenantId && m.sourcePackageKey === sourcePackageKey)
      .sort((a, b) => b.manifestVersion - a.manifestVersion);
    return matches[0] ? clone(matches[0]) : null;
  }

  async create(tenantId: TenantId, manifest: PackageManifest) {
    if (manifest.tenantId !== tenantId) {
      throw new Error('PACKAGE_MANIFEST_TENANT_MISMATCH');
    }
    const k = this.key(tenantId, manifest.id);
    if (this.store.has(k)) throw new Error('PACKAGE_MANIFEST_ALREADY_EXISTS');
    this.store.set(k, clone(manifest));
    return clone(manifest);
  }

  async update(tenantId: TenantId, manifest: PackageManifest) {
    const existing = await this.findById(tenantId, manifest.id);
    if (!existing) throw new Error('PACKAGE_MANIFEST_NOT_FOUND');
    if (existing.tenantId !== tenantId || manifest.tenantId !== tenantId) {
      throw new Error('PACKAGE_MANIFEST_TENANT_IMMUTABLE');
    }
    if (['FROZEN', 'SIGNING', 'SIGNED'].includes(existing.status)) {
      const cryptoFieldsChanged =
        existing.manifestHash !== manifest.manifestHash
        || existing.sourcePackageKey !== manifest.sourcePackageKey
        || existing.primaryContractId !== manifest.primaryContractId
        || existing.primaryContractVersionId !== manifest.primaryContractVersionId
        || existing.canonicalizationVersion !== manifest.canonicalizationVersion
        || JSON.stringify(existing.documents) !== JSON.stringify(manifest.documents);
      if (cryptoFieldsChanged) {
        throw new Error('APP_PACKAGE_MANIFEST_IMMUTABLE');
      }
    }
    this.store.set(this.key(tenantId, manifest.id), clone(manifest));
    return clone(manifest);
  }
}

export class PackageDocumentAcceptanceMemoryRepository
  implements PackageDocumentAcceptanceRepository
{
  private store = new Map<string, PackageDocumentAcceptance>();

  private key(tenantId: string, id: string) {
    return `${tenantId}::${id}`;
  }

  private signerDocKey(tenantId: string, signerId: string, docId: string) {
    return `${tenantId}::signer:${signerId}::doc:${docId}`;
  }

  async findById(tenantId: TenantId, acceptanceId: PackageDocumentAcceptanceId) {
    const found = this.store.get(this.key(tenantId, acceptanceId));
    return found ? clone(found) : null;
  }

  async findBySignerAndDocument(
    tenantId: TenantId,
    signerId: string,
    manifestDocumentId: PackageManifestDocumentId,
  ) {
    const found = this.store.get(
      this.signerDocKey(tenantId, signerId, manifestDocumentId),
    );
    return found ? clone(found) : null;
  }

  async listByEnvelope(tenantId: TenantId, envelopeId: string) {
    return [...this.store.values()]
      .filter((a) => a.tenantId === tenantId && a.envelopeId === envelopeId)
      .map(clone);
  }

  async listBySigner(tenantId: TenantId, signerId: string) {
    return [...this.store.values()]
      .filter((a) => a.tenantId === tenantId && a.signerId === signerId)
      .map(clone);
  }

  async upsert(tenantId: TenantId, acceptance: PackageDocumentAcceptance) {
    if (acceptance.tenantId !== tenantId) {
      throw new Error('PACKAGE_ACCEPTANCE_TENANT_MISMATCH');
    }
    const existing = await this.findBySignerAndDocument(
      tenantId,
      acceptance.signerId,
      acceptance.manifestDocumentId,
    );
    if (existing) {
      // Idempotente: não sobrescreve acceptedAt já gravado; permite preencher viewedAt/acceptedAt se vazio
      const merged: PackageDocumentAcceptance = {
        ...existing,
        viewedAt: existing.viewedAt || acceptance.viewedAt,
        acceptedAt: existing.acceptedAt || acceptance.acceptedAt,
        contentHash: existing.contentHash || acceptance.contentHash,
      };
      this.store.set(this.key(tenantId, merged.id), clone(merged));
      this.store.set(
        this.signerDocKey(tenantId, merged.signerId, merged.manifestDocumentId),
        clone(merged),
      );
      return { acceptance: clone(merged), created: false };
    }
    this.store.set(this.key(tenantId, acceptance.id), clone(acceptance));
    this.store.set(
      this.signerDocKey(tenantId, acceptance.signerId, acceptance.manifestDocumentId),
      clone(acceptance),
    );
    return { acceptance: clone(acceptance), created: true };
  }
}

/** Snapshot local imutável (sem Storage) para harness / testes. */
export type PackageManifestInlineSnapshotStore = Map<string, string>;

export function buildInlineSnapshotKey(
  tenantId: string,
  manifestId: string,
  documentKey: string,
): string {
  return `${tenantId}::${manifestId}::${documentKey}`;
}

export function assertTenantOwnsManifestDocument(
  tenantId: TenantId,
  document: PackageManifestDocument,
): void {
  if (document.tenantId !== tenantId) {
    throw new Error('PACKAGE_MANIFEST_DOCUMENT_CROSS_TENANT');
  }
}
