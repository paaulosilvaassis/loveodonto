import { loadDb, withDb } from '../db/index.js';
import { createId, normalizeText } from './helpers.js';

const ensurePatient = (db, patientId) => {
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

const ensureCollections = (db) => {
  if (!Array.isArray(db.patientOdontograms)) db.patientOdontograms = [];
  if (!Array.isArray(db.patientOdontogramHistory)) db.patientOdontogramHistory = [];
};

const ensureRecord = (db, patientId) => {
  ensureCollections(db);
  let record = db.patientOdontograms.find((item) => item.patient_id === patientId);
  if (!record) {
    record = {
      id: createId('odonto'),
      patient_id: patientId,
      tooth_status: {},
      updated_by: '',
      updated_at: new Date().toISOString(),
    };
    db.patientOdontograms.push(record);
  }
  return record;
};

export const getOdontogram = (patientId) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  return ensureRecord(db, patientId);
};

export const updateOdontogram = (patientId, payload, userId) => {
  return withDb((db) => {
    ensurePatient(db, patientId);
    const record = ensureRecord(db, patientId);
    const previous = record.tooth_status;
    record.tooth_status = payload.tooth_status || {};
    record.updated_by = normalizeText(userId || '');
    record.updated_at = new Date().toISOString();
    db.patientOdontogramHistory.unshift({
      id: createId('odonto-hist'),
      patient_id: patientId,
      tooth: normalizeText(payload.tooth || ''),
      action: normalizeText(payload.action || ''),
      previous_value: payload.previous_value || previous || {},
      new_value: payload.new_value || payload.tooth_status || {},
      note: normalizeText(payload.note || ''),
      user_id: normalizeText(userId || ''),
      at: new Date().toISOString(),
    });
    if (db.patientOdontogramHistory.length > 5000) {
      db.patientOdontogramHistory = db.patientOdontogramHistory.slice(0, 5000);
    }
    return record;
  });
};

export const listOdontogramHistory = (patientId) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  ensureCollections(db);
  return db.patientOdontogramHistory.filter((item) => item.patient_id === patientId);
};
