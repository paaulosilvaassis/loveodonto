import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';
import { isCpfValid, isPhoneValid, onlyDigits, validateFileMeta } from '../utils/validators.js';

const normalizeCpf = (value) => onlyDigits(value);
const normalizePhoneDigits = (value) => onlyDigits(value);
const buildE164 = (digits, country = '55') => (digits ? `+${country}${digits}` : '');
const SUGGEST_TTL_MS = 45000;
const suggestCache = new Map();

const maskCpf = (value) => {
  const digits = normalizeCpf(value);
  if (digits.length !== 11) return value || '';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
};

const normalizeMatch = (value) => normalizeText(value).toLowerCase();
const normalizePhoneParts = (payload) => {
  const rawDdd = onlyDigits(payload.ddd);
  const rawNumber = onlyDigits(payload.number);
  if (!rawDdd && rawNumber.length >= 10) {
    return { ddd: rawNumber.slice(0, 2), number: rawNumber.slice(2) };
  }
  return { ddd: rawDdd, number: rawNumber };
};
const withDbResult = (mutator) => {
  let result;
  withDb((db) => {
    result = mutator(db);
    return db;
  });
  return result;
};

const ensurePatient = (db, patientId) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:37',message:'ensure patient',data:{patientId,patientsCount:db.patients.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H8'})}).catch(()=>{});
  // #endregion
  const patient = db.patients.find((item) => item.id === patientId);
  if (!patient) throw new Error(`Paciente não encontrado (id: ${patientId || 'vazio'})`);
  return patient;
};

export function recalcPendingData(db, patientId) {
  const result = computePendingFields(db, patientId);
  const p = db.patients.find((x) => x.id === patientId);
  if (!p) return;
  p.hasPendingData = result.hasPendingData;
  p.pendingFields = result.pendingFields;
  p.pendingCriticalFields = result.pendingCriticalFields;
}

/**
 * Recalcula pendências a partir do estado atual do paciente no DB e persiste.
 * Deve ser chamado após salvar cadastro completo (profile, documents, record, phones, address)
 * para que o prontuário e o botão "Gerar contrato" reflitam o estado correto.
 */
export function recalcAndPersistPendingData(patientId) {
  withDb((db) => {
    recalcPendingData(db, patientId);
    return db;
  });
}

const ensureCpfUnique = (db, cpf, ignorePatientId) => {
  const normalized = normalizeCpf(cpf);
  if (!normalized) return;
  const exists = db.patients.some((item) => normalizeCpf(item.cpf) === normalized && item.id !== ignorePatientId);
  if (exists) throw new Error('CPF já cadastrado.');
};


export const listPatients = () => loadDb().patients;

export const searchPatients = (type, query) => {
  const db = loadDb();
  const q = normalizeText(query);
  if (!q) return { results: [], exactMatch: null };

  if (type === 'cpf') {
    const cpf = normalizeCpf(q);
    const exact = db.patients.find((item) => normalizeCpf(item.cpf) === cpf);
    const results = exact ? [exact] : [];
    return { results, exactMatch: exact || null };
  }

  if (type === 'phone') {
    const digits = normalizePhoneDigits(q);
    const phoneMatches = db.patientPhones.filter(
      (item) => normalizePhoneDigits(`${item.ddd}${item.number}`) === digits || normalizePhoneDigits(item.e164) === digits
    );
    const patientIds = Array.from(new Set(phoneMatches.map((item) => item.patient_id)));
    const results = db.patients.filter((item) => patientIds.includes(item.id));
    const exact = results[0] || null;
    return { results, exactMatch: exact };
  }

  const lower = q.toLowerCase();
  const results = db.patients.filter((item) => {
    return (
      item.full_name?.toLowerCase().includes(lower) ||
      item.nickname?.toLowerCase().includes(lower) ||
      item.social_name?.toLowerCase().includes(lower)
    );
  });
  return { results, exactMatch: null };
};

export const suggestPatients = (type, query, limit = 10) => {
  const q = normalizeText(query);
  if (!q) return { results: [] };
  const cacheKey = `${type}:${q}:${limit}`;
  const cached = suggestCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SUGGEST_TTL_MS) {
    return cached.data;
  }

  const db = loadDb();
  let results = [];

  if (type === 'cpf') {
    const digits = normalizeCpf(q);
    if (digits.length === 11) {
      results = db.patients.filter((item) => normalizeCpf(item.cpf) === digits);
    }
  } else if (type === 'phone') {
    const digits = normalizePhoneDigits(q);
    if (digits.length >= 4) {
      const phoneMatches = db.patientPhones.filter((item) => {
        const full = normalizePhoneDigits(`${item.ddd}${item.number}`);
        return full.includes(digits) || normalizePhoneDigits(item.e164).includes(digits);
      });
      const patientIds = Array.from(new Set(phoneMatches.map((item) => item.patient_id)));
      results = db.patients.filter((item) => patientIds.includes(item.id));
    }
  } else {
    const term = normalizeMatch(q);
    results = db.patients
      .map((item) => {
        const name = normalizeMatch(item.full_name);
        const nickname = normalizeMatch(item.nickname);
        const social = normalizeMatch(item.social_name);
        const starts =
          name.startsWith(term) || nickname.startsWith(term) || social.startsWith(term);
        const includes =
          name.includes(term) || nickname.includes(term) || social.includes(term);
        const score = starts ? 2 : includes ? 1 : 0;
        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.full_name.localeCompare(b.item.full_name))
      .map((entry) => entry.item);
  }

  const payload = {
    results: results.slice(0, limit).map((patient) => {
      const phones = db.patientPhones.filter((item) => item.patient_id === patient.id);
      const primaryPhone = phones.find((item) => item.is_primary) || phones[0];
      const phoneLabel = primaryPhone ? `(${primaryPhone.ddd}) ${primaryPhone.number}` : '';
      return {
        id: patient.id,
        name: patient.full_name,
        cpfMasked: maskCpf(patient.cpf),
        phoneLabel,
        birthDate: patient.birth_date || '',
        status: patient.status,
      };
    }),
  };

  suggestCache.set(cacheKey, { at: Date.now(), data: payload });
  return payload;
};

export const getPatient = (patientId) => {
  const db = loadDb();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:156',message:'patient get entry',data:{patientId,hasPatients:Array.isArray(db.patients),hasPatientDocuments:Array.isArray(db.patientDocuments),hasPatientBirth:Array.isArray(db.patientBirth),hasPatientEducation:Array.isArray(db.patientEducation),hasPatientPhones:Array.isArray(db.patientPhones),hasPatientAddresses:Array.isArray(db.patientAddresses),hasPatientRelationships:Array.isArray(db.patientRelationships),hasPatientInsurances:Array.isArray(db.patientInsurances),hasPatientAccess:Array.isArray(db.patientAccess),hasPatientActivitySummary:Array.isArray(db.patientActivitySummary)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H10'})}).catch(()=>{});
  // #endregion
  const profile = db.patients.find((item) => item.id === patientId);
  if (!profile) return null;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:165',message:'patient get profile photo',data:{patientId,hasPhotoUrl:typeof profile.photo_url === 'string' && profile.photo_url.length > 0,photoUrlLength:typeof profile.photo_url === 'string' ? profile.photo_url.length : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H7'})}).catch(()=>{});
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:163',message:'patient get before filter',data:{patientId,hasPatientDocuments:Array.isArray(db.patientDocuments),hasPatientPhones:Array.isArray(db.patientPhones),hasPatientAddresses:Array.isArray(db.patientAddresses),hasPatientInsurances:Array.isArray(db.patientInsurances)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H10'})}).catch(()=>{});
  // #endregion
  return {
    profile,
    documents: (Array.isArray(db.patientDocuments) ? db.patientDocuments.find((item) => item.patient_id === patientId) : null) || {},
    birth: (Array.isArray(db.patientBirth) ? db.patientBirth.find((item) => item.patient_id === patientId) : null) || {},
    education: (Array.isArray(db.patientEducation) ? db.patientEducation.find((item) => item.patient_id === patientId) : null) || {},
    phones: Array.isArray(db.patientPhones) ? db.patientPhones.filter((item) => item.patient_id === patientId) : [],
    addresses: Array.isArray(db.patientAddresses) ? db.patientAddresses.filter((item) => item.patient_id === patientId) : [],
    relationships: (Array.isArray(db.patientRelationships) ? db.patientRelationships.find((item) => item.patient_id === patientId) : null) || {},
    insurances: Array.isArray(db.patientInsurances) ? db.patientInsurances.filter((item) => item.patient_id === patientId) : [],
    access: (Array.isArray(db.patientAccess) ? db.patientAccess.find((item) => item.patient_id === patientId) : null) || {},
    activity: (Array.isArray(db.patientActivitySummary) ? db.patientActivitySummary.find((item) => item.patient_id === patientId) : null) || {},
  };
};


export const createPatientQuick = (user, payload) => {
  requirePermission(user, 'patients:write');
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:186',message:'createPatientQuick entry',data:{hasPhotoUrl:typeof payload?.photo_url === 'string' && payload.photo_url.length > 0,photoUrlLength:typeof payload?.photo_url === 'string' ? payload.photo_url.length : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
  // #endregion
  const patient = {
    id: createId('patient'),
    guid: crypto.randomUUID(),
    full_name: normalizeText(payload.full_name),
    nickname: normalizeText(payload.nickname),
    social_name: normalizeText(payload.social_name),
    sex: normalizeText(payload.sex),
    birth_date: normalizeText(payload.birth_date),
    cpf: normalizeCpf(payload.cpf),
    photo_url: '',
    status: 'active',
    blocked: false,
    block_reason: '',
    block_at: '',
    tags: payload.tags || [],
    lead_source: normalizeText(payload.lead_source),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by_user_id: user.id,
    updated_by_user_id: user.id,
  };

  assertRequired(patient.full_name, 'Nome completo é obrigatório.');
  assertRequired(patient.sex, 'Sexo é obrigatório.');
  assertRequired(patient.birth_date, 'Data de nascimento é obrigatória.');
  assertRequired(patient.cpf, 'CPF é obrigatório.');
  if (!isCpfValid(patient.cpf)) throw new Error('CPF inválido.');

  return withDbResult((db) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:203',message:'patient create start',data:{createdId:patient.id,beforeCount:db.patients.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    ensureCpfUnique(db, patient.cpf);
    db.patients.push(patient);
    const documents = {
      patient_id: patient.id,
      rg: '',
      pis: '',
      municipal_registration: '',
      personal_email: '',
      marital_status: '',
      responsible_name: '',
      responsible_relation: '',
      responsible_phone: '',
      mother_name: '',
      father_name: '',
    };
    db.patientDocuments.push(documents);
    const birth = { patient_id: patient.id, nationality: '', birth_city: '', birth_state: '' };
    db.patientBirth.push(birth);
    const education = { patient_id: patient.id, education_level: '', profession: '', other_profession: '' };
    db.patientEducation.push(education);
    const relationships = {
      patient_id: patient.id,
      emergency_contact_name: '',
      emergency_contact_phone: '',
      dependents: [],
      notes: '',
      marital_status: '',
      preferred_contact_period: '',
      preferred_contact_channel: '',
      lgpd_whatsapp_opt_in: false,
    };
    db.patientRelationships.push(relationships);
    const activity = {
      patient_id: patient.id,
      total_appointments: 0,
      last_appointment_at: '',
      total_procedures: 0,
      last_procedure_at: '',
    };
    db.patientActivitySummary.push(activity);
    logAction('patients:create-quick', { patientId: patient.id, userId: user.id });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:244',message:'patient create done',data:{createdId:patient.id,afterCount:db.patients.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    return {
      patientId: patient.id,
      profile: patient,
      documents,
      birth,
      education,
      relationships,
      activity,
    };
  });
};

/** Campos importantes para alerta de pendências (importação) */
export const PENDING_FIELDS_MAP = {
  full_name: 'Nome Completo',
  cpf: 'CPF',
  cpf_or_rg: 'CPF ou RG',
  sex: 'Sexo',
  birth_date: 'Data de Nascimento',
  personal_email: 'E-mail',
  phone: 'Telefone ou Celular',
  street: 'Endereço',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  cep: 'CEP',
  address_min: 'Endereço (mínimo: Cidade/UF ou Endereço+Cidade+CEP)',
  record_number: 'Nº Prontuário',
  preferred_dentist: 'Preferência (Dentista)',
  insurance_name: 'Nome do Convênio',
  responsible_name: 'Nome do Responsável',
  responsible_cpf: 'CPF do Responsável',
};

/** Campos obrigatórios para gerar contrato (quando faltando, bloqueiam contrato) */
export const CRITICAL_FIELDS = [
  'full_name',
  'cpf_or_rg',
  'birth_date',
  'phone',
  'address_min',
  'sex',
  'responsible_name',
  'responsible_cpf',
];

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

/**
 * Calcula pendências a partir do estado do paciente no DB.
 * Retorna { pendingFields, pendingCriticalFields, hasPendingData }.
 * Usado na importação e ao salvar/editar (recalcular e limpar quando completar).
 */
export function computePendingFields(db, patientId) {
  const p = db.patients?.find((x) => x.id === patientId);
  if (!p) return { pendingFields: [], pendingCriticalFields: [], hasPendingData: false };

  const docs = db.patientDocuments?.find((d) => d.patient_id === patientId) || {};
  const rec = (db.patientRecords || []).find((r) => r.patient_id === patientId);
  const addresses = (db.patientAddresses || []).filter((a) => a.patient_id === patientId) || [];
  const phones = (db.patientPhones || []).filter((ph) => ph.patient_id === patientId) || [];
  const minor = isMinor(p.birth_date);

  const pendingFields = [];
  const hasCpf = p.cpf && isCpfValid(p.cpf);
  const hasRg = Boolean(normalizeText(docs.rg));
  if (!normalizeText(p.full_name)) pendingFields.push('full_name');
  if (!hasCpf && !hasRg) pendingFields.push('cpf_or_rg');
  if (!hasCpf) pendingFields.push('cpf');
  if (!normalizeText(p.sex)) pendingFields.push('sex');
  if (!normalizeText(p.birth_date)) pendingFields.push('birth_date');
  if (!normalizeText(docs.personal_email)) pendingFields.push('personal_email');
  if (phones.length === 0) pendingFields.push('phone');
  const hasAddressMin =
    addresses.some(
      (a) =>
        (normalizeText(a.street) && normalizeText(a.city) && normalizeText(a.cep)) ||
        (normalizeText(a.city) && normalizeText(a.state))
    );
  if (!hasAddressMin) {
    pendingFields.push('address_min');
    if (!addresses.some((a) => normalizeText(a.street))) pendingFields.push('street');
    if (!addresses.some((a) => normalizeText(a.city))) pendingFields.push('city');
    if (!addresses.some((a) => normalizeText(a.cep))) pendingFields.push('cep');
    if (!addresses.some((a) => normalizeText(a.state))) pendingFields.push('state');
  } else {
    if (!addresses.some((a) => normalizeText(a.street))) pendingFields.push('street');
    if (!addresses.some((a) => normalizeText(a.neighborhood))) pendingFields.push('neighborhood');
    if (!addresses.some((a) => normalizeText(a.city))) pendingFields.push('city');
    if (!addresses.some((a) => normalizeText(a.state))) pendingFields.push('state');
    if (!addresses.some((a) => normalizeText(a.cep))) pendingFields.push('cep');
  }
  if (!rec?.record_number) pendingFields.push('record_number');
  // preferred_dentist e insurance_name são opcionais (não entram em pendingFields)
  if (minor) {
    if (!normalizeText(docs.responsible_name)) pendingFields.push('responsible_name');
    if (!normalizeText(docs.responsible_cpf)) pendingFields.push('responsible_cpf');
  }

  const pendingCriticalFields = CRITICAL_FIELDS.filter((f) => pendingFields.includes(f));
  const hasPendingData = pendingFields.length > 0;

  return {
    pendingFields: [...new Set(pendingFields)],
    pendingCriticalFields,
    hasPendingData,
  };
}

/**
 * Cria paciente a partir de importação (permite dados incompletos, marca pendências).
 */
export const createPatientFromImport = (user, payload, pendingFields = []) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'patientService.js:createPatientFromImport',message:'entry',data:{user:!!user,payloadName:payload?.full_name?.slice(0,30)},timestamp:Date.now(),runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  requirePermission(user, 'patients:write');
  const fullName = normalizeText(payload.full_name) || 'Paciente Importado';
  const sex = (normalizeText(payload.sex) || 'N').slice(0, 1).toUpperCase();
  const birthDate = normalizeText(payload.birth_date) || '1990-01-01';
  let cpf = normalizeCpf(payload.cpf);
  if (!cpf || !isCpfValid(cpf)) {
    cpf = generatePlaceholderCpf();
  }

  const patient = {
    id: createId('patient'),
    guid: crypto.randomUUID(),
    full_name: fullName,
    nickname: normalizeText(payload.nickname),
    social_name: normalizeText(payload.social_name),
    sex,
    birth_date: birthDate,
    cpf,
    photo_url: '',
    status: 'active',
    blocked: false,
    block_reason: '',
    block_at: '',
    tags: payload.tags || [],
    lead_source: normalizeText(payload.lead_source),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by_user_id: user.id,
    updated_by_user_id: user.id,
  };
  if (pendingFields.length > 0) {
    patient.hasPendingData = true;
    patient.pendingFields = [...pendingFields];
    patient.pendingCriticalFields = CRITICAL_FIELDS.filter((f) => pendingFields.includes(f));
  }

  return withDbResult((db) => {
    ensureCpfUnique(db, patient.cpf);
    db.patients.push(patient);
    const documents = {
      patient_id: patient.id,
      rg: '',
      pis: '',
      municipal_registration: '',
      personal_email: (payload.documents?.personal_email ?? payload.personal_email ?? '') || '',
      marital_status: '',
      responsible_name: '',
      responsible_relation: '',
      responsible_phone: '',
      responsible_cpf: '',
      mother_name: '',
      father_name: '',
    };
    if (payload.documents) {
      Object.assign(documents, {
        rg: normalizeText(payload.documents.rg),
        personal_email: normalizeText(payload.documents.personal_email || payload.documents.email),
        marital_status: normalizeText(payload.documents.marital_status),
        responsible_name: normalizeText(payload.documents.responsible_name),
        responsible_cpf: normalizeText(payload.documents.responsible_cpf),
      });
    }
    db.patientDocuments.push(documents);
    const birthData = payload.birth || {};
    const birth = {
      patient_id: patient.id,
      nationality: normalizeText(birthData.nationality) || 'Brasil',
      birth_city: normalizeText(birthData.birth_city),
      birth_state: normalizeText(birthData.birth_state),
    };
    db.patientBirth.push(birth);
    const edu = payload.education || {};
    const education = {
      patient_id: patient.id,
      education_level: normalizeText(edu.education_level),
      profession: normalizeText(edu.profession),
      other_profession: '',
    };
    db.patientEducation.push(education);
    const relationships = {
      patient_id: patient.id,
      emergency_contact_name: '',
      emergency_contact_phone: '',
      dependents: [],
      notes: '',
      marital_status: documents.marital_status || '',
      preferred_contact_period: '',
      preferred_contact_channel: '',
      lgpd_whatsapp_opt_in: false,
    };
    db.patientRelationships.push(relationships);
    const activity = {
      patient_id: patient.id,
      total_appointments: 0,
      last_appointment_at: '',
      total_procedures: 0,
      last_procedure_at: '',
    };
    db.patientActivitySummary.push(activity);
    logAction('patients:create-import', { patientId: patient.id, userId: user.id });
    return { patientId: patient.id, profile: patient };
  });
};

const buildPatientFromImportPayload = (payload, pendingFields, user) => {
  const fullName = normalizeText(payload.full_name) || 'Paciente Importado';
  const sex = (normalizeText(payload.sex) || 'N').slice(0, 1).toUpperCase();
  const birthDate = normalizeText(payload.birth_date) || '1990-01-01';
  let cpf = normalizeCpf(payload.cpf);
  if (!cpf || !isCpfValid(cpf)) cpf = generatePlaceholderCpf();
  const patient = {
    id: createId('patient'),
    guid: crypto.randomUUID(),
    full_name: fullName,
    nickname: normalizeText(payload.nickname),
    social_name: normalizeText(payload.social_name),
    sex,
    birth_date: birthDate,
    cpf,
    photo_url: '',
    status: 'active',
    blocked: false,
    block_reason: '',
    block_at: '',
    tags: payload.tags || [],
    lead_source: normalizeText(payload.lead_source),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by_user_id: user.id,
    updated_by_user_id: user.id,
  };
  if (pendingFields.length > 0) {
    patient.hasPendingData = true;
    patient.pendingFields = [...pendingFields];
    patient.pendingCriticalFields = CRITICAL_FIELDS.filter((f) => pendingFields.includes(f));
  }
  return { patient, payload };
};

/**
 * Cria vários pacientes de importação em uma única escrita no DB (batch).
 * Evita travar a UI e reduz I/O de localStorage.
 */
export const createPatientsFromImportBatch = (user, items) => {
  if (!items || items.length === 0) return { patientIds: [] };
  requirePermission(user, 'patients:write');
  const built = items.map(({ payload, pendingFields = [] }) => buildPatientFromImportPayload(payload, pendingFields, user));
  const cpfsInBatch = new Set();
  for (const { patient } of built) {
    let cpf = normalizeCpf(patient.cpf);
    while (cpfsInBatch.has(cpf)) {
      cpf = generatePlaceholderCpf();
      patient.cpf = cpf;
    }
    cpfsInBatch.add(cpf);
  }
  return withDbResult((db) => {
    const patientIds = [];
    for (const { patient, payload } of built) {
      ensureCpfUnique(db, patient.cpf);
      db.patients.push(patient);
      const documents = {
        patient_id: patient.id,
        rg: '',
        pis: '',
        municipal_registration: '',
        personal_email: (payload.documents?.personal_email ?? payload.personal_email ?? '') || '',
        marital_status: '',
        responsible_name: '',
        responsible_relation: '',
        responsible_phone: '',
        responsible_cpf: '',
        mother_name: '',
        father_name: '',
      };
      if (payload.documents) {
        Object.assign(documents, {
          rg: normalizeText(payload.documents.rg),
          personal_email: normalizeText(payload.documents.personal_email || payload.documents.email),
          marital_status: normalizeText(payload.documents.marital_status),
          responsible_name: normalizeText(payload.documents.responsible_name),
          responsible_cpf: normalizeText(payload.documents.responsible_cpf),
        });
      }
      db.patientDocuments.push(documents);
      const birthData = payload.birth || {};
      db.patientBirth.push({
        patient_id: patient.id,
        nationality: normalizeText(birthData.nationality) || 'Brasil',
        birth_city: normalizeText(birthData.birth_city),
        birth_state: normalizeText(birthData.birth_state),
      });
      const edu = payload.education || {};
      db.patientEducation.push({
        patient_id: patient.id,
        education_level: normalizeText(edu.education_level),
        profession: normalizeText(edu.profession),
        other_profession: '',
      });
      db.patientRelationships.push({
        patient_id: patient.id,
        emergency_contact_name: '',
        emergency_contact_phone: '',
        dependents: [],
        notes: '',
        marital_status: documents.marital_status || '',
        preferred_contact_period: '',
        preferred_contact_channel: '',
        lgpd_whatsapp_opt_in: false,
      });
      db.patientActivitySummary.push({
        patient_id: patient.id,
        total_appointments: 0,
        last_appointment_at: '',
        total_procedures: 0,
        last_procedure_at: '',
      });
      if (!Array.isArray(db.patientRecords)) db.patientRecords = [];
      const nextRecNum = (arr) => {
        const max = (arr || []).reduce((acc, r) => Math.max(acc, Number(String(r?.record_number || '').replace(/\D/g, '')) || 0), 0);
        return String(max + 1).padStart(8, '0');
      };
      const recNum = normalizeText(String(payload.record_number || '')) || nextRecNum(db.patientRecords);
      db.patientRecords.push({
        id: createId('record'),
        patient_id: patient.id,
        record_number: recNum,
        preferred_dentist: normalizeText(payload.preferred_dentist || ''),
        patient_type: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const digits = onlyDigits(payload.phone || '');
      if (digits.length >= 10) {
        if (!Array.isArray(db.patientPhones)) db.patientPhones = [];
        db.patientPhones.push({
          id: createId('phone'),
          patient_id: patient.id,
          type: '',
          country_code: '55',
          ddd: digits.slice(0, 2),
          number: digits.slice(2, 11),
          is_whatsapp: true,
          is_primary: true,
          e164: buildE164(digits, '55'),
        });
      }
      if (payload.address?.street || payload.address?.city) {
        if (!Array.isArray(db.patientAddresses)) db.patientAddresses = [];
        db.patientAddresses.push({
          id: createId('addr'),
          patient_id: patient.id,
          type: payload.address?.type || 'residencial',
          cep: normalizeText(payload.address?.cep),
          street: normalizeText(payload.address?.street),
          number: normalizeText(payload.address?.number),
          complement: normalizeText(payload.address?.complement),
          neighborhood: normalizeText(payload.address?.neighborhood),
          city: normalizeText(payload.address?.city),
          state: normalizeText(payload.address?.state),
          is_primary: true,
        });
      }
      if (payload.insurance?.insurance_name) {
        if (!Array.isArray(db.patientInsurances)) db.patientInsurances = [];
        db.patientInsurances.push({
          id: createId('ins'),
          patient_id: patient.id,
          insurance_name: normalizeText(payload.insurance?.insurance_name),
          membership_number: normalizeText(payload.insurance?.membership_number),
          company_partner: normalizeText(payload.insurance?.company_partner),
        });
      }
      patientIds.push(patient.id);
    }
    logAction('patients:create-import-batch', { count: patientIds.length, userId: user.id });
    return { patientIds };
  });
};

/**
 * Gera um CPF placeholder válido e único (para criação de paciente a partir de lead).
 * Usa 9 dígitos (1 + 8 aleatórios) + 2 dígitos verificadores; evita sequência repetida.
 */
function generatePlaceholderCpf() {
  const onlyDigits = (v) => (v || '').replace(/\D/g, '');
  const calc = (base, factor) => {
    let total = 0;
    for (let i = 0; i < base.length; i += 1) total += Number(base[i]) * (factor - i);
    const mod = total % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  let base = '1';
  for (let i = 0; i < 8; i += 1) base += Math.floor(Math.random() * 10);
  if (/^(\d)\1+$/.test(base)) base = '1' + String(Date.now() % 100000000).padStart(8, '0');
  const d1 = calc(base, 10);
  const d2 = calc(base + String(d1), 11);
  return onlyDigits(base + String(d1) + String(d2));
}

/**
 * Cria paciente a partir dos dados do lead (conversão automática ao aprovar orçamento).
 * Mapeamento: lead.name → full_name; lead.phone → patientPhones; sex/birth/cpf com placeholder.
 */
export const createPatientFromLead = (user, lead) => {
  const full_name = normalizeText(lead?.name) || 'Paciente CRM';
  const created = createPatientQuick(user, {
    full_name,
    sex: 'N',
    birth_date: '1990-01-01',
    cpf: generatePlaceholderCpf(),
    lead_source: 'crm_lead',
  });
  const patientId = created.patientId || created.profile?.id;
  if (!patientId) throw new Error('ID do paciente inválido.');
  const digits = (lead?.phone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2, 11);
    try {
      addPatientPhone(user, patientId, { ddd, number, is_primary: true, is_whatsapp: true });
    } catch (e) {
      console.warn('Telefone do lead não adicionado:', e?.message);
    }
  }
  return { patientId, profile: created.profile };
};

export const updatePatientProfile = (user, patientId, payload) => {
  requirePermission(user, 'patients:write');
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:257',message:'updatePatientProfile entry',data:{patientId,hasPhotoUrl:typeof payload?.photo_url === 'string' && payload.photo_url.length > 0,photoUrlLength:typeof payload?.photo_url === 'string' ? payload.photo_url.length : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
  // #endregion
  return withDbResult((db) => {
    const existing = db.patients.find((item) => item.id === patientId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:260',message:'patient update',data:{patientId,existingFound:Boolean(existing),patientsCount:db.patients.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    const basePatient = existing || {
      id: patientId,
      guid: crypto.randomUUID(),
      photo_url: '',
      status: 'active',
      blocked: false,
      block_reason: '',
      block_at: '',
      tags: [],
      lead_source: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by_user_id: user.id,
      updated_by_user_id: user.id,
    };
    const next = {
      ...basePatient,
      full_name: normalizeText(payload.full_name ?? basePatient.full_name),
      nickname: normalizeText(payload.nickname ?? basePatient.nickname),
      social_name: normalizeText(payload.social_name ?? basePatient.social_name),
      sex: normalizeText(payload.sex ?? basePatient.sex),
      birth_date: normalizeText(payload.birth_date ?? basePatient.birth_date),
      cpf: normalizeCpf(payload.cpf ?? basePatient.cpf),
      photo_url: payload.photo_url ?? basePatient.photo_url,
      tags: payload.tags ?? basePatient.tags ?? [],
      lead_source: normalizeText(payload.lead_source ?? basePatient.lead_source),
      updated_at: new Date().toISOString(),
      updated_by_user_id: user.id,
    };
    if (!next.full_name) throw new Error('Nome completo é obrigatório.');
    if (!next.sex) throw new Error('Sexo é obrigatório.');
    if (!next.birth_date) throw new Error('Data de nascimento é obrigatória.');
    if (!next.cpf) throw new Error('CPF é obrigatório.');
    if (!isCpfValid(next.cpf)) throw new Error('CPF inválido.');
    ensureCpfUnique(db, next.cpf, patientId);
    if (existing) {
      next.hasPendingData = existing.hasPendingData;
      next.pendingFields = existing.pendingFields || [];
      next.pendingCriticalFields = existing.pendingCriticalFields || [];
    }
    if (existing) {
      db.patients = db.patients.map((item) => (item.id === patientId ? next : item));
    } else {
      db.patients.push(next);
    }
    recalcPendingData(db, patientId);
    logAction('patients:update-profile', { patientId, userId: user.id });
    return next;
  });
};

/**
 * Atualiza hasPendingData, pendingFields e pendingCriticalFields do paciente (usado na importação).
 */
export const updatePatientPendingData = (user, patientId, hasPendingData, pendingFields, pendingCriticalFields = null) => {
  requirePermission(user, 'patients:write');
  return withDbResult((db) => {
    const p = db.patients.find((x) => x.id === patientId);
    if (!p) throw new Error('Paciente não encontrado.');
    p.hasPendingData = Boolean(hasPendingData);
    p.pendingFields = Array.isArray(pendingFields) ? [...pendingFields] : [];
    if (pendingCriticalFields !== null) {
      p.pendingCriticalFields = Array.isArray(pendingCriticalFields) ? [...pendingCriticalFields] : [];
    } else if (p.pendingFields.length > 0) {
      p.pendingCriticalFields = CRITICAL_FIELDS.filter((f) => p.pendingFields.includes(f));
    }
    p.updated_at = new Date().toISOString();
    p.updated_by_user_id = user.id;
    return p;
  });
};

export const uploadPatientPhoto = (user, patientId, file) => {
  requirePermission(user, 'patients:write');
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:325',message:'uploadPatientPhoto entry',data:{patientId,type:file?.type || null,size:file?.size || null,hasDataUrl:!!file?.dataUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  const validation = validateFileMeta(file, ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:327',message:'uploadPatientPhoto validation',data:{patientId,ok:validation.ok,message:validation.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  if (!validation.ok) throw new Error(validation.message);
  return updatePatientProfile(user, patientId, { photo_url: file.dataUrl });
};

export const updatePatientDocuments = (user, patientId, payload) => {
  requirePermission(user, 'patients:write');
  if (payload.cpf && !isCpfValid(payload.cpf)) throw new Error('CPF inválido.');
  return withDbResult((db) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:327',message:'updatePatientDocuments entry',data:{patientId,hasPatientDocuments:Array.isArray(db.patientDocuments),patientDocumentsType:typeof db.patientDocuments,patientDocumentsLength:Array.isArray(db.patientDocuments) ? db.patientDocuments.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    ensurePatient(db, patientId);
    if (payload.cpf) ensureCpfUnique(db, payload.cpf, patientId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:333',message:'updatePatientDocuments before filter',data:{patientId,hasPatientDocuments:Array.isArray(db.patientDocuments),patientDocumentsValue:db.patientDocuments ? 'exists' : 'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    if (!Array.isArray(db.patientDocuments)) {
      db.patientDocuments = [];
    }
    const next = {
      patient_id: patientId,
      rg: normalizeText(payload.rg),
      pis: normalizeText(payload.pis),
      municipal_registration: normalizeText(payload.municipal_registration),
      personal_email: normalizeText(payload.personal_email),
      marital_status: normalizeText(payload.marital_status),
      responsible_name: normalizeText(payload.responsible_name),
      responsible_relation: normalizeText(payload.responsible_relation),
      responsible_phone: normalizeText(payload.responsible_phone),
      responsible_cpf: normalizeText(payload.responsible_cpf),
      mother_name: normalizeText(payload.mother_name),
      father_name: normalizeText(payload.father_name),
    };
    db.patientDocuments = db.patientDocuments.filter((item) => item.patient_id !== patientId);
    db.patientDocuments.push(next);
    if (payload.cpf) {
      const patient = ensurePatient(db, patientId);
      patient.cpf = normalizeCpf(payload.cpf);
      patient.updated_at = new Date().toISOString();
      patient.updated_by_user_id = user.id;
    }
    recalcPendingData(db, patientId);
    logAction('patients:update-documents', { patientId, userId: user.id });
    return next;
  });
};

export const updatePatientBirth = (user, patientId, payload) => {
  requirePermission(user, 'patients:write');
  return withDbResult((db) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:359',message:'updatePatientBirth entry',data:{patientId,hasPatientBirth:Array.isArray(db.patientBirth),patientBirthType:typeof db.patientBirth,patientBirthLength:Array.isArray(db.patientBirth) ? db.patientBirth.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    const patient = ensurePatient(db, patientId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:363',message:'updatePatientBirth before filter',data:{patientId,hasPatientBirth:Array.isArray(db.patientBirth),patientBirthValue:db.patientBirth ? 'exists' : 'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    if (!Array.isArray(db.patientBirth)) {
      db.patientBirth = [];
    }
    const next = {
      patient_id: patientId,
      nationality: normalizeText(payload.nationality),
      birth_city: normalizeText(payload.birth_city),
      birth_state: normalizeText(payload.birth_state),
    };
    db.patientBirth = db.patientBirth.filter((item) => item.patient_id !== patientId);
    db.patientBirth.push(next);
    if (payload.birth_date) {
      patient.birth_date = normalizeText(payload.birth_date);
      patient.updated_at = new Date().toISOString();
      patient.updated_by_user_id = user.id;
    }
    recalcPendingData(db, patientId);
    logAction('patients:update-birth', { patientId, userId: user.id });
    return next;
  });
};

export const updatePatientEducation = (user, patientId, payload) => {
  requirePermission(user, 'patients:write');
  return withDbResult((db) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:381',message:'updatePatientEducation entry',data:{patientId,hasPatientEducation:Array.isArray(db.patientEducation),patientEducationType:typeof db.patientEducation,patientEducationLength:Array.isArray(db.patientEducation) ? db.patientEducation.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    ensurePatient(db, patientId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:385',message:'updatePatientEducation before filter',data:{patientId,hasPatientEducation:Array.isArray(db.patientEducation),patientEducationValue:db.patientEducation ? 'exists' : 'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    if (!Array.isArray(db.patientEducation)) {
      db.patientEducation = [];
    }
    const next = {
      patient_id: patientId,
      education_level: normalizeText(payload.education_level),
      profession: normalizeText(payload.profession),
      other_profession: normalizeText(payload.other_profession),
    };
    db.patientEducation = db.patientEducation.filter((item) => item.patient_id !== patientId);
    db.patientEducation.push(next);
    logAction('patients:update-education', { patientId, userId: user.id });
    return next;
  });
};

export const addPatientPhone = (user, patientId, payload) => {
  requirePermission(user, 'patients:write');
  const { ddd, number } = normalizePhoneParts(payload);
  const digits = normalizePhoneDigits(`${ddd}${number}`);
  if (!isPhoneValid(digits)) throw new Error('Telefone inválido.');
  const phone = {
    id: createId('phone'),
    patient_id: patientId,
    type: normalizeText(payload.type),
    country_code: normalizeText(payload.country_code || '55'),
    ddd,
    number,
    is_whatsapp: Boolean(payload.is_whatsapp),
    is_primary: Boolean(payload.is_primary),
    e164: buildE164(digits, payload.country_code || '55'),
  };
  return withDbResult((db) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:444',message:'addPatientPhone entry',data:{patientId,hasPatientPhones:Array.isArray(db.patientPhones),patientPhonesType:typeof db.patientPhones,patientPhonesLength:Array.isArray(db.patientPhones) ? db.patientPhones.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    ensurePatient(db, patientId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:448',message:'addPatientPhone before forEach',data:{patientId,hasPatientPhones:Array.isArray(db.patientPhones),patientPhonesValue:db.patientPhones ? 'exists' : 'undefined',isPrimary:phone.is_primary},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    if (!Array.isArray(db.patientPhones)) {
      db.patientPhones = [];
    }
    if (phone.is_primary) {
      db.patientPhones.forEach((item) => {
        if (item.patient_id === patientId) item.is_primary = false;
      });
    }
    db.patientPhones.push(phone);
    logAction('patients:add-phone', { patientId, userId: user.id });
    return phone;
  });
};

export const updatePatientPhone = (user, phoneId, payload) => {
  requirePermission(user, 'patients:write');
  return withDbResult((db) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:427',message:'updatePatientPhone entry',data:{phoneId,hasPatientPhones:Array.isArray(db.patientPhones),patientPhonesType:typeof db.patientPhones,patientPhonesLength:Array.isArray(db.patientPhones) ? db.patientPhones.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    if (!Array.isArray(db.patientPhones)) {
      db.patientPhones = [];
    }
    const index = db.patientPhones.findIndex((item) => item.id === phoneId);
    if (index < 0) throw new Error(`Telefone não encontrado (id: ${phoneId || 'vazio'})`);
    const current = db.patientPhones[index];
    const { ddd, number } = normalizePhoneParts({
      ddd: payload.ddd ?? current.ddd,
      number: payload.number ?? current.number,
    });
    const digits = normalizePhoneDigits(`${ddd}${number}`);
    if (!isPhoneValid(digits)) throw new Error('Telefone inválido.');
    const nextCountryCode = (payload.country_code ?? current.country_code) || '55';
    const next = {
      ...current,
      type: normalizeText(payload.type ?? current.type),
      country_code: normalizeText(nextCountryCode),
      ddd,
      number,
      is_whatsapp: payload.is_whatsapp ?? current.is_whatsapp,
      is_primary: payload.is_primary ?? current.is_primary,
      e164: buildE164(digits, nextCountryCode),
    };
    if (next.is_primary) {
      db.patientPhones.forEach((item) => {
        if (item.patient_id === current.patient_id) item.is_primary = false;
      });
    }
    db.patientPhones[index] = next;
    logAction('patients:update-phone', { phoneId, patientId: current.patient_id, userId: user.id });
    return next;
  });
};

export const removePatientPhone = (user, phoneId) => {
  requirePermission(user, 'patients:write');
  return withDbResult((db) => {
    db.patientPhones = db.patientPhones.filter((item) => item.id !== phoneId);
    logAction('patients:remove-phone', { phoneId, userId: user.id });
    return db.patientPhones;
  });
};

export const addPatientAddress = (user, patientId, payload) => {
  requirePermission(user, 'patients:write');
  const address = {
    id: createId('addr'),
    patient_id: patientId,
    type: normalizeText(payload.type),
    cep: normalizeText(payload.cep),
    street: normalizeText(payload.street),
    number: normalizeText(payload.number),
    complement: normalizeText(payload.complement),
    neighborhood: normalizeText(payload.neighborhood),
    city: normalizeText(payload.city),
    state: normalizeText(payload.state),
    is_primary: Boolean(payload.is_primary),
  };
  return withDbResult((db) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:521',message:'addPatientAddress entry',data:{patientId,hasPatientAddresses:Array.isArray(db.patientAddresses),patientAddressesType:typeof db.patientAddresses,patientAddressesLength:Array.isArray(db.patientAddresses) ? db.patientAddresses.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H8'})}).catch(()=>{});
    // #endregion
    ensurePatient(db, patientId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:525',message:'addPatientAddress before forEach',data:{patientId,hasPatientAddresses:Array.isArray(db.patientAddresses),patientAddressesValue:db.patientAddresses ? 'exists' : 'undefined',isPrimary:address.is_primary},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H8'})}).catch(()=>{});
    // #endregion
    if (!Array.isArray(db.patientAddresses)) {
      db.patientAddresses = [];
    }
    if (address.is_primary) {
      db.patientAddresses.forEach((item) => {
        if (item.patient_id === patientId) item.is_primary = false;
      });
    }
    db.patientAddresses.push(address);
    recalcPendingData(db, patientId);
    logAction('patients:add-address', { patientId, userId: user.id });
    return address;
  });
};

export const removePatientAddress = (user, addressId) => {
  requirePermission(user, 'patients:write');
  return withDbResult((db) => {
    db.patientAddresses = db.patientAddresses.filter((item) => item.id !== addressId);
    logAction('patients:remove-address', { addressId, userId: user.id });
    return db.patientAddresses;
  });
};

export const updatePatientRelationships = (user, patientId, payload) => {
  requirePermission(user, 'patients:write');
  const next = {
    patient_id: patientId,
    emergency_contact_name: normalizeText(payload.emergency_contact_name),
    emergency_contact_phone: normalizeText(payload.emergency_contact_phone),
    financial_responsible_name: normalizeText(payload.financial_responsible_name),
    financial_responsible_relation: normalizeText(payload.financial_responsible_relation),
    dependents: payload.dependents || [],
    notes: normalizeText(payload.notes),
    marital_status: normalizeText(payload.marital_status),
    preferred_contact_period: normalizeText(payload.preferred_contact_period),
    preferred_contact_channel: normalizeText(payload.preferred_contact_channel),
    lgpd_whatsapp_opt_in: Boolean(payload.lgpd_whatsapp_opt_in),
  };
  return withDbResult((db) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:558',message:'updatePatientRelationships entry',data:{patientId,hasPatientRelationships:Array.isArray(db.patientRelationships),patientRelationshipsType:typeof db.patientRelationships,patientRelationshipsLength:Array.isArray(db.patientRelationships) ? db.patientRelationships.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    ensurePatient(db, patientId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:562',message:'updatePatientRelationships before filter',data:{patientId,hasPatientRelationships:Array.isArray(db.patientRelationships),patientRelationshipsValue:db.patientRelationships ? 'exists' : 'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    if (!Array.isArray(db.patientRelationships)) {
      db.patientRelationships = [];
    }
    db.patientRelationships = db.patientRelationships.filter((item) => item.patient_id !== patientId);
    db.patientRelationships.push(next);
    logAction('patients:update-relationships', { patientId, userId: user.id });
    return next;
  });
};

export const addPatientInsurance = (user, patientId, payload) => {
  requirePermission(user, 'patients:write');
  const insurance = {
    id: createId('ins'),
    patient_id: patientId,
    insurance_name: normalizeText(payload.insurance_name),
    plan_name: normalizeText(payload.plan_name),
    membership_number: normalizeText(payload.membership_number),
    validity: normalizeText(payload.validity),
    is_holder: Boolean(payload.is_holder),
    company_partner: normalizeText(payload.company_partner),
    extra_data: normalizeText(payload.extra_data),
  };
  return withDbResult((db) => {
    ensurePatient(db, patientId);
    db.patientInsurances.push(insurance);
    recalcPendingData(db, patientId);
    logAction('patients:add-insurance', { patientId, userId: user.id });
    return insurance;
  });
};

export const removePatientInsurance = (user, insuranceId) => {
  requirePermission(user, 'patients:write');
  return withDbResult((db) => {
    db.patientInsurances = db.patientInsurances.filter((item) => item.id !== insuranceId);
    logAction('patients:remove-insurance', { insuranceId, userId: user.id });
    return db.patientInsurances;
  });
};

export const updatePatientAccess = (user, patientId, payload) => {
  requirePermission(user, 'patients:access');
  const next = {
    patient_id: patientId,
    user_id: normalizeText(payload.user_id),
    access_status: normalizeText(payload.access_status),
    last_login_at: normalizeText(payload.last_login_at),
    invite_sent_at: normalizeText(payload.invite_sent_at),
    access_email: normalizeText(payload.access_email),
    access_phone: normalizeText(payload.access_phone),
  };
  return withDbResult((db) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:608',message:'updatePatientAccess entry',data:{patientId,hasPatientAccess:Array.isArray(db.patientAccess),patientAccessType:typeof db.patientAccess,patientAccessLength:Array.isArray(db.patientAccess) ? db.patientAccess.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H7'})}).catch(()=>{});
    // #endregion
    ensurePatient(db, patientId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/services/patientService.js:612',message:'updatePatientAccess before filter',data:{patientId,hasPatientAccess:Array.isArray(db.patientAccess),patientAccessValue:db.patientAccess ? 'exists' : 'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H7'})}).catch(()=>{});
    // #endregion
    if (!Array.isArray(db.patientAccess)) {
      db.patientAccess = [];
    }
    db.patientAccess = db.patientAccess.filter((item) => item.patient_id !== patientId);
    db.patientAccess.push(next);
    logAction('patients:update-access', { patientId, userId: user.id });
    return next;
  });
};

export const updatePatientStatus = (user, patientId, payload) => {
  requirePermission(user, 'patients:status');
  return withDbResult((db) => {
    const patient = ensurePatient(db, patientId);
    const blocked = Boolean(payload.blocked);
    patient.status = payload.status || patient.status;
    patient.blocked = blocked;
    patient.block_reason = blocked ? normalizeText(payload.block_reason) : '';
    patient.block_at = blocked ? normalizeText(payload.block_at || new Date().toISOString()) : '';
    patient.updated_at = new Date().toISOString();
    patient.updated_by_user_id = user.id;
    logAction('patients:update-status', { patientId, userId: user.id });
    return patient;
  });
};

export const mergePatientActivity = (user, sourcePatientId, targetPatientId) => {
  requirePermission(user, 'patients:write');
  return withDbResult((db) => {
    ensurePatient(db, sourcePatientId);
    ensurePatient(db, targetPatientId);
    const source = db.patientActivitySummary.find((item) => item.patient_id === sourcePatientId);
    const target = db.patientActivitySummary.find((item) => item.patient_id === targetPatientId);
    if (!source || !target) throw new Error('Movimentação não encontrada.');
    target.total_appointments += source.total_appointments || 0;
    target.total_procedures += source.total_procedures || 0;
    target.last_appointment_at = source.last_appointment_at || target.last_appointment_at;
    target.last_procedure_at = source.last_procedure_at || target.last_procedure_at;
    logAction('patients:merge-activity', { sourcePatientId, targetPatientId, userId: user.id });
    return target;
  });
};

