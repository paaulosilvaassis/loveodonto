import { withDb, loadDb } from '../db/index.js';
import { logSignatureAudit } from './contractSignatureAuditService.js';
import { notifyClinicalBudgetUpdated } from './clinicalBudgetApprovedService.js';
import { addFile } from './patientFilesService.js';
import { createId } from './helpers.js';
import { getPatient } from './patientService.js';
import { buildContractContext } from './contractRenderService.js';
import { seedDefaultContractsForDb } from '../contracts/defaultContractSeed.js';
import { seedTreatmentContractTemplates } from '../contracts/treatmentContractSeed.js';
import { mergeContractAttachedTcleIds } from './clinicalTcleAttachmentService.js';
import {
  CONTRACT_STATUS,
  DEFAULT_CONTRACT_SETTINGS,
  SIGNATURE_TYPES,
  SIGNER_ROLES,
} from '../contracts/contractConstants.js';
import { matchesContractViewIdentity } from '../contracts/contractViewIdentity.js';
import {
  evaluateSignatureCeremony,
  assertSignerAllowed,
  nextContractStatusAfterStroke,
  buildCeremonySnapshot,
  isLegacyClinicalSignature,
} from '../contracts/clinicalSignatureCeremony.js';
import { mapLegacySignerRole } from '../contracts/clinicalRequiredSigners.js';
import {
  assertAuthenticatedSignerForStroke,
  isOperatorCollectedRole,
} from '../contracts/authenticatedSignerIdentity.js';
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
      name: currentUser?.name,
      cro: currentUser?.cro || currentUser?.registroProfissional || currentUser?.conselhoNumero || '',
      userId: currentUser?.id,
    },
    clinicalSnapshotJson: {
      procedimentos: ctx['#procedimentos'],
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
      throw new Error('Já existe contrato ativo para este orçamento. Use Editar contrato.');
    }
  }
  ensureContractsModuleSeeded();
  const row = createGeneratedContractDraft(user, payload);
  const tpl = getContractTemplate(payload.templateId);
  const attachedTcleIds = mergeContractAttachedTcleIds(
    { metadata: {} },
    { patientId: payload.patientId, appointmentId: payload.quoteId },
  );
  const snaps = buildSnapshots({
    quoteSource: payload.quoteSource,
    quoteId: payload.quoteId,
    patientId: payload.patientId,
    currentUser: user,
    budgetId: payload.budgetId || null,
  });
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

export function sendContractForSignature(user, contractId) {
  const settings = getContractSettings(user);
  const days = Number(settings.signLinkExpiryDays || 7);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const token = createId('csgn');
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('Contrato não encontrado.');
    if (arr[idx].status === CONTRACT_STATUS.SIGNED || arr[idx].status === CONTRACT_STATUS.COMPLETED) {
      throw new Error('Contrato já assinado.');
    }
    if (arr[idx].status !== CONTRACT_STATUS.GENERATED) {
      throw new Error('Somente contratos gerados podem ser enviados para assinatura.');
    }
    if (arr[idx].quoteSource === 'clinical_budget') {
      const md = arr[idx].metadata || {};
      if (!md.packageManifestId && !md.packageManifestHash && !md.frozenAt) {
        throw new Error('Manifest ainda não congelado. Prepare o pacote de assinatura primeiro.');
      }
    }
    arr[idx] = {
      ...arr[idx],
      status: CONTRACT_STATUS.SENT,
      lockedAt: arr[idx].lockedAt || new Date().toISOString(),
    };
    if (!Array.isArray(db.contractSignLinks)) db.contractSignLinks = [];
    const link = {
      id: createId('clnk'),
      tenant_id: tenantIdFromUser(user),
      clinicId: clinicId(),
      contractId,
      token,
      expiresAt,
      status: 'pending',
      createdBy: user?.id || null,
      createdAt: new Date().toISOString(),
      viewedAt: null,
      signedAt: null,
    };
    db.contractSignLinks.push(link);
    registerEvent(user, contractId, 'SENT', 'Enviado para assinatura por link', { linkId: link.id, expiresAt });
    return { contract: arr[idx], link, signUrl: `/assinatura/${token}` };
  });
}

export function getContractBySignToken(token) {
  const db = loadDb();
  const link = (db.contractSignLinks || []).find((l) => l.token === token && l.status === 'pending');
  if (!link) return null;
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return { expired: true, link };
  }
  const contract = getGeneratedContract(link.contractId);
  return { contract: normalizeContract(contract), link };
}

export function markContractViewed(user, contractId) {
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('Contrato não encontrado.');
    if (arr[idx].status === CONTRACT_STATUS.SENT) {
      arr[idx] = { ...arr[idx], status: CONTRACT_STATUS.VIEWED };
      registerEvent(user, contractId, 'VIEWED', 'Contrato visualizado pelo signatário');
    }
    return arr[idx];
  });
}

export function signContractOnScreen(user, contractId, {
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
}) {
  if (!signerName?.trim()) throw new Error('Nome do signatário é obrigatório.');
  if (!signatureImageDataUrl) throw new Error('Assinatura é obrigatória.');
  const contract = getGeneratedContract(contractId);
  if (!contract) throw new Error('Contrato não encontrado.');
  if (contract.status === CONTRACT_STATUS.DRAFT) {
    throw new Error('Não é possível assinar contrato em rascunho. Finalize o contrato primeiro.');
  }
  if (contract.status === CONTRACT_STATUS.SIGNED) throw new Error('Contrato já assinado.');
  const tenantId = tenantIdFromUser(user);
  const identityGate = assertAuthenticatedSignerForStroke(user, {
    signerRole,
    signerPersonId,
    tenantId,
    expectedAppointmentId,
    expectedBudgetId,
    expectedPatientId,
    contract,
  });
  let rolesSatisfied = [mapLegacySignerRole(signerRole)];
  let documentTypes = ['CONTRACT_SERVICES'];
  if (contract.quoteSource === 'clinical_budget') {
    const md = contract.metadata || {};
    if (!md.packageManifestId && !md.packageManifestHash && !md.frozenAt) {
      throw new Error('Manifest ainda não congelado. Prepare o pacote de assinatura primeiro.');
    }
    if (packageManifestId && md.packageManifestId && packageManifestId !== md.packageManifestId) {
      throw new Error('Manifest informado não corresponde ao pacote congelado.');
    }
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
  const now = new Date().toISOString();
  const hash = simpleHash(contract.renderedHtml || contract.finalContent);
  return withDb((db) => {
    if (!Array.isArray(db.contractSignatures)) db.contractSignatures = [];
    const sig = {
      id: createId('csig'),
      tenant_id: tenantId,
      clinicId: clinicId(),
      contractId,
      signerName: String(signerName).trim(),
      signerCpf: String(signerCpf || '').replace(/\D/g, ''),
      signerRole: mapLegacySignerRole(signerRole),
      signerPersonId: signerPersonId || null,
      rolesSatisfied,
      signatureType: SIGNATURE_TYPES.ON_SCREEN,
      signatureImageUrl: signatureImageDataUrl,
      signedAt: now,
      ipAddress: ipAddress || 'local',
      userAgent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      evidenceJson: {
        hash,
        signedByUserId: user?.id || null,
        operatorUserId: isOperatorCollectedRole(signerRole) ? (user?.id || null) : null,
        operatorPersonId: isOperatorCollectedRole(signerRole)
          ? (identityGate.identity?.personId || null)
          : null,
        signatureMethod: identityGate.method,
        authenticatedPersonId: identityGate.identity?.personId || null,
        packageManifestId: contract.metadata?.packageManifestId || null,
        packageManifestHash: contract.metadata?.packageManifestHash || null,
        contractVersion: contract.version || 1,
        documentTypes,
        rolesSatisfied,
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
      ceremonySnap = buildCeremonySnapshot(recount);
    }
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
    registerEvent(user, contractId, 'SIGNED', `Assinado por ${signerName} (${sig.signerRole})`, { signatureId: sig.id, rolesSatisfied });
    return { contract: arr[idx], signature: sig };
  });
}

export function signContractViaLink(token, {
  signerName,
  signerCpf,
  signatureImageDataUrl,
  ipAddress = '',
  userAgent = '',
}) {
  const resolved = getContractBySignToken(token);
  if (!resolved || resolved.expired) throw new Error('Link inválido ou expirado.');
  const { contract, link } = resolved;
  const result = signContractOnScreen(
    { id: 'public-signer', name: signerName, tenantId: contract.tenant_id, tenant_id: contract.tenant_id },
    contract.id,
    {
      signerName,
      signerCpf,
      signerRole: SIGNER_ROLES.PATIENT,
      signerPersonId: contract.patientId,
      signatureImageDataUrl,
      ipAddress,
      userAgent,
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
    user: { id: 'public-signer', name: signerName },
    payload: {
      signerCpf,
      authMethod: 'on_screen_link',
      documentHash: result.contract?.documentHash,
      ipAddress,
      platform: 'internal',
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
    if (idx >= 0 && arr[idx].status !== CONTRACT_STATUS.SIGNED) {
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

export function createContractNewVersion(user, contractId) {
  const original = getGeneratedContract(contractId);
  if (!original) throw new Error('Contrato não encontrado.');
  if (original.status !== CONTRACT_STATUS.SIGNED) {
    throw new Error('Somente contratos assinados podem gerar nova versão.');
  }
  const draft = createContractDraft(user, {
    quoteSource: original.quoteSource,
    quoteId: original.quoteId,
    patientId: original.patientId,
    budgetId: original.budgetId || null,
    templateId: original.templateId,
    editedHtml: original.finalContent,
  });
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const oIdx = arr.findIndex((c) => c.id === contractId);
    if (oIdx >= 0) {
      arr[oIdx] = {
        ...arr[oIdx],
        status: CONTRACT_STATUS.REPLACED,
        replacedById: draft.id,
      };
    }
    const dIdx = arr.findIndex((c) => c.id === draft.id);
    if (dIdx >= 0) {
      arr[dIdx] = {
        ...arr[dIdx],
        parentContractId: contractId,
        version: Number(original.version || 1) + 1,
      };
    }
    registerEvent(user, contractId, 'REPLACED', 'Nova versão criada', { newContractId: draft.id });
    return arr[dIdx >= 0 ? dIdx : 0] || draft;
  });
}

export function hasSignedContractForQuote(quoteId, quoteSource = 'crm_budget', budgetId = null) {
  const cid = clinicId();
  const db = loadDb();
  return (db.generatedContracts || []).some(
    (c) => c.clinicId === cid
      && c.quoteId === quoteId
      && c.quoteSource === quoteSource
      && c.status === CONTRACT_STATUS.SIGNED
      && (!budgetId || c.budgetId === budgetId),
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
    const exactActive = sortByRecent(
      contracts.filter(
        (c) => matchesPatient(c)
          && c.status !== CONTRACT_STATUS.REPLACED
          && c.budgetId === budgetId,
      ),
    );
    if (exactActive.length) return normalizeContract(exactActive[0]);

    const legacyActive = sortByRecent(
      contracts.filter(
        (c) => matchesPatient(c)
          && c.status !== CONTRACT_STATUS.REPLACED
          && !c.budgetId,
      ),
    );
    if (legacyActive.length === 1) return normalizeContract(legacyActive[0]);

    const exactIncludingReplaced = sortByRecent(
      contracts.filter((c) => matchesPatient(c) && c.budgetId === budgetId),
    );
    if (exactIncludingReplaced.length) return normalizeContract(exactIncludingReplaced[0]);

    // Reload-safe: não descartar contrato do mesmo atendimento/quote por budgetId órfão.
    const quoteActive = sortByRecent(
      contracts.filter((c) => matchesPatient(c) && c.status !== CONTRACT_STATUS.REPLACED),
    );
    if (quoteActive.length) return normalizeContract(quoteActive[0]);

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
