/**
 * PHASE_10.21AB — Staging-only bridge: clinical send → OPTION_C freeze → public package.
 * Gated by STAGING_TEST_MODE. No production writes. No external communication.
 * Reuses createPackageManifestFreezeService (não cria segundo motor).
 */
import { loadDb, withDb } from '../../../db/index.js';
import { isStagingTestModeEnabled } from './staging-browser-test-mode.ts';
import {
  PackageManifestMemoryRepository,
  PackageDocumentAcceptanceMemoryRepository,
} from '../packages/package-manifest.repository.ts';
import {
  createPackageManifestFreezeService,
  evaluatePackageManifestSignGate,
} from '../packages/package-manifest-freeze.service.ts';
import { createPackageManifestAcceptanceService } from '../packages/package-manifest-acceptance.service.ts';
import { LGPD_CLINIC_POLICY_VERSION } from '../packages/package-manifest-lgpd.ts';
import { buildPublicPackageDocumentsFromManifest } from '../../../components/contracts/public/PublicPackageManifestDocuments.jsx';
import { getTemplateByKey } from '../../../utils/documentTemplates.js';
import { getPatient } from '../../../services/patientService.js';
import { addFile } from '../../../services/patientFilesService.js';

const STORE_KEY = 'stagingPackageManifestBridge';

function tenantIdFromUser(user) {
  return String(user?.tenantId || user?.tenant_id || loadDb().clinicProfile?.tenant_id || 'staging-tenant').trim();
}

function resolveTclePresentedText(contract) {
  const db = loadDb();
  const tcleId = (contract?.metadata?.attachedTcleIds || [])[0] || 'tcle_implante';
  const patientId = contract?.patientId;
  const records = db.documentRecords || db.clinicalDocuments || [];
  const rec = records.find((d) => (
    d.patientId === patientId
    && (d.metadata?.tcleId === tcleId || String(d.templateKey || d.key || '').includes('implante'))
  ));
  const fromRecord = rec?.contentHtml || rec?.html || rec?.content || rec?.body;
  if (fromRecord) return { tcleId, presentedText: String(fromRecord), sourceId: rec?.id || tcleId };

  const tpl = getTemplateByKey('consent_implante');
  const patientName = getPatient(patientId)?.profile?.full_name || 'Paciente fictício';
  const body = String(tpl?.body || `TCLE Implante — ${patientName}`).replace(/\{\{NOME_PACIENTE\}\}/g, patientName);
  return { tcleId, presentedText: body, sourceId: `template:${tpl?.key || 'consent_implante'}` };
}

function buildFreezeDocuments(contract) {
  const tcle = resolveTclePresentedText(contract);
  return [
    {
      operationalType: 'CONTRACT_SERVICES',
      title: 'Contrato de Prestação de Serviços',
      required: true,
      displayOrder: 1,
      presentedText: String(contract.renderedHtml || contract.finalContent || ''),
      contentMimeType: 'text/html',
      sourceKind: 'CONTRACT_VERSION',
      sourceId: contract.id,
      documentVersion: String(contract.templateVersion || '1'),
    },
    {
      operationalType: 'TCLE',
      tcleId: tcle.tcleId,
      title: 'TCLE — Implantes',
      required: true,
      displayOrder: 2,
      presentedText: tcle.presentedText,
      contentMimeType: 'text/html',
      sourceKind: 'DOCUMENT_RECORD',
      sourceId: tcle.sourceId,
      documentVersion: `${tcle.tcleId}_v1`,
    },
    {
      operationalType: 'LGPD',
      title: 'LGPD / Privacidade',
      required: true,
      displayOrder: 3,
      contentMimeType: 'text/plain',
      sourceKind: 'CLINIC_POLICY',
      sourceId: LGPD_CLINIC_POLICY_VERSION,
      documentVersion: LGPD_CLINIC_POLICY_VERSION,
    },
  ];
}

function readStore() {
  const db = loadDb();
  return db[STORE_KEY] || { byToken: {}, manifests: {}, snapshots: {}, acceptances: {} };
}

function writeStore(next) {
  withDb((db) => {
    db[STORE_KEY] = next;
    return db;
  });
}

/**
 * Freeze OPTION_C no envio interno de staging e anexa ao link/request.
 * @returns {{ ok: boolean, manifestId?: string, manifestHash?: string, error?: string }}
 */
export async function freezeStagingClinicalPackageOnSend({ user, contract, request, link }) {
  if (!isStagingTestModeEnabled()) {
    return { ok: false, skipped: true, reason: 'not_staging_test_mode' };
  }
  if (!contract?.id || !link?.token) {
    return { ok: false, error: 'contract_or_token_missing' };
  }

  const tenantId = tenantIdFromUser(user);
  const manifests = new PackageManifestMemoryRepository();
  const envelopes = null;
  const snapshots = new Map();
  const freeze = createPackageManifestFreezeService({ manifests, envelopes, snapshots });

  const frozen = await freeze.freezePackageForSignature({
    tenantId,
    actorUserId: user?.id || 'staging-actor',
    sourcePackageKey: `pkg_${contract.budgetId || contract.quoteId || contract.id}`,
    primaryContractId: contract.id,
    primaryContractVersionId: contract.id,
    idempotencyKey: `freeze_${contract.id}_${link.token}`,
    documents: buildFreezeDocuments(contract),
  });

  if (!frozen.ok) {
    return { ok: false, error: frozen.errorMessage || frozen.errorCode || 'freeze_failed' };
  }

  const publicDocs = buildPublicPackageDocumentsFromManifest(frozen.manifest, snapshots);
  const store = readStore();
  const snapObj = Object.fromEntries(snapshots.entries());
  store.manifests[frozen.manifestId] = frozen.manifest;
  store.snapshots = { ...store.snapshots, ...snapObj };
  store.byToken[link.token] = {
    manifestId: frozen.manifestId,
    manifestHash: frozen.manifestHash,
    canonicalizationVersion: frozen.manifest.canonicalizationVersion,
    contractId: contract.id,
    requestId: request?.id || null,
    tenantId,
    publicDocs,
    createdAt: new Date().toISOString(),
  };
  writeStore(store);

  withDb((db) => {
    const links = db.contractSignLinks || [];
    const lIdx = links.findIndex((l) => l.token === link.token);
    if (lIdx >= 0) {
      links[lIdx] = {
        ...links[lIdx],
        packageManifestId: frozen.manifestId,
        packageManifestHash: frozen.manifestHash,
        packageCanonicalizationVersion: frozen.manifest.canonicalizationVersion,
        packagePublicDocs: publicDocs,
        packageManifest: frozen.manifest,
      };
    }
    const reqs = db.contractSignatureRequests || [];
    const rIdx = reqs.findIndex((r) => r.id === request?.id);
    if (rIdx >= 0) {
      reqs[rIdx] = {
        ...reqs[rIdx],
        packageManifestId: frozen.manifestId,
        packageManifestHash: frozen.manifestHash,
        // Envelope-compatible refs (OPTION_C) — mesmo request interno, sem segundo motor.
        envelopeStatus: 'SENT',
      };
    }
    return db;
  });

  return {
    ok: true,
    manifestId: frozen.manifestId,
    manifestHash: frozen.manifestHash,
    canonicalizationVersion: frozen.manifest.canonicalizationVersion,
    documentCount: publicDocs.length,
  };
}

export function getStagingPublicPackageByToken(token) {
  if (!token || !isStagingTestModeEnabled()) return null;
  const store = readStore();
  let entry = store.byToken[token];
  if (!entry) {
    // Fallback: link row (schema-persisted) if bridge map missed a race.
    const link = (loadDb().contractSignLinks || []).find((l) => l.token === token);
    if (link?.packageManifestId && link?.packagePublicDocs) {
      entry = {
        manifestId: link.packageManifestId,
        manifestHash: link.packageManifestHash,
        canonicalizationVersion: link.packageCanonicalizationVersion,
        contractId: link.contractId,
        requestId: link.requestId,
        tenantId: link.tenant_id || 'staging-tenant',
        publicDocs: link.packagePublicDocs,
        createdAt: link.createdAt,
      };
      if (link.packageManifest) {
        store.manifests[link.packageManifestId] = link.packageManifest;
      }
    }
  }
  if (!entry) return null;
  const manifest = store.manifests[entry.manifestId] || entry.manifest || null;
  return {
    ...entry,
    manifest,
    acceptances: Object.values(store.acceptances || {}).filter(
      (a) => a.manifestId === entry.manifestId,
    ),
  };
}

export async function recordStagingPackageAcceptance({
  token,
  documentId,
  viewedAt,
  acceptedAt,
  signerId = 'signer-patient-staging',
}) {
  const pkg = getStagingPublicPackageByToken(token);
  if (!pkg?.manifest) throw new Error('Pacote congelado não encontrado para este link.');

  const doc = pkg.manifest.documents.find((d) => d.id === documentId);
  if (!doc) throw new Error('Documento do manifesto não encontrado.');

  const manifests = new PackageManifestMemoryRepository();
  try {
    await manifests.create(pkg.tenantId, pkg.manifest);
  } catch {
    /* already hydrated in this process */
  }

  const acceptancesRepo = new PackageDocumentAcceptanceMemoryRepository();
  for (const a of pkg.acceptances || []) {
    await acceptancesRepo.upsert(pkg.tenantId, a);
  }

  const acceptSvc = createPackageManifestAcceptanceService({
    manifests,
    acceptances: acceptancesRepo,
  });

  const envelopeId = pkg.requestId || `env-link-${token}`;
  const viewed = await acceptSvc.markViewed({
    tenantId: pkg.tenantId,
    manifestId: pkg.manifestId,
    manifestDocumentId: documentId,
    envelopeId,
    signerId,
  });
  if (!viewed.ok) {
    return viewed;
  }

  const result = await acceptSvc.markAccepted({
    tenantId: pkg.tenantId,
    manifestId: pkg.manifestId,
    manifestDocumentId: documentId,
    envelopeId,
    signerId,
    contentHash: doc.contentHash,
  });

  const store = readStore();
  const list = await acceptancesRepo.listByEnvelope(pkg.tenantId, envelopeId);
  for (const a of list) {
    store.acceptances[a.id] = a;
  }
  // Preserve explicit timestamps when provided (tests / smoke).
  if (result.ok && result.acceptance) {
    const patched = {
      ...result.acceptance,
      viewedAt: viewedAt || result.acceptance.viewedAt,
      acceptedAt: acceptedAt || result.acceptance.acceptedAt,
    };
    store.acceptances[patched.id] = patched;
    result.acceptance = patched;
  }
  writeStore(store);
  return result;
}

export function evaluateStagingPackageSignGate(token) {
  const pkg = getStagingPublicPackageByToken(token);
  if (!pkg?.manifest) {
    return { hasManifest: false, canSign: true, missingRequiredAcceptances: [] };
  }
  return evaluatePackageManifestSignGate({
    manifest: pkg.manifest,
    envelopeManifestHash: pkg.manifestHash,
    acceptances: pkg.acceptances || [],
  });
}

export function listStagingPackageDocMeta(token) {
  const pkg = getStagingPublicPackageByToken(token);
  if (!pkg) return [];
  return (pkg.publicDocs || []).map((d) => ({
    documentType: d.documentType,
    documentKey: d.documentKey,
    version: d.documentVersion,
    required: d.required,
    hashPresent: Boolean(d.contentHash),
    title: d.title,
  }));
}

/** Persiste snapshots do pacote assinado no prontuário (staging only). */
export function persistSignedPackageToPatientRecord({ token, patientId, signerName }) {
  if (!isStagingTestModeEnabled() || !patientId || !token) return { ok: false };
  const pkg = getStagingPublicPackageByToken(token);
  if (!pkg?.publicDocs?.length) return { ok: false, error: 'package_missing' };

  const now = new Date().toISOString();
  const saved = [];
  for (const doc of pkg.publicDocs) {
    const blob = `data:text/html;charset=utf-8,${encodeURIComponent(doc.snapshotHtml || '')}`;
    const row = addFile(
      patientId,
      {
        category: 'Contratos',
        file_name: `${doc.title || doc.documentKey} (pacote assinado).html`,
        mime_type: 'text/html',
        file_url: blob,
        metadata: {
          packageManifestId: pkg.manifestId,
          packageManifestHash: pkg.manifestHash,
          documentKey: doc.documentKey,
          documentType: doc.documentType,
          contentHash: doc.contentHash,
          signedPackage: true,
          signerName: signerName || null,
          signedAt: now,
        },
      },
      'staging-sign',
    );
    saved.push({ id: row?.id || null, documentKey: doc.documentKey });
  }

  const db = loadDb();
  const evidence = db.stagingLastEvidenceReport;
  if (evidence?.html) {
    addFile(
      patientId,
      {
        category: 'Contratos',
        file_name: 'Comprovante pacote assinado.html',
        mime_type: 'text/html',
        file_url: `data:text/html;charset=utf-8,${encodeURIComponent(evidence.html)}`,
        metadata: {
          packageManifestId: pkg.manifestId,
          evidence: true,
          signedPackage: true,
        },
      },
      'staging-sign',
    );
  }
  return { ok: true, savedCount: saved.length, saved };
}
