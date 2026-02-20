import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, normalizeText } from './helpers.js';
import { logAction } from './logService.js';

/**
 * Cria um novo registro de documento
 */
export const createDocumentRecord = (user, payload) => {
  requirePermission(user, 'agenda:write');
  const now = new Date().toISOString();
  const record = {
    id: createId('doc'),
    patientId: payload.patientId,
    appointmentId: payload.appointmentId || null,
    category: normalizeText(payload.category),
    templateKey: normalizeText(payload.templateKey),
    title: normalizeText(payload.title),
    content: payload.content || '',
    createdAt: now,
    createdBy: user.id,
    signed: Boolean(payload.signed || false),
    signedAt: payload.signedAt || null,
    attachments: payload.attachments || [],
    metadata: payload.metadata || {},
  };

  return withDb((db) => {
    if (!Array.isArray(db.documentRecords)) {
      db.documentRecords = [];
    }
    db.documentRecords.push(record);
    logAction('document:create', { documentId: record.id, category: record.category, userId: user.id });
    return record;
  });
};

/**
 * Lista documentos por paciente e/ou atendimento
 */
export const listDocumentRecords = (filters = {}) => {
  const db = loadDb();
  if (!Array.isArray(db.documentRecords)) {
    return [];
  }

  let records = [...db.documentRecords];

  if (filters.patientId) {
    records = records.filter((r) => r.patientId === filters.patientId);
  }

  if (filters.appointmentId) {
    records = records.filter((r) => r.appointmentId === filters.appointmentId);
  }

  if (filters.category) {
    records = records.filter((r) => r.category === filters.category);
  }

  if (filters.templateKey) {
    records = records.filter((r) => r.templateKey === filters.templateKey);
  }

  return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * Busca um documento por ID
 */
export const getDocumentRecord = (documentId) => {
  const db = loadDb();
  if (!Array.isArray(db.documentRecords)) {
    return null;
  }
  return db.documentRecords.find((r) => r.id === documentId) || null;
};

/**
 * Atualiza um documento existente (apenas campos editáveis)
 */
export const updateDocumentRecord = (user, documentId, updates) => {
  requirePermission(user, 'agenda:write');
  return withDb((db) => {
    if (!Array.isArray(db.documentRecords)) {
      throw new Error('Documento não encontrado');
    }
    const index = db.documentRecords.findIndex((r) => r.id === documentId);
    if (index < 0) {
      throw new Error('Documento não encontrado');
    }

    const before = { ...db.documentRecords[index] };
    db.documentRecords[index] = {
      ...db.documentRecords[index],
      ...updates,
      content: updates.content !== undefined ? updates.content : db.documentRecords[index].content,
      title: updates.title !== undefined ? normalizeText(updates.title) : db.documentRecords[index].title,
      signed: updates.signed !== undefined ? Boolean(updates.signed) : db.documentRecords[index].signed,
      signedAt: updates.signedAt !== undefined ? updates.signedAt : db.documentRecords[index].signedAt,
    };

    logAction('document:update', { documentId, userId: user.id, changes: updates });
    return db.documentRecords[index];
  });
};

/**
 * Remove um documento (soft delete ou hard delete)
 */
export const deleteDocumentRecord = (user, documentId) => {
  requirePermission(user, 'agenda:write');
  return withDb((db) => {
    if (!Array.isArray(db.documentRecords)) {
      throw new Error('Documento não encontrado');
    }
    const index = db.documentRecords.findIndex((r) => r.id === documentId);
    if (index < 0) {
      throw new Error('Documento não encontrado');
    }

    db.documentRecords.splice(index, 1);
    logAction('document:delete', { documentId, userId: user.id });
    return true;
  });
};
