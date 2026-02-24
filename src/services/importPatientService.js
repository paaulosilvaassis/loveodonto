/**
 * Serviço de importação de pacientes (CSV, XLSX, JSON).
 */
import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { isCpfValid, onlyDigits } from '../utils/validators.js';
import { parseCsvText, parseXlsxFile, parseDate, getCanonicalHeaderMap, normalizeParsedRows } from './csvXlsxUtils.js';
import { createPatientFromImport, createPatientQuick, createPatientsFromImportBatch, CRITICAL_FIELDS, updatePatientProfile, updatePatientDocuments, updatePatientBirth, updatePatientEducation, addPatientPhone, addPatientAddress, addPatientInsurance, updatePatientPendingData } from './patientService.js';
import { updatePatientRecord } from './patientRecordService.js';
import { logImportExport } from './importExportLogService.js';

const normalize = (v) => String(v ?? '').trim();
const normCpf = (v) => onlyDigits(v);

/** Mapeia nome de coluna para chave normalizada (aceita variações) */
const colMap = {
  unidade_origem: 'unidade_origem',
  numero_prontuario: 'numero_prontuario',
  numero_etiqueta: 'numero_etiqueta',
  nome_completo: 'nome_completo',
  nome_social: 'nome_social',
  apelido: 'apelido',
  sexo: 'sexo',
  cpf: 'cpf',
  rg: 'rg',
  email: 'email',
  telefone: 'telefone',
  celular: 'celular',
  endereco: 'endereco',
  bairro: 'bairro',
  cidade: 'cidade',
  cep: 'cep',
  estado: 'estado',
  estado_civil: 'estado_civil',
  escolaridade: 'escolaridade',
  profissao: 'profissao',
  data_nascimento: 'data_nascimento',
  local_nascimento: 'local_nascimento',
  nacionalidade: 'nacionalidade',
  nome_responsavel: 'nome_responsavel',
  preferencia_dentista: 'preferencia_dentista',
  nome_convenio: 'nome_convenio',
  convenio_cartao: 'convenio_cartao',
  convenio_obs: 'convenio_obs',
  data_cadastro: 'data_cadastro',
  indicacao: 'indicacao',
};

function getRowKey(row, key) {
  if (row == null || typeof row !== 'object') return '';
  const k = colMap[key] || key;
  try {
    return String(row[k] ?? row[key] ?? row[key.replace(/_/g, ' ')] ?? '').trim();
  } catch {
    return '';
  }
}

/** Linha é válida para importar se tiver pelo menos: nome completo OU CPF (11 dígitos) OU telefone/celular (10+ dígitos). Evita criar paciente 100% vazio. */
export function isRowValidForImport(row) {
  if (row == null || typeof row !== 'object') return false;
  const nome = getRowKey(row, 'nome_completo');
  const cpf = onlyDigits(getRowKey(row, 'cpf'));
  const tel = onlyDigits(getRowKey(row, 'telefone'));
  const cel = onlyDigits(getRowKey(row, 'celular'));
  if (nome && nome.length > 0) return true;
  if (cpf && cpf.length === 11) return true;
  if ((tel && tel.length >= 10) || (cel && cel.length >= 10)) return true;
  return false;
}

/**
 * Valida uma linha e retorna pendências (avisos) e falhas reais (formato inválido).
 * Nada aqui bloqueia a importação; falhas reais são apenas informativas (ex.: CPF digitado errado).
 */
export function validateRow(row, index) {
  const warnings = [];
  const realErrors = [];
  if (row == null || typeof row !== 'object') {
    warnings.push('Linha sem dados');
    return { warnings, realErrors };
  }
  const nome = getRowKey(row, 'nome_completo');
  const cpf = normCpf(getRowKey(row, 'cpf'));
  const birth = parseDate(getRowKey(row, 'data_nascimento')) || getRowKey(row, 'data_nascimento');
  const sex = getRowKey(row, 'sexo');

  if (!nome) warnings.push('Nome completo vazio');
  if (cpf && !isCpfValid(cpf)) realErrors.push('CPF inválido');
  if (birth) {
    const d = new Date(birth);
    if (Number.isNaN(d.getTime())) realErrors.push('Data de nascimento inválida');
  } else if (!getRowKey(row, 'data_nascimento')) {
    warnings.push('Data de nascimento vazia');
  }
  if (!sex) warnings.push('Sexo vazio');

  return { warnings, realErrors };
}

const isMinor = (birthDate) => {
  if (!birthDate) return false;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age < 18;
};

/** Retorna { pendingFields, pendingCriticalFields } para a linha (campos faltando). */
function getPendingFieldsFromRow(row) {
  if (row == null || typeof row !== 'object') {
    return { pendingFields: [], pendingCriticalFields: [] };
  }
  const pending = [];
  const nome = getRowKey(row, 'nome_completo');
  const cpf = normCpf(getRowKey(row, 'cpf'));
  const rg = getRowKey(row, 'rg');
  const sex = getRowKey(row, 'sexo');
  const birthRaw = getRowKey(row, 'data_nascimento');
  const birth = parseDate(birthRaw) && !Number.isNaN(new Date(parseDate(birthRaw)).getTime()) ? parseDate(birthRaw) : null;
  const email = getRowKey(row, 'email');
  const tel = getRowKey(row, 'telefone');
  const cel = getRowKey(row, 'celular');
  const endereco = getRowKey(row, 'endereco');
  const cidade = getRowKey(row, 'cidade');
  const cep = getRowKey(row, 'cep');
  const estado = getRowKey(row, 'estado');
  const record = getRowKey(row, 'numero_prontuario');
  const nomeResp = getRowKey(row, 'nome_responsavel');

  if (!nome) pending.push('full_name');
  const hasCpf = cpf && isCpfValid(cpf);
  const hasRg = Boolean(rg && String(rg).trim());
  if (!hasCpf && !hasRg) pending.push('cpf_or_rg');
  if (!hasCpf) pending.push('cpf');
  if (!sex) pending.push('sex');
  if (!birth) pending.push('birth_date');
  if (!email) pending.push('personal_email');
  const hasPhone = Boolean((tel && String(tel).replace(/\D/g, '').length >= 10) || (cel && String(cel).replace(/\D/g, '').length >= 10));
  if (!hasPhone) pending.push('phone');
  const hasAddressMin = (endereco && cidade && cep) || (cidade && estado);
  if (!hasAddressMin) {
    pending.push('address_min');
    if (!endereco) pending.push('street');
    if (!cidade) pending.push('city');
    if (!cep) pending.push('cep');
    if (!estado) pending.push('state');
  } else {
    if (!endereco) pending.push('street');
    if (!cidade) pending.push('city');
    if (!estado) pending.push('state');
    if (!cep) pending.push('cep');
  }
  if (!record) pending.push('record_number');
  // preferred_dentist e insurance_name são opcionais (não entram em pending)

  const minor = isMinor(birth);
  if (minor) {
    if (!nomeResp) pending.push('responsible_name');
    pending.push('responsible_cpf'); // CSV normalmente não tem CPF responsável; marcar como pendente
  }

  const pendingCriticalFields = CRITICAL_FIELDS.filter((f) => pending.includes(f));
  return { pendingFields: [...new Set(pending)], pendingCriticalFields };
}

/** Converte linha CSV/XLSX para payload de paciente */
function rowToPayload(row, conflictMode) {
  if (row == null || typeof row !== 'object') {
    row = {};
  }
  const nome = getRowKey(row, 'nome_completo') || 'Paciente';
  const cpfRaw = getRowKey(row, 'cpf');
  let cpf = normCpf(cpfRaw);
  if (!cpf) cpf = String(Date.now()).slice(-11).padStart(11, '0');
  const birth = parseDate(getRowKey(row, 'data_nascimento')) || '1990-01-01';
  const sex = getRowKey(row, 'sexo') || 'N';

  return {
    full_name: nome,
    nickname: getRowKey(row, 'apelido') || getRowKey(row, 'nome_social'),
    social_name: getRowKey(row, 'nome_social'),
    sex: sex.slice(0, 1).toUpperCase(),
    birth_date: birth,
    cpf,
    record_number: getRowKey(row, 'numero_prontuario'),
    preferred_dentist: getRowKey(row, 'preferencia_dentista'),
    documents: {
      rg: getRowKey(row, 'rg'),
      personal_email: getRowKey(row, 'email'),
      marital_status: getRowKey(row, 'estado_civil'),
      mother_name: getRowKey(row, 'mother_name'),
      father_name: getRowKey(row, 'father_name'),
      responsible_name: getRowKey(row, 'nome_responsavel'),
    },
    birth: {
      nationality: getRowKey(row, 'nacionalidade') || 'Brasil',
      birth_city: (String(getRowKey(row, 'local_nascimento')).split('-')[0] || '').trim() || '',
      birth_state: (String(getRowKey(row, 'local_nascimento')).split('-')[1] || '').trim().slice(0, 2) || '',
    },
    education: {
      education_level: getRowKey(row, 'escolaridade'),
      profession: getRowKey(row, 'profissao'),
    },
    phone: getRowKey(row, 'celular') || getRowKey(row, 'telefone'),
    address: {
      type: 'residencial',
      street: getRowKey(row, 'endereco'),
      number: '',
      neighborhood: getRowKey(row, 'bairro'),
      city: getRowKey(row, 'cidade'),
      cep: getRowKey(row, 'cep'),
      state: getRowKey(row, 'estado') || '',
    },
    insurance: {
      insurance_name: getRowKey(row, 'nome_convenio'),
      membership_number: getRowKey(row, 'convenio_cartao'),
      company_partner: getRowKey(row, 'convenio_obs'),
    },
    lead_source: getRowKey(row, 'indicacao'),
    tags: getRowKey(row, 'numero_etiqueta') ? [getRowKey(row, 'numero_etiqueta')] : [],
  };
}

/** Encontra paciente existente pelo conflito */
function findExistingPatient(db, row, conflictMode) {
  const cpf = normCpf(getRowKey(row, 'cpf'));
  const recordNum = getRowKey(row, 'numero_prontuario');

  if (conflictMode === 'update_cpf' && cpf) {
    return db.patients.find((p) => normCpf(p.cpf) === cpf) || null;
  }
  if (conflictMode === 'update_record' && recordNum) {
    const rec = (db.patientRecords || []).find((r) => String(r.record_number || '') === String(recordNum));
    return rec ? db.patients.find((p) => p.id === rec.patient_id) : null;
  }
  if (conflictMode === 'merge') {
    if (cpf) {
      const byCpf = db.patients.find((p) => normCpf(p.cpf) === cpf);
      if (byCpf) return byCpf;
    }
    if (recordNum) {
      const rec = (db.patientRecords || []).find((r) => String(r.record_number || '') === String(recordNum));
      if (rec) return db.patients.find((p) => p.id === rec.patient_id) || null;
    }
  }
  return null;
}

const CHUNK_SIZE = 300;
const BATCH_CREATE_SIZE = 200;
const MAX_ROWS_PER_IMPORT = 10000;
const YIELD_EVERY = 10;

function yieldToMain() {
  return new Promise((r) => setTimeout(r, 0));
}

/** Importa CSV ou XLSX em chunks: parse → validar em chunks → salvar em batch/updates com progresso e cancelamento. */
export async function importFromCsvOrXlsx(file, user, conflictMode = 'create', options = {}) {
  const { onProgress = () => {}, getCancelRequested = () => false } = options;
  const ext = (file.name || '').toLowerCase();
  let rows = [];
  try {
    onProgress({ phase: 'reading', current: 0, total: 1, message: 'Lendo arquivo…' });
    if (ext.endsWith('.csv')) {
      const text = await file.text();
      rows = parseCsvText(text);
    } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      rows = await parseXlsxFile(file);
    } else {
      throw new Error('Formato não suportado. Use CSV ou XLSX.');
    }
  } catch (parseErr) {
    throw parseErr;
  }

  const rawRows = Array.isArray(rows) ? rows : [];
  const rawHeaders = rawRows.length && typeof rawRows[0] === 'object' ? Object.keys(rawRows[0]) : [];
  const headerMap = getCanonicalHeaderMap(rawHeaders);
  const safeRows = normalizeParsedRows(rawRows, headerMap);
  const totalRowsInFile = safeRows.length;
  const toProcessTotal = Math.min(totalRowsInFile, MAX_ROWS_PER_IMPORT);
  const truncated = totalRowsInFile > MAX_ROWS_PER_IMPORT;

  let created = 0;
  let updated = 0;
  let withPending = 0;
  let ignored = 0;
  const importErrors = [];
  const createBatch = [];

  for (let chunkStart = 0; chunkStart < toProcessTotal; chunkStart += CHUNK_SIZE) {
    if (getCancelRequested()) break;

    onProgress({ phase: 'validating', current: chunkStart, total: toProcessTotal, message: `Validando ${Math.min(chunkStart + CHUNK_SIZE, toProcessTotal)} / ${toProcessTotal}…` });
    await yieldToMain();

    const chunk = safeRows.slice(chunkStart, chunkStart + CHUNK_SIZE);
    const validatedChunk = chunk.map((row, i) => {
      try {
        const { pendingFields = [], pendingCriticalFields = [] } = getPendingFieldsFromRow(row);
        const { warnings = [], realErrors = [] } = validateRow(row, chunkStart + i);
        return {
          row: row != null && typeof row === 'object' ? row : {},
          index: chunkStart + i + 1,
          warnings,
          realErrors,
          pendingFields,
          pendingCriticalFields,
        };
      } catch (err) {
        return {
          row: row != null && typeof row === 'object' ? row : {},
          index: chunkStart + i + 1,
          warnings: ['Linha com dados inválidos'],
          realErrors: [err?.message || 'Erro ao processar linha'],
          pendingFields: [],
          pendingCriticalFields: [],
        };
      }
    });

    onProgress({ phase: 'saving', current: chunkStart, total: toProcessTotal, message: `Processando ${chunkStart + validatedChunk.length} / ${toProcessTotal}…` });

    for (let i = 0; i < validatedChunk.length; i++) {
      if (getCancelRequested()) break;
      if (i > 0 && i % YIELD_EVERY === 0) await yieldToMain();

      const item = validatedChunk[i];
      const { row, index, pendingFields = [], pendingCriticalFields = [] } = item;
      try {
        if (!isRowValidForImport(row)) {
          ignored++;
          onProgress({ phase: 'saving', current: chunkStart + i + 1, total: toProcessTotal, message: `Processando ${chunkStart + i + 1} / ${toProcessTotal}…`, liveItem: { type: 'ignored', line: index, message: `Linha ${index} (sem dados mínimos)` } });
          continue;
        }

        const db = loadDb();
        const existing = findExistingPatient(db, row, conflictMode);

        if (existing && (conflictMode === 'update_cpf' || conflictMode === 'update_record' || conflictMode === 'merge')) {
          const payload = rowToPayload(row, conflictMode);
          updatePatientProfile(user, existing.id, {
            full_name: payload.full_name,
            nickname: payload.nickname,
            social_name: payload.social_name,
            sex: payload.sex,
            birth_date: payload.birth_date,
            cpf: payload.cpf,
            lead_source: payload.lead_source,
            tags: payload.tags,
          });
          updatePatientDocuments(user, existing.id, payload.documents);
          updatePatientBirth(user, existing.id, payload.birth);
          updatePatientEducation(user, existing.id, payload.education);
          updatePatientRecord(existing.id, { record_number: payload.record_number, preferred_dentist: payload.preferred_dentist });
          if (payload.phone) {
            const digits = onlyDigits(payload.phone);
            if (digits.length >= 10) {
              try {
                addPatientPhone(user, existing.id, { ddd: digits.slice(0, 2), number: digits.slice(2, 11), is_primary: true, is_whatsapp: true });
              } catch (_) {}
            }
          }
          if (payload.address?.street || payload.address?.city) {
            try { addPatientAddress(user, existing.id, payload.address); } catch (_) {}
          }
          if (payload.insurance?.insurance_name) {
            try { addPatientInsurance(user, existing.id, payload.insurance); } catch (_) {}
          }
          if (pendingFields.length > 0) {
            updatePatientPendingData(user, existing.id, true, pendingFields, pendingCriticalFields);
            withPending++;
          }
          updated++;
          const name = (payload.full_name || '').trim() || 'Sem nome';
          onProgress({ phase: 'saving', current: chunkStart + i + 1, total: toProcessTotal, message: `Processando ${chunkStart + i + 1} / ${toProcessTotal}…`, liveItem: { type: pendingFields.length ? 'imported_pending' : 'imported', line: index, name, message: pendingFields.length ? `faltando: ${pendingFields.slice(0, 3).join(', ')}` : null } });
        } else {
          const payload = rowToPayload(row, conflictMode);
          createBatch.push({ payload, pendingFields, index });
          if (createBatch.length >= BATCH_CREATE_SIZE) {
            const { patientIds } = createPatientsFromImportBatch(user, createBatch.map((x) => ({ payload: x.payload, pendingFields: x.pendingFields })));
            created += patientIds.length;
            if (createBatch.some((x) => x.pendingFields.length > 0)) withPending += createBatch.filter((x) => x.pendingFields.length > 0).length;
            createBatch.forEach((x) => {
              const name = (x.payload.full_name || '').trim() || 'Sem nome';
              onProgress({ phase: 'saving', current: chunkStart + i + 1, total: toProcessTotal, message: `Processando ${chunkStart + i + 1} / ${toProcessTotal}…`, liveItem: { type: x.pendingFields.length ? 'imported_pending' : 'imported', line: x.index, name, message: x.pendingFields.length ? `faltando: ${x.pendingFields.slice(0, 3).join(', ')}` : null } });
            });
            createBatch.length = 0;
            await yieldToMain();
            onProgress({ phase: 'saving', current: chunkStart + i + 1, total: toProcessTotal, message: `Processando ${chunkStart + i + 1} / ${toProcessTotal}…` });
          }
        }
      } catch (err) {
        importErrors.push({ row: index, errors: [err?.message || 'Erro ao processar linha'] });
        onProgress({ phase: 'saving', current: chunkStart + i + 1, total: toProcessTotal, message: `Processando ${chunkStart + i + 1} / ${toProcessTotal}…`, liveItem: { type: 'error', line: index, message: err?.message || 'Erro ao processar linha' } });
      }
    }
  }

  if (createBatch.length > 0 && !getCancelRequested()) {
    try {
      const { patientIds } = createPatientsFromImportBatch(user, createBatch.map((x) => ({ payload: x.payload, pendingFields: x.pendingFields })));
      created += patientIds.length;
      if (createBatch.some((x) => x.pendingFields.length > 0)) withPending += createBatch.filter((x) => x.pendingFields.length > 0).length;
      createBatch.forEach((x) => {
        const name = (x.payload.full_name || '').trim() || 'Sem nome';
        onProgress({ phase: 'saving', current: toProcessTotal, total: toProcessTotal, message: 'Finalizando…', liveItem: { type: x.pendingFields.length ? 'imported_pending' : 'imported', line: x.index, name, message: x.pendingFields.length ? `faltando: ${x.pendingFields.slice(0, 3).join(', ')}` : null } });
      });
    } catch (err) {
      importErrors.push({ row: 'batch', errors: [err?.message || 'Erro ao salvar lote'] });
    }
  }

  logImportExport({
    type: 'IMPORT',
    format: ext.endsWith('.csv') ? 'csv' : 'xlsx',
    count: created + updated,
    success: true,
    userId: user?.id,
    errors: importErrors.length > 0 ? importErrors.map((e) => `Linha ${e.row}: ${e.errors.join(', ')}`) : null,
  });

  return { created, updated, ignored, errors: importErrors, withPending, truncated, totalRowsInFile, headerMap };
}

/** Importa JSON completo */
export async function importFromJson(file, user, conflictMode = 'create') {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Arquivo JSON inválido.');
  }

  const patient = data.patient || data;
  const fields = patient.fields || patient;
  const raw = patient.raw || patient;

  const nome = fields.nome_completo || raw.full_name || 'Paciente';
  const cpf = normCpf(fields.cpf || raw.cpf) || String(Date.now()).slice(-11).padStart(11, '0');
  const birth = parseDate(fields.data_nascimento || raw.birth_date) || '1990-01-01';
  const sex = (fields.sexo || raw.sex || 'N').slice(0, 1).toUpperCase();

  const db = loadDb();
  let existing = null;
  if (conflictMode === 'update_cpf' && cpf) {
    existing = db.patients.find((p) => normCpf(p.cpf) === cpf);
  }
  if (conflictMode === 'update_record' && (fields.numero_prontuario || raw.record_number)) {
    const rec = (db.patientRecords || []).find(
      (r) => String(r.record_number || '') === String(fields.numero_prontuario || raw.record_number || '')
    );
    existing = rec ? db.patients.find((p) => p.id === rec.patient_id) : null;
  }

  let patientId;
  if (existing && (conflictMode === 'update_cpf' || conflictMode === 'update_record')) {
    patientId = existing.id;
    await updatePatientProfile(user, patientId, {
      full_name: nome,
      nickname: fields.apelido || raw.nickname,
      social_name: fields.nome_social || raw.social_name,
      sex,
      birth_date: birth,
      cpf,
      lead_source: fields.indicacao || raw.lead_source,
      tags: raw.tags || [],
    });
    const docs = raw.documents || {};
    updatePatientDocuments(user, patientId, {
      rg: fields.rg || docs.rg,
      personal_email: fields.email || docs.personal_email,
      marital_status: fields.estado_civil || docs.marital_status,
      mother_name: docs.mother_name,
      father_name: docs.father_name,
      responsible_name: fields.nome_responsavel || docs.responsible_name,
    });
    const birthData = raw.birth || {};
    updatePatientBirth(user, patientId, {
      nationality: fields.nacionalidade || birthData.nationality,
      birth_city: (fields.local_nascimento || '').split('-')[0]?.trim() || birthData.birth_city,
      birth_state: (fields.local_nascimento || '').split('-')[1]?.trim().slice(0, 2) || birthData.birth_state,
    });
    const edu = raw.education || {};
    updatePatientEducation(user, patientId, {
      education_level: fields.escolaridade || edu.education_level,
      profession: fields.profissao || edu.profession,
    });
    updatePatientRecord(patientId, {
      record_number: fields.numero_prontuario || raw.record_number,
      preferred_dentist: fields.preferencia_dentista || raw.preferred_dentist,
    });
  } else {
    const { patientId: pid } = createPatientQuick(user, {
      full_name: nome,
      nickname: fields.apelido || raw.nickname,
      social_name: fields.nome_social || raw.social_name,
      sex,
      birth_date: birth,
      cpf,
      lead_source: fields.indicacao || raw.lead_source,
      tags: raw.tags || [],
    });
    patientId = pid;
    const docs = raw.documents || {};
    updatePatientDocuments(user, patientId, {
      rg: fields.rg || docs.rg,
      personal_email: fields.email || docs.personal_email,
      marital_status: fields.estado_civil || docs.marital_status,
      mother_name: docs.mother_name,
      father_name: docs.father_name,
      responsible_name: fields.nome_responsavel || docs.responsible_name,
    });
    const birthData = raw.birth || {};
    updatePatientBirth(user, patientId, {
      nationality: fields.nacionalidade || birthData.nationality,
      birth_city: (fields.local_nascimento || '').split('-')[0]?.trim() || birthData.birth_city,
      birth_state: (fields.local_nascimento || '').split('-')[1]?.trim().slice(0, 2) || birthData.birth_state,
    });
    const edu = raw.education || {};
    updatePatientEducation(user, patientId, {
      education_level: fields.escolaridade || edu.education_level,
      profession: fields.profissao || edu.profession,
    });
    updatePatientRecord(patientId, {
      record_number: fields.numero_prontuario || raw.record_number,
      preferred_dentist: fields.preferencia_dentista || raw.preferred_dentist,
    });
  }

  logImportExport({ type: 'IMPORT', format: 'json', count: 1, success: true, userId: user?.id });
  return { created: existing ? 0 : 1, updated: existing ? 1 : 0, patientId };
}
