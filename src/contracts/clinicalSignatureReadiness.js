/**
 * SSOT da etapa Assinatura no Atendimento Clínico.
 * Reutiliza package, manifest frozen e requisitos documentais — sem motor paralelo.
 */

import { loadDb } from '../db/index.js';
import { CONTRACT_STATUS } from './contractConstants.js';
import { OPERATIONAL_UX_STATUS } from './operationalContractUi.js';
import { getTreatmentDocumentRequirements } from './treatmentDocumentRequirements.js';
import { buildDocumentPackageForBudget } from '../services/operationalContractWizardService.js';
import {
  evaluateSignatureCeremony,
  CEREMONY_STATUS,
  isLegacyClinicalSignature,
} from './clinicalSignatureCeremony.js';

export const CLINICAL_SIGNATURE_STEP = {
  BLOCKED: 'blocked',
  PREPARING_PACKAGE: 'preparing_package',
  READY_TO_SIGN: 'ready_to_sign',
  PARTIALLY_SIGNED: 'partially_signed',
  AWAITING_SIGNATURE: 'awaiting_signature',
  AWAITING_REQUIRED_SIGNERS: 'awaiting_required_signers',
  SIGNED: 'signed',
};

export const CLINICAL_SIGNATURE_STEP_LABELS = {
  [CLINICAL_SIGNATURE_STEP.BLOCKED]: 'Bloqueado',
  [CLINICAL_SIGNATURE_STEP.PREPARING_PACKAGE]: 'Preparando pacote',
  [CLINICAL_SIGNATURE_STEP.READY_TO_SIGN]: 'Pronto para assinatura',
  [CLINICAL_SIGNATURE_STEP.PARTIALLY_SIGNED]: 'Assinatura parcial',
  [CLINICAL_SIGNATURE_STEP.AWAITING_SIGNATURE]: 'Aguardando assinatura',
  [CLINICAL_SIGNATURE_STEP.AWAITING_REQUIRED_SIGNERS]: 'Aguardando signatários',
  [CLINICAL_SIGNATURE_STEP.SIGNED]: 'Assinado',
};

const SIGNED_STATUSES = new Set([
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.COMPLETED,
  CONTRACT_STATUS.VIGENTE,
]);

const AWAITING_STATUSES = new Set([
  CONTRACT_STATUS.SENT,
  CONTRACT_STATUS.VIEWED,
  CONTRACT_STATUS.SIGNED_BY_PATIENT,
  CONTRACT_STATUS.SIGNED_BY_CLINIC,
]);

const FINALIZED_STATUSES = new Set([
  CONTRACT_STATUS.GENERATED,
  CONTRACT_STATUS.READY_TO_SEND,
  ...AWAITING_STATUSES,
  ...SIGNED_STATUSES,
]);

function tenantOf(user) {
  return user?.tenantId || user?.tenant_id || loadDb().clinicProfile?.tenant_id || null;
}

export function isPackageManifestFrozen(contract) {
  if (!contract) return false;
  const md = contract.metadata || {};
  return Boolean(md.packageManifestId || md.packageManifestHash || md.frozenAt);
}

export function evaluateClinicalSignatureReadiness({
  appointmentId,
  budgetId = null,
  patientId = null,
  tenantId = null,
  contractId = null,
  user = null,
} = {}) {
  const blockers = [];
  const expectedTenant = tenantId || tenantOf(user);
  const docs = getTreatmentDocumentRequirements({ appointmentId, budgetId, patientId });
  const contract = docs.contract || null;

  if (contractId && contract?.id && contract.id !== contractId) {
    return failClosed('Contrato informado não corresponde ao atendimento.', {
      docs,
      expectedTenant,
      appointmentId,
      budgetId,
      patientId,
    });
  }
  if (expectedTenant && contract?.tenant_id && contract.tenant_id !== expectedTenant) {
    return failClosed('Contrato não pertence a este tenant.', { docs, expectedTenant, appointmentId, budgetId, patientId });
  }
  if (patientId && contract?.patientId && contract.patientId !== patientId) {
    return failClosed('Contrato não pertence a este paciente.', { docs, expectedTenant, appointmentId, budgetId, patientId });
  }
  if (appointmentId && contract?.quoteId && contract.quoteId !== appointmentId) {
    return failClosed('Contrato não pertence a este atendimento.', { docs, expectedTenant, appointmentId, budgetId, patientId });
  }
  if (budgetId && contract?.budgetId && contract.budgetId !== budgetId) {
    return failClosed('Contrato não pertence a este orçamento.', { docs, expectedTenant, appointmentId, budgetId, patientId });
  }

  const pkg = buildDocumentPackageForBudget({
    appointmentId,
    budgetId: budgetId || docs.budgetId,
    patientId: patientId || docs.patientId,
  });
  const requiredItems = (pkg.items || []).filter((item) => item.required);
  const packageReady = requiredItems.every((item) => item.ready);
  const tcleItem = (pkg.items || []).find((i) => i.documentType === 'TCLE');
  const manifestFrozen = isPackageManifestFrozen(contract);
  const status = String(contract?.status || '').toLowerCase();

  if (!contract?.id) {
    blockers.push({
      code: 'CONTRACT_MISSING',
      message: 'Contrato ainda não finalizado.',
      ctaLabel: 'Ir para Contrato',
      ctaSection: 'contratos',
    });
  } else if (status === CONTRACT_STATUS.DRAFT || !FINALIZED_STATUSES.has(status)) {
    blockers.push({
      code: 'CONTRACT_NOT_FINALIZED',
      message: 'Contrato ainda não finalizado.',
      ctaLabel: 'Ir para Contrato',
      ctaSection: 'contratos',
    });
  }

  if (!docs.requiredApplicableSatisfied || !packageReady) {
    blockers.push({
      code: 'DOCUMENTS_PENDING',
      message: 'Documentos obrigatórios pendentes.',
      ctaLabel: 'Ir para Documentos',
      ctaSection: 'documentos',
    });
  }

  if (contract?.id && FINALIZED_STATUSES.has(status) && !SIGNED_STATUSES.has(status) && packageReady && !manifestFrozen) {
    blockers.push({
      code: 'MANIFEST_NOT_FROZEN',
      message: 'Manifest ainda não congelado.',
      ctaLabel: 'Finalizar preparação',
      ctaSection: 'assinatura',
      action: 'prepare_package',
    });
  }

  if (contract?.id && FINALIZED_STATUSES.has(status) && !packageReady) {
    blockers.push({
      code: 'PACKAGE_NOT_READY',
      message: 'Pacote ainda não preparado.',
      ctaLabel: 'Preparar pacote',
      ctaSection: 'assinatura',
      action: 'prepare_package',
    });
  }

  const ceremony = evaluateSignatureCeremony({
    tenantId: expectedTenant,
    patientId: patientId || docs.patientId,
    appointmentId,
    budgetId: budgetId || docs.budgetId,
    contractId: contract?.id || null,
  });
  for (const b of ceremony.blockers || []) blockers.push(b);

  const effectiveContract = contract || ceremony.contract || null;
  const effectiveStatus = String(effectiveContract?.status || status || '').toLowerCase();
  const legacy = isLegacyClinicalSignature(effectiveContract);
  const pendingRequired = (ceremony.requiredSigners || []).some((s) => s.required && s.status !== 'signed');

  let step = CLINICAL_SIGNATURE_STEP.BLOCKED;
  if (legacy || SIGNED_STATUSES.has(effectiveStatus)) {
    step = CLINICAL_SIGNATURE_STEP.SIGNED;
  } else if (ceremony.status === CEREMONY_STATUS.PARTIALLY_SIGNED) {
    step = CLINICAL_SIGNATURE_STEP.PARTIALLY_SIGNED;
  } else if (ceremony.status === CEREMONY_STATUS.AWAITING_REQUIRED_SIGNERS) {
    step = CLINICAL_SIGNATURE_STEP.AWAITING_REQUIRED_SIGNERS;
  } else if (AWAITING_STATUSES.has(status) && packageReady) {
    step = CLINICAL_SIGNATURE_STEP.AWAITING_SIGNATURE;
  } else if (
    contract?.id
    && FINALIZED_STATUSES.has(status)
    && packageReady
    && manifestFrozen
    && docs.requiredApplicableSatisfied
    && !(ceremony.blockers || []).length
  ) {
    step = CLINICAL_SIGNATURE_STEP.READY_TO_SIGN;
  } else if (contract?.id && FINALIZED_STATUSES.has(status) && !SIGNED_STATUSES.has(status)) {
    step = CLINICAL_SIGNATURE_STEP.PREPARING_PACKAGE;
  }

  const signatureReady = step === CLINICAL_SIGNATURE_STEP.READY_TO_SIGN;
  const inCeremony = [
    CLINICAL_SIGNATURE_STEP.READY_TO_SIGN,
    CLINICAL_SIGNATURE_STEP.PARTIALLY_SIGNED,
    CLINICAL_SIGNATURE_STEP.AWAITING_SIGNATURE,
    CLINICAL_SIGNATURE_STEP.AWAITING_REQUIRED_SIGNERS,
  ].includes(step);
  const canSignNow = inCeremony && manifestFrozen && pendingRequired && !legacy;
  const canSend = canSignNow && (ceremony.requiredSigners || []).some((s) => (
    s.required && s.status !== 'signed' && (s.role === 'PATIENT' || s.role === 'LEGAL_GUARDIAN')
  ));
  const manifestLabel = legacy && !manifestFrozen
    ? 'Assinatura anterior ao manifest atual'
    : (manifestFrozen ? 'Pronto / congelado' : 'Não congelado');

  let uxStatus = OPERATIONAL_UX_STATUS.WITH_PENDING;
  if (step === CLINICAL_SIGNATURE_STEP.READY_TO_SIGN) uxStatus = OPERATIONAL_UX_STATUS.READY_TO_SIGN;
  else if (step === CLINICAL_SIGNATURE_STEP.AWAITING_SIGNATURE || step === CLINICAL_SIGNATURE_STEP.AWAITING_REQUIRED_SIGNERS) {
    uxStatus = OPERATIONAL_UX_STATUS.AWAITING_SIGNATURE;
  } else if (step === CLINICAL_SIGNATURE_STEP.PARTIALLY_SIGNED) uxStatus = OPERATIONAL_UX_STATUS.PARTIALLY_SIGNED;
  else if (step === CLINICAL_SIGNATURE_STEP.SIGNED) uxStatus = OPERATIONAL_UX_STATUS.SIGNED;

  return {
    ok: inCeremony || step === CLINICAL_SIGNATURE_STEP.SIGNED,
    step,
    label: CLINICAL_SIGNATURE_STEP_LABELS[step],
    uxStatus,
    signatureReady,
    canSignNow,
    canSend,
    contractFinalized: Boolean(contract?.id && FINALIZED_STATUSES.has(status) && status !== CONTRACT_STATUS.DRAFT),
    packageReady,
    manifestFrozen,
    manifestLabel,
    legacySignedBeforeManifest: Boolean(legacy && !manifestFrozen),
    documentsSatisfied: Boolean(docs.requiredApplicableSatisfied),
    tcleRequired: Boolean(docs.documents?.tcle?.required),
    tcleApplicable: Boolean(docs.documents?.tcle?.applicable),
    packageItems: (pkg.items || []).filter((item) => item.required || item.documentType === 'LGPD' || item.documentType === 'IMAGE_USE'),
    blockers: step === CLINICAL_SIGNATURE_STEP.SIGNED ? [] : uniqueBlockers(blockers),
    contract,
    package: pkg,
    ceremony,
    identity: {
      tenantId: expectedTenant,
      patientId: patientId || docs.patientId || contract?.patientId || null,
      appointmentId,
      budgetId: budgetId || docs.budgetId || contract?.budgetId || null,
      contractId: contract?.id || null,
      contractNumber: contract?.contractNumber || null,
      packageManifestId: contract?.metadata?.packageManifestId || null,
      packageManifestHash: contract?.metadata?.packageManifestHash || null,
    },
  };
}

function uniqueBlockers(blockers) {
  const seen = new Set();
  return blockers.filter((b) => {
    if (seen.has(b.code)) return false;
    seen.add(b.code);
    return true;
  });
}

function failClosed(message, ctx) {
  return {
    ok: false,
    step: CLINICAL_SIGNATURE_STEP.BLOCKED,
    label: CLINICAL_SIGNATURE_STEP_LABELS[CLINICAL_SIGNATURE_STEP.BLOCKED],
    signatureReady: false,
    canSignNow: false,
    canSend: false,
    contractFinalized: false,
    packageReady: false,
    manifestFrozen: isPackageManifestFrozen(ctx.docs?.contract),
    documentsSatisfied: false,
    tcleRequired: false,
    tcleApplicable: false,
    packageItems: [],
    blockers: [{ code: 'IDENTITY', message, ctaLabel: 'Ir para Contrato', ctaSection: 'contratos' }],
    contract: ctx.docs?.contract || null,
    package: null,
    identity: {
      tenantId: ctx.expectedTenant,
      patientId: ctx.patientId,
      appointmentId: ctx.appointmentId,
      budgetId: ctx.budgetId,
      contractId: null,
      packageManifestId: null,
    },
  };
}

export function assertClinicalSignatureReady(input = {}, { forSend = false, forSign = false } = {}) {
  const readiness = evaluateClinicalSignatureReadiness(input);
  const contract = readiness.contract;
  if (!contract?.id) {
    throw new Error(readiness.blockers[0]?.message || 'Contrato ausente.');
  }
  if (contract.status === CONTRACT_STATUS.DRAFT) {
    throw new Error('Não é possível assinar contrato em rascunho. Finalize o contrato primeiro.');
  }
  if (forSend && !readiness.canSend) {
    throw new Error(readiness.blockers[0]?.message || 'Assinatura ainda não está pronta para envio.');
  }
  if (forSign && !readiness.canSignNow) {
    throw new Error(readiness.blockers[0]?.message || 'Assinatura ainda não está pronta.');
  }
  return readiness;
}
