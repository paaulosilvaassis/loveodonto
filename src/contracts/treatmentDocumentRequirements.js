/**
 * SSOT de elegibilidade documental do tratamento.
 * Contract Readiness, etapa Documentos e package/manifest devem usar esta camada.
 */

import { loadDb } from '../db/index.js';
import { findBudgetRecord, getActiveClinicalBudget } from '../services/budgetNavigationService.js';
import { getContractStatusForQuote } from '../services/contractModuleService.js';
import { mapDocumentTemplateToTcleId } from '../services/clinicalTcleAttachmentService.js';
import { listDocumentRecords } from '../services/documentService.js';
import { detectAllTreatmentTypes } from '../components/clinical/contract/detectTreatmentType.js';
import { DOCUMENT_CATEGORIES, getTemplateByKey } from '../utils/documentTemplates.js';
import { CONTRACT_STATUS } from './contractConstants.js';
import { resolveRequiredTcles, validateRequiredTcles } from './contractTcleRegistry.js';

export const DOCUMENT_APPLICABILITY = {
  APPLICABLE: 'applicable',
  NOT_APPLICABLE_TO_CURRENT_TREATMENT: 'notApplicableToCurrentTreatment',
  MANUAL: 'manual',
};

export const TCLE_NOT_REQUIRED_REASON = 'not_required_for_treatment';

const FROZEN_CONTRACT_STATUSES = new Set([
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.COMPLETED,
  CONTRACT_STATUS.SENT,
  CONTRACT_STATUS.VIEWED,
  CONTRACT_STATUS.SIGNED_BY_PATIENT,
  CONTRACT_STATUS.SIGNED_BY_CLINIC,
]);

function currentClinicId() {
  return loadDb().clinicProfile?.id || null;
}

function resolveBudget({ appointmentId, budgetId = null } = {}) {
  if (budgetId) {
    const record = findBudgetRecord({ budgetId, appointmentId });
    if (record?.budget) return record.budget;
  }
  return getActiveClinicalBudget(appointmentId) || null;
}

function resolveClinical(appointmentId) {
  return (loadDb().clinicalAppointments || []).find((c) => c.appointmentId === appointmentId) || null;
}

export function isContractPackageFrozen(contract) {
  if (!contract) return false;
  if (FROZEN_CONTRACT_STATUSES.has(contract.status)) return true;
  const md = contract.metadata || {};
  return Boolean(md.packageManifestId || md.packageManifestHash || md.frozenAt);
}

export function isTcleDocumentApplicableToCurrentTreatment(doc) {
  const applicability = doc?.metadata?.applicability;
  return applicability !== DOCUMENT_APPLICABILITY.NOT_APPLICABLE_TO_CURRENT_TREATMENT;
}

export function eligibleAttachedTcleIds({
  patientId,
  appointmentId,
  requiredTcles = [],
  contractAttachedIds = [],
} = {}) {
  const requiredIds = new Set((requiredTcles || []).map((item) => item.id));
  if (!requiredIds.size) return [];
  const records = listDocumentRecords({
    patientId,
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
  }).filter((row) => !appointmentId || !row.appointmentId || row.appointmentId === appointmentId);

  const ids = new Set();
  for (const row of records) {
    if (!isTcleDocumentApplicableToCurrentTreatment(row)) continue;
    const mapped = mapDocumentTemplateToTcleId(row.templateKey) || row.metadata?.tcleId || null;
    if (!mapped) continue;
    if (requiredIds.size && !requiredIds.has(mapped)) continue;
    ids.add(mapped);
  }
  if (requiredIds.size) {
    for (const id of contractAttachedIds || []) {
      if (id && requiredIds.has(id)) ids.add(id);
    }
  }
  return [...ids];
}

export function evaluateTcleTemplateEligibility({
  templateKey = null,
  tcleId: tcleIdInput = null,
  treatmentTypes = [],
} = {}) {
  const tcleId = tcleIdInput || mapDocumentTemplateToTcleId(templateKey) || null;
  const requiredTcles = resolveRequiredTcles(treatmentTypes);
  const required = requiredTcles.length > 0;
  const template = templateKey ? getTemplateByKey(templateKey) : null;
  const templateLabel = template?.title || (tcleId === 'tcle_implante' ? 'Implante' : 'este consentimento');

  if (!tcleId) {
    return {
      tcleId: null,
      required,
      applicable: false,
      eligibleForPackage: false,
      reason: 'not_a_mapped_tcle',
      requiredTcles,
      templateLabel,
    };
  }

  if (!required) {
    return {
      tcleId,
      required: false,
      applicable: false,
      eligibleForPackage: false,
      reason: TCLE_NOT_REQUIRED_REASON,
      requiredTcles,
      templateLabel,
    };
  }

  const matchesRequired = requiredTcles.some((item) => item.id === tcleId);
  return {
    tcleId,
    required: true,
    applicable: matchesRequired,
    eligibleForPackage: matchesRequired,
    reason: matchesRequired ? 'eligible' : 'incompatible_treatment',
    requiredTcles,
    templateLabel,
  };
}

export function buildIncompatibleTcleWarning(eligibility, budget = null) {
  const procedureHint = (budget?.procedures || [])
    .map((p) => p.name)
    .filter(Boolean)
    .join(', ') || budget?.planName || 'o tratamento atual';
  return {
    title: 'Este consentimento não corresponde ao tratamento atual.',
    message: `O orçamento aprovado não possui procedimento de ${eligibility.templateLabel || 'Implante'}.\n\nTratamento atual: ${procedureHint}.\n\nEste documento não será considerado obrigatório nem incluído automaticamente no pacote de assinatura.`,
  };
}

export function getTreatmentDocumentRequirements({
  appointmentId,
  budgetId = null,
  patientId = null,
} = {}) {
  const clinical = appointmentId ? resolveClinical(appointmentId) : null;
  const budget = resolveBudget({ appointmentId, budgetId });
  const resolvedPatientId = patientId || clinical?.patientId || null;
  const resolvedBudgetId = budget?.id || budgetId || null;
  const treatmentTypes = detectAllTreatmentTypes({
    planName: budget?.planName || '',
    procedures: budget?.procedures || [],
  });
  const requiredTcles = resolveRequiredTcles(treatmentTypes);
  const contract = getContractStatusForQuote(
    appointmentId,
    'clinical_budget',
    resolvedBudgetId,
    resolvedPatientId,
  );
  const attachedEligible = eligibleAttachedTcleIds({
    patientId: resolvedPatientId,
    appointmentId,
    requiredTcles,
    contractAttachedIds: contract?.metadata?.attachedTcleIds || [],
  });
  const tcleCheck = validateRequiredTcles(treatmentTypes, attachedEligible);
  const tcleRequired = requiredTcles.length > 0;
  const contractReady = Boolean(contract?.id && !['canceled', 'replaced', 'refused'].includes(String(contract.status || '').toLowerCase()));

  const documents = {
    contract: {
      required: true,
      applicable: true,
      ready: contractReady,
    },
    lgpd: {
      required: true,
      applicable: true,
      ready: true,
    },
    tcle: {
      required: tcleRequired,
      applicable: tcleRequired,
      ready: tcleCheck.ok,
      reason: tcleRequired ? null : TCLE_NOT_REQUIRED_REASON,
      requiredTcles,
      attachedEligibleIds: attachedEligible,
    },
    imageConsent: {
      required: false,
      applicable: true,
      ready: false,
    },
  };

  const requiredApplicable = Object.values(documents).filter((item) => item.required && item.applicable);
  const requiredApplicableSatisfied = requiredApplicable.every((item) => item.ready);

  return {
    appointmentId,
    budgetId: resolvedBudgetId,
    patientId: resolvedPatientId,
    clinicId: currentClinicId(),
    treatmentTypes,
    budget,
    contract,
    documents,
    requiredApplicableSatisfied,
    hasPendency: !requiredApplicableSatisfied,
  };
}

export function areRequiredApplicableDocumentsSatisfied(input = {}) {
  return getTreatmentDocumentRequirements(input).requiredApplicableSatisfied;
}

export function assertDocumentPackageEligibility({
  user,
  patientId,
  appointmentId,
  budgetId = null,
  documentId = null,
  templateKey = null,
  tcleId = null,
} = {}) {
  if (!user?.id) {
    return { ok: false, error: 'Usuário ausente.' };
  }
  if (!patientId || !appointmentId) {
    return { ok: false, error: 'patientId/appointmentId obrigatórios.' };
  }

  const req = getTreatmentDocumentRequirements({ appointmentId, budgetId, patientId });
  const tenantId = user.tenantId || user.tenant_id || null;
  const db = loadDb();
  const patient = (db.patients || []).find((p) => p.id === patientId) || null;
  if (tenantId && patient?.tenant_id && patient.tenant_id !== tenantId) {
    return { ok: false, error: 'Documento/paciente não pertence a este tenant.' };
  }
  if (req.patientId && req.patientId !== patientId) {
    return { ok: false, error: 'Atendimento não pertence a este paciente.' };
  }
  if (budgetId && req.budgetId && req.budgetId !== budgetId) {
    return { ok: false, error: 'Orçamento não corresponde ao atendimento.' };
  }

  const eligibility = evaluateTcleTemplateEligibility({
    templateKey,
    tcleId,
    treatmentTypes: req.treatmentTypes,
  });
  if (!eligibility.tcleId) {
    return { ok: false, error: 'Modelo não mapeado para TCLE do tratamento.', eligibility, requirements: req };
  }
  if (!eligibility.eligibleForPackage) {
    const warning = buildIncompatibleTcleWarning(eligibility, req.budget);
    return {
      ok: false,
      error: warning.message,
      eligibility,
      requirements: req,
      reason: eligibility.reason,
    };
  }

  if (documentId) {
    const doc = listDocumentRecords({ patientId }).find((row) => row.id === documentId)
      || (db.documentRecords || []).find((row) => row.id === documentId)
      || null;
    if (!doc) {
      return { ok: false, error: 'Documento não encontrado.', eligibility, requirements: req };
    }
    if (doc.patientId && doc.patientId !== patientId) {
      return { ok: false, error: 'Documento pertence a outro paciente.', eligibility, requirements: req };
    }
    if (doc.appointmentId && doc.appointmentId !== appointmentId) {
      return { ok: false, error: 'Documento pertence a outro atendimento.', eligibility, requirements: req };
    }
    if (doc.metadata?.budgetId && budgetId && doc.metadata.budgetId !== budgetId) {
      return { ok: false, error: 'Documento pertence a outro orçamento.', eligibility, requirements: req };
    }
    if (!isTcleDocumentApplicableToCurrentTreatment(doc)) {
      return {
        ok: false,
        error: 'Documento avulso incompatível com o tratamento atual. Não entra no pacote.',
        eligibility,
        requirements: req,
        reason: TCLE_NOT_REQUIRED_REASON,
      };
    }
    if (doc.signed || doc.metadata?.frozen) {
      return { ok: false, error: 'Documento assinado/frozen não pode ser alterado.', eligibility, requirements: req, frozen: true };
    }
  }

  if (isContractPackageFrozen(req.contract)) {
    return {
      ok: false,
      error: 'Pacote jurídico já congelado/assinado. Não é possível alterar documentos do package.',
      eligibility,
      requirements: req,
      frozen: true,
    };
  }

  return { ok: true, eligibility, requirements: req };
}

export function findEligibleTcleDocumentForPackage({
  patientId,
  appointmentId,
  budgetId = null,
} = {}) {
  const req = getTreatmentDocumentRequirements({ appointmentId, budgetId, patientId });
  if (!req.documents.tcle.required) {
    return { ok: false, document: null, reason: TCLE_NOT_REQUIRED_REASON, requirements: req };
  }
  const requiredIds = new Set(req.documents.tcle.requiredTcles.map((item) => item.id));
  const docs = listDocumentRecords({
    patientId,
    appointmentId,
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
  });
  const match = docs.find((row) => {
    if (!isTcleDocumentApplicableToCurrentTreatment(row)) return false;
    const mapped = mapDocumentTemplateToTcleId(row.templateKey) || row.metadata?.tcleId;
    return mapped && requiredIds.has(mapped);
  }) || null;
  if (!match) {
    return { ok: false, document: null, reason: 'no_eligible_tcle', requirements: req };
  }
  return { ok: true, document: match, requirements: req };
}
