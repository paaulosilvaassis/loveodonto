/**
 * Anexa TCLE clínico ao pacote documental do tratamento (operacional).
 * Reutiliza metadata.attachedTcleIds + documentRecords — sem motor paralelo.
 * Idempotente: não duplica o mesmo tcleId.
 */

import { withDb, loadDb } from '../db/index.js';
import { mapDocumentTemplateToTcleId } from './clinicalTcleAttachmentService.js';
import { getContractStatusForQuote } from './contractModuleService.js';
import { buildDocumentPackageForBudget } from './operationalContractWizardService.js';
import {
  assertDocumentPackageEligibility,
  findEligibleTcleDocumentForPackage,
  DOCUMENT_APPLICABILITY,
} from '../contracts/treatmentDocumentRequirements.js';

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

  const gate = assertDocumentPackageEligibility({
    user,
    patientId,
    appointmentId,
    budgetId,
    documentId,
    templateKey,
    tcleId,
  });
  if (!gate.ok) {
    return {
      ok: false,
      attached: false,
      duplicate: false,
      tcleId: tcleId || null,
      contractId: gate.requirements?.contract?.id || null,
      packageSnapshot: null,
      error: gate.error,
      reason: gate.reason || null,
      frozen: Boolean(gate.frozen),
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
            applicability: DOCUMENT_APPLICABILITY.APPLICABLE,
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

export function attachEligibleTcleToTreatmentPackage({
  user,
  patientId,
  appointmentId,
  budgetId = null,
} = {}) {
  const found = findEligibleTcleDocumentForPackage({ patientId, appointmentId, budgetId });
  if (!found.ok) {
    const error = found.reason === 'not_required_for_treatment'
      ? 'TCLE não é exigido para este tratamento. Nada foi vinculado ao pacote.'
      : 'Não há TCLE compatível com o tratamento atual para vincular ao pacote.';
    return {
      ok: false,
      attached: false,
      duplicate: false,
      tcleId: null,
      contractId: found.requirements?.contract?.id || null,
      packageSnapshot: null,
      error,
      reason: found.reason,
    };
  }
  return attachTcleDocumentToTreatmentPackage({
    user,
    patientId,
    appointmentId,
    budgetId,
    documentId: found.document.id,
    templateKey: found.document.templateKey,
    tcleId: found.document.metadata?.tcleId || null,
  });
}
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
