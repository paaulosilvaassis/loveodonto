/**
 * Serviço de exportação de pacientes (CSV e JSON completo).
 */
import { loadDb } from '../db/index.js';
import { getPatient } from './patientService.js';
import { getPatientRecord } from './patientRecordService.js';
import { listFiles } from './patientFilesService.js';
import { listDocumentRecords } from './documentService.js';
import { toCsv, parseDate } from './csvXlsxUtils.js';
import { logImportExport } from './importExportLogService.js';

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

function patientToFlatRow(p, record, docs, birth, education, phones, address, insurance, activity) {
  const primaryPhone = (phones || []).find((ph) => ph.is_primary) || (phones || [])[0];
  const mainAddr = (address || [])[0] || {};
  const ins = (insurance || [])[0] || {};
  const calcAge = (bd) => {
    if (!bd) return '';
    const d = new Date(bd);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    let a = today.getFullYear() - d.getFullYear();
    if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) a -= 1;
    return a >= 0 ? `${a} anos` : '';
  };
  return {
    unidade_origem: '',
    numero_prontuario: record?.record_number ?? '',
    numero_etiqueta: p.tags?.join?.(',') ?? '',
    nome_completo: p.full_name ?? '',
    nome_social: p.social_name ?? '',
    apelido: p.nickname ?? '',
    sexo: p.sex ?? '',
    cpf: onlyDigits(p.cpf) || '',
    rg: docs?.rg ?? '',
    email: docs?.personal_email ?? '',
    telefone: primaryPhone ? `(${primaryPhone.ddd}) ${primaryPhone.number}` : '',
    celular: primaryPhone ? `(${primaryPhone.ddd}) ${primaryPhone.number}` : '',
    endereco: [mainAddr.street, mainAddr.number].filter(Boolean).join(', '),
    bairro: mainAddr.neighborhood ?? '',
    cidade: mainAddr.city ?? '',
    cep: mainAddr.cep ?? '',
    estado: mainAddr.state ?? '',
    estado_civil: docs?.marital_status ?? '',
    escolaridade: education?.education_level ?? '',
    profissao: education?.profession ?? '',
    registro_conselho: '',
    data_nascimento: p.birth_date ?? '',
    local_nascimento: birth ? [birth.birth_city, birth.birth_state].filter(Boolean).join(' - ') : '',
    nacionalidade: birth?.nationality ?? '',
    idade: calcAge(p.birth_date),
    nome_responsavel: docs?.responsible_name ?? '',
    cpf_responsavel: docs?.responsible_phone ?? '',
    balanca_financeira: '',
    preferencia_dentista: record?.preferred_dentist ?? '',
    nome_convenio: ins.insurance_name ?? '',
    convenio_cartao: ins.membership_number ?? '',
    convenio_obs: ins.company_partner ?? '',
    data_cadastro: p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : '',
    campanha: '',
    captacao: '',
    indicacao: p.lead_source ?? '',
    indicacao_outros: '',
    tipo_sanguineo: '',
    cor_pele: '',
    cor_cabelos: '',
    cor_olhos: '',
    formato_rosto: '',
    data_ultimo_atendimento: activity?.last_appointment_at ? new Date(activity.last_appointment_at).toISOString().slice(0, 10) : '',
  };
}

export function exportPatientCsv(patientId, userId) {
  const patient = getPatient(patientId);
  if (!patient) throw new Error('Paciente não encontrado');
  const record = getPatientRecord(patientId);
  const row = patientToFlatRow(
    patient.profile,
    record,
    patient.documents,
    patient.birth,
    patient.education,
    patient.phones,
    patient.addresses,
    patient.insurances,
    patient.activity
  );
  const csv = toCsv([row]);
  logImportExport({ type: 'EXPORT', format: 'csv', count: 1, success: true, userId });
  return csv;
}

export function exportPatientJsonFull(patientId, userId) {
  const db = loadDb();
  const patient = getPatient(patientId);
  if (!patient) throw new Error('Paciente não encontrado');
  const record = getPatientRecord(patientId);
  const files = [...(listFiles(patientId) || []), ...(listFiles(patientId, { confidential: true }) || [])];
  const docRecords = listDocumentRecords({ patientId });
  const appointments = (db.appointments || []).filter((a) => a.patientId === patientId);
  const apptIds = new Set(appointments.map((a) => a.id));
  const clinicalAppointmentsFiltered = (db.clinicalAppointments || []).filter((ca) =>
    apptIds.has(ca.appointmentId)
  );
  const patientCharts = (db.patientCharts || []).filter((c) => c.patient_id === patientId);
  const clinicalEvents = (db.clinicalEvents || []).filter((e) => apptIds.has(e.appointmentId));

  const flat = patientToFlatRow(
    patient.profile,
    record,
    patient.documents,
    patient.birth,
    patient.education,
    patient.phones,
    patient.addresses,
    patient.insurances,
    patient.activity
  );

  const payload = {
    meta: {
      app: 'LOVE ODONTO',
      format: 'patient_full',
      exportedAt: new Date().toISOString(),
    },
    patient: {
      id: patient.profile.id,
      fields: flat,
      raw: {
        profile: patient.profile,
        documents: patient.documents,
        birth: patient.birth,
        education: patient.education,
        phones: patient.phones,
        addresses: patient.addresses,
        relationships: patient.relationships,
        insurances: patient.insurances,
        record,
        activity: patient.activity,
      },
    },
    records: {
      clinicalDevelopments: clinicalEvents,
      procedures: [],
      planning: clinicalAppointmentsFiltered.map((ca) => ({ ...ca, budget: ca.budget })),
      budgets: clinicalAppointmentsFiltered.filter((ca) => ca.budget).map((ca) => ca.budget),
      contracts: [],
      documents: docRecords,
      clinicalData: patientCharts,
      appointments,
    },
    files: files.map((f) => ({
      id: f.id,
      name: f.file_name,
      mime: f.mime_type,
      path: f.file_url || f.file_id,
      downloadUrl: f.file_url || '',
    })),
  };

  logImportExport({ type: 'EXPORT', format: 'json', count: 1, success: true, userId });
  return payload;
}

export function exportPatientsBatch(filters, userId) {
  const db = loadDb();
  let list = [...(db.patients || [])];

  if (filters.createdFrom || filters.createdTo) {
    list = list.filter((p) => {
      const created = p.created_at ? new Date(p.created_at).getTime() : 0;
      if (filters.createdFrom && created < new Date(filters.createdFrom).getTime()) return false;
      if (filters.createdTo && created > new Date(filters.createdTo + 'T23:59:59').getTime()) return false;
      return true;
    });
  }

  if (filters.insuranceName) {
    const insIds = (db.patientInsurances || [])
      .filter((i) => (i.insurance_name || '').toLowerCase().includes((filters.insuranceName || '').toLowerCase()))
      .map((i) => i.patient_id);
    list = list.filter((p) => insIds.includes(p.id));
  }

  if (filters.preferredDentist) {
    const recs = (db.patientRecords || []).filter((r) =>
      (r.preferred_dentist || '').toLowerCase().includes((filters.preferredDentist || '').toLowerCase())
    );
    const ids = new Set(recs.map((r) => r.patient_id));
    list = list.filter((p) => ids.has(p.id));
  }

  if (filters.leadSource) {
    list = list.filter((p) => (p.lead_source || '').toLowerCase().includes((filters.leadSource || '').toLowerCase()));
  }

  if (filters.captacao) {
    list = list.filter((p) => (p.lead_source || '').toLowerCase().includes((filters.captacao || '').toLowerCase()));
  }

  if (filters.city || filters.state) {
    const addrIds = (db.patientAddresses || []).filter((a) => {
      if (filters.city && (a.city || '').toLowerCase() !== (filters.city || '').toLowerCase()) return false;
      if (filters.state && (a.state || '').toUpperCase() !== (filters.state || '').toUpperCase()) return false;
      return true;
    }).map((a) => a.patient_id);
    list = list.filter((p) => addrIds.includes(p.id));
  }

  const rows = list.map((p) => {
    const pt = getPatient(p.id);
    const rec = getPatientRecord(p.id);
    return patientToFlatRow(
      pt?.profile || p,
      rec,
      pt?.documents,
      pt?.birth,
      pt?.education,
      pt?.phones,
      pt?.addresses,
      pt?.insurances,
      pt?.activity
    );
  });

  const csv = toCsv(rows);
  logImportExport({ type: 'EXPORT', format: 'csv', count: rows.length, success: true, userId });
  return { csv, json: rows, count: rows.length, format: 'csv' };
}
