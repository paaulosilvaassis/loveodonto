import { loadDb, withDb } from '../db/index.js';
import { recalcPendingData } from './patientService.js';
import { createId, normalizeText } from './helpers.js';

const ensurePatient = (db, patientId) => {
  if (!Array.isArray(db.patients)) {
    throw new Error(`Banco de dados inválido: pacientes não é um array`);
  }
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

const nextRecordNumber = (records) => {
  if (!Array.isArray(records)) return '00000001';
  const max = records.reduce((acc, item) => {
    const value = Number(String(item?.record_number || '').replace(/\D/g, '')) || 0;
    return Math.max(acc, value);
  }, 0);
  return String(max + 1).padStart(8, '0');
};

const ensureRecord = (db, patientId) => {
  if (!Array.isArray(db.patientRecords)) {
    db.patientRecords = [];
  }
  let record = db.patientRecords.find((item) => item.patient_id === patientId);
  if (!record) {
    record = {
      id: createId('record'),
      patient_id: patientId,
      record_number: nextRecordNumber(db.patientRecords),
      preferred_dentist: '',
      patient_type: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.patientRecords.push(record);
  }
  return record;
};

export const getPatientRecord = (patientId) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  return ensureRecord(db, patientId);
};

export const updatePatientRecord = (patientId, payload = {}) => {
  return withDb((db) => {
    try {
      ensurePatient(db, patientId);
      const record = ensureRecord(db, patientId);
      record.record_number = normalizeText(String(payload.record_number || record.record_number || ''));
      record.preferred_dentist = normalizeText(String(payload.preferred_dentist || ''));
      record.patient_type = normalizeText(String(payload.patient_type || ''));
      record.updated_at = new Date().toISOString();
      recalcPendingData(db, patientId);
      return record;
    } catch (error) {
      throw error;
    }
  });
};
