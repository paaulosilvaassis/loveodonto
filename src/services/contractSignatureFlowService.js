/**
 * Orquestração do fluxo de assinatura digital de contratos odontológicos.
 */
import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import { getPatient } from './patientService.js';
import { resolvePatientEmail, PATIENT_EMAIL_REQUIRED_MSG } from './patientEmail.js';
import { formatCivilCpf } from '../utils/patientCpfIdentity.js';
import { getGeneratedContract } from './contractService.js';
import {
  getContractSettings,
  registerContractEvent,
  normalizeContract,
} from './contractModuleService.js';
import { addFile } from './patientFilesService.js';
import {
  CONTRACT_STATUS,
  LEGAL_SIGNATURE_TYPES,
  SIGNED_STATUSES,
  SIGNATURE_WEBHOOK_EVENTS,
} from '../contracts/contractConstants.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import { assertClinicalSignatureReady } from '../contracts/clinicalSignatureReadiness.js';
import {
  createSignatureRequest,
  sendSignatureEmail,
  mapWebhookEventToContractStatus,
} from './signatureProviderService.js';
import { buildSignatureEmailContent, resolveClinicEmail } from './signatureEmailService.js';
import { resolveClinicEmailIdentity } from './clinicEmailIdentity.js';
import {
  logSignatureAudit,
  getLatestSignatureRequest,
} from './contractSignatureAuditService.js';
import { notifyClinicalBudgetUpdated } from './clinicalBudgetApprovedService.js';
import { validateContractGeneration } from './contractValidationService.js';
import { mergeContractAttachedTcleIds } from './clinicalTcleAttachmentService.js';
import { coerceInternalSignatureType } from '../contracts/internalSignatureClassification.js';
import {
  LIFECYCLE_ACTIONS,
  CONTRACT_LIFECYCLE_TRANSITION_INVALID,
  CONTRACT_LIFECYCLE_WRITER_NOT_IMPLEMENTED,
  assertContractStatusMutation,
} from '../contracts/lifecycle/index.js';

const APPROVED_BUDGET_STATUSES = new Set([
  BUDGET_STATUS.APROVADO,
  BUDGET_STATUS.CONTRATO_GERADO,
  'APPROVED',
  'APROVADO',
]);

const CHOSEN_PAYMENT_MARKERS = new Set(['escolhida', 'chosen', 'accepted', 'selected']);

function isBudgetApprovedStatus(status) {
  return APPROVED_BUDGET_STATUSES.has(String(status || '').trim().toUpperCase());
}

function isPaymentConditionChosen(budget) {
  return (budget?.paymentOptions || []).some((option) => {
    if (!option) return false;
    if (option.accepted) return true;
    const presentation = String(option.presentationStatus || '').trim().toLowerCase();
    return CHOSEN_PAYMENT_MARKERS.has(presentation);
  });
}

const BLOCKED_SEND_STATUSES = new Set([
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.COMPLETED,
  CONTRACT_STATUS.CANCELED,
  CONTRACT_STATUS.REFUSED,
  CONTRACT_STATUS.REPLACED,
  CONTRACT_STATUS.DRAFT,
  CONTRACT_STATUS.SIGNED_BY_PATIENT,
]);

const SENDABLE_CONTRACT_STATUSES = new Set([
  CONTRACT_STATUS.GENERATED,
  CONTRACT_STATUS.READY_TO_SEND,
  CONTRACT_STATUS.SENT,
  CONTRACT_STATUS.VIEWED,
  CONTRACT_STATUS.SIGNED_BY_CLINIC,
]);

/**
 * Resolve orçamento vinculado ao contrato gerado (reload/route-change safe).
 */
export function resolveBudgetForContractSend(contract, budgetHint = null) {
  if (contract?.budgetId) {
    const db = loadDb();
    for (const ca of db.clinicalAppointments || []) {
      if (ca?.budget?.id === contract.budgetId) return ca.budget;
      const hist = (ca?.budgetHistory || []).find((b) => b?.id === contract.budgetId);
      if (hist) return hist;
    }
  }
  if (budgetHint?.id && (!contract?.budgetId || budgetHint.id === contract.budgetId)) {
    return budgetHint;
  }
  if (!contract) return budgetHint || null;
  return budgetHint || null;
}

export function canSendContractForSignature({ contract, budget }) {
  if (!contract) return false;
  if (BLOCKED_SEND_STATUSES.has(contract.status)) return false;
  if (!SENDABLE_CONTRACT_STATUSES.has(contract.status)) return false;

  const resolvedBudget = resolveBudgetForContractSend(contract, budget);
  if (!resolvedBudget) {
    // Contrato GENERATED já passou pelos pré-requisitos na finalização.
    // Após reload, ausência temporária do orçamento na UI não deve esconder o CTA.
    return Boolean(contract.quoteId || contract.budgetId || contract.id);
  }
  if (!isBudgetApprovedStatus(resolvedBudget.status)) {
    const hist = String(resolvedBudget.status || '').trim().toUpperCase() === 'HISTORICO';
    if (!hist) return false;
  }
  if (!isPaymentConditionChosen(resolvedBudget)) {
    // Status CONTRATO_GERADO / contrato GENERATED: pagamento já foi escolhido no fluxo.
    const st = String(resolvedBudget.status || '').trim().toUpperCase();
    if (st === 'CONTRATO_GERADO' || st === 'HISTORICO') return true;
    return false;
  }
  return true;
}

export function buildSignatureSendFormDefaults({
  patientId,
  professional,
  settings,
  contractId = null,
}) {
  const bundle = patientId ? getPatient(patientId) : null;
  const profile = bundle?.profile || {};
  const phones = bundle?.phones || [];
  const mainPhone = phones.find((p) => p.is_primary) || phones[0];
  const db = loadDb();
  const clinic = db.clinicProfile || {};

  const birthDate = profile.birth_date;
  let isMinor = false;
  if (birthDate) {
    const birth = new Date(`${String(birthDate).slice(0, 10)}T12:00:00`);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
    isMinor = age < 18;
  }

  const previous = contractId ? getLatestSignatureRequest(contractId) : null;
  const previousEmail = previous?.recipients?.patientEmail || '';

  return {
    patientName: profile.full_name || '',
    patientCpf: formatCivilCpf(profile.cpf),
    patientEmail: resolvePatientEmail(bundle) || previousEmail || '',
    patientEmailOnFile: Boolean(resolvePatientEmail(bundle)),
    patientPhone: mainPhone ? `(${mainPhone.ddd || ''}) ${mainPhone.number || ''}`.trim() : '',
    guardianEmail: isMinor
      ? (profile.guardian_email || profile.legal_guardian_email || '')
      : '',
    technicalEmail: settings.technicalResponsibleEmail || professional?.email || '',
    clinicEmail: resolveClinicEmail(settings) || clinic.email || '',
    linkExpiryDays: settings.signLinkExpiryDays || 7,
    signatureType: coerceInternalSignatureType(
      settings.defaultSignatureType || LEGAL_SIGNATURE_TYPES.SIMPLE,
      settings,
    ),
    professional,
  };
}

export function resolveRequiredSignatureType({ budget, settings }) {
  const total = Number(budget?.totalValue || 0);
  const hasFinancing = Boolean(budget?.financingId);
  if (settings.financingRequireAdvancedSignature && hasFinancing) {
    return coerceInternalSignatureType(LEGAL_SIGNATURE_TYPES.ADVANCED, settings);
  }
  if (settings.highValueRequireAdvancedSignature && total >= Number(settings.highValueThreshold || 0)) {
    return coerceInternalSignatureType(LEGAL_SIGNATURE_TYPES.ADVANCED, settings);
  }
  if (settings.requireIcpCertificate) {
    return coerceInternalSignatureType(LEGAL_SIGNATURE_TYPES.QUALIFIED, settings);
  }
  return coerceInternalSignatureType(
    settings.defaultSignatureType || LEGAL_SIGNATURE_TYPES.SIMPLE,
    settings,
  );
}

export async function sendContractForDigitalSignature(user, contractId, formData) {
  if (!formData?.patientEmail?.trim()) {
    throw new Error(PATIENT_EMAIL_REQUIRED_MSG);
  }
  const attachedTcleIds = withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) return [];
    const c = arr[idx];
    const merged = mergeContractAttachedTcleIds(c, {
      patientId: c.patientId,
      appointmentId: c.quoteId,
    });
    arr[idx] = {
      ...c,
      metadata: { ...(c.metadata || {}), attachedTcleIds: merged },
    };
    return merged;
  });

  const contract = normalizeContract(getGeneratedContract(contractId));
  if (!contract) throw new Error('Contrato não encontrado.');
  if (!SENDABLE_CONTRACT_STATUSES.has(contract.status)) {
    throw new Error('Este contrato não pode ser enviado para assinatura remota no status atual.');
  }
  if (contract.quoteSource === 'clinical_budget') {
    assertClinicalSignatureReady({
      appointmentId: contract.quoteId,
      budgetId: contract.budgetId,
      patientId: contract.patientId,
      contractId: contract.id,
      user,
    }, { forSend: true });
  }

  const readiness = validateContractGeneration({
    quoteSource: contract.quoteSource,
    quoteId: contract.quoteId,
    patientId: contract.patientId,
    currentUser: user,
    htmlPreview: contract.finalContent || contract.renderedHtml || '',
    contractNumber: contract.contractNumber,
    strict: true,
    attachedTcleIds: attachedTcleIds.length
      ? attachedTcleIds
      : (contract.metadata?.attachedTcleIds || formData.attachedTcleIds || []),
  });
  if (!readiness.ok) {
    const labels = readiness.missing.map((m) => m.label).slice(0, 6).join('; ');
    throw new Error(`Envio bloqueado. Corrija antes de assinar: ${labels}`);
  }
  // Warnings (ex.: valueMismatch) são informativos — alinhado a evaluateContractSignatureReadiness.ok.
  // Bloqueio jurídico/operacional fica só em readiness.missing / readiness.ok.
  // Staging não ignora missing críticos.

  const settings = getContractSettings(user);
  if (!formData.patientEmail?.trim()) {
    throw new Error(PATIENT_EMAIL_REQUIRED_MSG);
  }
  if (settings.requireCpfForSignature && !formData.patientCpf?.trim()) {
    throw new Error('CPF do paciente é obrigatório para assinatura.');
  }

  const signatureType = coerceInternalSignatureType(
    formData.signatureType || resolveRequiredSignatureType({
      budget: formData.budget,
      settings,
    }),
    settings,
  );

  const { request, signUrl, documentHash } = await createSignatureRequest({
    user,
    contract,
    formData: { ...formData, signatureType },
    settings: { ...settings, signLinkExpiryDays: formData.linkExpiryDays },
  });

  const clinicIdentity = resolveClinicEmailIdentity();
  const clinicName = clinicIdentity.name;
  const emailContent = buildSignatureEmailContent({
    patientName: formData.patientName,
    treatmentName: formData.treatmentName,
    clinicName,
    clinicIdentity,
    signUrl: (typeof window !== 'undefined' && window.location?.origin)
      ? `${window.location.origin}${signUrl}`
      : signUrl,
    expiresAt: request.expiresAt,
    contractNumber: contract.contractNumber,
  });

  const delivery = await sendSignatureEmail({ user, request, signUrl, emailContent });
  if (!delivery?.ok || delivery?.simulated === true) {
    throw new Error('O e-mail de assinatura não foi enviado.');
  }
  if (delivery?.acceptedByTransport === false) {
    throw new Error('O provedor de e-mail não aceitou o disparo. O link não foi enviado.');
  }

  registerContractEvent(user, contractId, 'SENT', 'Contrato enviado para assinatura digital', {
    requestId: request.id,
    provider: delivery.provider || request.provider,
    recipientEmail: formData.patientEmail,
    documentHash,
    expiresAt: request.expiresAt,
    messageId: delivery.messageId || null,
    reused: Boolean(request && signUrl),
  });

  if (contract.patientId) {
    notifyClinicalBudgetUpdated(contract.patientId);
  }

  return { request, signUrl, emailContent, delivery };
}

export function applySignatureCompletion({
  user,
  contractId,
  signedPdfDataUrl,
  auditPayload = {},
}) {
  const now = new Date().toISOString();
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('Contrato não encontrado.');

    const contract = arr[idx];
    if (SIGNED_STATUSES.includes(contract.status)) {
      return { contract, alreadySigned: true };
    }

    assertContractStatusMutation(contract, CONTRACT_STATUS.COMPLETED, {
      action: LIFECYCLE_ACTIONS.RECORD_SIGNATURE,
      contractId,
    });

    arr[idx] = {
      ...contract,
      status: CONTRACT_STATUS.COMPLETED,
      signedAt: now,
      pdfUrl: signedPdfDataUrl || contract.pdfUrl,
      documentHash: auditPayload.documentHash || contract.documentHash,
      signatureCertificateUrl: auditPayload.certificateUrl || contract.signatureCertificateUrl,
      lockedAt: contract.lockedAt || now,
    };

    if (!Array.isArray(db.contractAttachments)) db.contractAttachments = [];
    if (signedPdfDataUrl) {
      db.contractAttachments.push({
        id: createId('catt'),
        tenant_id: user?.tenantId || user?.tenant_id || null,
        clinicId: contract.clinicId,
        contractId,
        fileUrl: signedPdfDataUrl,
        fileName: `contrato-assinado-${contract.contractNumber || contractId}.pdf`,
        fileType: 'application/pdf',
        uploadedBy: user?.id || 'system',
        createdAt: now,
        source: 'signature_platform',
      });
    }

    const requests = db.contractSignatureRequests || [];
    const reqIdx = requests.findIndex((r) => r.contractId === contractId && r.status !== 'completed');
    if (reqIdx >= 0) {
      requests[reqIdx] = {
        ...requests[reqIdx],
        status: 'completed',
        completedAt: now,
        signedPdfUrl: signedPdfDataUrl || requests[reqIdx].signedPdfUrl,
        certificateUrl: auditPayload.certificateUrl || requests[reqIdx].certificateUrl,
      };
    }

    return { contract: arr[idx] };
  });
}

export function saveSignedContractToPatientChart(user, contract, signedPdfDataUrl) {
  if (!contract?.patientId || !signedPdfDataUrl) return null;
  return addFile(
    contract.patientId,
    {
      category: 'Contratos',
      file_name: `Contrato assinado ${contract.contractNumber || contract.id}.pdf`,
      mime_type: 'application/pdf',
      file_url: signedPdfDataUrl,
    },
    user?.id,
  );
}

export function processSignatureWebhookEvent(payload) {
  const eventType = payload?.event || payload?.type;
  const externalId = payload?.externalId || payload?.document_id || payload?.data?.id;
  const contractId = payload?.contractId;

  const db = loadDb();
  let request = null;

  if (contractId) {
    request = getLatestSignatureRequest(contractId);
  } else if (externalId) {
    request = (db.contractSignatureRequests || []).find((r) => r.externalId === externalId) || null;
  }

  if (!request) {
    return { processed: false, reason: 'request_not_found' };
  }

  const nextStatus = mapWebhookEventToContractStatus(eventType);
  if (!nextStatus) {
    return { processed: false, reason: 'unknown_event', eventType };
  }

  withDb((draft) => {
    const arr = draft.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === request.contractId);
    if (idx >= 0) {
      try {
        assertContractStatusMutation(arr[idx], nextStatus, {
          contractId: request.contractId,
        });
        arr[idx] = { ...arr[idx], status: nextStatus };
      } catch (err) {
        if (
          err?.code !== CONTRACT_LIFECYCLE_TRANSITION_INVALID
          && err?.code !== CONTRACT_LIFECYCLE_WRITER_NOT_IMPLEMENTED
        ) {
          throw err;
        }
      }
    }

    const reqList = draft.contractSignatureRequests || [];
    const rIdx = reqList.findIndex((r) => r.id === request.id);
    if (rIdx >= 0) {
      reqList[rIdx] = {
        ...reqList[rIdx],
        status: eventType === SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_COMPLETED ? 'completed' : reqList[rIdx].status,
        lastWebhookEvent: eventType,
        lastWebhookAt: new Date().toISOString(),
      };
    }
    return draft;
  });

  logSignatureAudit({
    contractId: request.contractId,
    requestId: request.id,
    action: `webhook_${eventType}`,
    user: null,
    payload: {
      platform: request.provider,
      externalId: request.externalId,
      ipAddress: payload.ipAddress || '',
      signerCpf: payload.signerCpf || '',
      authMethod: payload.authMethod || '',
      documentHash: payload.documentHash || '',
      certificateUrl: payload.certificateUrl || '',
      metadata: payload,
    },
  });

  if (eventType === SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_COMPLETED && payload.signedPdfUrl) {
    const result = applySignatureCompletion({
      user: { id: 'webhook' },
      contractId: request.contractId,
      signedPdfDataUrl: payload.signedPdfUrl,
      auditPayload: payload,
    });
    const contract = result.contract;
    saveSignedContractToPatientChart({ id: 'webhook' }, contract, payload.signedPdfUrl);
    if (contract?.patientId) notifyClinicalBudgetUpdated(contract.patientId);
  }

  return { processed: true, contractId: request.contractId, status: nextStatus };
}

export function getContractSignatureSummary(contractId) {
  const request = getLatestSignatureRequest(contractId);
  const audits = (loadDb().contractSignatureAudits || []).filter((a) => a.contractId === contractId);
  return { request, audits };
}
