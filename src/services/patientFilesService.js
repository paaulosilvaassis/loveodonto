import { loadDb, withDb } from '../db/index.js';
import { createId, normalizeText } from './helpers.js';

const ensurePatient = (db, patientId) => {
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

const normalizeFile = (payload, patientId, userId, isConfidential) => ({
  id: createId('file'),
  patient_id: patientId,
  category: normalizeText(payload.category),
  file_name: normalizeText(payload.file_name),
  mime_type: normalizeText(payload.mime_type),
  file_url: normalizeText(payload.file_url || ''),
  file_id: normalizeText(payload.file_id || ''),
  is_confidential: Boolean(isConfidential),
  uploaded_by: normalizeText(userId || ''),
  uploaded_at: new Date().toISOString(),
  validity: normalizeText(payload.validity || ''),
});

export const listFiles = (patientId, { confidential = false } = {}) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  const list = confidential ? db.patientConfidentialFiles || [] : db.patientFiles || [];
  return list.filter((item) => item.patient_id === patientId);
};

export const addFile = (patientId, payload, userId, { confidential = false } = {}) => {
  return withDb((db) => {
    ensurePatient(db, patientId);
    if (confidential) {
      db.patientConfidentialFiles = db.patientConfidentialFiles || [];
      const entry = normalizeFile(payload, patientId, userId, true);
      db.patientConfidentialFiles.unshift(entry);
      return entry;
    }
    db.patientFiles = db.patientFiles || [];
    const entry = normalizeFile(payload, patientId, userId, false);
    db.patientFiles.unshift(entry);
    return entry;
  });
};
