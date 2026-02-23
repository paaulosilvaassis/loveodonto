/**
 * Serviço de log de importações e exportações.
 */
import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

export function logImportExport({ type, format, count, success, userId, errors }) {
  const entry = {
    id: createId('iel'),
    type: type || 'EXPORT',
    format: format || 'csv',
    count: count ?? 0,
    success: Boolean(success),
    userId: userId || null,
    errors: errors || null,
    createdAt: new Date().toISOString(),
  };
  withDb((db) => {
    db.importExportLogs = db.importExportLogs || [];
    db.importExportLogs.unshift(entry);
    if (db.importExportLogs.length > 200) {
      db.importExportLogs = db.importExportLogs.slice(0, 200);
    }
    return db;
  });
  return entry;
}

export function listImportExportLogs(limit = 50) {
  const db = loadDb();
  const list = (db.importExportLogs || []).slice(0, limit);
  return list;
}
