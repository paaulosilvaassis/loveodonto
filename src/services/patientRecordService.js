import { loadDb, withDb } from '../db/index.js';
import { createId, normalizeText } from './helpers.js';

const ensurePatient = (db, patientId) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientRecordService.js:4',message:'record ensure patient',data:{patientId,hasPatients:Array.isArray(db.patients),patientsCount:Array.isArray(db.patients) ? db.patients.length : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H12'})}).catch(()=>{});
  // #endregion
  if (!Array.isArray(db.patients)) {
    throw new Error(`Banco de dados inválido: pacientes não é um array`);
  }
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

const nextRecordNumber = (records) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientRecordService.js:13',message:'nextRecordNumber entry',data:{isArray:Array.isArray(records),recordsType:typeof records,recordsLength:Array.isArray(records) ? records.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H11'})}).catch(()=>{});
  // #endregion
  if (!Array.isArray(records)) return '00000001';
  const max = records.reduce((acc, item) => {
    const value = Number(String(item?.record_number || '').replace(/\D/g, '')) || 0;
    return Math.max(acc, value);
  }, 0);
  return String(max + 1).padStart(8, '0');
};

const ensureRecord = (db, patientId) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientRecordService.js:22',message:'ensureRecord entry',data:{patientId,hasPatientRecords:Array.isArray(db.patientRecords),patientRecordsType:typeof db.patientRecords,patientRecordsLength:Array.isArray(db.patientRecords) ? db.patientRecords.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H11'})}).catch(()=>{});
  // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientRecordService.js:48',message:'record update start',data:{patientId,recordNumber:record.record_number || null,payloadRecord:payload?.record_number || null,payloadPreferred:payload?.preferred_dentist || null,payloadType:payload?.patient_type || null},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H9'})}).catch(()=>{});
      // #endregion
      record.record_number = normalizeText(String(payload.record_number || record.record_number || ''));
      record.preferred_dentist = normalizeText(String(payload.preferred_dentist || ''));
      record.patient_type = normalizeText(String(payload.patient_type || ''));
      record.updated_at = new Date().toISOString();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientRecordService.js:57',message:'record update end',data:{patientId,recordNumber:record.record_number || null},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H9'})}).catch(()=>{});
      // #endregion
      return record;
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientRecordService.js:63',message:'record update error',data:{patientId,message:String(error?.message || error)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H9'})}).catch(()=>{});
      // #endregion
      throw error;
    }
  });
};
