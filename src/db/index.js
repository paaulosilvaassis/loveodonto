/**
 * Persistência principal em IndexedDB (não localStorage) para evitar quota.
 * localStorage continua apenas para sessão e preferências.
 */
import { defaultDbState, DB_VERSION } from './schema.js';
import { migrateDb, getSeedCrmTags } from './migrations.js';
import { createId } from '../services/helpers.js';
import * as idb from './idbStorage.js';

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

let cachedDb = null;
let initDbPromise = null;
let loadDbWorker = null;
const getLoadDbWorker = () => {
  if (!loadDbWorker) {
    loadDbWorker = new Worker(new URL('./loadDb.worker.js', import.meta.url), { type: 'module' });
  }
  return loadDbWorker;
};

function applyPostMigrationFixes(migrated) {
  if (!migrated.clinicalAppointments) migrated.clinicalAppointments = [];
  if (!migrated.clinicalEvents) migrated.clinicalEvents = [];
  if (!migrated.patientJourneyEntries) migrated.patientJourneyEntries = [];
  if (migrated.version >= 21) {
    if (!migrated.crmTags || migrated.crmTags.length === 0) {
      migrated.crmTags = getSeedCrmTags(createId, migrated.clinicProfile?.id || 'clinic-1', new Date().toISOString());
    }
    if (!migrated.leadTags) migrated.leadTags = [];
  }
  if (migrated.version >= 22 && !Array.isArray(migrated.crmTasks)) migrated.crmTasks = [];
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
        migrated.memberships.push({
          id: `memb-${crypto.randomUUID()}`,
          tenant_id: defaultTenantId,
          user_id: u.id,
          role: u.role === 'admin' ? 'master' : (u.role || 'atendimento'),
          has_system_access: u.has_system_access !== false,
          status: 'active',
          created_at: now,
          updated_at: now,
        });
        membershipByKey.add(key);
      }
    }
  }
  return migrated;
}

/**
 * Inicializa o banco: migra do localStorage (se existir) para IndexedDB e carrega em cache.
 * Deve ser await antes de qualquer loadDb() no app.
 */
export async function initDb() {
  if (initDbPromise) return initDbPromise;
  const defaultState = defaultDbState();

  initDbPromise = (async () => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) {
      const raw = localStorage.getItem(STORAGE_KEY);
      return new Promise((resolve, reject) => {
        const worker = getLoadDbWorker();
        const onMessage = (e) => {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          const { ok, db: dbFromWorker } = e.data || {};
          if (ok && dbFromWorker) {
            idb.saveFullDb(dbFromWorker, defaultState).then(() => {
              try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
              cachedDb = applyPostMigrationFixes(dbFromWorker);
              resolve();
            }).catch(reject);
          } else {
            try {
              const parsed = JSON.parse(raw);
              const migrated = migrateDb(parsed);
              idb.saveFullDb(migrated, defaultState).then(() => {
                try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
                cachedDb = applyPostMigrationFixes(migrated);
                resolve();
              }).catch(reject);
            } catch (err) {
              reject(err);
            }
          }
        };
        const onError = () => {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
          try {
            const parsed = JSON.parse(raw);
            const migrated = migrateDb(parsed);
            idb.saveFullDb(migrated, defaultState).then(() => {
              try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
              cachedDb = applyPostMigrationFixes(migrated);
              resolve();
            }).catch(reject);
          } catch (err) {
            reject(err);
          }
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ raw });
      });
    } else {
      const db = await idb.getFullDb(defaultState);
      cachedDb = applyPostMigrationFixes(db);
    }
  })();

  return initDbPromise;
}

/**
 * Carrega o DB de forma assíncrona (garante init e retorna clone do cache).
 */
export function loadDbAsync() {
  return initDb().then(() => clone(cachedDb));
}

export const loadDb = () => {
  if (cachedDb !== null) return clone(cachedDb);
  const defaultState = defaultDbState();
  if (!defaultState.crmTags || defaultState.crmTags.length === 0) {
    defaultState.crmTags = getSeedCrmTags(createId, defaultState.clinicProfile?.id || 'clinic-1', new Date().toISOString());
  }
  if (!defaultState.leadTags) defaultState.leadTags = [];
  if (!Array.isArray(defaultState.tenants) || defaultState.tenants.length === 0) {
    const now = new Date().toISOString();
    defaultState.tenants = [{
      id: 'tenant-1',
      name: (defaultState.clinicProfile?.nomeClinica || defaultState.clinicProfile?.nomeFantasia || 'Minha Clínica').trim() || 'Minha Clínica',
      logo_url: defaultState.clinicProfile?.logoUrl || null,
      status: 'active',
      plan_id: null,
      created_at: now,
      updated_at: now,
    }];
    defaultState.memberships = Array.isArray(defaultState.memberships) ? defaultState.memberships : [];
    const membKey = new Set(defaultState.memberships.map((m) => `${m.tenant_id}:${m.user_id}`));
    for (const u of defaultState.users || []) {
      if (!u?.id) continue;
      const key = 'tenant-1:' + u.id;
      if (membKey.has(key)) continue;
      defaultState.memberships.push({
        id: 'memb-' + crypto.randomUUID(),
        tenant_id: 'tenant-1',
        user_id: u.id,
        role: u.role === 'admin' ? 'master' : (u.role || 'atendimento'),
        has_system_access: u.has_system_access !== false,
        status: 'active',
        created_at: now,
        updated_at: now,
      });
      membKey.add(key);
    }
  }
  return clone(defaultState);
};

export const saveDb = (db) => {
  if (!db || typeof db !== 'object') {
    throw new Error('Tentativa de salvar banco de dados inválido');
  }
  const defaultState = defaultDbState();
  idb.saveFullDb(db, defaultState).catch((err) => {
    console.error('Erro ao persistir no IndexedDB:', err);
  });
  cachedDb = db;
  return db;
};

export const resetDb = () => {
  idb.clearIdb().catch(() => {});
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }
  cachedDb = null;
  initDbPromise = null;
};

const ADMIN_SEED_EMAIL = 'admin@loveodonto.com';
const ADMIN_SEED_PASSWORD = 'admin123';

/**
 * Garante que existam credenciais do admin (admin@loveodonto.com / admin123).
 * Executa se não houver nenhum userAuth ou se o admin não existir.
 */
export async function seedAdminCredentialsIfEmpty() {
  const db = loadDb();
  const hasAdmin = (db.userAuth || []).some((r) => (r.email || '').toLowerCase() === ADMIN_SEED_EMAIL.toLowerCase());
  const userAdmin = (db.users || []).find((u) => u.id === 'user-admin');
  if (hasAdmin) return;
  if (!userAdmin) return;

  const tenantId = 'tenant-1';
  const collabId = 'col-admin';
  const now = new Date().toISOString();

  const next = clone(db);
  if (!Array.isArray(next.tenants) || next.tenants.length === 0) {
    next.tenants = [{
      id: tenantId,
      name: (next.clinicProfile?.nomeClinica || next.clinicProfile?.nomeFantasia || 'Minha Clínica').trim() || 'Minha Clínica',
      logo_url: next.clinicProfile?.logoUrl || null,
      status: 'active',
      plan_id: null,
      created_at: now,
      updated_at: now,
    }];
  }

  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(ADMIN_SEED_PASSWORD, 10);
  next.collaborators = next.collaborators || [];
  if (!next.collaborators.some((c) => c.id === collabId)) {
    next.collaborators.push({
      id: collabId,
      status: 'ativo',
      apelido: 'Administrador',
      nomeCompleto: 'Administrador',
      nomeSocial: '',
      sexo: '',
      dataNascimento: '',
      fotoUrl: '',
      cargo: 'Administrador',
      especialidades: [],
      registroProfissional: '',
      email: ADMIN_SEED_EMAIL,
      createdAt: now,
      updatedAt: now,
    });
  }
  next.collaboratorAccess = next.collaboratorAccess || [];
  next.collaboratorAccess = next.collaboratorAccess.filter((a) => a.collaboratorId !== collabId);
  next.collaboratorAccess.push({
    collaboratorId: collabId,
    userId: 'user-admin',
    role: 'admin',
    permissions: [],
    lastLoginAt: '',
  });
  next.userAuth = next.userAuth || [];
  next.userAuth = next.userAuth.filter((r) => (r.email || '').toLowerCase() !== ADMIN_SEED_EMAIL.toLowerCase());
  next.userAuth.push({
    id: createId('uauth'),
    collaboratorId: collabId,
    email: ADMIN_SEED_EMAIL,
    passwordHash,
    mustChangePassword: false,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
  });
  const membExists = (next.memberships || []).some((m) => m.tenant_id === tenantId && m.user_id === 'user-admin');
  if (!membExists) {
    next.memberships = next.memberships || [];
    next.memberships.push({
      id: `memb-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      user_id: 'user-admin',
      role: 'master',
      has_system_access: true,
      status: 'active',
      created_at: now,
      updated_at: now,
    });
  }
  saveDb(next);
}

/** Força recriação do admin (para recuperação em dev). */
export async function forceSeedAdminCredentials() {
  const db = loadDb();
  const userAdmin = (db.users || []).find((u) => u.id === 'user-admin');
  if (!userAdmin) return Promise.reject(new Error('user-admin não encontrado'));
  const next = clone(db);
  next.userAuth = (next.userAuth || []).filter((r) => (r.email || '').toLowerCase() !== ADMIN_SEED_EMAIL.toLowerCase());
  next.collaboratorAccess = (next.collaboratorAccess || []).filter((a) => a.collaboratorId !== 'col-admin');
  next.collaborators = (next.collaborators || []).filter((c) => c.id !== 'col-admin');
  saveDb(next);
  return seedAdminCredentialsIfEmpty();
}

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
  const cloned = clone(db);
  const result = mutator(cloned);
  const next = result && typeof result === 'object' && !Array.isArray(result) && 'patients' in result ? result : cloned;
  saveDb(next);
  return result;
};
