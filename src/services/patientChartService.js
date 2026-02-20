import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

const ensurePatient = (db, patientId) => {
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

const ensureChart = (db, patientId) => {
  db.patientCharts = db.patientCharts || [];
  let chart = db.patientCharts.find((item) => item.patient_id === patientId);
  if (!chart) {
    chart = {
      id: createId('chart'),
      patient_id: patientId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.patientCharts.push(chart);
  }
  return chart;
};

export const getPatientChart = (patientId) => {
  const db = loadDb();
  ensurePatient(db, patientId);
  const chart = ensureChart(db, patientId);
  return chart;
};

export const touchPatientChart = (patientId) => {
  return withDb((db) => {
    ensurePatient(db, patientId);
    const chart = ensureChart(db, patientId);
    chart.updated_at = new Date().toISOString();
    return chart;
  });
};
