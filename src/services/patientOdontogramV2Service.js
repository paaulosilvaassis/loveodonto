import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

const ensurePatient = (db, patientId) => {
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

const ensureCollection = (db) => {
  if (!Array.isArray(db.patientOdontogramsV2)) db.patientOdontogramsV2 = [];
  return db.patientOdontogramsV2;
};

const ensureRecord = (db, patientId) => {
  ensureCollection(db);
  let record = db.patientOdontogramsV2.find((item) => item.patient_id === patientId);
  if (!record) {
    record = {
      id: createId('odonto-v2'),
      patient_id: patientId,
      teeth: {},
      history: [],
      updated_at: new Date().toISOString(),
      updated_by: '',
    };
    db.patientOdontogramsV2.push(record);
  }
  return record;
};

export const getOdontogramV2 = (patientId) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  return ensureRecord(db, patientId);
};

export const updateOdontogramV2 = (patientId, payload = {}, userId = '') => {
  return withDb((db) => {
    ensurePatient(db, patientId);
    const record = ensureRecord(db, patientId);
    record.teeth = payload.teeth || record.teeth || {};
    record.history = Array.isArray(payload.history) ? payload.history : record.history || [];
    record.updated_at = new Date().toISOString();
    record.updated_by = userId || '';
    return record;
  });
};
