import { withDb, loadDb } from '../db/index.js';
import { logSignatureAudit } from './contractSignatureAuditService.js';
import { notifyClinicalBudgetUpdated } from './clinicalBudgetApprovedService.js';
import { addFile } from './patientFilesService.js';
import { createId } from './helpers.js';
import { getPatient } from './patientService.js';
import { assertLegalPatientIdentityConsistency } from './patientIdentityIntegrity.js';
import { buildContractContext } from './contractRenderService.js';
import { seedDefaultContractsForDb } from '../contracts/defaultContractSeed.js';
import { seedTreatmentContractTemplates } from '../contracts/treatmentContractSeed.js';
import { mergeContractAttachedTcleIds } from './clinicalTcleAttachmentService.js';
import {
  CONTRACT_STATUS,
  DEFAULT_CONTRACT_SETTINGS,
  SIGNATURE_PROVIDERS,
  SIGNATURE_TYPES,
  SIGNER_ROLES,
} from '../contracts/contractConstants.js';
import { matchesContractViewIdentity } from '../contracts/contractViewIdentity.js';
import { resolveContractForSelectedBudget } from '../contracts/resolveContractForSelectedBudget.js';
import {
  evaluateSignatureCeremony,
  assertSignerAllowed,
  nextContractStatusAfterStroke,
  buildCeremonySnapshot,
  isLegacyClinicalSignature,
  CEREMONY_STATUS,
} from '../contracts/clinicalSignatureCeremony.js';
import { mapLegacySignerRole, CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { resolveClinicalProfessionalIdentity } from '../contracts/clinicalProfessionalIdentity.js';
import {
  assertAuthenticatedSignerForStroke,
} from '../contracts/authenticatedSignerIdentity.js';
import {
  AUTH_METHOD,
  SIGNATURE_METHOD,
  SIGNING_CHANNEL,
  assertRequiredConsentsAccepted,
  buildConsentAcceptances,
  collectPresentedConsents,
  computeEvidenceHash,
  isLikelyHumanDocumentView,
  namesDiverge,
} from '../contracts/remoteSignatureEvidence.js';
import { resolveEvidenceClientIp } from '../contracts/signingClientIp.js';
import { requirePersistedContractVersion } from '../contracts/generatedContractVersion.js';
import { assertFrozenDocumentIntegrityBeforeSignature } from '../contracts/assertFrozenDocumentIntegrityBeforeSignature.js';
import { assertRemoteSignatureBinding } from '../contracts/remoteSignatureBinding.js';
import {
  assertContractSignable,
  assertInPlaceReissueBlocked,
  isContractSignable,
} from '../contracts/contractLifecycleGuard.js';
import {
  LIFECYCLE_ACTIONS,
  assertContractStatusMutation,
  assertSignLinkSignable,
  assertSignatureRequestSignable,
  isAccessExpired,
  isTerminalContractState,
  normalizeContractLifecycleStatus,
  normalizeLinkLifecycleStatus,
} from '../contracts/lifecycle/index.js';
import { persistClockExpiredAccess, persistExpiredSigningAccess } from '../contracts/lifecycle/accessExpiry.js';
import { maybeGenerateFinalSignedArtifact } from './finalSignedContractArtifactService.js';
import {
  createGeneratedContractDraft,
  updateDraftGeneratedContract,
  finalizeGeneratedContract,
  cancelGeneratedContract,
  listGeneratedContracts,
  getGeneratedContract,
  listContractTemplates,
  getContractTemplate,
  listContractAuditLogs,
} from './contractService.js';

export {
  listContractTemplates,
  getContractTemplate,
  listContractAuditLogs,
  cancelGeneratedContract,
  updateDraftGeneratedContract,
  finalizeGeneratedContract,
} from './contractService.js';

function clinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

function tenantIdFromUser(user) {
  return user?.tenantId || user?.tenant_id || null;
}

function simpleHash(text) {
  let h = 5381;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return `h${(h >>> 0).toString(16)}`;
}

export function ensureContractsModuleSeeded() {
  withDb((db) => {
    seedDefaultContractsForDb(db);
    seedTreatmentContractTemplates(db, db.clinicProfile?.id || 'clinic-1');
    return db;
  });
}

export function normalizeContract(row) {
  if (!row) return null;
  return {
    ...row,
    status: row.status || CONTRACT_STATUS.DRAFT,
    category: row.category || 'servicos',
  };
}

function matchesBudgetFinanceRow(row, budgetId, appointmentId) {
  if (!row) return false;
  const budgetKey = budgetId ? String(budgetId) : '';
  if (budgetKey) {
    if (String(row.origin_id || '') === budgetKey) return true;
    if (String(row.budget_id || row.budgetId || '') === budgetKey) return true;
    if (String(row.treatment_plan_id || '') === budgetKey) return true;
    return false;
  }
  return appointmentId ? String(row.origin_id || '') === String(appointmentId) : true;
}

function listFinanceRowsForBudget(db, { patientId, budgetId, appointmentId }) {
  const financings = (db.financings || []).filter(
    (row) => row.patient_id === patientId
      && budgetId
      && String(row.budget_id || row.budgetId || '') === String(budgetId),
  );
  const financingIds = new Set(financings.map((row) => row.id));

  const receivables = (db.accountsReceivable || []).filter((row) => {
    if (row.patient_id !== patientId) return false;
    if (matchesBudgetFinanceRow(row, budgetId, appointmentId)) return true;
    if (row.financing_id && financingIds.has(row.financing_id)) return true;
    return false;
  });

  return { receivables, financings };
}

function buildSnapshots({ quoteSource, quoteId, patientId, currentUser, budgetId = null }) {
  const db = loadDb();
  const ctx = buildContractContext({ quoteSource, quoteId, patientId, currentUser });
  const patientBundle = getPatient(patientId);
  const clinic = db.clinicProfile || {};
  const doc = db.clinicDocumentation || {};
  const { receivables, financings } = listFinanceRowsForBudget(db, {
    patientId,
    budgetId,
    appointmentId: quoteId,
  });
  const clinicalIdentity = resolveClinicalProfessionalIdentity({
    appointmentId: quoteId,
    tenantId: currentUser?.tenantId || currentUser?.tenant_id || clinic.tenant_id,
  });
  const clinicalProfessional = clinicalIdentity.clinicalProfessional;
  return {
    patientSnapshotJson: {
      id: patientId,
      full_name: patientBundle?.profile?.full_name,
      cpf: patientBundle?.profile?.cpf,
      birth_date: patientBundle?.profile?.birth_date,
    },
    clinicSnapshotJson: {
      razaoSocial: clinic.razaoSocial || clinic.nomeFantasia,
      cnpj: doc.cnpj,
      endereco: db.clinicAddresses?.[0] || null,
    },
    professionalSnapshotJson: {
      name: clinicalProfessional?.displayName || '',
      cro: clinicalProfessional?.registrationDisplay || clinicalProfessional?.registration || '',
      conselhoUf: clinicalProfessional?.councilUf || '',
      collaboratorId: clinicalProfessional?.collaboratorId || null,
      userId: null,
    },
    clinicalSnapshotJson: {
      procedimentos: ctx['#procedimentos'],
      procedures: ctx.__meta?.procedureRows || [],
      planName: ctx.__meta?.planName || '',
      dentes: ctx['#dentes'],
      observacoes: ctx['#orcamentoObservacoes'],
    },
    financialSnapshotJson: {
      budgetId: budgetId || null,
      valorTotal: ctx['#valor_total'],
      entrada: ctx['#entrada'],
      formaPagamento: ctx['#forma_pagamento'],
      financiamentos: financings.map((f) => ({
        id: f.id,
        budget_id: f.budget_id || f.budgetId || null,
        entry_amount: f.entry_amount,
        installments_count: f.installments_count,
        interest_rate: f.interest_rate,
        total_value: f.total_value || f.totalValue,
        status: f.status,
      })),
      parcelas: receivables.map((r) => ({
        due_date: r.due_date,
        description: r.description,
        net_amount: r.net_amount,
        original_amount: r.original_amount,
        installment_number: r.installment_number,
        total_installments: r.total_installments,
        financing_id: r.financing_id || null,
        status: r.status,
      })),
    },
    totalValueSnapshot: Number(ctx['#valor_total'] || 0),
  };
}

export function registerContractEvent(user, contractId, eventType, description, metadata = {}) {
  registerEvent(user, contractId, eventType, description, metadata);
}

function registerEvent(user, contractId, eventType, description, metadata = {}) {
  withDb((db) => {
    if (!Array.isArray(db.contractEvents)) db.contractEvents = [];
    db.contractEvents.push({
      id: createId('cevt'),
      tenant_id: tenantIdFromUser(user),
      clinicId: clinicId(),
      contractId,
      eventType,
      description,
      userId: user?.id || null,
      metadataJson: metadata,
      createdAt: new Date().toISOString(),
    });
    return db;
  });
}

export function getContractSettings(user) {
  ensureContractsModuleSeeded();
  const cid = clinicId();
  const tid = tenantIdFromUser(user);
  const db = loadDb();
  const row = (db.contractSettings || []).find(
    (s) => s.clinicId === cid && (s.tenant_id === tid || !s.tenant_id),
  );
  return { ...DEFAULT_CONTRACT_SETTINGS, ...row?.settings };
}

export function saveContractSettings(user, settings) {
  const cid = clinicId();
  const tid = tenantIdFromUser(user);
  return withDb((db) => {
    if (!Array.isArray(db.contractSettings)) db.contractSettings = [];
    const idx = db.contractSettings.findIndex(
      (s) => s.clinicId === cid && (s.tenant_id === tid || !s.tenant_id),
    );
    const now = new Date().toISOString();
    const payload = {
      clinicId: cid,
      tenant_id: tid,
      settings: { ...DEFAULT_CONTRACT_SETTINGS, ...settings },
      updatedAt: now,
      updatedBy: user?.id || null,
    };
    if (idx >= 0) {
      db.contractSettings[idx] = { ...db.contractSettings[idx], ...payload };
      return db.contractSettings[idx];
    }
    const row = { id: createId('cset'), createdAt: now, ...payload };
    db.contractSettings.push(row);
    return row;
  });
}

export function createContractDraft(user, payload) {
  if (payload.quoteSource === 'clinical_budget' && !payload.budgetId) {
    if (import.meta.env?.DEV) {
      console.debug('[contractModuleService] createContractDraft chamado sem budgetId — vínculo pode ser órfão.');
    }
  }
  if (payload.quoteSource === 'clinical_budget' && payload.allowDuplicate !== true) {
    const existing = getContractStatusForQuote(
      payload.quoteId,
      payload.quoteSource,
      payload.budgetId || null,
      payload.patientId || null,
    );
    if (existing && ![CONTRACT_STATUS.CANCELED, CONTRACT_STATUS.REPLACED, CONTRACT_STATUS.REFUSED].includes(existing.status)) {
      // ONE_BUDGET → MAX_ONE_ACTIVE_GENERATED_CONTRACT: retry/duplo clique reutiliza o canônico.
      return getGeneratedContract(existing.id) || existing;
    }
  }
  ensureContractsModuleSeeded();
  const snaps = buildSnapshots({
    quoteSource: payload.quoteSource,
    quoteId: payload.quoteId,
    patientId: payload.patientId,
    currentUser: user,
    budgetId: payload.budgetId || null,
  });
  assertLegalPatientIdentityConsistency({
    patientId: payload.patientId,
    liveFullName: getPatient(payload.patientId)?.profile?.full_name,
    snapshotFullName: snaps.patientSnapshotJson?.full_name,
    requireLiveAndSnapshot: true,
  });
  const row = createGeneratedContractDraft(user, payload);
  const tpl = getContractTemplate(payload.templateId);
  const attachedTcleIds = mergeContractAttachedTcleIds(
    { metadata: {} },
    { patientId: payload.patientId, appointmentId: payload.quoteId },
  );
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === row.id);
    if (idx < 0) {
      throw new Error(
        `CONTRACT_PERSISTENCE: draft ${row.id} ausente após createGeneratedContractDraft (cache inconsistente).`,
      );
    }
    arr[idx] = {
      ...arr[idx],
      tenant_id: tenantIdFromUser(user),
      title: payload.title || (payload.skipHashtagValidation ? 'Contrato profissional odontológico' : null) || tpl?.name || 'Contrato',
      category: tpl?.category || 'servicos',
      treatmentType: tpl?.treatmentType || null,
      ...snaps,
      metadata: {
        ...(arr[idx].metadata || {}),
        attachedTcleIds,
      },
      documentHash: simpleHash(arr[idx].renderedHtml || arr[idx].finalContent),
    };
    registerEvent(user, row.id, 'CREATED', 'Contrato criado em rascunho', {
      templateId: payload.templateId,
      budgetId: payload.budgetId || null,
      attachedTcleIds,
    });
    return arr[idx];
  });
}

export function isContractEditable(contract) {
  const c = normalizeContract(contract);
  if (!c) return false;
  return [CONTRACT_STATUS.DRAFT, CONTRACT_STATUS.GENERATED].includes(c.status);
}

export function listPatientContracts(patientId, filters = {}) {
  return listGeneratedContracts({ patientId, ...filters }).map(normalizeContract);
}

export function listContractsByStatus(statuses) {
  const cid = clinicId();
  const db = loadDb();
  const set = new Set(statuses);
  return (db.generatedContracts || [])
    .filter((c) => c.clinicId === cid && set.has(c.status))
    .map(normalizeContract)
    .sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0));
}

export function getContractDetails(contractId, expectedIdentity) {
  if (!contractId) return null;
  const contract = normalizeContract(getGeneratedContract(contractId));
  if (!contract) return null;
  const cid = clinicId();
  if (contract.clinicId && String(contract.clinicId) !== String(cid)) return null;
  const identity = expectedIdentity?.contractId ? expectedIdentity : { contractId };
  if (!matchesContractViewIdentity(contract, identity)) return null;
  const db = loadDb();
  const signatures = (db.contractSignatures || []).filter((s) => s.contractId === contractId);
  const events = (db.contractEvents || [])
    .filter((e) => e.contractId === contractId && e.clinicId === cid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const attachments = (db.contractAttachments || []).filter((a) => a.contractId === contractId);
  const signLinks = (db.contractSignLinks || []).filter((l) => l.contractId === contractId);
  return { contract, signatures, events, attachments, signLinks };
}

function isReusablePatientRequest(request, now) {
  if (!request?.id) return false;
  const status = String(request.status || '');
  if (!['pending', 'sent'].includes(status)) return false;
  const role = mapLegacySignerRole(request.signerRole || CLINICAL_SIGNER_ROLE.PATIENT);
  if (role !== CLINICAL_SIGNER_ROLE.PATIENT) return false;
  if (!request.expiresAt) return true;
  return new Date(request.expiresAt).getTime() > now;
}

function findReusableBoundSignAccess(db, contractId, now = Date.now()) {
  const request = (db.contractSignatureRequests || [])
    .filter((row) => row.contractId === contractId && isReusablePatientRequest(row, now))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  if (!request) return null;
  const link = (db.contractSignLinks || []).find((row) => (
    row.requestId === request.id
    && row.status === 'pending'
    && row.token
    && !isAccessExpired(row.expiresAt, now)
  )) || null;
  if (!link?.requestId) return null;
  return { request, link };
}

function createBoundPatientSignAccess(db, { user, contract, token, expiresAt }) {
  const requestId = createId('csreq');
  if (!requestId) throw new Error('requestId obrigatório para novo link de assinatura.');
  const tenantId = tenantIdFromUser(user) || contract.tenant_id || contract.tenantId || null;
  const actedAt = new Date().toISOString();
  const request = {
    id: requestId,
    tenant_id: tenantId,
    clinicId: clinicId(),
    contractId: contract.id,
    provider: SIGNATURE_PROVIDERS.INTERNAL,
    externalId: token,
    status: 'pending',
    signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
    signerPersonId: contract.patientId || null,
    expiresAt,
    createdBy: user?.id || null,
    createdAt: actedAt,
    sentAt: null,
    completedAt: null,
  };
  const link = {
    id: createId('clnk'),
    tenant_id: tenantId,
    clinicId: request.clinicId,
    contractId: contract.id,
    requestId,
    token,
    expiresAt,
    status: 'pending',
    signerRole: CLINICAL_SIGNER_ROLE.PATIENT,
    signerPersonId: contract.patientId || null,
    createdBy: user?.id || null,
    createdAt: actedAt,
    viewedAt: null,
    signedAt: null,
  };
  if (!link.requestId) {
    throw new Error('NEW_LINK_WITHOUT_REQUEST_ID');
  }
  if (!Array.isArray(db.contractSignatureRequests)) db.contractSignatureRequests = [];
  if (!Array.isArray(db.contractSignLinks)) db.contractSignLinks = [];
  db.contractSignatureRequests.push(request);
  db.contractSignLinks.push(link);
  return { request, link };
}

export function sendContractForSignature(user, contractId) {
  const existing = getGeneratedContract(contractId);
  if (existing) {
    assertLegalPatientIdentityConsistency({
      patientId: existing.patientId,
      liveFullName: existing.patientId ? getPatient(existing.patientId)?.profile?.full_name : '',
      snapshotFullName: existing.patientSnapshotJson?.full_name,
    });
  }
  const settings = getContractSettings(user);
  const days = Number(settings.signLinkExpiryDays || 7);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('Contrato não encontrado.');
    const normalized = normalizeContractLifecycleStatus(arr[idx].status);
    if (isTerminalContractState(arr[idx].status) || normalized === 'signed') {
      throw new Error('Contrato já assinado.');
    }
    if (normalized !== 'generated' && normalized !== 'partially_signed') {
      throw new Error('Somente contratos gerados ou parcialmente assinados podem ser enviados para assinatura.');
    }
    if (arr[idx].quoteSource === 'clinical_budget') {
      const md = arr[idx].metadata || {};
      if (!md.packageManifestId && !md.packageManifestHash && !md.frozenAt) {
        throw new Error('Manifest ainda não congelado. Prepare o pacote de assinatura primeiro.');
      }
    }
    persistClockExpiredAccess(db, {
      contractId,
      trustedNow: Date.now(),
      actorId: user?.id || 'system',
      actorRole: user?.role || 'system',
      tenantId: tenantIdFromUser(user) || arr[idx].tenant_id || null,
    });
    const reused = findReusableBoundSignAccess(db, contractId);
    const token = reused?.link?.token || createId('csgn');
    const access = reused || createBoundPatientSignAccess(db, {
      user,
      contract: arr[idx],
      token,
      expiresAt,
    });
    if (!access.link.requestId) {
      throw new Error('NEW_LINK_WITHOUT_REQUEST_ID');
    }
    assertContractStatusMutation(arr[idx], CONTRACT_STATUS.SENT, { contractId });
    arr[idx] = {
      ...arr[idx],
      status: CONTRACT_STATUS.SENT,
      lockedAt: arr[idx].lockedAt || new Date().toISOString(),
      signatureRequestId: access.request.id,
    };
    registerEvent(user, contractId, 'SENT', 'Enviado para assinatura por link', {
      linkId: access.link.id,
      requestId: access.request.id,
      expiresAt: access.link.expiresAt,
    });
    return {
      contract: arr[idx],
      request: access.request,
      link: access.link,
      signUrl: `/assinatura/${access.link.token}`,
    };
  });
}

export function getContractBySignToken(token, claims = {}) {
  const db = loadDb();
  const link = (db.contractSignLinks || []).find((row) => row.token === token);
  if (!link) return null;
  if (claims.claimedContractId && link.contractId !== claims.claimedContractId) return null;
  if (claims.claimedSignerRole && link.signerRole) {
    if (mapLegacySignerRole(link.signerRole) !== mapLegacySignerRole(claims.claimedSignerRole)) {
      return null;
    }
  }
  const linkStatus = normalizeLinkLifecycleStatus(link.status);
  if (linkStatus === 'signed') {
    return { replay: true, link };
  }
  if (linkStatus === 'expired' || (linkStatus === 'pending' && isAccessExpired(link.expiresAt))) {
    const persisted = persistExpiredSigningAccess({
      token,
      contractId: link.contractId,
      requestId: link.requestId || null,
      actorId: 'system',
      actorRole: 'system',
    });
    const next = (persisted.expiredLinks || []).find((row) => row.token === token)
      || persisted.expiredLinks?.[0]
      || { ...link, status: 'expired' };
    return { expired: true, link: next };
  }
  if (linkStatus !== 'pending') return null;
  const contract = getGeneratedContract(link.contractId);
  if (!isContractSignable(contract)) return null;
  return { contract: normalizeContract(contract), link };
}

/**
 * First-view idempotente do link público. Não consome o token.
 * Prefetch/bot não deve chamar isto (ver isLikelyHumanDocumentView).
 */
export function recordSignLinkFirstView(token, {
  human = true,
  visibilityState,
  webdriver,
  prefetch = false,
} = {}) {
  if (!human || !isLikelyHumanDocumentView({ visibilityState, webdriver, prefetch })) {
    return null;
  }
  const resolved = getContractBySignToken(token);
  if (!resolved || resolved.expired || resolved.replay || !resolved.link) return resolved;
  return withDb((db) => {
    const links = db.contractSignLinks || [];
    const idx = links.findIndex((row) => row.token === token);
    if (idx < 0) return null;
    const link = links[idx];
    if (link.status !== 'pending') return link;
    if (link.viewedAt) return link;
    const viewedAt = new Date().toISOString();
    links[idx] = { ...link, viewedAt };
    const arr = db.generatedContracts || [];
    const cIdx = arr.findIndex((row) => row.id === link.contractId);
    if (cIdx >= 0 && arr[cIdx].status === CONTRACT_STATUS.SENT) {
      assertContractStatusMutation(arr[cIdx], CONTRACT_STATUS.VIEWED, { contractId: link.contractId });
      arr[cIdx] = { ...arr[cIdx], status: CONTRACT_STATUS.VIEWED };
    }
    return links[idx];
  });
}

export function markContractViewed(user, contractId) {
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('Contrato não encontrado.');
    if (arr[idx].status === CONTRACT_STATUS.SENT) {
      assertContractStatusMutation(arr[idx], CONTRACT_STATUS.VIEWED, { contractId });
      arr[idx] = { ...arr[idx], status: CONTRACT_STATUS.VIEWED };
      registerEvent(user, contractId, 'VIEWED', 'Contrato visualizado pelo signatário');
    }
    return arr[idx];
  });
}

function resolveRegisteredSignerName({ signerRole, signerPersonId, contract }) {
  const role = mapLegacySignerRole(signerRole);
  if (role === CLINICAL_SIGNER_ROLE.PATIENT || role === CLINICAL_SIGNER_ROLE.LEGAL_GUARDIAN) {
    const bundle = contract?.patientId ? getPatient(contract.patientId) : null;
    return bundle?.profile?.full_name
      || contract?.patientSnapshotJson?.full_name
      || contract?.patientSnapshotJson?.name
      || '';
  }
  const col = (loadDb().collaborators || []).find((row) => row.id === signerPersonId);
  return col?.nomeCompleto || col?.name || '';
}

export async function signContractOnScreen(user, contractId, {
  signerName,
  signerCpf,
  signerRole = SIGNER_ROLES.PATIENT,
  signerPersonId = null,
  signatureImageDataUrl,
  ipAddress = '',
  userAgent = '',
  packageManifestId = null,
  expectedAppointmentId = null,
  expectedBudgetId = null,
  expectedPatientId = null,
  signingChannel = null,
  observedClientContext = null,
  consentAcceptances = null,
  presentedConsents = null,
  acceptanceMap = null,
  acceptedAtById = null,
  requireConsent = false,
  typedSignerName = null,
  signatureRequestId = null,
  signLinkId = null,
}) {
  if (!signerName?.trim()) throw new Error('Nome do signatário é obrigatório.');
  if (!signatureImageDataUrl) throw new Error('Assinatura é obrigatória.');
  const contract = getGeneratedContract(contractId);
  if (!contract) throw new Error('Contrato não encontrado.');
  assertContractSignable(contract);
  const tenantId = tenantIdFromUser(user);
  const channel = signingChannel
    || (user?.publicSignLink ? SIGNING_CHANNEL.PUBLIC_SIGN_LINK : SIGNING_CHANNEL.CLINIC_APP);
  const identityGate = assertAuthenticatedSignerForStroke(user, {
    signerRole,
    signerPersonId,
    tenantId,
    expectedAppointmentId,
    expectedBudgetId,
    expectedPatientId,
    contract,
    signingChannel: channel,
  });
  const presented = presentedConsents || [];
  const map = acceptanceMap || {};
  assertRequiredConsentsAccepted({
    presentedConsents: presented,
    acceptanceMap: map,
    requireConsent,
  });
  const now = new Date().toISOString();
  const consents = Array.isArray(consentAcceptances)
    ? consentAcceptances
    : buildConsentAcceptances({
      presentedConsents: presented,
      acceptanceMap: map,
      acceptedAtById: acceptedAtById || {},
      acceptedAt: now,
    });
  let rolesSatisfied = [mapLegacySignerRole(signerRole)];
  let documentTypes = ['CONTRACT_SERVICES'];
  let frozenIntegrity = null;
  if (contract.quoteSource === 'clinical_budget') {
    frozenIntegrity = await assertFrozenDocumentIntegrityBeforeSignature({
      contract,
      packageManifestId,
    });
    if (isLegacyClinicalSignature(contract)) {
      throw new Error('Contrato legado já assinado. Não altere a evidência histórica.');
    }
    const ceremony = evaluateSignatureCeremony({
      tenantId,
      patientId: contract.patientId,
      appointmentId: contract.quoteId,
      budgetId: contract.budgetId,
      contractId: contract.id,
    });
    const allowed = assertSignerAllowed(ceremony, {
      signerRole,
      signerPersonId,
      tenantId,
    });
    rolesSatisfied = allowed.rolesSatisfied;
    documentTypes = allowed.slot.documentTypes || documentTypes;
  }
  const hash = simpleHash(contract.renderedHtml || contract.finalContent);
  const registeredSignerName = resolveRegisteredSignerName({ signerRole, signerPersonId, contract });
  const typedName = String(typedSignerName || signerName).trim();
  const clientIp = resolveEvidenceClientIp({
    observedClientContext,
    fallbackIp: ipAddress,
  });
  const remote = identityGate.method === SIGNATURE_METHOD.REMOTE_ON_SCREEN;
  const operatorCollected = identityGate.method === SIGNATURE_METHOD.OPERATOR_COLLECTED_PRESENCE;
  const remoteBinding = assertRemoteSignatureBinding({
    contractId,
    signingChannel: identityGate.signingChannel || channel,
    signatureMethod: identityGate.method,
    signatureRequestId,
    signLinkId,
  });
  const evidenceFields = {
    contractId,
    documentHash: hash,
    contractVersion: requirePersistedContractVersion(contract),
    signerPersonId: signerPersonId || null,
    signerRole: mapLegacySignerRole(signerRole),
    signedAt: now,
    signatureMethod: identityGate.method,
    signingChannel: identityGate.signingChannel || channel,
    authMethod: identityGate.authMethod || (remote ? AUTH_METHOD.ON_SCREEN_LINK : null),
    registeredSignerName,
    typedSignerName: typedName,
    consentAcceptances: consents,
    clientIp: clientIp.ip,
    signatureRequestId: remoteBinding.signatureRequestId,
    signLinkId: remoteBinding.signLinkId,
  };
  const result = withDb((db) => {
    if (!Array.isArray(db.contractSignatures)) db.contractSignatures = [];
    const sig = {
      id: createId('csig'),
      tenant_id: tenantId,
      clinicId: clinicId(),
      contractId,
      signerName: typedName,
      signerCpf: String(signerCpf || '').replace(/\D/g, ''),
      signerRole: mapLegacySignerRole(signerRole),
      signerPersonId: signerPersonId || null,
      rolesSatisfied,
      signatureType: SIGNATURE_TYPES.ON_SCREEN,
      signatureImageUrl: signatureImageDataUrl,
      signedAt: now,
      ipAddress: clientIp.ip,
      userAgent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      evidenceJson: {
        hash,
        documentHash: hash,
        evidenceHash: computeEvidenceHash(evidenceFields),
        signedByUserId: identityGate.identity?.authenticatedUserId || null,
        operatorUserId: operatorCollected ? (user?.id || null) : null,
        operatorPersonId: operatorCollected
          ? (identityGate.identity?.personId || null)
          : null,
        signatureMethod: identityGate.method,
        signingChannel: identityGate.signingChannel || channel,
        authMethod: identityGate.authMethod || null,
        authenticatedPersonId: identityGate.identity?.personId || signerPersonId || null,
        registeredSignerName,
        typedSignerName: typedName,
        namesDiverged: namesDiverge(registeredSignerName, typedName),
        consentAcceptances: consents,
        clientIp: clientIp.ip,
        clientIpSource: clientIp.source,
        packageManifestId: contract.metadata?.packageManifestId || null,
        packageManifestHash: contract.metadata?.packageManifestHash || null,
        frozenContentSha256: frozenIntegrity?.frozenContentSha256 || null,
        contractVersion: requirePersistedContractVersion(contract),
        documentTypes,
        rolesSatisfied,
        ...(remoteBinding.required ? {
          signatureRequestId: remoteBinding.signatureRequestId,
          signLinkId: remoteBinding.signLinkId,
        } : {}),
      },
    };
    db.contractSignatures.push(sig);
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    let nextStatus = CONTRACT_STATUS.SIGNED;
    let ceremonySnap = arr[idx].metadata?.signatureCeremony || null;
    if (arr[idx].quoteSource === 'clinical_budget') {
      const recount = evaluateSignatureCeremony({
        tenantId,
        patientId: arr[idx].patientId,
        appointmentId: arr[idx].quoteId,
        budgetId: arr[idx].budgetId,
        contractId: arr[idx].id,
      });
      nextStatus = recount.allRequiredSatisfied
        ? CONTRACT_STATUS.SIGNED
        : nextContractStatusAfterStroke(recount, { justSignedRole: signerRole });
      ceremonySnap = buildCeremonySnapshot(
        recount.allRequiredSatisfied
          ? { ...recount, status: CEREMONY_STATUS.SIGNED, allRequiredSatisfied: true }
          : recount,
        { completedAt: recount.allRequiredSatisfied ? now : null },
      );
    }
    assertContractStatusMutation(arr[idx], nextStatus, {
      action: LIFECYCLE_ACTIONS.RECORD_SIGNATURE,
      contractId,
    });
    arr[idx] = {
      ...arr[idx],
      status: nextStatus,
      signedAt: nextStatus === CONTRACT_STATUS.SIGNED ? now : arr[idx].signedAt || null,
      documentHash: hash,
      metadata: {
        ...(arr[idx].metadata || {}),
        signatureCeremony: ceremonySnap,
      },
    };
    registerEvent(user, contractId, 'SIGNED', `Assinado por ${typedName} (${sig.signerRole})`, { signatureId: sig.id, rolesSatisfied });
    return { contract: arr[idx], signature: sig };
  });

  if (result.contract?.quoteSource === 'clinical_budget') {
    const recount = evaluateSignatureCeremony({
      tenantId,
      patientId: result.contract.patientId,
      appointmentId: result.contract.quoteId,
      budgetId: result.contract.budgetId,
      contractId: result.contract.id,
    });
    const ceremonySnap = buildCeremonySnapshot(recount, {
      completedAt: recount.allRequiredSatisfied ? result.signature.signedAt : null,
    });
    const nextStatus = recount.allRequiredSatisfied
      ? CONTRACT_STATUS.SIGNED
      : result.contract.status;
    withDb((db) => {
      const arr = db.generatedContracts || [];
      const idx = arr.findIndex((row) => row.id === contractId);
      if (idx < 0) return db;
      arr[idx] = {
        ...arr[idx],
        status: nextStatus,
        signedAt: nextStatus === CONTRACT_STATUS.SIGNED
          ? (arr[idx].signedAt || result.signature.signedAt)
          : arr[idx].signedAt,
        metadata: {
          ...(arr[idx].metadata || {}),
          signatureCeremony: ceremonySnap,
        },
      };
      result.contract = arr[idx];
      return db;
    });
  }

  if (result.contract?.status === CONTRACT_STATUS.SIGNED) {
    const signatures = (loadDb().contractSignatures || []).filter((row) => row.contractId === contractId);
    const artifact = await maybeGenerateFinalSignedArtifact({
      contract: result.contract,
      signatures,
      ceremony: result.contract.metadata?.signatureCeremony,
    });
    result.finalArtifact = artifact;
    if (artifact?.contract) result.contract = artifact.contract;
  }
  return result;
}

export async function signContractViaLink(token, {
  signerName,
  signerCpf,
  signatureImageDataUrl,
  ipAddress = '',
  userAgent = '',
  consentAcceptances = null,
  presentedConsents = null,
  privacy = null,
  acceptanceMap = null,
  acceptedAtById = null,
  requireConsent = false,
  observedClientContext = null,
  typedSignerName = null,
}) {
  const resolved = getContractBySignToken(token);
  if (!resolved || resolved.expired || resolved.replay) throw new Error('Link inválido ou expirado.');
  const { contract, link } = resolved;
  assertSignLinkSignable(link);
  const request = (loadDb().contractSignatureRequests || []).find((row) => row.id === link.requestId) || null;
  if (request) assertSignatureRequestSignable(request);
  const map = acceptanceMap
    || (consentAcceptances && !Array.isArray(consentAcceptances) ? consentAcceptances : {})
    || {};
  const presented = presentedConsents
    || collectPresentedConsents(privacy)
    || [];
  const arrayAcceptances = Array.isArray(consentAcceptances) ? consentAcceptances : null;
  const result = await signContractOnScreen(
    {
      id: null,
      name: signerName,
      tenantId: contract.tenant_id,
      tenant_id: contract.tenant_id,
      publicSignLink: true,
    },
    contract.id,
    {
      signerName,
      signerCpf,
      signerRole: SIGNER_ROLES.PATIENT,
      signerPersonId: contract.patientId,
      signatureImageDataUrl,
      ipAddress,
      userAgent,
      signingChannel: SIGNING_CHANNEL.PUBLIC_SIGN_LINK,
      observedClientContext,
      consentAcceptances: arrayAcceptances,
      presentedConsents: presented,
      acceptanceMap: arrayAcceptances ? null : map,
      acceptedAtById,
      requireConsent,
      typedSignerName: typedSignerName || signerName,
      signatureRequestId: link.requestId,
      signLinkId: link.id,
    },
  );
  withDb((db) => {
    const links = db.contractSignLinks || [];
    const idx = links.findIndex((l) => l.id === link.id);
    if (idx >= 0) {
      links[idx] = { ...links[idx], status: 'signed', signedAt: new Date().toISOString() };
    }
    const requests = db.contractSignatureRequests || [];
    const rIdx = requests.findIndex((r) => r.id === link.requestId);
    if (rIdx >= 0) {
      requests[rIdx] = {
        ...requests[rIdx],
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
    }
    return db;
  });

  logSignatureAudit({
    contractId: contract.id,
    requestId: link.requestId || null,
    action: 'signed_via_link',
    user: { id: null, name: signerName },
    payload: {
      signerCpf,
      authMethod: AUTH_METHOD.ON_SCREEN_LINK,
      documentHash: result.contract?.documentHash,
      ipAddress: result.signature?.ipAddress,
      platform: 'internal',
      metadata: {
        signatureMethod: SIGNATURE_METHOD.REMOTE_ON_SCREEN,
        signingChannel: SIGNING_CHANNEL.PUBLIC_SIGN_LINK,
      },
    },
  });

  if (signatureImageDataUrl && contract.patientId) {
    addFile(
      contract.patientId,
      {
        category: 'Contratos',
        file_name: `Assinatura contrato ${contract.contractNumber || contract.id}.png`,
        mime_type: 'image/png',
        file_url: signatureImageDataUrl,
      },
      'public-signer',
    );
    notifyClinicalBudgetUpdated(contract.patientId);
  }

  return result;
}

export function uploadSignedContractAttachment(user, contractId, { fileName, fileDataUrl, fileType = 'application/pdf' }) {
  if (!fileDataUrl) throw new Error('Arquivo é obrigatório.');
  const contract = getGeneratedContract(contractId);
  if (!contract) throw new Error('Contrato não encontrado.');
  assertContractSignable(contract);
  const now = new Date().toISOString();
  return withDb((db) => {
    if (!Array.isArray(db.contractAttachments)) db.contractAttachments = [];
    const att = {
      id: createId('catt'),
      tenant_id: tenantIdFromUser(user),
      clinicId: clinicId(),
      contractId,
      fileUrl: fileDataUrl,
      fileName: fileName || 'contrato-assinado.pdf',
      fileType,
      uploadedBy: user?.id || null,
      createdAt: now,
    };
    db.contractAttachments.push(att);
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx >= 0 && normalizeContractLifecycleStatus(arr[idx].status) !== 'signed') {
      assertContractStatusMutation(arr[idx], CONTRACT_STATUS.SIGNED, {
        action: LIFECYCLE_ACTIONS.RECORD_SIGNATURE,
        contractId,
      });
      arr[idx] = {
        ...arr[idx],
        status: CONTRACT_STATUS.SIGNED,
        signedAt: now,
        pdfUrl: fileDataUrl,
      };
      if (!Array.isArray(db.contractSignatures)) db.contractSignatures = [];
      db.contractSignatures.push({
        id: createId('csig'),
        tenant_id: tenantIdFromUser(user),
        clinicId: clinicId(),
        contractId,
        signerName: 'Upload externo',
        signerCpf: '',
        signerRole: SIGNER_ROLES.PATIENT,
        signatureType: SIGNATURE_TYPES.UPLOAD,
        signatureImageUrl: null,
        signedAt: now,
        ipAddress: 'upload',
        userAgent: '',
        evidenceJson: { attachmentId: att.id },
      });
      registerEvent(user, contractId, 'SIGNED', 'Contrato assinado via upload de PDF', { attachmentId: att.id });
    }
    return att;
  });
}

export function createContractNewVersion(_user, contractId) {
  const original = getGeneratedContract(contractId);
  if (!original) throw new Error('Contrato não encontrado.');
  assertInPlaceReissueBlocked(original);
}

export function hasSignedContractForQuote(quoteId, quoteSource = 'crm_budget', budgetId = null) {
  const cid = clinicId();
  const db = loadDb();
  return (db.generatedContracts || []).some(
    (c) => c.clinicId === cid
      && c.quoteId === quoteId
      && c.quoteSource === quoteSource
      && c.status === CONTRACT_STATUS.SIGNED
      && (budgetId ? c.budgetId === budgetId : true),
  );
}

export function getContractStatusForQuote(
  quoteId,
  quoteSource = 'crm_budget',
  budgetId = null,
  patientId = null,
) {
  const cid = clinicId();
  const db = loadDb();
  const contracts = (db.generatedContracts || []).filter(
    (c) => c.clinicId === cid && c.quoteId === quoteId && c.quoteSource === quoteSource,
  );
  const matchesPatient = (c) => !patientId || c.patientId === patientId;
  const sortByRecent = (list) => [...list].sort(
    (a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0),
  );

  if (budgetId) {
    const resolved = resolveContractForSelectedBudget({
      budgetId,
      appointmentId: quoteId,
      patientId,
      clinicId: cid,
    });
    if (resolved.ok) return normalizeContract(resolved.contract);

    const quoteContracts = contracts.filter(matchesPatient);
    const hasScopedBudget = quoteContracts.some((c) => c.budgetId);
    const legacyActive = sortByRecent(
      quoteContracts.filter(
        (c) => c.status !== CONTRACT_STATUS.REPLACED && !c.budgetId,
      ),
    );
    if (!hasScopedBudget && legacyActive.length === 1) {
      return normalizeContract(legacyActive[0]);
    }
    return null;
  }

  const fallbackActive = sortByRecent(
    contracts.filter((c) => matchesPatient(c) && c.status !== CONTRACT_STATUS.REPLACED),
  );
  if (fallbackActive.length) return normalizeContract(fallbackActive[0]);

  const fallbackAny = sortByRecent(contracts.filter(matchesPatient));
  return fallbackAny[0] ? normalizeContract(fallbackAny[0]) : null;
}

export function canStartTreatmentWithoutContract(user, quoteId, quoteSource = 'crm_budget') {
  const settings = getContractSettings(user);
  if (!settings.contractRequiredBeforeTreatment) return { allowed: true };
  const signed = hasSignedContractForQuote(quoteId, quoteSource);
  return {
    allowed: signed,
    reason: signed ? null : 'Contrato obrigatório não assinado para este orçamento.',
  };
}

export function listTemplatesByCategory(category) {
  ensureContractsModuleSeeded();
  const cid = clinicId();
  return listContractTemplates().filter(
    (t) => t.clinicId === cid && t.isActive !== false && (!category || t.category === category),
  );
}

export function listTemplatesByTreatment(treatmentType) {
  ensureContractsModuleSeeded();
  return listContractTemplates().filter(
    (t) => t.isActive !== false && t.treatmentType === treatmentType,
  );
}

export function setDefaultTemplateForTreatment(user, templateId, treatmentType) {
  const cid = clinicId();
  return withDb((db) => {
    const arr = db.contractTemplates || [];
    for (let i = 0; i < arr.length; i += 1) {
      if (arr[i].clinicId === cid && arr[i].treatmentType === treatmentType) {
        arr[i] = { ...arr[i], isDefault: arr[i].id === templateId };
      }
    }
    registerEvent(user, null, 'TEMPLATE_DEFAULT', 'Modelo padrão definido', { templateId, treatmentType });
    return getContractTemplate(templateId);
  });
}
