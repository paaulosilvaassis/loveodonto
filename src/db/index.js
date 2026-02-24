import { defaultDbState, DB_VERSION } from './schema.js';
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

let cachedDb = null;
let cachedRaw = null;

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
 * Carrega o DB de forma assíncrona no Worker (parse + migrate no thread secundário).
 * Evita "Página sem resposta" com bancos grandes. Use para bootstrap e dashboard.
 */
export function loadDbAsync() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh = loadDb();
    return Promise.resolve(clone(fresh));
  }
  if (cachedDb !== null && cachedRaw === raw) {
    return Promise.resolve(clone(cachedDb));
  }
  return new Promise((resolve, reject) => {
    const worker = getLoadDbWorker();
    const onMessage = (e) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      const { ok, db: dbFromWorker, error } = e.data || {};
      if (ok && dbFromWorker) {
        const migrated = applyPostMigrationFixes(dbFromWorker);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        cachedDb = migrated;
        cachedRaw = raw;
        resolve(clone(migrated));
      } else {
        setTimeout(() => {
          try {
            resolve(clone(loadDb()));
          } catch (err) {
            reject(err);
          }
        }, 0);
      }
    };
    const onError = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      setTimeout(() => {
        try {
          resolve(clone(loadDb()));
        } catch (err) {
          reject(err);
        }
      }, 0);
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ raw });
  });
}

export const loadDb = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (cachedDb !== null && cachedRaw === raw) {
    return clone(cachedDb);
  }
  if (!raw) {
    const fresh = defaultDbState();
    if (!fresh.crmTags || fresh.crmTags.length === 0) {
      fresh.crmTags = getSeedCrmTags(createId, fresh.clinicProfile?.id || 'clinic-1', new Date().toISOString());
    }
    if (!fresh.leadTags) fresh.leadTags = [];
    if (!Array.isArray(fresh.tenants) || fresh.tenants.length === 0) {
      const now = new Date().toISOString();
      fresh.tenants = [{
        id: 'tenant-1',
        name: (fresh.clinicProfile?.nomeClinica || fresh.clinicProfile?.nomeFantasia || 'Minha Clínica').trim() || 'Minha Clínica',
        logo_url: fresh.clinicProfile?.logoUrl || null,
        status: 'active',
        plan_id: null,
        created_at: now,
        updated_at: now,
      }];
      fresh.memberships = Array.isArray(fresh.memberships) ? fresh.memberships : [];
      const membKey = new Set(fresh.memberships.map((m) => `${m.tenant_id}:${m.user_id}`));
      for (const u of fresh.users || []) {
        if (!u?.id) continue;
        const key = `tenant-1:${u.id}`;
        if (membKey.has(key)) continue;
        fresh.memberships.push({
          id: `memb-${crypto.randomUUID()}`,
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    cachedDb = fresh;
    cachedRaw = raw;
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
    cachedDb = migrated;
    cachedRaw = raw;
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
      const minimal = {
        version: DB_VERSION,
        patients: [],
        appointments: [],
        clinicalAppointments: [],
        clinicalEvents: [],
        patientJourneyEntries: [],
      };
      cachedDb = minimal;
      cachedRaw = raw;
      return clone(minimal);
    }
  }
};

export const saveDb = (db) => {
  if (!db || typeof db !== 'object') {
    throw new Error('Tentativa de salvar banco de dados inválido');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  cachedDb = null;
  cachedRaw = null;
  return db;
};

export const resetDb = () => {
  localStorage.removeItem(STORAGE_KEY);
  cachedDb = null;
  cachedRaw = null;
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
