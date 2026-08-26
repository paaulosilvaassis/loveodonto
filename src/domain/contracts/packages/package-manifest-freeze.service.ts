/**
 * @module domain/contracts/packages/package-manifest-freeze.service
 * @description Freeze real do manifesto criptográfico — Phase 10.21U (OPTION_C).
 */

import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractClock } from '../shared/contract-clock.js';
import {
  buildManifestDocumentKey,
  mapOperationalDocumentTypeToContractDocumentType,
} from './package-manifest-document-map.js';
import {
  hashPackageManifestEntity,
  hashPresentedBinaryContentV1,
  hashPresentedTextContentV1,
} from './package-manifest-hash.js';
import { resolveLgpdPresentedContent } from './package-manifest-lgpd.js';
import { requireFreezeDocumentVersion, PACKAGE_DOCUMENT_VERSION_MISSING } from './package-manifest-document-version.js';
import type { PackageManifestRepository } from './package-manifest.repository.js';
import {
  buildInlineSnapshotKey,
  type PackageManifestInlineSnapshotStore,
} from './package-manifest.repository.js';
import {
  PACKAGE_MANIFEST_CANONICALIZATION_VERSION,
  type PackageManifest,
  type PackageManifestDocument,
} from './package-manifest.types.js';
import type {
  BindManifestToEnvelopeInput,
  FreezePackageForSignature,
  FreezePackageForSignatureInput,
  FreezePackageForSignatureResult,
  PackageManifestSignGate,
} from './package-manifest-freeze.design.js';
import type { PackageDocumentAcceptance } from './package-manifest.types.js';
import type { SignatureEnvelopeRepository } from '../signatures/signature-memory.repository.js';

export interface PackageManifestFreezeDeps {
  manifests: PackageManifestRepository;
  envelopes?: SignatureEnvelopeRepository;
  snapshots?: PackageManifestInlineSnapshotStore;
  clock?: ContractClock;
  idFactory?: () => string;
}

function requirePresentedContent(doc: FreezePackageForSignatureInput['documents'][number]) {
  const hasText = String(doc.presentedText || '').length > 0;
  const hasBytes = doc.presentedBytes && doc.presentedBytes.length > 0;
  if (!hasText && !hasBytes) {
    throw Object.assign(new Error('Documento sem conteúdo apresentado.'), {
      code: 'PACKAGE_MANIFEST_CONTENT_REQUIRED',
    });
  }
}

export function createPackageManifestFreezeService(
  deps: PackageManifestFreezeDeps,
): {
  freezePackageForSignature: FreezePackageForSignature;
  bindManifestToEnvelope: (
    input: BindManifestToEnvelopeInput,
  ) => Promise<{ ok: boolean; errorCode?: string }>;
} {
  const clock = deps.clock || createSystemContractClock();
  const ids = createCryptoContractIdFactory();
  const newId = deps.idFactory || (() => ids.next('pkgm'));
  const snapshots = deps.snapshots || new Map<string, string>();

  return {
    async freezePackageForSignature(input) {
      const tid = String(input.tenantId || '').trim();
      if (!tid) {
        return {
          ok: false,
          duplicate: false,
          errorCode: 'PACKAGE_MANIFEST_TENANT_REQUIRED',
          errorMessage: 'tenantId obrigatório.',
        };
      }
      if (!input.idempotencyKey) {
        return {
          ok: false,
          duplicate: false,
          errorCode: 'PACKAGE_MANIFEST_IDEMPOTENCY_REQUIRED',
          errorMessage: 'idempotencyKey obrigatório.',
        };
      }
      if (!Array.isArray(input.documents) || input.documents.length === 0) {
        return {
          ok: false,
          duplicate: false,
          errorCode: 'PACKAGE_MANIFEST_DOCUMENTS_REQUIRED',
          errorMessage: 'Informe ao menos um documento.',
        };
      }

      const existing = await deps.manifests.findByIdempotencyKey(
        tid,
        input.idempotencyKey,
      );
      if (existing?.status === 'FROZEN' || existing?.status === 'SIGNING' || existing?.status === 'SIGNED') {
        return {
          ok: true,
          duplicate: true,
          manifestId: existing.id,
          manifestHash: existing.manifestHash,
          manifest: existing,
        };
      }

      const requiredMissing = input.documents
        .filter((d) => d.required !== false)
        .filter((d) => {
          const isLgpd = String(d.operationalType || '').toUpperCase() === 'LGPD';
          if (isLgpd && !d.presentedText && !d.presentedBytes) {
            // LGPD pode resolver conteúdo versionado default no freeze.
            return false;
          }
          try {
            requirePresentedContent(d);
            return false;
          } catch {
            return true;
          }
        });
      if (requiredMissing.length) {
        return {
          ok: false,
          duplicate: false,
          errorCode: 'PACKAGE_MANIFEST_REQUIRED_CONTENT_MISSING',
          errorMessage: `Conteúdo ausente: ${requiredMissing.map((d) => d.title).join(', ')}`,
        };
      }

      const now = clock.nowIso();
      const manifestId = newId();
      const docs: PackageManifestDocument[] = [];

      try {
      for (const [idx, raw] of input.documents.entries()) {
        let presentedText = raw.presentedText;
        let documentVersion: unknown = raw.documentVersion;
        let sourceKind = raw.sourceKind;
        let sourceId = raw.sourceId;

        if (String(raw.operationalType || '').toUpperCase() === 'LGPD' && !presentedText) {
          const lgpd = resolveLgpdPresentedContent({
            version: typeof raw.documentVersion === 'string' ? raw.documentVersion : undefined,
            presentedText: raw.presentedText,
          });
          presentedText = lgpd.presentedText;
          documentVersion = lgpd.version;
          sourceKind = sourceKind || 'CLINIC_POLICY';
          sourceId = sourceId || lgpd.version;
        }

        requirePresentedContent({ ...raw, presentedText });
        const frozenDocumentVersion = requireFreezeDocumentVersion(documentVersion);

        const mapped = mapOperationalDocumentTypeToContractDocumentType(
          raw.operationalType,
          raw.tcleId,
        );
        const documentKey = buildManifestDocumentKey(raw.operationalType, raw.tcleId);
        const required = raw.required !== undefined ? Boolean(raw.required) : mapped.requiredDefault;

        let contentHash: string;
        let contentHashEncoding: 'utf8_canonical_v1' | 'binary_sha256_v1';
        if (raw.presentedBytes && raw.presentedBytes.length > 0) {
          contentHash = await hashPresentedBinaryContentV1(raw.presentedBytes);
          contentHashEncoding = 'binary_sha256_v1';
        } else {
          contentHash = await hashPresentedTextContentV1(String(presentedText || ''));
          contentHashEncoding = 'utf8_canonical_v1';
        }

        const snapKey = buildInlineSnapshotKey(tid, manifestId, documentKey);
        snapshots.set(snapKey, String(presentedText || ''));

        docs.push({
          id: newId(),
          tenantId: tid,
          manifestId,
          documentKey,
          documentType: mapped.documentType,
          sourceKind,
          sourceId,
          documentVersion: frozenDocumentVersion,
          title: String(raw.title || mapped.defaultAcceptanceLabel).trim(),
          required,
          displayOrder: Number(raw.displayOrder) || idx + 1,
          contentMimeType: String(raw.contentMimeType || 'text/html'),
          contentHash,
          contentHashEncoding,
          snapshotStorageProvider: 'inline',
          snapshotStorageBucket: 'memory',
          snapshotStoragePath: snapKey,
          acceptanceCode: mapped.defaultAcceptanceCode,
          acceptanceLabel: mapped.defaultAcceptanceLabel,
          createdAt: now,
        });
      }
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === PACKAGE_DOCUMENT_VERSION_MISSING) {
          return {
            ok: false,
            duplicate: false,
            errorCode: PACKAGE_DOCUMENT_VERSION_MISSING,
            errorMessage: (err as Error).message || 'documentVersion ausente.',
          };
        }
        throw err;
      }

      const draft: PackageManifest = {
        id: manifestId,
        tenantId: tid,
        packageId: input.packageId,
        sourcePackageKey: String(input.sourcePackageKey || '').trim(),
        manifestVersion: 1,
        status: 'DRAFT',
        canonicalizationVersion: PACKAGE_MANIFEST_CANONICALIZATION_VERSION,
        primaryContractId: input.primaryContractId,
        primaryContractVersionId: input.primaryContractVersionId,
        createdBy: String(input.actorUserId || ''),
        createdAt: now,
        idempotencyKey: input.idempotencyKey,
        documents: docs,
      };

      const manifestHash = await hashPackageManifestEntity(draft);
      const frozen: PackageManifest = {
        ...draft,
        status: 'FROZEN',
        manifestHash,
        frozenAt: now,
        frozenBy: String(input.actorUserId || ''),
      };

      await deps.manifests.create(tid, frozen);
      return {
        ok: true,
        duplicate: false,
        manifestId: frozen.id,
        manifestHash: frozen.manifestHash,
        manifest: frozen,
      };
    },

    async bindManifestToEnvelope(input) {
      if (!deps.envelopes) {
        return { ok: false, errorCode: 'PACKAGE_MANIFEST_ENVELOPE_REPO_MISSING' };
      }
      const tid = String(input.tenantId || '').trim();
      const envelope = await deps.envelopes.findById(tid, input.envelopeId);
      if (!envelope) return { ok: false, errorCode: 'SIGNATURE_ENVELOPE_NOT_FOUND' };
      const manifest = await deps.manifests.findById(tid, input.manifestId);
      if (!manifest) return { ok: false, errorCode: 'PACKAGE_MANIFEST_NOT_FOUND' };
      if (manifest.tenantId !== tid || envelope.tenantId !== tid) {
        return { ok: false, errorCode: 'PACKAGE_MANIFEST_CROSS_TENANT' };
      }
      if (String(manifest.manifestHash || '') !== String(input.expectedManifestHash || '')) {
        return { ok: false, errorCode: 'PACKAGE_MANIFEST_HASH_MISMATCH' };
      }
      if (!['FROZEN', 'SIGNING', 'SIGNED'].includes(manifest.status)) {
        return { ok: false, errorCode: 'PACKAGE_MANIFEST_NOT_FROZEN' };
      }

      const updated = {
        ...envelope,
        packageManifestId: manifest.id,
        packageManifestHash: manifest.manifestHash,
        rowVersion: (envelope.rowVersion || 1) + 1,
        updatedAt: clock.nowIso(),
      };
      await deps.envelopes.update(tid, updated);
      return { ok: true };
    },
  };
}

export function evaluatePackageManifestSignGate(input: {
  manifest: PackageManifest | null | undefined;
  envelopeManifestHash?: string | null;
  acceptances: PackageDocumentAcceptance[];
}): PackageManifestSignGate {
  const manifest = input.manifest || null;
  if (!manifest) {
    return {
      hasManifest: false,
      manifestHashMatches: true,
      missingRequiredAcceptances: [],
      contentHashMismatches: [],
      canSign: true,
    };
  }

  const manifestHashMatches =
    String(input.envelopeManifestHash || '') === String(manifest.manifestHash || '');

  const byDoc = new Map(
    input.acceptances.map((a) => [String(a.manifestDocumentId), a]),
  );

  const missingRequiredAcceptances: string[] = [];
  const contentHashMismatches: string[] = [];

  for (const doc of manifest.documents || []) {
    if (!doc.required) continue;
    const acc = byDoc.get(String(doc.id));
    if (!acc?.acceptedAt) {
      missingRequiredAcceptances.push(doc.documentKey);
      continue;
    }
    if (String(acc.contentHash || '') !== String(doc.contentHash || '')) {
      contentHashMismatches.push(doc.documentKey);
    }
  }

  return {
    hasManifest: true,
    manifestHashMatches,
    missingRequiredAcceptances,
    contentHashMismatches,
    canSign:
      manifestHashMatches
      && missingRequiredAcceptances.length === 0
      && contentHashMismatches.length === 0,
  };
}

export type { FreezePackageForSignatureResult };
