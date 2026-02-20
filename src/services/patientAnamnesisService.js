import { loadDb, withDb } from '../db/index.js';
import { normalizeText } from './helpers.js';

const ensurePatient = (db, patientId) => {
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

const ensureCollection = (db, key) => {
  if (!Array.isArray(db[key])) db[key] = [];
  return db[key];
};

const ensureRecord = (db, key, patientId, defaults = []) => {
  const list = ensureCollection(db, key);
  let record = list.find((item) => item.patient_id === patientId);
  if (!record) {
    record = { patient_id: patientId, answers: defaults };
    list.push(record);
  }
  return record;
};

export const getClinicalAnamnesis = (patientId, defaults = []) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  return ensureRecord(db, 'patientAnamnesisClinical', patientId, defaults);
};

export const getAtmAnamnesis = (patientId, defaults = []) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  return ensureRecord(db, 'patientAnamnesisAtm', patientId, defaults);
};

export const updateClinicalAnamnesis = (patientId, answers = []) => {
  return withDb((db) => {
    ensurePatient(db, patientId);
    const record = ensureRecord(db, 'patientAnamnesisClinical', patientId, []);
    record.answers = answers.map((item) => ({
      code: normalizeText(item.code),
      answer: normalizeText(item.answer),
      details: normalizeText(item.details),
    }));
    return record;
  });
};

export const updateAtmAnamnesis = (patientId, answers = []) => {
  return withDb((db) => {
    ensurePatient(db, patientId);
    const record = ensureRecord(db, 'patientAnamnesisAtm', patientId, []);
    record.answers = answers.map((item) => ({
      code: normalizeText(item.code),
      answer: normalizeText(item.answer),
      details: normalizeText(item.details),
    }));
    return record;
  });
};
