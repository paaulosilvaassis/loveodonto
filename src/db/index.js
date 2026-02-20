import { defaultDbState } from './schema.js';
import { migrateDb, getSeedCrmTags } from './migrations.js';
import { createId } from '../services/helpers.js';

const resolveStorageKey = () => {
  const dbUrl = import.meta?.env?.VITE_DATABASE_URL || '';
  if (dbUrl.startsWith('localstorage://')) {
    const key = dbUrl.slice('localstorage://'.length);
    if (key) return key;
  }
  if (dbUrl.startsWith('localstorage:')) {
    const key = dbUrl.slice('localstorage:'.length).replace(/^\/\//, '');
    if (key) return key;
  }
  return import.meta?.env?.VITE_DB_STORAGE_KEY || 'appgestaoodonto.db';
};

const STORAGE_KEY = resolveStorageKey();

const clone = (value) => JSON.parse(JSON.stringify(value));

export const loadDb = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh = defaultDbState();
    if (!fresh.crmTags || fresh.crmTags.length === 0) {
      fresh.crmTags = getSeedCrmTags(createId, fresh.clinicProfile?.id || 'clinic-1', new Date().toISOString());
    }
    if (!fresh.leadTags) fresh.leadTags = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return clone(fresh);
  }
  try {
    const parsed = JSON.parse(raw);
    let migrated;
    try {
      migrated = migrateDb(parsed);
      // Garantir que os novos campos existam mesmo se a migration falhar silenciosamente
      if (!migrated.clinicalAppointments) {
        migrated.clinicalAppointments = [];
      }
      if (!migrated.clinicalEvents) {
        migrated.clinicalEvents = [];
      }
      if (!migrated.patientJourneyEntries) {
        migrated.patientJourneyEntries = [];
      }
    } catch (migrateErr) {
      // Em caso de erro na migration, adicionar os campos manualmente e continuar
      console.error('Erro na migration, adicionando campos manualmente:', migrateErr);
      migrated = {
        ...parsed,
        clinicalAppointments: parsed.clinicalAppointments || [],
        clinicalEvents: parsed.clinicalEvents || [],
        patientJourneyEntries: parsed.patientJourneyEntries || [],
        version: DB_VERSION,
      };
    }
    // Garantir que os campos existam antes de salvar
    if (!migrated.clinicalAppointments) {
      migrated.clinicalAppointments = [];
    }
    if (!migrated.clinicalEvents) {
      migrated.clinicalEvents = [];
    }
    if (!migrated.patientJourneyEntries) {
      migrated.patientJourneyEntries = [];
    }
    if (migrated.version >= 21) {
      if (!migrated.crmTags || migrated.crmTags.length === 0) {
        migrated.crmTags = getSeedCrmTags(createId, migrated.clinicProfile?.id || 'clinic-1', new Date().toISOString());
      }
      if (!migrated.leadTags) migrated.leadTags = [];
    }
    if (migrated.version >= 22 && !Array.isArray(migrated.crmTasks)) {
      migrated.crmTasks = [];
    }
    // Reparo: DB em v26 com tenants vazio nunca passou pela migration 26 (startVersion===targetVersion).
    // Garantir tenant default e memberships para permitir login.
    const tenants = Array.isArray(migrated.tenants) ? migrated.tenants : [];
    if (tenants.length === 0 && migrated.clinicProfile) {
      const now = new Date().toISOString();
      migrated.tenants = [{
        id: 'tenant-1',
        name: (migrated.clinicProfile.nomeClinica || migrated.clinicProfile.nomeFantasia || 'Minha Clínica').trim() || 'Minha Clínica',
        logo_url: migrated.clinicProfile.logoUrl || null,
        status: 'active',
        plan_id: null,
        created_at: now,
        updated_at: now,
      }];
      const defaultTenantId = 'tenant-1';
      migrated.memberships = Array.isArray(migrated.memberships) ? migrated.memberships : [];
      const membershipByKey = new Set(migrated.memberships.map((m) => `${m.tenant_id}:${m.user_id}`));
      if (Array.isArray(migrated.users)) {
        for (const u of migrated.users) {
          if (!u.id) continue;
          const key = `${defaultTenantId}:${u.id}`;
          if (membershipByKey.has(key)) continue;
          const role = u.role === 'admin' ? 'master' : (u.role || 'atendimento');
          migrated.memberships.push({
            id: `memb-${crypto.randomUUID()}`,
            tenant_id: defaultTenantId,
            user_id: u.id,
            role,
            has_system_access: u.has_system_access !== false,
            status: 'active',
            created_at: now,
            updated_at: now,
          });
          membershipByKey.add(key);
        }
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return clone(migrated);
  } catch (err) {
    console.error('Erro ao carregar banco de dados:', err);
    try {
      const fresh = defaultDbState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return clone(fresh);
    } catch (freshErr) {
      console.error('Erro crítico ao criar banco de dados fresh:', freshErr);
      // Retornar um objeto mínimo para evitar crash total
      return {
        version: DB_VERSION,
        patients: [],
        appointments: [],
        clinicalAppointments: [],
        clinicalEvents: [],
        patientJourneyEntries: [],
      };
    }
  }
};

export const saveDb = (db) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/db/index.js:56',message:'db save entry',data:{storageKey:STORAGE_KEY,hasPatients:Array.isArray(db?.patients),patientsCount:Array.isArray(db?.patients) ? db.patients.length : 0,dbKeys:db ? Object.keys(db).slice(0,5) : []},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H13'})}).catch(()=>{});
  // #endregion
  if (!db || typeof db !== 'object') {
    throw new Error('Tentativa de salvar banco de dados inválido');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/db/index.js:62',message:'db save done',data:{storageKey:STORAGE_KEY,patientsCount:Array.isArray(db?.patients) ? db.patients.length : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H13'})}).catch(()=>{});
  // #endregion
  return db;
};

export const resetDb = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const seedDevDb = () => {
  if (!import.meta?.env?.DEV) return;
  withDb((db) => {
    if (!Array.isArray(db.patients) || db.patients.length > 0) return db;
    const now = new Date().toISOString();
    const patientId = createId('patient');
    db.patients.push({
      id: patientId,
      guid: crypto.randomUUID(),
      full_name: 'Maria Fernanda Alves',
      nickname: 'Maria',
      social_name: '',
      sex: 'Feminino',
      birth_date: '1992-06-15',
      cpf: '16299988845',
      photo_url: '',
      status: 'active',
      blocked: false,
      block_reason: '',
      block_at: '',
      tags: [],
      lead_source: 'Indicação',
      created_at: now,
      updated_at: now,
      created_by_user_id: 'user-admin',
      updated_by_user_id: 'user-admin',
    });
    db.patientDocuments.push({
      patient_id: patientId,
      rg: '',
      pis: '',
      municipal_registration: '',
      personal_email: 'maria@email.com',
      marital_status: '',
      responsible_name: '',
      responsible_relation: '',
      responsible_phone: '',
      mother_name: '',
      father_name: '',
    });
    db.patientBirth.push({ patient_id: patientId, nationality: 'Brasil', birth_city: 'São Paulo', birth_state: 'SP' });
    db.patientEducation.push({ patient_id: patientId, education_level: '', profession: '', other_profession: '' });
    db.patientRelationships.push({
      patient_id: patientId,
      emergency_contact_name: 'Carlos Alves',
      emergency_contact_phone: '(11) 98888-7777',
      dependents: [],
      notes: '',
      marital_status: '',
    });
    db.patientPhones.push({
      id: createId('phone'),
      patient_id: patientId,
      type: 'whatsapp',
      ddd: '11',
      number: '988887777',
      is_whatsapp: true,
      is_primary: true,
      e164: '+5511988887777',
    });
    db.patientAccess.push({ patient_id: patientId, wants_portal: false, portal_email: '', portal_phone: '' });
    db.patientActivitySummary.push({
      patient_id: patientId,
      last_visit_at: '',
      last_procedure: '',
      next_visit_at: '',
      missing_appointments: 0,
      canceled_appointments: 0,
    });
    return db;
  });
};

export const withDb = (mutator) => {
  const db = loadDb();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/db/index.js:141',message:'withDb entry',data:{hasDb:!!db,dbKeys:db ? Object.keys(db).slice(0,5) : []},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H13'})}).catch(()=>{});
  // #endregion
  const cloned = clone(db);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/db/index.js:145',message:'withDb before mutator',data:{hasCloned:!!cloned,clonedKeys:cloned ? Object.keys(cloned).slice(0,5) : []},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H13'})}).catch(()=>{});
  // #endregion
  const result = mutator(cloned);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/db/index.js:149',message:'withDb after mutator',data:{hasResult:!!result,resultType:typeof result,resultIsArray:Array.isArray(result),resultKeys:result && typeof result === 'object' ? Object.keys(result).slice(0,5) : [],clonedKeys:cloned ? Object.keys(cloned).slice(0,5) : []},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H13'})}).catch(()=>{});
  // #endregion
  const next = result && typeof result === 'object' && !Array.isArray(result) && 'patients' in result ? result : cloned;
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/db/index.js:153',message:'withDb before save',data:{hasNext:!!next,nextKeys:next ? Object.keys(next).slice(0,5) : [],usingResult:result === next},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H13'})}).catch(()=>{});
  // #endregion
  saveDb(next);
  return result;
};
