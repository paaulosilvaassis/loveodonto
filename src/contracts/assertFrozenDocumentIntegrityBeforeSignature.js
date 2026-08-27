/**
 * PHASE_10.21CK — revalida manifesto/entidade/versão/SHA-256 congelados antes do stroke.
 * Não muta manifesto, não substitui contentHash, não faz freeze.
 */
import { loadDb } from '../db/index.js';
import { requirePersistedContractVersion } from './generatedContractVersion.js';
import {
  hashPackageManifestEntity,
  hashPresentedTextContentV1,
} from '../domain/contracts/packages/package-manifest-hash.ts';
import { timingSafeEqualHex } from '../domain/contracts/files/contract-binary-hash.ts';

export const FROZEN_DOCUMENT_CONTENT_MISMATCH = 'FROZEN_DOCUMENT_CONTENT_MISMATCH';
export const FROZEN_MANIFEST_ENTITY_MISSING = 'FROZEN_MANIFEST_ENTITY_MISSING';
export const FROZEN_MANIFEST_ID_MISMATCH = 'FROZEN_MANIFEST_ID_MISMATCH';
export const FROZEN_MANIFEST_HASH_MISMATCH = 'FROZEN_MANIFEST_HASH_MISMATCH';
export const FROZEN_DOCUMENT_VERSION_MISMATCH = 'FROZEN_DOCUMENT_VERSION_MISMATCH';
export const FROZEN_CONTRACT_DOCUMENT_MISSING = 'FROZEN_CONTRACT_DOCUMENT_MISSING';
export const MANIFEST_NOT_FROZEN = 'MANIFEST_NOT_FROZEN';

function frozenError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function presentedContractHtml(contract) {
  return String(contract?.renderedHtml || contract?.finalContent || contract?.editedHtml || '');
}

export function findFrozenContractServicesDocument(manifest) {
  const docs = Array.isArray(manifest?.documents) ? manifest.documents : [];
  return docs.find((doc) => {
    const type = String(doc?.documentType || doc?.operationalType || '').toUpperCase();
    const key = String(doc?.documentKey || '');
    return type === 'SERVICE_CONTRACT'
      || type === 'CONTRACT_SERVICES'
      || key === 'contract';
  }) || null;
}

export function loadFrozenManifestEntity(contract) {
  const metadata = contract?.metadata || {};
  const manifestId = String(metadata.packageManifestId || '').trim();
  const rows = loadDb().clinicalPackageManifests || [];
  if (!manifestId) return null;
  return rows.find((row) => row?.id === manifestId) || null;
}

/**
 * Fail-closed para quoteSource clinical_budget.
 * Contratos CRM sem pacote clínico não passam por este gate.
 */
export async function assertFrozenDocumentIntegrityBeforeSignature({
  contract,
  packageManifestId = null,
} = {}) {
  if (String(contract?.quoteSource || '') !== 'clinical_budget') {
    return { ok: true, skipped: true };
  }

  const metadata = contract?.metadata || {};
  if (!metadata.packageManifestId && !metadata.packageManifestHash && !metadata.frozenAt) {
    throw frozenError(
      MANIFEST_NOT_FROZEN,
      'Manifest ainda não congelado. Prepare o pacote de assinatura primeiro.',
    );
  }

  const persistedVersion = requirePersistedContractVersion(contract);
  const expectedVersion = String(persistedVersion);
  const metadataId = String(metadata.packageManifestId || '').trim();
  const metadataHash = String(metadata.packageManifestHash || '').trim();
  const claimedId = packageManifestId ? String(packageManifestId).trim() : '';

  if (claimedId && claimedId !== metadataId) {
    throw frozenError(FROZEN_MANIFEST_ID_MISMATCH, 'Manifest informado não corresponde ao pacote congelado.');
  }

  const manifest = loadFrozenManifestEntity(contract);
  if (!manifest) {
    throw frozenError(FROZEN_MANIFEST_ENTITY_MISSING, 'Manifesto congelado não encontrado.');
  }

  const entityId = String(manifest.id || '').trim();
  const entityHash = String(manifest.manifestHash || manifest.hash || '').trim();
  if (!entityId || entityId !== metadataId) {
    throw frozenError(FROZEN_MANIFEST_ID_MISMATCH, 'Manifesto persistido não corresponde ao contrato.');
  }
  if (!entityHash || !metadataHash || !timingSafeEqualHex(entityHash, metadataHash)) {
    throw frozenError(FROZEN_MANIFEST_HASH_MISMATCH, 'Hash do manifesto congelado não confere.');
  }

  const recomputed = await hashPackageManifestEntity(manifest);
  if (!timingSafeEqualHex(String(recomputed || ''), entityHash)) {
    throw frozenError(FROZEN_MANIFEST_HASH_MISMATCH, 'Hash do manifesto congelado não confere.');
  }

  const contractDoc = findFrozenContractServicesDocument(manifest);
  if (!contractDoc) {
    throw frozenError(FROZEN_CONTRACT_DOCUMENT_MISSING, 'Documento CONTRACT_SERVICES ausente no manifesto congelado.');
  }
  if (String(contractDoc.documentVersion || '').trim() !== expectedVersion) {
    throw frozenError(
      FROZEN_DOCUMENT_VERSION_MISMATCH,
      'Versão documental do manifesto não corresponde à versão persistida do contrato.',
    );
  }

  const expectedContentHash = String(contractDoc.contentHash || '').trim();
  const currentContentHash = await hashPresentedTextContentV1(presentedContractHtml(contract));
  if (!expectedContentHash || !timingSafeEqualHex(currentContentHash, expectedContentHash)) {
    throw frozenError(
      FROZEN_DOCUMENT_CONTENT_MISMATCH,
      'O conteúdo atual do contrato não corresponde ao SHA-256 congelado no manifesto.',
    );
  }

  return {
    ok: true,
    skipped: false,
    manifestId: entityId,
    manifestHash: entityHash,
    documentVersion: expectedVersion,
    frozenContentSha256: expectedContentHash,
    currentContentSha256: currentContentHash,
    contractVersion: persistedVersion,
  };
}
