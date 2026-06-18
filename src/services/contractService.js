/**
 * CRUD de modelos de contrato, blocos e contratos gerados (IndexedDB).
 */
import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import { canByPermission } from './accessService.js';
import { seedDefaultContractsForDb } from '../contracts/defaultContractSeed.js';
import {
  buildContractContext,
  applyHashtags,
  filterBlocksForRender,
} from './contractRenderService.js';
import { findUnknownHashtags } from '../contracts/hashtagRegistry.js';
import { validateContractGeneration } from './contractValidationService.js';
import { mergeContractAttachedTcleIds } from './clinicalTcleAttachmentService.js';
import { getPatient } from './patientService.js';
import { BUDGET_LOCK_ERROR } from './clinicalBudgetLockService.js';

const NON_EDITABLE_CONTRACT_STATUSES = new Set([
  'generated', 'sent', 'viewed', 'signed_by_patient', 'signed_by_clinic',
  'completed', 'signed', 'canceled',
]);

function assertContractMutationAllowed(contract, { allowDraft = false } = {}) {
  if (!contract) throw new Error('Contrato não encontrado.');
  if (contract.status === 'canceled') throw new Error(BUDGET_LOCK_ERROR);
  if (allowDraft && contract.status === 'draft') return;
  if (NON_EDITABLE_CONTRACT_STATUSES.has(contract.status)) {
    throw new Error(BUDGET_LOCK_ERROR);
  }
}

function clinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

function audit(user, contractId, action, metadata = {}) {
  withDb((db) => {
    if (!Array.isArray(db.contractAuditLogs)) db.contractAuditLogs = [];
    db.contractAuditLogs.push({
      id: createId('cadt'),
      clinicId: clinicId(),
      contractId: contractId || null,
      action,
      userId: user?.id || null,
      metadata,
      createdAt: new Date().toISOString(),
    });
    return db;
  });
}

export function ensureContractsSeeded() {
  withDb((db) => {
    seedDefaultContractsForDb(db);
    return db;
  });
}

export function listContractTemplates() {
  ensureContractsSeeded();
  const cid = clinicId();
  const db = loadDb();
  return (db.contractTemplates || []).filter((t) => t.clinicId === cid);
}

export function getContractTemplate(templateId) {
  const db = loadDb();
  return (db.contractTemplates || []).find((t) => t.id === templateId) || null;
}

export function listBlocksForTemplate(templateId) {
  const cid = clinicId();
  const db = loadDb();
  return (db.contractBlocks || [])
    .filter((b) => b.clinicId === cid && b.templateId === templateId)
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
}

export function upsertContractBlock(user, payload) {
  const { id, templateId, blockNumber, title, content, isActive, conditionType, orderIndex } = payload;
  const cid = clinicId();
  if (!templateId) throw new Error('templateId é obrigatório.');
  const tpl = getContractTemplate(templateId);
  if (!tpl) throw new Error('Modelo não encontrado.');
  return withDb((db) => {
    const blocks = db.contractBlocks || [];
    const now = new Date().toISOString();
    const idx = id ? blocks.findIndex((b) => b.id === id) : -1;
    const effectiveBlockNum = idx >= 0 ? Number(blocks[idx].blockNumber) : Number(blockNumber);
    if (
      tpl.type === 'system_default'
      && effectiveBlockNum === 1
      && !user?.isMaster
      && String(user?.role || '').toLowerCase() !== 'admin'
      && !canByPermission(user, 'admin_contratos:edit_system_clause')
    ) {
      throw new Error('Sem permissão para editar a cláusula Das Partes do contrato padrão.');
    }
    if (idx >= 0) {
      blocks[idx] = {
        ...blocks[idx],
        blockNumber: blockNumber != null ? Number(blockNumber) : blocks[idx].blockNumber,
        title: title != null ? String(title) : blocks[idx].title,
        content: content != null ? String(content) : blocks[idx].content,
        isActive: isActive != null ? Boolean(isActive) : blocks[idx].isActive,
        conditionType: conditionType != null ? String(conditionType) : blocks[idx].conditionType,
        orderIndex: orderIndex != null ? Number(orderIndex) : blocks[idx].orderIndex,
        updatedAt: now,
      };
      audit(user, null, 'BLOCK_UPDATE', { blockId: blocks[idx].id, templateId });
      return blocks[idx];
    }
    const row = {
      id: id || createId('cblk'),
      clinicId: cid,
      templateId,
      blockNumber: Number(blockNumber) || 1,
      title: String(title || ''),
      content: String(content || ''),
      isActive: isActive !== false,
      conditionType: String(conditionType || 'always'),
      orderIndex: Number(orderIndex) || 0,
      createdAt: now,
      updatedAt: now,
    };
    blocks.push(row);
    db.contractBlocks = blocks;
    audit(user, null, 'BLOCK_CREATE', { blockId: row.id, templateId });
    return row;
  });
}

/** Impede desativar bloco 1 padrão */
export function setBlockActive(user, blockId, isActive) {
  const db = loadDb();
  const b = (db.contractBlocks || []).find((x) => x.id === blockId);
  if (!b) throw new Error('Bloco não encontrado.');
  const tpl = getContractTemplate(b.templateId);
  if (tpl?.type === 'system_default' && Number(b.blockNumber) === 1 && !isActive) {
    throw new Error('A cláusula Das Partes não pode ser desativada.');
  }
  return upsertContractBlock(user, {
    id: blockId,
    templateId: b.templateId,
    blockNumber: b.blockNumber,
    title: b.title,
    content: b.content,
    isActive,
    conditionType: b.conditionType,
    orderIndex: b.orderIndex,
  });
}

export function createClinicCustomTemplate(user, { name, content }) {
  const cid = clinicId();
  const now = new Date().toISOString();
  return withDb((db) => {
    if (!Array.isArray(db.contractTemplates)) db.contractTemplates = [];
    const row = {
      id: createId('ctpl'),
      clinicId: cid,
      name: String(name || 'Contrato personalizado').trim(),
      type: 'clinic_custom',
      content: String(content || ''),
      isActive: true,
      version: 1,
      usageCount: 0,
      createdBy: user?.id || null,
      createdAt: now,
      updatedAt: now,
    };
    db.contractTemplates.push(row);
    audit(user, null, 'TEMPLATE_CREATE', { templateId: row.id });
    return row;
  });
}

export function updateClinicCustomTemplate(user, templateId, { name, content, isActive }) {
  const tpl = getContractTemplate(templateId);
  if (!tpl || tpl.type !== 'clinic_custom') throw new Error('Apenas modelos próprios podem ser editados aqui.');
  return withDb((db) => {
    const arr = db.contractTemplates || [];
    const idx = arr.findIndex((t) => t.id === templateId);
    if (idx < 0) throw new Error('Modelo não encontrado.');
    const now = new Date().toISOString();
    arr[idx] = {
      ...arr[idx],
      name: name != null ? String(name).trim() : arr[idx].name,
      content: content != null ? String(content) : arr[idx].content,
      isActive: isActive != null ? Boolean(isActive) : arr[idx].isActive,
      version: Number(arr[idx].version || 1) + 1,
      updatedAt: now,
    };
    audit(user, null, 'TEMPLATE_UPDATE', { templateId });
    return arr[idx];
  });
}

export function duplicateClinicTemplate(user, templateId) {
  const tpl = getContractTemplate(templateId);
  if (!tpl || tpl.type !== 'clinic_custom') throw new Error('Somente modelos próprios podem ser duplicados.');
  const copy = createClinicCustomTemplate(user, {
    name: `${tpl.name} (cópia)`,
    content: tpl.content || '',
  });
  const blocks = listBlocksForTemplate(templateId);
  for (const b of blocks) {
    upsertContractBlock(user, {
      templateId: copy.id,
      blockNumber: b.blockNumber,
      title: b.title,
      content: b.content,
      isActive: b.isActive,
      conditionType: b.conditionType,
      orderIndex: b.orderIndex,
    });
  }
  return copy;
}

export function deleteClinicTemplate(user, templateId) {
  const tpl = getContractTemplate(templateId);
  if (!tpl || tpl.type !== 'clinic_custom') throw new Error('Somente modelos próprios podem ser excluídos.');
  if (Number(tpl.usageCount || 0) > 0) throw new Error('Modelo já utilizado em contrato gerado; não é possível excluir.');
  return withDb((db) => {
    db.contractTemplates = (db.contractTemplates || []).filter((t) => t.id !== templateId);
    db.contractBlocks = (db.contractBlocks || []).filter((b) => b.templateId !== templateId);
    audit(user, null, 'TEMPLATE_DELETE', { templateId });
    return true;
  });
}

export function restoreSystemDefaultTemplate(user) {
  ensureContractsSeeded();
  const cid = clinicId();
  return withDb((db) => {
    const templates = db.contractTemplates || [];
    const blocks = db.contractBlocks || [];
    const sys = templates.find((t) => t.clinicId === cid && t.type === 'system_default');
    if (!sys) {
      seedDefaultContractsForDb(db);
      audit(user, null, 'TEMPLATE_RESTORE', { ok: true });
      return getContractTemplate((db.contractTemplates || []).find((t) => t.clinicId === cid && t.type === 'system_default')?.id);
    }
    db.contractBlocks = blocks.filter((b) => !(b.clinicId === cid && b.templateId === sys.id));
    db.contractTemplates = templates.filter((t) => t.id !== sys.id);
    seedDefaultContractsForDb(db);
    audit(user, null, 'TEMPLATE_RESTORE', { ok: true });
    return getContractTemplate((db.contractTemplates || []).find((t) => t.clinicId === cid && t.type === 'system_default')?.id);
  });
}

/**
 * Gera HTML final a partir do modelo (blocos ou content único para clinic_custom).
 */
export function composeTemplateHtml(templateId) {
  const tpl = getContractTemplate(templateId);
  if (!tpl) throw new Error('Modelo não encontrado.');
  if (tpl.type === 'clinic_custom') {
    return `${tpl.content || ''}`;
  }
  const blocks = listBlocksForTemplate(templateId);
  const ctx = { __meta: { includeOrthodontics: true, hasFinancialResponsible: false } };
  const filtered = filterBlocksForRender(blocks, ctx);
  let html = tpl.content || '';
  for (const b of filtered) {
    html += `<section class="contract-clause"><h2>${b.blockNumber}. ${escapeTitle(b.title)}</h2><div class="clause-body">${b.content || ''}</div></section>`;
  }
  return html;
}

/** Monta HTML do modelo usando paciente/orçamento reais (para preview e geração). */
export function composeTemplateHtmlForContext(templateId, { quoteSource, quoteId, patientId, currentUser }) {
  const tpl = getContractTemplate(templateId);
  if (!tpl) throw new Error('Modelo não encontrado.');
  if (tpl.type === 'clinic_custom') {
    return String(tpl.content || '');
  }
  const ctx0 = buildContractContext({
    quoteSource,
    quoteId,
    patientId,
    currentUser,
  });
  const blocks = listBlocksForTemplate(templateId);
  const filtered = filterBlocksForRender(blocks, ctx0);
  let html = tpl.content || '';
  for (const b of filtered) {
    html += `<section class="contract-clause"><h2>${b.blockNumber}. ${escapeTitle(b.title)}</h2><div class="clause-body">${b.content || ''}</div></section>`;
  }
  return html;
}

export function assertPatientReadyForContract(patientId) {
  const bundle = getPatient(patientId);
  const pr = bundle?.profile;
  if (!pr) throw new Error('Paciente não encontrado.');
  if (pr.has_financial_responsible && !String(pr.dependent_full_name || '').trim()) {
    throw new Error(
      'Paciente marcado com responsável financeiro: informe o nome completo do dependente no cadastro (aba Relacionamentos / contrato) antes de gerar o contrato.',
    );
  }
}

function escapeTitle(t) {
  return String(t || '').replace(/</g, '&lt;');
}

export function validateTemplateHashtags(html) {
  return findUnknownHashtags(html);
}

export function createGeneratedContractDraft(user, payload) {
  const {
    quoteSource,
    quoteId,
    patientId,
    templateId,
    editedHtml,
    skipHashtagValidation = false,
    budgetId = null,
  } = payload;
  if (!quoteSource || !quoteId || !patientId || !templateId) {
    throw new Error('quoteSource, quoteId, patientId e templateId são obrigatórios.');
  }
  assertPatientReadyForContract(patientId);
  const ctx0 = buildContractContext({
    quoteSource,
    quoteId,
    patientId,
    currentUser: user,
  });
  const tpl = getContractTemplate(templateId);
  if (!tpl) throw new Error('Modelo não encontrado.');
  const baseHtml = composeTemplateHtmlForContext(templateId, {
    quoteSource,
    quoteId,
    patientId,
    currentUser: user,
  });
  const merged = editedHtml != null ? String(editedHtml) : baseHtml;
  if (!skipHashtagValidation) {
    const unknown = findUnknownHashtags(merged);
    if (unknown.length) {
      throw new Error(`Hashtags desconhecidas: ${unknown.join(', ')}`);
    }
    const readiness = validateContractGeneration({
      quoteSource,
      quoteId,
      patientId,
      currentUser: user,
      htmlPreview: merged,
      strict: false,
    });
    if (!readiness.ok) {
      const labels = readiness.missing.map((m) => m.label).slice(0, 5).join('; ');
      throw new Error(`Contrato com dados obrigatórios pendentes: ${labels}`);
    }
  }
  const ctx = buildContractContext({
    quoteSource,
    quoteId,
    patientId,
    currentUser: user,
  });
  const rendered = applyHashtags(merged, ctx);
  const now = new Date().toISOString();
  const id = createId('gctr');
  return withDb((db) => {
    if (!db.contractSeqByClinic || typeof db.contractSeqByClinic !== 'object') db.contractSeqByClinic = {};
    const cid = clinicId();
    const n = Number(db.contractSeqByClinic[cid] || 0) + 1;
    db.contractSeqByClinic[cid] = n;
    const year = new Date().getFullYear();
    const contractNumber = `CTR-${year}-${String(n).padStart(5, '0')}`;
    const tIdx = (db.contractTemplates || []).findIndex((t) => t.id === templateId);
    if (tIdx >= 0) {
      db.contractTemplates[tIdx] = {
        ...db.contractTemplates[tIdx],
        usageCount: Number(db.contractTemplates[tIdx].usageCount || 0) + 1,
      };
    }
    if (!Array.isArray(db.generatedContracts)) db.generatedContracts = [];
    const row = {
      id,
      clinicId: cid,
      patientId,
      quoteId,
      quoteSource,
      budgetId: budgetId || null,
      templateId,
      templateVersion: Number(tpl.version || 1),
      contractNumber,
      finalContent: merged,
      renderedHtml: rendered,
      pdfUrl: null,
      status: 'draft',
      generatedBy: user?.id || null,
      generatedAt: now,
      signedAt: null,
      canceledAt: null,
      metadata: {},
    };
    db.generatedContracts.push(row);
    if (!Array.isArray(db.contractAuditLogs)) db.contractAuditLogs = [];
    db.contractAuditLogs.push({
      id: createId('cadt'),
      clinicId: cid,
      contractId: id,
      action: 'GENERATE_DRAFT',
      userId: user?.id || null,
      metadata: { templateId, quoteSource, quoteId },
      createdAt: now,
    });
    return row;
  });
}

export function updateDraftGeneratedContract(user, contractId, { finalContent }) {
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('Contrato não encontrado.');
    const c = arr[idx];
    assertContractMutationAllowed(c, { allowDraft: true });
    if (c.status !== 'draft') throw new Error('Apenas rascunhos podem ser editados.');
    const merged = String(finalContent ?? '');
    const unknown = findUnknownHashtags(merged);
    if (unknown.length) {
      throw new Error(`Hashtags desconhecidas: ${unknown.join(', ')}`);
    }
    const rendered = applyHashtags(merged, buildContractContext({
      quoteSource: c.quoteSource,
      quoteId: c.quoteId,
      patientId: c.patientId,
      currentUser: user,
    }));
    arr[idx] = { ...c, finalContent: merged, renderedHtml: rendered };
    audit(user, contractId, 'DRAFT_UPDATE', {});
    return arr[idx];
  });
}

export function finalizeGeneratedContract(user, contractId) {
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('Contrato não encontrado.');
    const c = arr[idx];
    if (c.status === 'canceled') throw new Error('Contrato cancelado.');
    if (c.status === 'generated') throw new Error('Contrato já finalizado.');

    const attachedTcleIds = mergeContractAttachedTcleIds(c, {
      patientId: c.patientId,
      appointmentId: c.quoteId,
    });
    arr[idx] = {
      ...c,
      metadata: { ...(c.metadata || {}), attachedTcleIds },
    };

    const readiness = validateContractGeneration({
      quoteSource: c.quoteSource,
      quoteId: c.quoteId,
      patientId: c.patientId,
      currentUser: user,
      htmlPreview: c.finalContent,
      contractNumber: c.contractNumber,
      strict: true,
      attachedTcleIds,
    });
    if (!readiness.ok) {
      const labels = readiness.missing.map((m) => m.label).slice(0, 6).join('; ');
      throw new Error(`Contrato não pode ser finalizado. Pendências: ${labels}`);
    }

    const rendered = applyHashtags(c.finalContent, buildContractContext({
      quoteSource: c.quoteSource,
      quoteId: c.quoteId,
      patientId: c.patientId,
      currentUser: user,
    }));
    arr[idx] = {
      ...arr[idx],
      status: 'generated',
      renderedHtml: rendered,
      generatedAt: new Date().toISOString(),
    };
    audit(user, contractId, 'FINALIZE', { readinessWarnings: readiness.warnings });
    return arr[idx];
  });
}

export function cancelGeneratedContract(user, contractId, meta = {}) {
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('Contrato não encontrado.');
    const current = arr[idx];
    if (current.status === 'signed') {
      throw new Error('Contrato assinado não pode ser cancelado por este fluxo.');
    }
    if (current.status === 'canceled') {
      throw new Error('Contrato já está cancelado.');
    }
    arr[idx] = {
      ...arr[idx],
      status: 'canceled',
      canceledAt: new Date().toISOString(),
      cancelReason: meta.reason || arr[idx].cancelReason || null,
      canceledBy: meta.canceledBy || user?.id || null,
      canceledByName: meta.canceledByName || null,
      cancelFinancialAction: meta.financialAction || null,
    };
    audit(user, contractId, 'CANCEL', meta);
    return arr[idx];
  });
}

export function listGeneratedContracts(filters = {}) {
  const cid = clinicId();
  const db = loadDb();
  let list = (db.generatedContracts || []).filter((c) => c.clinicId === cid);
  if (filters.patientId) list = list.filter((c) => c.patientId === filters.patientId);
  if (filters.status) list = list.filter((c) => c.status === filters.status);
  if (filters.quoteId) list = list.filter((c) => c.quoteId === filters.quoteId);
  list.sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0));
  return list;
}

export function getGeneratedContract(id) {
  const db = loadDb();
  return (db.generatedContracts || []).find((c) => c.id === id) || null;
}

export function listContractAuditLogs(contractId) {
  const cid = clinicId();
  const db = loadDb();
  return (db.contractAuditLogs || [])
    .filter((l) => l.clinicId === cid && (!contractId || l.contractId === contractId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
