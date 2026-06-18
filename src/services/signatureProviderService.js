/**
 * Camada única de integração com plataformas de assinatura eletrônica.
 * Provedores externos (Clicksign, DocuSign, etc.) são adaptadores preparados para API real.
 */
import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import {
  SIGNATURE_PROVIDERS,
  CONTRACT_STATUS,
  SIGNATURE_WEBHOOK_EVENTS,
} from '../contracts/contractConstants.js';
import { buildSignatureEmailContent } from './signatureEmailService.js';
import { logSignatureAudit } from './contractSignatureAuditService.js';
import { getGeneratedContract } from './contractService.js';

function simpleHash(text) {
  let h = 5381;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return `h${(h >>> 0).toString(16)}`;
}

function clinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

function tenantIdFromUser(user) {
  return user?.tenantId || user?.tenant_id || null;
}

function notImplemented(provider) {
  const error = new Error(
    `Provedor "${provider}" ainda não configurado. Configure as credenciais em Administrativo > Contratos.`,
  );
  error.code = 'SIGNATURE_PROVIDER_NOT_CONFIGURED';
  throw error;
}

/** Adaptador interno — link seguro Love Odonto + registro de auditoria. */
const internalProvider = {
  id: SIGNATURE_PROVIDERS.INTERNAL,

  async createSignatureRequest({ user, contract, payload, settings }) {
    const days = Number(payload.linkExpiryDays || settings.signLinkExpiryDays || 7);
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    const token = createId('csgn');
    const documentHash = simpleHash(contract.renderedHtml || contract.finalContent);

    return withDb((db) => {
      const request = {
        id: createId('csreq'),
        tenant_id: tenantIdFromUser(user),
        clinicId: clinicId(),
        contractId: contract.id,
        provider: SIGNATURE_PROVIDERS.INTERNAL,
        externalId: token,
        status: 'pending',
        signatureType: payload.signatureType,
        documentHash,
        contractNumber: contract.contractNumber,
        budgetId: contract.budgetId || null,
        quoteId: contract.quoteId || null,
        recipients: {
          patientEmail: payload.patientEmail,
          patientPhone: payload.patientPhone,
          patientName: payload.patientName,
          patientCpf: payload.patientCpf,
          guardianEmail: payload.guardianEmail || '',
          technicalEmail: payload.technicalEmail || '',
          clinicEmail: payload.clinicEmail || '',
        },
        authRequirements: payload.authRequirements || {},
        expiresAt,
        createdBy: user?.id || null,
        createdAt: new Date().toISOString(),
        sentAt: null,
        completedAt: null,
        signedPdfUrl: null,
        certificateUrl: null,
      };

      if (!Array.isArray(db.contractSignatureRequests)) db.contractSignatureRequests = [];
      db.contractSignatureRequests.push(request);

      if (!Array.isArray(db.contractSignLinks)) db.contractSignLinks = [];
      const link = {
        id: createId('clnk'),
        tenant_id: tenantIdFromUser(user),
        clinicId: clinicId(),
        contractId: contract.id,
        requestId: request.id,
        token,
        expiresAt,
        status: 'pending',
        createdBy: user?.id || null,
        createdAt: new Date().toISOString(),
        viewedAt: null,
        signedAt: null,
      };
      db.contractSignLinks.push(link);

      const arr = db.generatedContracts || [];
      const idx = arr.findIndex((c) => c.id === contract.id);
      if (idx >= 0) {
        arr[idx] = {
          ...arr[idx],
          status: CONTRACT_STATUS.SENT,
          signatureRequestId: request.id,
          documentHash,
          lockedAt: arr[idx].lockedAt || new Date().toISOString(),
        };
      }

      return { request, link, signUrl: `/assinatura/${token}`, documentHash };
    });
  },

  async sendSignatureEmail({ user, request, signUrl, emailContent }) {
    logSignatureAudit({
      contractId: request.contractId,
      requestId: request.id,
      action: 'email_sent',
      user,
      payload: {
        provider: SIGNATURE_PROVIDERS.INTERNAL,
        recipientEmail: request.recipients?.patientEmail,
        documentHash: request.documentHash,
        metadata: {
          subject: emailContent.subject,
          to: request.recipients?.patientEmail,
          cc: [request.recipients?.guardianEmail, request.recipients?.clinicEmail]
            .filter(Boolean),
        },
      },
    });

    return withDb((db) => {
      const requests = db.contractSignatureRequests || [];
      const idx = requests.findIndex((r) => r.id === request.id);
      if (idx >= 0) {
        requests[idx] = {
          ...requests[idx],
          status: 'sent',
          sentAt: new Date().toISOString(),
          lastEmailSubject: emailContent.subject,
        };
      }
      return { delivered: true, simulated: true, signUrl };
    });
  },

  async getSignatureStatus({ requestId, externalId }) {
    const db = loadDb();
    const request = (db.contractSignatureRequests || []).find(
      (r) => r.id === requestId || r.externalId === externalId,
    );
    if (!request) return { status: 'not_found' };

    const contract = getGeneratedContract(request.contractId);
    const link = (db.contractSignLinks || []).find((l) => l.requestId === request.id);

    if (link?.expiresAt && new Date(link.expiresAt) < new Date() && link.status === 'pending') {
      return { status: 'expired', request, contract };
    }

    return {
      status: contract?.status || request.status,
      request,
      contract,
      link,
    };
  },

  async downloadSignedDocument({ requestId }) {
    const db = loadDb();
    const request = (db.contractSignatureRequests || []).find((r) => r.id === requestId);
    if (!request?.signedPdfUrl) {
      const att = (db.contractAttachments || []).find((a) => a.contractId === request?.contractId);
      return att ? { fileUrl: att.fileUrl, fileName: att.fileName } : null;
    }
    return { fileUrl: request.signedPdfUrl, fileName: `contrato-assinado-${request.contractNumber}.pdf` };
  },

  async cancelSignatureRequest({ user, requestId, reason }) {
    return withDb((db) => {
      const requests = db.contractSignatureRequests || [];
      const idx = requests.findIndex((r) => r.id === requestId);
      if (idx < 0) throw new Error('Solicitação de assinatura não encontrada.');

      requests[idx] = {
        ...requests[idx],
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelReason: reason || '',
        cancelledBy: user?.id || null,
      };

      const links = db.contractSignLinks || [];
      for (let i = 0; i < links.length; i += 1) {
        if (links[i].requestId === requestId && links[i].status === 'pending') {
          links[i] = { ...links[i], status: 'cancelled' };
        }
      }

      logSignatureAudit({
        contractId: requests[idx].contractId,
        requestId,
        action: 'request_cancelled',
        user,
        payload: { reason, provider: SIGNATURE_PROVIDERS.INTERNAL },
      });

      return requests[idx];
    });
  },
};

/** Stubs para provedores externos — prontos para credenciais e API. */
function createExternalStub(providerId) {
  return {
    id: providerId,
    createSignatureRequest: () => notImplemented(providerId),
    sendSignatureEmail: () => notImplemented(providerId),
    getSignatureStatus: () => notImplemented(providerId),
    downloadSignedDocument: () => notImplemented(providerId),
    cancelSignatureRequest: () => notImplemented(providerId),
  };
}

const PROVIDERS = {
  [SIGNATURE_PROVIDERS.INTERNAL]: internalProvider,
  [SIGNATURE_PROVIDERS.CLICKSIGN]: createExternalStub(SIGNATURE_PROVIDERS.CLICKSIGN),
  [SIGNATURE_PROVIDERS.DOCUSIGN]: createExternalStub(SIGNATURE_PROVIDERS.DOCUSIGN),
  [SIGNATURE_PROVIDERS.ZAPSIGN]: createExternalStub(SIGNATURE_PROVIDERS.ZAPSIGN),
  [SIGNATURE_PROVIDERS.D4SIGN]: createExternalStub(SIGNATURE_PROVIDERS.D4SIGN),
  [SIGNATURE_PROVIDERS.ICP_BRASIL]: createExternalStub(SIGNATURE_PROVIDERS.ICP_BRASIL),
};

export function getSignatureProvider(providerId) {
  const provider = PROVIDERS[providerId] || PROVIDERS[SIGNATURE_PROVIDERS.INTERNAL];
  return provider;
}

export function buildSignaturePayload({
  contract,
  patient,
  professional,
  clinic,
  formData,
  settings,
}) {
  const db = loadDb();
  const documentContent = contract.renderedHtml || contract.finalContent || '';
  const documentHash = simpleHash(documentContent);

  return {
    pdfContent: documentContent,
    documentHash,
    contractNumber: contract.contractNumber,
    budgetId: contract.budgetId,
    quoteId: contract.quoteId,
    patientName: formData.patientName,
    patientCpf: formData.patientCpf,
    patientEmail: formData.patientEmail,
    patientPhone: formData.patientPhone,
    guardianEmail: formData.guardianEmail,
    technicalEmail: formData.technicalEmail,
    clinicEmail: formData.clinicEmail,
    professionalName: professional?.nomeCompleto || professional?.name || '',
    professionalCro: professional?.conselhoNumero || professional?.cro || '',
    clinicName: clinic?.nomeFantasia || clinic?.razaoSocial || '',
    clinicCnpj: db.clinicDocumentation?.cnpj || '',
    signatureType: formData.signatureType || settings.defaultSignatureType,
    linkExpiryDays: formData.linkExpiryDays,
    authRequirements: {
      requireCpf: settings.requireCpfForSignature,
      requireEmail: settings.requireEmailForSignature,
      requireSmsToken: settings.requireSmsToken,
      requireSelfie: settings.requireSelfie,
      requireIcpCertificate: settings.requireIcpCertificate,
    },
  };
}

export async function createSignatureRequest({ user, contract, formData, settings }) {
  const provider = getSignatureProvider(settings.signatureProvider);
  const db = loadDb();
  const patientBundle = contract.patientId ? { patientId: contract.patientId } : {};
  const payload = buildSignaturePayload({
    contract,
    patient: patientBundle,
    professional: formData.professional,
    clinic: db.clinicProfile,
    formData,
    settings,
  });

  const result = await provider.createSignatureRequest({ user, contract, payload, settings });

  logSignatureAudit({
    contractId: contract.id,
    requestId: result.request?.id,
    action: 'request_created',
    user,
    payload: {
      provider: provider.id,
      documentHash: result.documentHash,
      externalId: result.request?.externalId,
      authMethod: payload.signatureType,
    },
  });

  return result;
}

export async function sendSignatureEmail({ user, request, signUrl, emailContent }) {
  const provider = getSignatureProvider(request.provider);
  return provider.sendSignatureEmail({ user, request, signUrl, emailContent });
}

export async function getSignatureStatus({ requestId, externalId, providerId }) {
  const provider = getSignatureProvider(providerId);
  return provider.getSignatureStatus({ requestId, externalId });
}

export async function downloadSignedDocument({ requestId, providerId }) {
  const provider = getSignatureProvider(providerId);
  return provider.downloadSignedDocument({ requestId });
}

export async function cancelSignatureRequest({ user, requestId, providerId, reason }) {
  const provider = getSignatureProvider(providerId);
  return provider.cancelSignatureRequest({ user, requestId, reason });
}

export function mapWebhookEventToContractStatus(eventType) {
  switch (eventType) {
    case SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_SENT:
      return CONTRACT_STATUS.SENT;
    case SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_VIEWED:
      return CONTRACT_STATUS.VIEWED;
    case SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_SIGNED:
      return CONTRACT_STATUS.SIGNED_BY_PATIENT;
    case SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_COMPLETED:
      return CONTRACT_STATUS.COMPLETED;
    case SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_EXPIRED:
      return CONTRACT_STATUS.EXPIRED;
    case SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_REFUSED:
      return CONTRACT_STATUS.REFUSED;
    case SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_CANCELLED:
      return CONTRACT_STATUS.CANCELED;
    default:
      return null;
  }
}
