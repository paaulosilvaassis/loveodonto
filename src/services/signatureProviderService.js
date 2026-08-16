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
import { deliverSignatureInviteEmail } from './signatureInviteEmailService.js';

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

function isReusableRequest(request, now = Date.now()) {
  if (!request || !['pending', 'sent'].includes(String(request.status || ''))) return false;
  if (!request.expiresAt) return true;
  return new Date(request.expiresAt).getTime() > now;
}

function preserveContractStatusAfterInvite(currentStatus) {
  const keep = new Set([
    CONTRACT_STATUS.SIGNED_BY_CLINIC,
    CONTRACT_STATUS.SIGNED_BY_PATIENT,
    CONTRACT_STATUS.SIGNED,
    CONTRACT_STATUS.COMPLETED,
  ]);
  if (keep.has(currentStatus)) return currentStatus;
  return CONTRACT_STATUS.SENT;
}

function findReusableSignatureArtifacts(db, contractId) {
  const requests = db.contractSignatureRequests || [];
  const reusable = requests
    .filter((row) => row.contractId === contractId && isReusableRequest(row))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const request = reusable[0] || null;
  if (!request) return null;
  const link = (db.contractSignLinks || []).find(
    (row) => row.requestId === request.id && row.status === 'pending',
  ) || null;
  if (!link?.token) return null;
  return { request, link, signUrl: `/assinatura/${link.token}`, documentHash: request.documentHash, reused: true };
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

    const created = withDb((db) => {
      const reused = findReusableSignatureArtifacts(db, contract.id);
      if (reused) {
        const requests = db.contractSignatureRequests || [];
        const idx = requests.findIndex((row) => row.id === reused.request.id);
        if (idx >= 0) {
          requests[idx] = {
            ...requests[idx],
            recipients: {
              ...(requests[idx].recipients || {}),
              patientEmail: payload.patientEmail || requests[idx].recipients?.patientEmail,
              patientPhone: payload.patientPhone || requests[idx].recipients?.patientPhone,
              patientName: payload.patientName || requests[idx].recipients?.patientName,
              patientCpf: payload.patientCpf || requests[idx].recipients?.patientCpf,
            },
          };
          reused.request = requests[idx];
        }
        return reused;
      }

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
          signatureRequestId: request.id,
          documentHash,
          lockedAt: arr[idx].lockedAt || new Date().toISOString(),
        };
      }

      return { request, link, signUrl: `/assinatura/${token}`, documentHash, reused: false };
    });

    // OPTION_C freeze — somente STAGING_TEST_MODE (bridge oficial, sem segundo motor).
    try {
      const { isStagingTestModeEnabled } = await import('../domain/contracts/staging/staging-browser-test-mode.ts');
      if (isStagingTestModeEnabled()) {
        const { freezeStagingClinicalPackageOnSend } = await import(
          '../domain/contracts/staging/stagingClinicalPackageManifestBridge.js'
        );
        created.packageFreeze = await freezeStagingClinicalPackageOnSend({
          user,
          contract,
          request: created.request,
          link: created.link,
        });
      }
    } catch (err) {
      created.packageFreeze = { ok: false, error: String(err?.message || err).slice(0, 200) };
    }
    return created;
  },

  async sendSignatureEmail({ user, request, signUrl, emailContent }) {
    const recipient = request.recipients?.patientEmail;
    const delivery = await deliverSignatureInviteEmail({
      to: recipient,
      patientName: request.recipients?.patientName,
      treatmentName: emailContent?.treatmentName,
      clinicName: emailContent?.clinicName,
      signUrl,
      expiresAt: request.expiresAt,
      contractNumber: request.contractNumber,
      requestId: request.id,
    });

    logSignatureAudit({
      contractId: request.contractId,
      requestId: request.id,
      action: 'email_sent',
      user,
      payload: {
        provider: delivery.provider || SIGNATURE_PROVIDERS.INTERNAL,
        recipientEmail: recipient,
        documentHash: request.documentHash,
        metadata: {
          subject: emailContent?.subject,
          to: recipient,
          messageId: delivery.messageId || null,
          simulated: false,
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
          lastEmailSubject: emailContent?.subject,
          lastEmailProvider: delivery.provider || null,
          lastEmailMessageId: delivery.messageId || null,
        };
      }
      const arr = db.generatedContracts || [];
      const cIdx = arr.findIndex((c) => c.id === request.contractId);
      if (cIdx >= 0) {
        arr[cIdx] = {
          ...arr[cIdx],
          status: preserveContractStatusAfterInvite(arr[cIdx].status),
        };
      }
      return { delivered: true, ok: true, simulated: false, provider: delivery.provider, messageId: delivery.messageId, signUrl };
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
  if (!contract?.id) throw new Error('Contrato ausente.');
  if (contract.status === CONTRACT_STATUS.DRAFT) {
    throw new Error('Não é possível assinar contrato em rascunho. Finalize o contrato primeiro.');
  }
  if (contract.quoteSource === 'clinical_budget') {
    const md = contract.metadata || {};
    if (!md.packageManifestId && !md.packageManifestHash && !md.frozenAt) {
      throw new Error('Manifest ainda não congelado. Prepare o pacote de assinatura primeiro.');
    }
  }
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
