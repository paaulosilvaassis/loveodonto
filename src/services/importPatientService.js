/**
 * Serviço de importação de pacientes (CSV, XLSX, JSON).
 */
import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { isCpfValid, onlyDigits } from '../utils/validators.js';
import { parseCsvText, parseXlsxFile, parseDate } from './csvXlsxUtils.js';
import { createPatientFromImport, createPatientQuick, CRITICAL_FIELDS, updatePatientProfile, updatePatientDocuments, updatePatientBirth, updatePatientEducation, addPatientPhone, addPatientAddress, addPatientInsurance, updatePatientPendingData } from './patientService.js';
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
  const dentista = getRowKey(row, 'preferencia_dentista');
  const convenio = getRowKey(row, 'nome_convenio');
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
  if (!dentista) pending.push('preferred_dentist');
  if (!convenio) pending.push('insurance_name');

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

/** Importa CSV ou XLSX (array de linhas). Não bloqueia por erros de validação. */
export async function importFromCsvOrXlsx(file, user, conflictMode = 'create') {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'importPatientService.js:importFromCsvOrXlsx',message:'import entry',data:{ext:(file?.name||'').toLowerCase().slice(-5),user:!!user,userId:user?.id,conflictMode},timestamp:Date.now(),runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  const ext = (file.name || '').toLowerCase();
  let rows = [];
  try {
  if (ext.endsWith('.csv')) {
    const text = await file.text();
    rows = parseCsvText(text);
  } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
    rows = await parseXlsxFile(file);
  } else {
    throw new Error('Formato não suportado. Use CSV ou XLSX.');
  }
  } catch (parseErr) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'importPatientService.js:importFromCsvOrXlsx',message:'parse error',data:{errMsg:parseErr?.message},timestamp:Date.now(),runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    throw parseErr;
  }
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'importPatientService.js:importFromCsvOrXlsx',message:'parse done',data:{rowsCount:rows.length,isArray:Array.isArray(rows)},timestamp:Date.now(),runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion

  const safeRows = Array.isArray(rows) ? rows : [];
  const validated = safeRows.map((row, i) => {
    try {
      const { pendingFields = [], pendingCriticalFields = [] } = getPendingFieldsFromRow(row);
      const { warnings = [], realErrors = [] } = validateRow(row, i);
      return {
        row: row != null && typeof row === 'object' ? row : {},
        index: i + 1,
        warnings,
        realErrors,
        pendingFields,
        pendingCriticalFields,
      };
    } catch (err) {
      return {
        row: row != null && typeof row === 'object' ? row : {},
        index: i + 1,
        warnings: ['Linha com dados inválidos'],
        realErrors: [err?.message || 'Erro ao processar linha'],
        pendingFields: [],
        pendingCriticalFields: [],
      };
    }
  });
  const toImport = validated;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'importPatientService.js:importFromCsvOrXlsx',message:'validated done',data:{toImportLen:toImport.length},timestamp:Date.now(),runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion

  let created = 0;
  let updated = 0;
  let withPending = 0;
  const importErrors = [];

  for (const item of toImport) {
    const { row, index, pendingFields = [], pendingCriticalFields = [] } = item;
    try {
      const db = loadDb();
      const existing = findExistingPatient(db, row, conflictMode);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'importPatientService.js:importFromCsvOrXlsx',message:'loop row',data:{index,hasExisting:!!existing},timestamp:Date.now(),runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion

      if (existing && (conflictMode === 'update_cpf' || conflictMode === 'update_record' || conflictMode === 'merge')) {
        const payload = rowToPayload(row, conflictMode);
        await updatePatientProfile(user, existing.id, {
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
            addPatientPhone(user, existing.id, {
              ddd: digits.slice(0, 2),
              number: digits.slice(2, 11),
              is_primary: true,
              is_whatsapp: true,
            });
          } catch (_) {}
        }
      }
      if (payload.address?.street || payload.address?.city) {
        try {
          addPatientAddress(user, existing.id, payload.address);
        } catch (_) {}
      }
      if (payload.insurance?.insurance_name) {
        try {
          addPatientInsurance(user, existing.id, payload.insurance);
        } catch (_) {}
      }
      if (pendingFields.length > 0) {
        updatePatientPendingData(user, existing.id, true, pendingFields, pendingCriticalFields);
        withPending++;
      }
        updated++;
      } else {
        const payload = rowToPayload(row, conflictMode);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'importPatientService.js:createPatientFromImport call',message:'before create',data:{index,user:!!user},timestamp:Date.now(),runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        const { patientId } = createPatientFromImport(user, payload, pendingFields);
        updatePatientDocuments(user, patientId, payload.documents);
        updatePatientBirth(user, patientId, payload.birth);
        updatePatientEducation(user, patientId, payload.education);
        updatePatientRecord(patientId, { record_number: payload.record_number, preferred_dentist: payload.preferred_dentist });
        if (payload.phone) {
          const digits = onlyDigits(payload.phone);
          if (digits.length >= 10) {
            try {
              addPatientPhone(user, patientId, {
                ddd: digits.slice(0, 2),
                number: digits.slice(2, 11),
                is_primary: true,
                is_whatsapp: true,
              });
            } catch (_) {}
          }
        }
        if (payload.address?.street || payload.address?.city) {
          try {
            addPatientAddress(user, patientId, payload.address);
          } catch (_) {}
        }
        if (payload.insurance?.insurance_name) {
          try {
            addPatientInsurance(user, patientId, payload.insurance);
          } catch (_) {}
        }
        if (pendingFields.length > 0) withPending++;
        created++;
      }
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'importPatientService.js:importFromCsvOrXlsx',message:'loop row catch',data:{index,errMsg:err?.message},timestamp:Date.now(),runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      importErrors.push({ row: index, errors: [err?.message || 'Erro ao processar linha'] });
    }
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'importPatientService.js:importFromCsvOrXlsx',message:'import about to return',data:{created,updated,withPending,errorsLen:importErrors.length},timestamp:Date.now(),runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
  // #endregion
  logImportExport({
    type: 'IMPORT',
    format: ext.endsWith('.csv') ? 'csv' : 'xlsx',
    count: created + updated,
    success: true,
    userId: user?.id,
    errors: importErrors.length > 0 ? importErrors.map((e) => `Linha ${e.row}: ${e.errors.join(', ')}`) : null,
  });

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'importPatientService.js:importFromCsvOrXlsx',message:'import complete',data:{created,updated,errorsCount:importErrors.length,withPending},timestamp:Date.now(),runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
  // #endregion
  return { created, updated, errors: importErrors, withPending };
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
