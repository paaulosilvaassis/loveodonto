/**
 * Anexa TCLE clínico ao pacote documental do tratamento (operacional).
 * Reutiliza metadata.attachedTcleIds + documentRecords — sem motor paralelo.
 * Idempotente: não duplica o mesmo tcleId.
 */

import { withDb, loadDb } from '../db/index.js';
import { mapDocumentTemplateToTcleId } from './clinicalTcleAttachmentService.js';
import { getContractStatusForQuote } from './contractModuleService.js';
import { buildDocumentPackageForBudget } from './operationalContractWizardService.js';

/**
 * @returns {{ ok: boolean, attached: boolean, duplicate: boolean, tcleId: string|null, contractId: string|null, packageSnapshot: object|null, error?: string }}
 */
export function attachTcleDocumentToTreatmentPackage({
  user,
  patientId,
  appointmentId,
  budgetId = null,
  documentId = null,
  templateKey = null,
  tcleId: tcleIdInput = null,
} = {}) {
  if (!user?.id) {
    return { ok: false, attached: false, duplicate: false, tcleId: null, contractId: null, packageSnapshot: null, error: 'Usuário ausente.' };
  }
  if (!patientId || !appointmentId) {
    return { ok: false, attached: false, duplicate: false, tcleId: null, contractId: null, packageSnapshot: null, error: 'patientId/appointmentId obrigatórios.' };
  }

  const tcleId = tcleIdInput
    || mapDocumentTemplateToTcleId(templateKey)
    || null;

  if (!tcleId) {
    return {
      ok: false,
      attached: false,
      duplicate: false,
      tcleId: null,
      contractId: null,
      packageSnapshot: null,
      error: 'Modelo não mapeado para TCLE obrigatório do contrato.',
    };
  }

  const contract = getContractStatusForQuote(
    appointmentId,
    'clinical_budget',
    budgetId,
    patientId,
  );

  let duplicate = false;
  let attached = false;

  if (contract?.id) {
    withDb((db) => {
      const arr = db.generatedContracts || [];
      const idx = arr.findIndex((c) => c.id === contract.id);
      if (idx < 0) return db;
      const prev = arr[idx];
      const current = Array.isArray(prev.metadata?.attachedTcleIds)
        ? [...prev.metadata.attachedTcleIds]
        : [];
      if (current.includes(tcleId)) {
        duplicate = true;
      } else {
        current.push(tcleId);
        attached = true;
        arr[idx] = {
          ...prev,
          metadata: {
            ...(prev.metadata || {}),
            attachedTcleIds: current,
            lastTcleDocumentId: documentId || prev.metadata?.lastTcleDocumentId || null,
            lastTcleAttachedAt: new Date().toISOString(),
            lastTcleAttachedBy: user.id,
          },
          updatedAt: new Date().toISOString(),
        };
        db.generatedContracts = arr;
      }
      return db;
    });
  } else {
    // Sem contrato ainda: documentRecords com metadata.tcleId já alimentam o package via resolveAttachedTcleIds.
    attached = true;
  }

  // Garante metadata no documentRecord (idempotente).
  if (documentId) {
    withDb((db) => {
      const docs = db.documentRecords || db.clinicalDocuments || [];
      const idx = docs.findIndex((d) => d.id === documentId);
      if (idx < 0) return db;
      const row = docs[idx];
      docs[idx] = {
        ...row,
        metadata: {
          ...(row.metadata || {}),
          tcleId,
          packageAttached: true,
        },
      };
      if (db.documentRecords) db.documentRecords = docs;
      return db;
    });
  }

  const packageSnapshot = buildDocumentPackageForBudget({
    appointmentId,
    budgetId,
    patientId,
  });

  return {
    ok: true,
    attached: attached || duplicate,
    duplicate,
    tcleId,
    contractId: contract?.id || null,
    packageSnapshot,
    contractStatus: contract?.status || null,
  };
}

export function listPackageDocumentStatuses({
  appointmentId,
  budgetId,
  patientId,
} = {}) {
  const pkg = buildDocumentPackageForBudget({ appointmentId, budgetId, patientId });
  return (pkg.items || []).map((item) => {
    let status = 'DRAFT';
    if (item.documentType === 'CONTRACT_SERVICES') {
      const raw = String(pkg.contractStatus || '').toLowerCase();
      if (['signed', 'completed', 'assinado'].includes(raw)) status = 'SIGNED';
      else if (['sent', 'viewed', 'pending_signature'].includes(raw)) status = 'PENDING_SIGNATURE';
      else if (item.ready) status = 'READY';
    } else if (item.documentType === 'TCLE') {
      status = item.ready ? 'READY' : 'DRAFT';
    } else if (item.documentType === 'LGPD') {
      status = item.ready ? 'READY' : 'DRAFT';
    } else {
      status = item.ready ? 'READY' : 'DRAFT';
    }
    return {
      id: item.id,
      documentType: item.documentType,
      label: item.label,
      required: item.required,
      ready: item.ready,
      status,
      detail: item.detail || null,
    };
  });
}

/** Diagnóstico local — não dispara comunicação. */
export function inspectTclePackageLink({ patientId, appointmentId, budgetId } = {}) {
  const db = loadDb();
  const contract = getContractStatusForQuote(appointmentId, 'clinical_budget', budgetId, patientId);
  return {
    contractId: contract?.id || null,
    attachedTcleIds: contract?.metadata?.attachedTcleIds || [],
    package: buildDocumentPackageForBudget({ appointmentId, budgetId, patientId }),
    documentRecordCount: (db.documentRecords || []).filter((d) => d.patientId === patientId).length,
  };
}
