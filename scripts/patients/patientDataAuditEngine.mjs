/**
 * Motor de auditoria Pacientes — Phase 9.4A Wave 3A (somente leitura / simulação).
 * Opera sobre snapshot in-memory. Nunca escreve, nunca chama rede.
 */

import { hashId, maskCpf, onlyDigits, sanitizeForReport } from './patientDataAuditMask.mjs';

export const PATIENT_COLLECTIONS = [
  'patients',
  'patientDocuments',
  'patientBirth',
  'patientEducation',
  'patientPhones',
  'patientAddresses',
  'patientRelationships',
  'patientInsurances',
  'patientAccess',
  'patientActivitySummary',
  'patientRecords',
];

export const LINK_COLLECTIONS = [
  { key: 'appointments', patientField: 'patientId' },
  { key: 'crmLeads', patientField: 'patient_id' },
  { key: 'generatedContracts', patientField: 'patient_id' },
  { key: 'accountsReceivable', patientField: 'patient_id' },
  { key: 'financings', patientField: 'patient_id' },
  { key: 'budgets', patientField: 'patient_id' },
  { key: 'patientJourneyEntries', patientField: 'patient_id' },
  { key: 'patientCharts', patientField: 'patient_id' },
  { key: 'patientOdontograms', patientField: 'patient_id' },
  { key: 'patientOdontogramsV2', patientField: 'patientId' },
  { key: 'patientFiles', patientField: 'patient_id' },
  { key: 'patientConfidentialFiles', patientField: 'patient_id' },
];

export const CLASSIFICATION = {
  MIGRATION_READY: 'MIGRATION_READY',
  MIGRATION_READY_WITH_WARNINGS: 'MIGRATION_READY_WITH_WARNINGS',
  BLOCKED_INVALID_IDENTITY: 'BLOCKED_INVALID_IDENTITY',
  BLOCKED_DUPLICATE_CPF: 'BLOCKED_DUPLICATE_CPF',
  BLOCKED_MISSING_TENANT: 'BLOCKED_MISSING_TENANT',
  BLOCKED_ORPHAN_LINKS: 'BLOCKED_ORPHAN_LINKS',
  BLOCKED_CROSS_TENANT: 'BLOCKED_CROSS_TENANT',
  BLOCKED_INVALID_CARDINALITY: 'BLOCKED_INVALID_CARDINALITY',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_PATIENT_RE = /^patient-/i;
const UF_SET = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export function isUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

export function isPatientLegacyId(value) {
  const raw = String(value || '').trim();
  return LEGACY_PATIENT_RE.test(raw) && raw.length > 'patient-'.length;
}

export function isCpfValid(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  const calc = (base, factor) => {
    let total = 0;
    for (let i = 0; i < base.length; i += 1) total += Number(base[i]) * (factor - i);
    const mod = total % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const base = cpf.slice(0, 9);
  const dig1 = calc(base, 10);
  const dig2 = calc(base + dig1, 11);
  return cpf === base + String(dig1) + String(dig2);
}

export function isPlaceholderCpf(value) {
  const cpf = onlyDigits(value);
  if (!cpf) return false;
  // padrões comuns de placeholder / gerados
  if (/^0+$/.test(cpf) || /^1+$/.test(cpf) || cpf === '12345678909') return true;
  if (cpf.startsWith('000') || cpf.endsWith('0000')) return true;
  return false;
}

export function isPhoneValidDigits(ddd, number) {
  const digits = onlyDigits(`${ddd || ''}${number || ''}`);
  return digits.length === 10 || digits.length === 11;
}

export function isValidIsoDate(value) {
  if (value === null || value === undefined || value === '') return false;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) && Number.isNaN(Date.parse(s))) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function arr(db, key) {
  return Array.isArray(db?.[key]) ? db[key] : [];
}

function patientTenant(p) {
  return String(p?.tenant_id ?? p?.tenantId ?? '').trim();
}

function ageYears(birthDate) {
  if (!isValidIsoDate(birthDate)) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

export function mapCollectionInventory() {
  return {
    patients: {
      key: 'id', patientId: 'id', tenant: 'tenant_id', cardinality: '1',
      legacyId: 'id (patient-*)', timestamps: 'created_at/updated_at ISO',
    },
    patientDocuments: {
      key: 'patient_id', cardinality: '1:1', tenant: 'via patient',
    },
    patientBirth: { key: 'patient_id', cardinality: '1:1' },
    patientEducation: { key: 'patient_id', cardinality: '1:1' },
    patientPhones: { key: 'id (phone-*)', cardinality: '1:N', primary: 'is_primary' },
    patientAddresses: { key: 'id (addr-*)', cardinality: '1:N', primary: 'is_primary' },
    patientRelationships: { key: 'patient_id', cardinality: '1:1 agregado' },
    patientInsurances: { key: 'id (ins-*)', cardinality: '1:N' },
    patientAccess: { key: 'patient_id', cardinality: '1:1' },
    patientActivitySummary: { key: 'patient_id', cardinality: '1:1' },
    patientRecords: { key: 'id (record-*)', cardinality: '1:1', recordNumber: 'record_number' },
  };
}

/**
 * @param {object} snapshot — objeto estilo loadDb()
 * @param {{ sourceLabel?: string }} [options]
 */
export function auditPatientSnapshot(snapshot, options = {}) {
  const started = Date.now();
  const db = snapshot && typeof snapshot === 'object' ? snapshot : null;
  const remoteActionsExecuted = false;

  if (!db) {
    return {
      status: 'BLOCKED_BY_UNAVAILABLE_LOCAL_DATA',
      dataAccessible: false,
      remoteActionsExecuted,
      inventory: mapCollectionInventory(),
      durationMs: Date.now() - started,
      error: 'SNAPSHOT_MISSING',
    };
  }

  const patients = arr(db, 'patients');
  const docs = arr(db, 'patientDocuments');
  const births = arr(db, 'patientBirth');
  const educations = arr(db, 'patientEducation');
  const phones = arr(db, 'patientPhones');
  const addresses = arr(db, 'patientAddresses');
  const relationships = arr(db, 'patientRelationships');
  const insurances = arr(db, 'patientInsurances');
  const access = arr(db, 'patientAccess');
  const activity = arr(db, 'patientActivitySummary');
  const records = arr(db, 'patientRecords');

  const byId = new Map(patients.map((p) => [String(p.id || ''), p]));
  const patientIds = new Set(byId.keys());

  // --- profile metrics ---
  const profile = {
    total: patients.length,
    active: 0,
    inactive: 0,
    blocked: 0,
    missingTenant: 0,
    invalidTenantUuid: 0,
    missingLegacyId: 0,
    duplicateLegacyIds: 0,
    missingGuid: 0,
    duplicateGuids: 0,
    emptyNames: 0,
    invalidBirthDates: 0,
    missingCreatedAt: 0,
    missingUpdatedAt: 0,
  };

  const legacyCounts = new Map();
  const guidCounts = new Map();
  for (const p of patients) {
    const id = String(p.id || '').trim();
    if (!id || !isPatientLegacyId(id)) profile.missingLegacyId += 1;
    else legacyCounts.set(id, (legacyCounts.get(id) || 0) + 1);
    const guid = String(p.guid || '').trim();
    if (!guid) profile.missingGuid += 1;
    else guidCounts.set(guid, (guidCounts.get(guid) || 0) + 1);
    const tid = patientTenant(p);
    if (!tid) profile.missingTenant += 1;
    else if (!isUuid(tid)) profile.invalidTenantUuid += 1;
    if (String(p.status || 'active') === 'inactive') profile.inactive += 1;
    else profile.active += 1;
    if (p.blocked) profile.blocked += 1;
    if (!String(p.full_name || '').trim()) profile.emptyNames += 1;
    if (p.birth_date && !isValidIsoDate(p.birth_date)) profile.invalidBirthDates += 1;
    if (!p.created_at) profile.missingCreatedAt += 1;
    if (!p.updated_at) profile.missingUpdatedAt += 1;
  }
  profile.duplicateLegacyIds = [...legacyCounts.values()].filter((n) => n > 1).length;
  profile.duplicateGuids = [...guidCounts.values()].filter((n) => n > 1).length;

  // --- CPF ---
  const cpfStats = {
    absent: 0,
    valid: 0,
    invalid: 0,
    placeholder: 0,
    maskedForm: 0,
    nonDigitChars: 0,
    incompatibleSqlDigits11: 0,
    duplicateSameTenant: 0,
    sameAcrossTenants: 0,
  };
  const cpfByTenant = new Map(); // tenant|cpf -> [hashes]
  const cpfGlobal = new Map(); // cpf -> Set(tenant)
  for (const p of patients) {
    const raw = String(p.cpf ?? '');
    const digits = onlyDigits(raw);
    if (!digits) {
      cpfStats.absent += 1;
      continue;
    }
    if (/\D/.test(raw.trim())) {
      cpfStats.nonDigitChars += 1;
      if (/[.*\-]/.test(raw)) cpfStats.maskedForm += 1;
    }
    if (digits.length !== 11) cpfStats.incompatibleSqlDigits11 += 1;
    if (isPlaceholderCpf(digits)) cpfStats.placeholder += 1;
    if (isCpfValid(digits)) cpfStats.valid += 1;
    else cpfStats.invalid += 1;
    const tid = patientTenant(p) || '__none__';
    const key = `${tid}|${digits}`;
    if (!cpfByTenant.has(key)) cpfByTenant.set(key, []);
    cpfByTenant.get(key).push(hashId(p.id));
    if (!cpfGlobal.has(digits)) cpfGlobal.set(digits, new Set());
    cpfGlobal.get(digits).add(tid);
  }
  for (const list of cpfByTenant.values()) {
    if (list.length > 1) cpfStats.duplicateSameTenant += 1;
  }
  for (const tenants of cpfGlobal.values()) {
    if (tenants.size > 1) cpfStats.sameAcrossTenants += 1;
  }

  // --- phones ---
  const phoneStats = {
    patientsWithoutPhone: 0,
    valid: 0,
    invalid: 0,
    duplicateNumbers: 0,
    multiPrimary: 0,
    noPrimary: 0,
    missingPatientId: 0,
    orphan: 0,
    crossTenant: 0,
  };
  const phonesByPatient = new Map();
  const phoneNumberCounts = new Map();
  for (const ph of phones) {
    const pid = String(ph.patient_id || '').trim();
    if (!pid) {
      phoneStats.missingPatientId += 1;
      continue;
    }
    if (!patientIds.has(pid)) phoneStats.orphan += 1;
    else {
      const p = byId.get(pid);
      const pt = patientTenant(p);
      const pht = String(ph.tenant_id || '').trim();
      if (pht && pt && pht !== pt) phoneStats.crossTenant += 1;
    }
    if (!phonesByPatient.has(pid)) phonesByPatient.set(pid, []);
    phonesByPatient.get(pid).push(ph);
    const num = onlyDigits(`${ph.ddd || ''}${ph.number || ''}`) || onlyDigits(ph.e164);
    if (num) phoneNumberCounts.set(num, (phoneNumberCounts.get(num) || 0) + 1);
    if (isPhoneValidDigits(ph.ddd, ph.number) || (onlyDigits(ph.e164).length >= 12)) {
      phoneStats.valid += 1;
    } else {
      phoneStats.invalid += 1;
    }
  }
  phoneStats.duplicateNumbers = [...phoneNumberCounts.values()].filter((n) => n > 1).length;
  for (const p of patients) {
    const list = phonesByPatient.get(String(p.id)) || [];
    if (!list.length) {
      phoneStats.patientsWithoutPhone += 1;
      continue;
    }
    const primaries = list.filter((x) => x.is_primary);
    if (primaries.length > 1) phoneStats.multiPrimary += 1;
    if (primaries.length === 0) phoneStats.noPrimary += 1;
  }

  // --- documents ---
  const docStats = {
    orphan: 0,
    duplicateOneToOne: 0,
    cpfDivergentProfile: 0,
    missingResponsibleForMinor: 0,
    invalidEmail: 0,
    inconsistentRg: 0,
    crossTenant: 0,
  };
  const docsByPatient = new Map();
  for (const d of docs) {
    const pid = String(d.patient_id || '').trim();
    if (!pid || !patientIds.has(pid)) {
      docStats.orphan += 1;
      continue;
    }
    if (!docsByPatient.has(pid)) docsByPatient.set(pid, []);
    docsByPatient.get(pid).push(d);
    const p = byId.get(pid);
    const pCpf = onlyDigits(p?.cpf);
    const dResp = onlyDigits(d.responsible_cpf);
    if (pCpf && d.responsible_cpf === undefined) {
      // ok
    }
    void dResp;
    const email = String(d.personal_email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) docStats.invalidEmail += 1;
    if (d.rg && String(d.rg).length > 32) docStats.inconsistentRg += 1;
    const age = ageYears(p?.birth_date);
    if (age !== null && age < 18) {
      if (!String(d.responsible_name || '').trim() || !onlyDigits(d.responsible_cpf)) {
        docStats.missingResponsibleForMinor += 1;
      }
    }
    // profile vs documents: documents don't hold patient cpf typically — check responsible only
  }
  for (const list of docsByPatient.values()) {
    if (list.length > 1) docStats.duplicateOneToOne += 1;
  }

  // --- addresses ---
  const addrStats = {
    patientsWithoutAddress: 0,
    invalidCep: 0,
    invalidUf: 0,
    multiPrimary: 0,
    noPrimary: 0,
    orphan: 0,
    crossTenant: 0,
  };
  const addrByPatient = new Map();
  for (const a of addresses) {
    const pid = String(a.patient_id || '').trim();
    if (!pid || !patientIds.has(pid)) {
      addrStats.orphan += 1;
      continue;
    }
    if (!addrByPatient.has(pid)) addrByPatient.set(pid, []);
    addrByPatient.get(pid).push(a);
    const cep = onlyDigits(a.cep);
    if (a.cep && cep.length !== 8) addrStats.invalidCep += 1;
    const uf = String(a.state || '').trim().toUpperCase();
    if (uf && !UF_SET.has(uf)) addrStats.invalidUf += 1;
    const p = byId.get(pid);
    const at = String(a.tenant_id || '').trim();
    if (at && patientTenant(p) && at !== patientTenant(p)) addrStats.crossTenant += 1;
  }
  for (const p of patients) {
    const list = addrByPatient.get(String(p.id)) || [];
    if (!list.length) {
      addrStats.patientsWithoutAddress += 1;
      continue;
    }
    const primaries = list.filter((x) => x.is_primary);
    if (primaries.length > 1) addrStats.multiPrimary += 1;
    if (primaries.length === 0) addrStats.noPrimary += 1;
  }

  // --- insurances ---
  const insStats = {
    orphan: 0,
    missingCard: 0,
    missingName: 0,
    duplicates: 0,
    tenantDivergent: 0,
    providerIdPresent: 0,
    planIdPresent: 0,
  };
  const insKeys = new Map();
  for (const ins of insurances) {
    const pid = String(ins.patient_id || '').trim();
    if (!pid || !patientIds.has(pid)) {
      insStats.orphan += 1;
      continue;
    }
    if (!String(ins.insurance_name || '').trim()) insStats.missingName += 1;
    if (!String(ins.membership_number || '').trim()) insStats.missingCard += 1;
    if (ins.provider_id) insStats.providerIdPresent += 1;
    if (ins.plan_id) insStats.planIdPresent += 1;
    const p = byId.get(pid);
    const it = String(ins.tenant_id || '').trim();
    if (it && patientTenant(p) && it !== patientTenant(p)) insStats.tenantDivergent += 1;
    const dupKey = `${pid}|${String(ins.insurance_name || '').toLowerCase()}|${String(ins.membership_number || '')}`;
    insKeys.set(dupKey, (insKeys.get(dupKey) || 0) + 1);
  }
  insStats.duplicates = [...insKeys.values()].filter((n) => n > 1).length;

  // --- records ---
  const recordStats = {
    patientsWithoutRecord: 0,
    duplicateRecordNumberSameTenant: 0,
    sameRecordNumberAcrossTenants: 0,
    orphan: 0,
    crossTenant: 0,
  };
  const recordsByPatient = new Map();
  const rnByTenant = new Map();
  const rnGlobal = new Map();
  for (const r of records) {
    const pid = String(r.patient_id || '').trim();
    if (!pid || !patientIds.has(pid)) {
      recordStats.orphan += 1;
      continue;
    }
    recordsByPatient.set(pid, (recordsByPatient.get(pid) || 0) + 1);
    const p = byId.get(pid);
    const tid = patientTenant(p) || '__none__';
    const rn = String(r.record_number || '').trim();
    if (rn) {
      const key = `${tid}|${rn}`;
      rnByTenant.set(key, (rnByTenant.get(key) || 0) + 1);
      if (!rnGlobal.has(rn)) rnGlobal.set(rn, new Set());
      rnGlobal.get(rn).add(tid);
    }
    const rt = String(r.tenant_id || '').trim();
    if (rt && patientTenant(p) && rt !== patientTenant(p)) recordStats.crossTenant += 1;
  }
  for (const p of patients) {
    if (!recordsByPatient.has(String(p.id))) recordStats.patientsWithoutRecord += 1;
  }
  for (const n of rnByTenant.values()) {
    if (n > 1) recordStats.duplicateRecordNumberSameTenant += 1;
  }
  for (const tenants of rnGlobal.values()) {
    if (tenants.size > 1) recordStats.sameRecordNumberAcrossTenants += 1;
  }

  // --- 1:1 satellites ---
  function oneToOneStats(items, label) {
    const byP = new Map();
    let orphan = 0;
    let invalid = 0;
    for (const row of items) {
      const pid = String(row.patient_id || '').trim();
      if (!pid || !patientIds.has(pid)) {
        orphan += 1;
        continue;
      }
      byP.set(pid, (byP.get(pid) || 0) + 1);
    }
    let duplicate = 0;
    let absent = 0;
    for (const p of patients) {
      const n = byP.get(String(p.id)) || 0;
      if (n === 0) absent += 1;
      if (n > 1) duplicate += 1;
    }
    return { label, absent, duplicate, orphan, invalid, cardinalityExpected: '1:1' };
  }

  const satelliteOneToOne = {
    birth: oneToOneStats(births, 'patientBirth'),
    education: oneToOneStats(educations, 'patientEducation'),
    relationships: oneToOneStats(relationships, 'patientRelationships'),
    access: oneToOneStats(access, 'patientAccess'),
    activity: oneToOneStats(activity, 'patientActivitySummary'),
    documents: oneToOneStats(docs, 'patientDocuments'),
  };

  // --- external links ---
  const links = {};
  let totalBrokenLinks = 0;
  for (const spec of LINK_COLLECTIONS) {
    const rows = arr(db, spec.key);
    const stats = {
      collection: spec.key,
      totalRows: rows.length,
      withPatientId: 0,
      missingPatientId: 0,
      validLegacyRef: 0,
      unexpectedUuidRef: 0,
      missingPatient: 0,
      tenantDivergent: 0,
      present: rows.length > 0 || Object.prototype.hasOwnProperty.call(db, spec.key),
    };
    for (const row of rows) {
      const pid = String(row[spec.patientField] ?? row.patientId ?? row.patient_id ?? '').trim();
      if (!pid) {
        stats.missingPatientId += 1;
        continue;
      }
      stats.withPatientId += 1;
      if (isUuid(pid) && !isPatientLegacyId(pid)) stats.unexpectedUuidRef += 1;
      if (isPatientLegacyId(pid)) stats.validLegacyRef += 1;
      if (!patientIds.has(pid)) {
        stats.missingPatient += 1;
        totalBrokenLinks += 1;
      } else {
        const p = byId.get(pid);
        const rt = String(row.tenant_id || row.tenantId || '').trim();
        if (rt && patientTenant(p) && rt !== patientTenant(p)) stats.tenantDivergent += 1;
      }
    }
    links[spec.key] = stats;
  }

  // --- per-patient classification ---
  const classifications = {
    [CLASSIFICATION.MIGRATION_READY]: 0,
    [CLASSIFICATION.MIGRATION_READY_WITH_WARNINGS]: 0,
    [CLASSIFICATION.BLOCKED_INVALID_IDENTITY]: 0,
    [CLASSIFICATION.BLOCKED_DUPLICATE_CPF]: 0,
    [CLASSIFICATION.BLOCKED_MISSING_TENANT]: 0,
    [CLASSIFICATION.BLOCKED_ORPHAN_LINKS]: 0,
    [CLASSIFICATION.BLOCKED_CROSS_TENANT]: 0,
    [CLASSIFICATION.BLOCKED_INVALID_CARDINALITY]: 0,
    [CLASSIFICATION.MANUAL_REVIEW_REQUIRED]: 0,
  };
  const samples = [];

  const duplicateCpfKeys = new Set(
    [...cpfByTenant.entries()].filter(([, list]) => list.length > 1).map(([k]) => k),
  );

  for (const p of patients) {
    const reasons = [];
    const warnings = [];
    const pid = String(p.id || '').trim();
    const tid = patientTenant(p);
    const cpf = onlyDigits(p.cpf);

    if (!tid) reasons.push('missing_tenant');
    else if (!isUuid(tid)) reasons.push('invalid_tenant_uuid_format');

    if (!pid || !isPatientLegacyId(pid)) reasons.push('invalid_legacy_id');
    if ((legacyCounts.get(pid) || 0) > 1) reasons.push('duplicate_legacy_id');
    if (!String(p.full_name || '').trim()) reasons.push('empty_name');
    if (cpf && !isCpfValid(cpf) && !isPlaceholderCpf(cpf)) reasons.push('invalid_cpf');
    if (cpf && isPlaceholderCpf(cpf)) warnings.push('placeholder_cpf');
    if (cpf && duplicateCpfKeys.has(`${tid || '__none__'}|${cpf}`)) {
      reasons.push('duplicate_cpf_same_tenant');
    }

    const phList = phonesByPatient.get(pid) || [];
    if (phList.filter((x) => x.is_primary).length > 1) reasons.push('multi_primary_phone');
    const adList = addrByPatient.get(pid) || [];
    if (adList.filter((x) => x.is_primary).length > 1) reasons.push('multi_primary_address');
    if ((docsByPatient.get(pid) || []).length > 1) reasons.push('duplicate_documents_1to1');
    if ((recordsByPatient.get(pid) || 0) > 1) reasons.push('duplicate_records_1to1');

    // cross-tenant satellite
    for (const ph of phList) {
      const pht = String(ph.tenant_id || '').trim();
      if (pht && tid && pht !== tid) reasons.push('phone_cross_tenant');
    }
    for (const a of adList) {
      const at = String(a.tenant_id || '').trim();
      if (at && tid && at !== tid) reasons.push('address_cross_tenant');
    }

    if (!phList.length) warnings.push('no_phone');
    if (!adList.length) warnings.push('no_address');
    if (!recordsByPatient.has(pid)) warnings.push('no_record');
    if (profile.invalidTenantUuid && tid && !isUuid(tid)) {
      // already in reasons
    }

    let cls = CLASSIFICATION.MIGRATION_READY;
    if (reasons.includes('missing_tenant')) cls = CLASSIFICATION.BLOCKED_MISSING_TENANT;
    else if (reasons.includes('duplicate_cpf_same_tenant')) cls = CLASSIFICATION.BLOCKED_DUPLICATE_CPF;
    else if (
      reasons.includes('invalid_legacy_id')
      || reasons.includes('empty_name')
      || reasons.includes('invalid_cpf')
      || reasons.includes('duplicate_legacy_id')
    ) {
      cls = CLASSIFICATION.BLOCKED_INVALID_IDENTITY;
    } else if (
      reasons.includes('phone_cross_tenant')
      || reasons.includes('address_cross_tenant')
    ) {
      cls = CLASSIFICATION.BLOCKED_CROSS_TENANT;
    } else if (
      reasons.includes('multi_primary_phone')
      || reasons.includes('multi_primary_address')
      || reasons.includes('duplicate_documents_1to1')
      || reasons.includes('duplicate_records_1to1')
    ) {
      cls = CLASSIFICATION.BLOCKED_INVALID_CARDINALITY;
    } else if (reasons.includes('invalid_tenant_uuid_format')) {
      cls = CLASSIFICATION.MANUAL_REVIEW_REQUIRED;
    } else if (warnings.length) {
      cls = CLASSIFICATION.MIGRATION_READY_WITH_WARNINGS;
    }

    classifications[cls] += 1;
    if (samples.length < 40) {
      samples.push({
        idHash: hashId(pid),
        classification: cls,
        reasons,
        warnings,
        cpfMasked: maskCpf(p.cpf),
        tenantPresent: Boolean(tid),
        tenantUuidOk: isUuid(tid),
      });
    }
  }

  const simulation = simulateBackfill(patients, {
    docs,
    births,
    educations,
    phones,
    addresses,
    relationships,
    insurances,
    access,
    activity,
    records,
    classifications,
    byId,
    duplicateCpfKeys,
  });

  const strategy = buildBackfillStrategy();

  const blockedTotal =
    classifications[CLASSIFICATION.BLOCKED_INVALID_IDENTITY]
    + classifications[CLASSIFICATION.BLOCKED_DUPLICATE_CPF]
    + classifications[CLASSIFICATION.BLOCKED_MISSING_TENANT]
    + classifications[CLASSIFICATION.BLOCKED_ORPHAN_LINKS]
    + classifications[CLASSIFICATION.BLOCKED_CROSS_TENANT]
    + classifications[CLASSIFICATION.BLOCKED_INVALID_CARDINALITY];

  const crossTenantIssues =
    phoneStats.crossTenant
    + addrStats.crossTenant
    + insStats.tenantDivergent
    + recordStats.crossTenant
    + Object.values(links).reduce((acc, l) => acc + (l.tenantDivergent || 0), 0);

  let gate = 'READY_FOR_BACKFILL_DRY_RUN';
  if (profile.total === 0) {
    gate = 'READY_WITH_DATA_CLEANUP_REQUIRED'; // empty ok for dry-run of tooling, but note
  }
  if (crossTenantIssues > 0) gate = 'BLOCKED_BY_CROSS_TENANT_DATA';
  else if (blockedTotal > 0 || profile.invalidTenantUuid > 0 || profile.missingTenant > 0) {
    gate = 'READY_WITH_DATA_CLEANUP_REQUIRED';
  }
  if (
    classifications[CLASSIFICATION.BLOCKED_CROSS_TENANT] > 0
    && crossTenantIssues > 0
  ) {
    gate = 'BLOCKED_BY_CROSS_TENANT_DATA';
  }

  // Empty snapshot still "accessible"
  if (profile.invalidTenantUuid > 0 && gate === 'READY_FOR_BACKFILL_DRY_RUN') {
    gate = 'READY_WITH_DATA_CLEANUP_REQUIRED';
  }

  return {
    status: 'PHASE_9_4A_WAVE3A_AUDIT_OK',
    gate,
    dataAccessible: true,
    sourceLabel: options.sourceLabel || 'snapshot',
    remoteActionsExecuted,
    inventory: mapCollectionInventory(),
    collectionCounts: Object.fromEntries(
      PATIENT_COLLECTIONS.map((k) => [k, arr(db, k).length]),
    ),
    profile,
    cpf: cpfStats,
    phones: phoneStats,
    documents: docStats,
    addresses: addrStats,
    insurances: insStats,
    records: recordStats,
    satellitesOneToOne: satelliteOneToOne,
    links,
    brokenExternalLinks: totalBrokenLinks,
    classifications,
    classificationSamples: samples.map(sanitizeForReport),
    simulation,
    strategy,
    piiMasked: true,
    durationMs: Date.now() - started,
    flagsAssumedOff: true,
    indexedDbRemainsSsot: true,
  };
}

function simulateBackfill(patients, ctx) {
  let wouldInsert = 0;
  let wouldSkip = 0;
  let conflicts = 0;
  let manualReview = 0;
  let orphanSatellites = 0;
  let brokenLinks = 0;

  for (const p of patients) {
    const tid = patientTenant(p);
    const cpf = onlyDigits(p.cpf);
    const pid = String(p.id || '').trim();
    if (!tid || !isPatientLegacyId(pid) || !String(p.full_name || '').trim()) {
      wouldSkip += 1;
      continue;
    }
    if (!isUuid(tid)) {
      manualReview += 1;
      continue;
    }
    if (cpf && ctx.duplicateCpfKeys.has(`${tid}|${cpf}`)) {
      conflicts += 1;
      continue;
    }
    if (cpf && cpf.length > 0 && cpf.length !== 11) {
      conflicts += 1;
      continue;
    }
    wouldInsert += 1;
  }

  orphanSatellites +=
    ctx.phones.filter((x) => !ctx.byId.has(String(x.patient_id || ''))).length
    + ctx.addresses.filter((x) => !ctx.byId.has(String(x.patient_id || ''))).length
    + ctx.docs.filter((x) => !ctx.byId.has(String(x.patient_id || ''))).length
    + ctx.records.filter((x) => !ctx.byId.has(String(x.patient_id || ''))).length;

  manualReview += ctx.classifications[CLASSIFICATION.MANUAL_REVIEW_REQUIRED] || 0;

  return {
    mode: 'SIMULATION_ONLY_NO_PERSIST',
    persisted: false,
    wouldInsertPatients: wouldInsert,
    wouldSkipPatients: wouldSkip,
    conflictPatients: conflicts,
    manualReviewPatients: manualReview,
    orphanSatellites,
    brokenExternalLinksNoted: brokenLinks,
    insertOrder: [
      'patients',
      'patient_documents',
      'patient_birth_details',
      'patient_education',
      'patient_phones',
      'patient_addresses',
      'patient_relationships',
      'patient_insurances',
      'patient_access',
      'patient_activity_summary',
      'patient_records',
    ],
    preserveLegacyId: true,
    generateUuid: true,
    mappingArtifact: 'legacy_id → uuid (arquivo/tabela local, não criado nesta wave)',
    notes: [
      'Nenhum INSERT/UPDATE/DELETE executado.',
      'tenant_id não-UUID (ex.: tenant-1) exige mapping humano antes do backfill.',
      'Vínculos externos (appointments/crm/...) permanecem com patient_id opaco legado.',
    ],
  };
}

export function buildBackfillStrategy() {
  return {
    idempotent: true,
    dryRunMandatory: true,
    batchSize: 100,
    resumeToken: 'last_legacy_id_lexicographic',
    checkpoints: ['pre_validate', 'batch_N', 'post_validate'],
    mappingFile: 'artifacts/patients/backfill-mapping.local.json (não criar ainda)',
    orderPatients: 'tenant_id ASC, legacy_id ASC',
    orderSatellites: 'after parent patient uuid resolved',
    orderLinks: 'NÃO migrar na Wave 3B — preservar patient-* opaco',
    conflictPolicy: 'fail-closed → MANUAL_REVIEW; nunca sobrescrever CPF duplicado',
    placeholderPolicy: 'aceitar com warning; marcar has_pending_data',
    invalidPolicy: 'skip + relatório',
    crossTenantPolicy: 'bloquear batch do tenant até decisão humana',
    rollback: 'soft-delete rows inseridas no batch (deleted_at) + restore mapping checkpoint',
    reentrancy: 'upsert por (tenant_id, legacy_id) onde deleted_at is null',
    humanGates: [
      'tenant_id UUID mapping',
      'CPF duplicado same-tenant',
      'cross-tenant satellite/link',
    ],
  };
}

export function determineGate(report) {
  if (!report?.dataAccessible) return 'BLOCKED_BY_UNAVAILABLE_LOCAL_DATA';
  return report.gate;
}
