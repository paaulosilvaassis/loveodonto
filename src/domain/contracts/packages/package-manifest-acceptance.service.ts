/**
 * @module domain/contracts/packages/package-manifest-acceptance.service
 * @description Aceites individuais por documento do manifesto — Phase 10.21U.
 */

import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractClock } from '../shared/contract-clock.js';
import type {
  PackageDocumentAcceptance,
  PackageManifest,
} from './package-manifest.types.js';
import type {
  PackageDocumentAcceptanceRepository,
  PackageManifestRepository,
} from './package-manifest.repository.js';

export interface RecordPackageDocumentViewInput {
  tenantId: string;
  manifestId: string;
  manifestDocumentId: string;
  envelopeId: string;
  signerId: string;
}

export interface RecordPackageDocumentAcceptanceInput extends RecordPackageDocumentViewInput {
  /** Se omitido, usa contentHash do item frozen. */
  contentHash?: string;
}

export function createPackageManifestAcceptanceService(deps: {
  manifests: PackageManifestRepository;
  acceptances: PackageDocumentAcceptanceRepository;
  clock?: ContractClock;
  idFactory?: () => string;
}) {
  const clock = deps.clock || createSystemContractClock();
  const ids = createCryptoContractIdFactory();
  const newId = deps.idFactory || (() => ids.next('pkgacc'));

  async function loadDoc(tenantId: string, manifestId: string, manifestDocumentId: string) {
    const manifest = await deps.manifests.findById(tenantId, manifestId);
    if (!manifest) {
      return { errorCode: 'PACKAGE_MANIFEST_NOT_FOUND' as const, manifest: null, doc: null };
    }
    if (manifest.tenantId !== tenantId) {
      return { errorCode: 'PACKAGE_MANIFEST_CROSS_TENANT' as const, manifest: null, doc: null };
    }
    const doc = (manifest.documents || []).find((d) => d.id === manifestDocumentId) || null;
    if (!doc) {
      return { errorCode: 'PACKAGE_MANIFEST_DOCUMENT_NOT_FOUND' as const, manifest, doc: null };
    }
    if (doc.tenantId !== tenantId) {
      return { errorCode: 'PACKAGE_MANIFEST_DOCUMENT_CROSS_TENANT' as const, manifest, doc: null };
    }
    return { errorCode: null, manifest, doc };
  }

  return {
    async markViewed(input: RecordPackageDocumentViewInput) {
      const loaded = await loadDoc(
        input.tenantId,
        input.manifestId,
        input.manifestDocumentId,
      );
      if (loaded.errorCode || !loaded.doc || !loaded.manifest) {
        return { ok: false as const, errorCode: loaded.errorCode || 'UNKNOWN' };
      }
      const now = clock.nowIso();
      const draft: PackageDocumentAcceptance = {
        id: newId(),
        tenantId: input.tenantId,
        manifestId: input.manifestId,
        manifestDocumentId: input.manifestDocumentId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        documentKey: loaded.doc.documentKey,
        contentHash: loaded.doc.contentHash,
        acceptanceVersion: 'accept_v1',
        viewedAt: now,
        createdAt: now,
      };
      const { acceptance, created } = await deps.acceptances.upsert(input.tenantId, draft);
      return { ok: true as const, acceptance, created, duplicate: !created };
    },

    async markAccepted(input: RecordPackageDocumentAcceptanceInput) {
      const loaded = await loadDoc(
        input.tenantId,
        input.manifestId,
        input.manifestDocumentId,
      );
      if (loaded.errorCode || !loaded.doc || !loaded.manifest) {
        return { ok: false as const, errorCode: loaded.errorCode || 'UNKNOWN' };
      }
      const expected = loaded.doc.contentHash;
      const provided = String(input.contentHash || expected);
      if (provided !== expected) {
        return { ok: false as const, errorCode: 'PACKAGE_ACCEPTANCE_HASH_MISMATCH' };
      }
      const now = clock.nowIso();
      const draft: PackageDocumentAcceptance = {
        id: newId(),
        tenantId: input.tenantId,
        manifestId: input.manifestId,
        manifestDocumentId: input.manifestDocumentId,
        envelopeId: input.envelopeId,
        signerId: input.signerId,
        documentKey: loaded.doc.documentKey,
        contentHash: expected,
        acceptanceVersion: 'accept_v1',
        viewedAt: now,
        acceptedAt: now,
        createdAt: now,
      };
      const { acceptance, created } = await deps.acceptances.upsert(input.tenantId, draft);
      return { ok: true as const, acceptance, created, duplicate: !created };
    },

    async listAcceptancesForEnvelope(tenantId: string, envelopeId: string) {
      return deps.acceptances.listByEnvelope(tenantId, envelopeId);
    },

    getSnapshotContent(
      manifest: PackageManifest,
      documentKey: string,
      snapshots: Map<string, string>,
    ): string | null {
      const doc = (manifest.documents || []).find((d) => d.documentKey === documentKey);
      if (!doc || doc.tenantId !== manifest.tenantId) return null;
      if (doc.snapshotStoragePath && snapshots.has(doc.snapshotStoragePath)) {
        return snapshots.get(doc.snapshotStoragePath) || null;
      }
      return null;
    },
  };
}
