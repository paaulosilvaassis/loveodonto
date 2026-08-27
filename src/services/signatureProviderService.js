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
import { CLINICAL_SIGNER_ROLE, mapLegacySignerRole } from '../contracts/clinicalRequiredSigners.js';
import { logSignatureAudit } from './contractSignatureAuditService.js';
import { getGeneratedContract } from './contractService.js';
import { deliverSignatureInviteEmail } from './signatureInviteEmailService.js';
import { assertFrozenDocumentIntegrityBeforeSignature } from '../contracts/assertFrozenDocumentIntegrityBeforeSignature.js';
import { readPersistedContractVersion } from '../contracts/generatedContractVersion.js';

export const SIGNATURE_DELIVERY_STATE = {
  REQUEST_CREATED: 'REQUEST_CREATED',
  LINK_CREATED: 'LINK_CREATED',
  DELIVERY_REQUESTED: 'DELIVERY_REQUESTED',
  PROVIDER_ACCEPTED: 'PROVIDER_ACCEPTED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  DELIVERED: 'DELIVERED',
  BOUNCED: 'BOUNCED',
  EXPIRED: 'EXPIRED',
};

export const REMOTE_SIGNATURE_METHOD = 'REMOTE_LINK';

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

function isPatientSlotRequest(request) {
  const role = mapLegacySignerRole(request?.signerRole || CLINICAL_SIGNER_ROLE.PATIENT);
  return role === CLINICAL_SIGNER_ROLE.PATIENT;
}

function isReusableRequest(request, now = Date.now()) {
  if (!request || !['pending', 'sent'].includes(String(request.status || ''))) return false;
  if (!isPatientSlotRequest(request)) return false;
  if (!request.expiresAt) return true;
  return new Date(request.expiresAt).getTime() > now;
}

function isLinkExpired(link, now = Date.now()) {
  if (!link?.expiresAt) return false;
  return new Date(link.expiresAt).getTime() <= now;
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

function findReusableSignatureArtifacts(db, contractId, now = Date.now()) {
  const requests = db.contractSignatureRequests || [];
  const reusable = requests
    .filter((row) => row.contractId === contractId && isReusableRequest(row, now))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const request = reusable[0] || null;
  if (!request) return null;
  const link = (db.contractSignLinks || []).find(
    (row) => row.requestId === request.id && row.status === 'pending' && !isLinkExpired(row, now),
  ) || null;
  if (!link?.token) return null;
  return { request, link, signUrl: `/assinatura/${link.token}`, documentHash: request.documentHash, reused: true };
}

function findRotatablePatientArtifacts(db, contractId, now = Date.now()) {
  const requests = (db.contractSignatureRequests || [])
    .filter((row) => row.contractId === contractId && isPatientSlotRequest(row))
    .filter((row) => !['cancelled', 'completed', 'revoked'].includes(String(row.status || '')))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const request = requests[0] || null;
  if (!request) return null;
  const link = (db.contractSignLinks || []).find((row) => row.requestId === request.id) || null;
  const expired = !isReusableRequest(request, now) || isLinkExpired(link, now);
  if (!expired) return null;
  return { request, link };
}

function bindPatientLink(link, contract) {
  return {
    ...link,
    signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
    signerPersonId: contract.patientId || null,
    tenant_id: link.tenant_id || contract.tenant_id || null,
    contractId: contract.id,
  };
}

export function getActivePatientSignatureInvite(contractId) {
  const db = loadDb();
  const reused = findReusableSignatureArtifacts(db, contractId);
  if (!reused) return null;
  return {
    request: reused.request,
    link: reused.link,
    signUrl: reused.signUrl,
    deliveryStatus: reused.request.deliveryStatus || (
      reused.request.status === 'sent' ? SIGNATURE_DELIVERY_STATE.PROVIDER_ACCEPTED : SIGNATURE_DELIVERY_STATE.LINK_CREATED
    ),
  };
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
            signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
            signerPersonId: contract.patientId || requests[idx].signerPersonId || null,
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

      const rotatable = findRotatablePatientArtifacts(db, contract.id);
      if (rotatable?.request) {
        const requests = db.contractSignatureRequests || [];
        const rIdx = requests.findIndex((row) => row.id === rotatable.request.id);
        const links = db.contractSignLinks || [];
        if (rotatable.link) {
          const lIdx = links.findIndex((row) => row.id === rotatable.link.id);
          if (lIdx >= 0 && links[lIdx].status === 'pending') {
            links[lIdx] = { ...links[lIdx], status: 'expired' };
          }
        }
        const rotatedLink = bindPatientLink({
          id: createId('clnk'),
          tenant_id: tenantIdFromUser(user) || contract.tenant_id || null,
          clinicId: clinicId(),
          contractId: contract.id,
          requestId: rotatable.request.id,
          token,
          expiresAt,
          status: 'pending',
          createdBy: user?.id || null,
          createdAt: new Date().toISOString(),
          viewedAt: null,
          signedAt: null,
        }, contract);
        links.push(rotatedLink);
        const nextRequest = {
          ...rotatable.request,
          externalId: token,
          status: 'pending',
          expiresAt,
          signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
          signerPersonId: contract.patientId || null,
          deliveryStatus: SIGNATURE_DELIVERY_STATE.LINK_CREATED,
          sentAt: null,
          recipients: {
            ...(rotatable.request.recipients || {}),
            patientEmail: payload.patientEmail || rotatable.request.recipients?.patientEmail,
            patientPhone: payload.patientPhone || rotatable.request.recipients?.patientPhone,
            patientName: payload.patientName || rotatable.request.recipients?.patientName,
            patientCpf: payload.patientCpf || rotatable.request.recipients?.patientCpf,
          },
        };
        if (rIdx >= 0) requests[rIdx] = nextRequest;
        logSignatureAudit({
          contractId: contract.id,
          requestId: nextRequest.id,
          action: 'challenge_rotated',
          user,
          payload: {
            provider: SIGNATURE_PROVIDERS.INTERNAL,
            documentHash,
            metadata: { reason: 'expired_link' },
          },
        });
        return {
          request: nextRequest,
          link: rotatedLink,
          signUrl: `/assinatura/${token}`,
          documentHash: nextRequest.documentHash || documentHash,
          reused: true,
          rotated: true,
        };
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
        signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
        signerPersonId: contract.patientId || null,
        deliveryStatus: SIGNATURE_DELIVERY_STATE.REQUEST_CREATED,
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
      const link = bindPatientLink({
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
      }, contract);
      db.contractSignLinks.push(link);
      request.deliveryStatus = SIGNATURE_DELIVERY_STATE.LINK_CREATED;

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
    withDb((db) => {
      const requests = db.contractSignatureRequests || [];
      const idx = requests.findIndex((r) => r.id === request.id);
      if (idx >= 0) {
        requests[idx] = {
          ...requests[idx],
          deliveryStatus: SIGNATURE_DELIVERY_STATE.DELIVERY_REQUESTED,
        };
      }
      return db;
    });

    let delivery;
    try {
      delivery = await deliverSignatureInviteEmail({
        to: recipient,
        patientName: request.recipients?.patientName,
        treatmentName: emailContent?.treatmentName,
        clinicName: emailContent?.clinicName,
        clinicIdentity: emailContent?.clinicIdentity,
        signUrl,
        expiresAt: request.expiresAt,
        contractNumber: request.contractNumber || emailContent?.contractNumber,
        requestId: request.id,
      });
    } catch (err) {
      withDb((db) => {
        const requests = db.contractSignatureRequests || [];
        const idx = requests.findIndex((r) => r.id === request.id);
        if (idx >= 0) {
          requests[idx] = {
            ...requests[idx],
            deliveryStatus: SIGNATURE_DELIVERY_STATE.DELIVERY_FAILED,
          };
        }
        return db;
      });
      throw err;
    }

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
          acceptedByTransport: delivery.acceptedByTransport === true,
          delivered: false,
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
          deliveryStatus: SIGNATURE_DELIVERY_STATE.PROVIDER_ACCEPTED,
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
      return {
        delivered: false,
        acceptedByTransport: delivery.acceptedByTransport !== false && delivery.simulated !== true,
        ok: true,
        simulated: false,
        provider: delivery.provider,
        messageId: delivery.messageId,
        signUrl,
        deliveryStatus: SIGNATURE_DELIVERY_STATE.PROVIDER_ACCEPTED,
      };
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

function persistPatientRemoteRequestBindings({ requestId, contract, frozen, reused }) {
  if (!requestId || !frozen) return;
  withDb((db) => {
    const requests = db.contractSignatureRequests || [];
    const idx = requests.findIndex((row) => row.id === requestId);
    if (idx < 0) return db;
    const row = requests[idx];
    const role = mapLegacySignerRole(row.signerRole || CLINICAL_SIGNER_ROLE.PATIENT);
    if (role !== CLINICAL_SIGNER_ROLE.PATIENT) {
      const err = new Error('Solicitação remota não pode ser criada para papel PROFESSIONAL.');
      err.code = 'REMOTE_REQUEST_ROLE_NOT_PATIENT';
      throw err;
    }
    const bindings = {
      signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
      signerPersonId: contract.patientId || row.signerPersonId || null,
      tenant_id: row.tenant_id || contract.tenant_id || null,
      packageManifestId: frozen.manifestId,
      packageManifestHash: frozen.manifestHash,
      contractVersion: frozen.contractVersion,
    };
    if (reused) {
      if (row.packageManifestId && row.packageManifestId !== bindings.packageManifestId) {
        const err = new Error('Manifest informado não corresponde ao pacote congelado.');
        err.code = 'FROZEN_MANIFEST_ID_MISMATCH';
        throw err;
      }
      if (row.packageManifestHash && row.packageManifestHash !== bindings.packageManifestHash) {
        const err = new Error('Hash do manifesto congelado não confere.');
        err.code = 'FROZEN_MANIFEST_HASH_MISMATCH';
        throw err;
      }
      if (row.contractVersion != null && Number(row.contractVersion) !== Number(bindings.contractVersion)) {
        const err = new Error('Versão documental do manifesto não corresponde à versão persistida do contrato.');
        err.code = 'FROZEN_DOCUMENT_VERSION_MISMATCH';
        throw err;
      }
      return db;
    }
    requests[idx] = { ...row, ...bindings };
    return db;
  });
}

export async function createSignatureRequest({ user, contract, formData, settings }) {
  if (!contract?.id) throw new Error('Contrato ausente.');
  if (contract.status === CONTRACT_STATUS.DRAFT) {
    throw new Error('Não é possível assinar contrato em rascunho. Finalize o contrato primeiro.');
  }
  let frozenIntegrity = null;
  if (contract.quoteSource === 'clinical_budget') {
    const md = contract.metadata || {};
    if (!md.packageManifestId && !md.packageManifestHash && !md.frozenAt) {
      throw new Error('Manifest ainda não congelado. Prepare o pacote de assinatura primeiro.');
    }
    if (readPersistedContractVersion(contract) != null) {
      frozenIntegrity = await assertFrozenDocumentIntegrityBeforeSignature({ contract });
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
  persistPatientRemoteRequestBindings({
    requestId: result.request?.id,
    contract,
    frozen: frozenIntegrity,
    reused: Boolean(result.reused),
  });
  if (frozenIntegrity && result.request) {
    result.request = {
      ...result.request,
      signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
      signerPersonId: contract.patientId || result.request.signerPersonId || null,
      packageManifestId: frozenIntegrity.manifestId,
      packageManifestHash: frozenIntegrity.manifestHash,
      contractVersion: frozenIntegrity.contractVersion,
    };
  }

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
