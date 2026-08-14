/**
 * Prepara/congela o package clínico para assinatura.
 * Reutiliza createPackageManifestFreezeService — sem segundo motor.
 * Não envia link, WhatsApp, e-mail ou SMS.
 */

import { loadDb, withDb } from '../db/index.js';
import { listDocumentRecords } from './documentService.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { PackageManifestMemoryRepository } from '../domain/contracts/packages/package-manifest.repository.ts';
import { createPackageManifestFreezeService } from '../domain/contracts/packages/package-manifest-freeze.service.ts';
import { LGPD_CLINIC_POLICY_VERSION } from '../domain/contracts/packages/package-manifest-lgpd.ts';
import {
  evaluateClinicalSignatureReadiness,
  isPackageManifestFrozen,
  CLINICAL_SIGNATURE_STEP,
} from '../contracts/clinicalSignatureReadiness.js';
import { DOCUMENT_APPLICABILITY } from '../contracts/treatmentDocumentRequirements.js';

function tenantIdFromUser(user) {
  return String(user?.tenantId || user?.tenant_id || loadDb().clinicProfile?.tenant_id || '').trim();
}

function persistFrozenMetadata(contractId, frozen) {
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('Contrato não encontrado.');
    arr[idx] = {
      ...arr[idx],
      metadata: {
        ...(arr[idx].metadata || {}),
        packageManifestId: frozen.manifestId,
        packageManifestHash: frozen.manifestHash,
        frozenAt: new Date().toISOString(),
        packageCanonicalizationVersion: frozen.manifest?.canonicalizationVersion || null,
      },
      updatedAt: new Date().toISOString(),
    };
    if (!Array.isArray(db.clinicalPackageManifests)) db.clinicalPackageManifests = [];
    const existing = db.clinicalPackageManifests.findIndex((m) => m.id === frozen.manifestId);
    const row = { ...frozen.manifest, id: frozen.manifestId, manifestHash: frozen.manifestHash };
    if (existing >= 0) db.clinicalPackageManifests[existing] = row;
    else db.clinicalPackageManifests.push(row);
    db.generatedContracts = arr;
    return arr[idx];
  });
}

function buildClinicalFreezeDocuments({ contract, readiness }) {
  const docs = [
    {
      operationalType: 'CONTRACT_SERVICES',
      title: 'Contrato de Prestação de Serviços',
      required: true,
      displayOrder: 1,
      presentedText: String(contract.renderedHtml || contract.finalContent || contract.editedHtml || ''),
      contentMimeType: 'text/html',
      sourceKind: 'CONTRACT_VERSION',
      sourceId: contract.id,
      documentVersion: String(contract.templateVersion || contract.version || '1'),
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

  if (readiness.tcleRequired && readiness.tcleApplicable) {
    const requiredTcle = readiness.package?.items?.find((i) => i.documentType === 'TCLE');
    const tcleId = (readiness.identity && contract.metadata?.attachedTcleIds?.[0])
      || requiredTcle?.id
      || 'tcle';
    const records = listDocumentRecords({
      patientId: contract.patientId,
      appointmentId: contract.quoteId,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    }).filter((row) => row.metadata?.applicability !== DOCUMENT_APPLICABILITY.NOT_APPLICABLE_TO_CURRENT_TREATMENT);
    const rec = records[0];
    const presentedText = String(rec?.content || rec?.contentHtml || rec?.html || `TCLE ${tcleId}`);
    docs.splice(1, 0, {
      operationalType: 'TCLE',
      tcleId,
      title: requiredTcle?.label || 'TCLE',
      required: true,
      displayOrder: 2,
      presentedText,
      contentMimeType: 'text/html',
      sourceKind: 'DOCUMENT_RECORD',
      sourceId: rec?.id || tcleId,
      documentVersion: `${tcleId}_v1`,
    });
  }

  return docs;
}

export async function prepareClinicalSignaturePackage({
  user,
  appointmentId,
  budgetId = null,
  patientId = null,
  contractId = null,
} = {}) {
  const tenantId = tenantIdFromUser(user);
  if (!tenantId) {
    return { ok: false, error: 'tenantId obrigatório.' };
  }
  const readiness = evaluateClinicalSignatureReadiness({
    appointmentId,
    budgetId,
    patientId,
    tenantId,
    contractId,
    user,
  });
  const contract = readiness.contract;
  if (!contract?.id) {
    return { ok: false, error: readiness.blockers[0]?.message || 'Contrato ausente.', readiness };
  }
  if (contract.status === CONTRACT_STATUS.DRAFT) {
    return { ok: false, error: 'Não é possível preparar pacote de um contrato em rascunho.', readiness };
  }
  if (!readiness.packageReady || !readiness.documentsSatisfied) {
    return { ok: false, error: 'Documentos obrigatórios pendentes.', readiness };
  }
  if (isPackageManifestFrozen(contract)) {
    return {
      ok: true,
      duplicate: true,
      manifestId: contract.metadata.packageManifestId,
      manifestHash: contract.metadata.packageManifestHash,
      contract,
      readiness: evaluateClinicalSignatureReadiness({
        appointmentId,
        budgetId,
        patientId,
        tenantId,
        contractId: contract.id,
        user,
      }),
    };
  }

  const freeze = createPackageManifestFreezeService({
    manifests: new PackageManifestMemoryRepository(),
    snapshots: new Map(),
  });
  const frozen = await freeze.freezePackageForSignature({
    tenantId,
    actorUserId: user?.id || 'clinical-actor',
    sourcePackageKey: `pkg_${contract.budgetId || contract.quoteId || contract.id}`,
    primaryContractId: contract.id,
    primaryContractVersionId: contract.id,
    idempotencyKey: `freeze_clinical_${contract.id}_${contract.budgetId || contract.quoteId}`,
    documents: buildClinicalFreezeDocuments({ contract, readiness }),
  });
  if (!frozen.ok) {
    return {
      ok: false,
      error: frozen.errorMessage || frozen.errorCode || 'Falha ao congelar o manifesto.',
      readiness,
    };
  }

  const updated = persistFrozenMetadata(contract.id, frozen);
  const next = evaluateClinicalSignatureReadiness({
    appointmentId,
    budgetId,
    patientId,
    tenantId,
    contractId: contract.id,
    user,
  });
  return {
    ok: true,
    duplicate: Boolean(frozen.duplicate),
    manifestId: frozen.manifestId,
    manifestHash: frozen.manifestHash,
    contract: updated,
    readiness: next,
    step: next.step || CLINICAL_SIGNATURE_STEP.READY_TO_SIGN,
  };
}
