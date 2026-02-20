import { loadDb, withDb } from '../db/index.js';
import { normalizeText } from './helpers.js';

const ensurePatient = (db, patientId) => {
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

const ensureCharacteristics = (db, patientId) => {
  db.patientCharacteristics = db.patientCharacteristics || [];
  let record = db.patientCharacteristics.find((item) => item.patient_id === patientId);
  if (!record) {
    record = {
      patient_id: patientId,
      blood_type: '',
      skin_color: '',
      hair_color: '',
      eye_color: '',
      face_shape: '',
    };
    db.patientCharacteristics.push(record);
  }
  return record;
};

export const getCharacteristics = (patientId) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  return ensureCharacteristics(db, patientId);
};

export const updateCharacteristics = (patientId, payload = {}) => {
  return withDb((db) => {
    ensurePatient(db, patientId);
    const record = ensureCharacteristics(db, patientId);
    record.blood_type = normalizeText(payload.blood_type);
    record.skin_color = normalizeText(payload.skin_color);
    record.hair_color = normalizeText(payload.hair_color);
    record.eye_color = normalizeText(payload.eye_color);
    record.face_shape = normalizeText(payload.face_shape);
    return record;
  });
};
