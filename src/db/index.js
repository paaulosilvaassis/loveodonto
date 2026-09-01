/**
 * Persistência principal em IndexedDB (não localStorage) para evitar quota.
 * localStorage continua apenas para sessão e preferências.
 */
import { defaultDbState, DB_VERSION } from './schema.js';
import { migrateDb, getSeedCrmTags, DEFAULT_EXPENSE_CATEGORIES } from './migrations.js';
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
let dbCloneCount = 0;
const clone = (value) => {
  dbCloneCount += 1;
  return JSON.parse(JSON.stringify(value));
};
export const getDbCloneCount = () => dbCloneCount;
export const resetDbCloneCount = () => {
  dbCloneCount = 0;
};
const normalizeTenantValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};
const IS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TENANT_GUARDED_COLLECTIONS = [
  'users_profile',
  'memberships',
  'patients',
  'appointments',
  'transactions',
  'accountsReceivable',
  'receivablePayments',
  'payables',
  'cashTransactions',
  'crmLeads',
  'crmTasks',
  'marketingCampaigns',
  'marketingFunnels',
  'marketingAutomations',
  'marketingChatConversations',
  'marketingChatMessages',
  'marketingChatContacts',
];

function validateTenantIntegrityOnWrite(previousDb, nextDb) {
  const tenants = new Set((Array.isArray(nextDb?.tenants) ? nextDb.tenants : []).map((t) => normalizeTenantValue(t?.id)).filter(Boolean));

  for (const collectionName of TENANT_GUARDED_COLLECTIONS) {
    const previous = Array.isArray(previousDb?.[collectionName]) ? previousDb[collectionName] : [];
    const current = Array.isArray(nextDb?.[collectionName]) ? nextDb[collectionName] : [];

    if (current.length === 0) continue;
    const previousById = new Map(previous.map((item) => [item?.id, item]));

    for (const row of current) {
      if (!row || typeof row !== 'object') continue;
      const rowId = row.id;
      if (!rowId) continue;

      const before = previousById.get(rowId);
      const isNew = !before;
      const hadTenantBefore = normalizeTenantValue(before?.tenant_id || before?.tenantId);
      const currentTenant = normalizeTenantValue(row.tenant_id || row.tenantId);

      if (isNew && !currentTenant) {
        console.error(`[TENANT_GUARD] create bloqueado em "${collectionName}" sem tenant_id`, { collectionName, id: rowId });
        const error = new Error(`TENANT_REQUIRED: criação em "${collectionName}" exige tenant_id.`);
        error.code = 'TENANT_REQUIRED';
        throw error;
      }

      if (!isNew && hadTenantBefore && !currentTenant) {
        console.error(`[TENANT_GUARD] update bloqueado em "${collectionName}" removendo tenant_id`, { collectionName, id: rowId });
        const error = new Error(`TENANT_REQUIRED: update em "${collectionName}" não pode remover tenant_id.`);
        error.code = 'TENANT_REQUIRED';
        throw error;
      }

      if (currentTenant && tenants.size > 0 && !tenants.has(currentTenant)) {
        if (IS_UUID.test(currentTenant)) continue;
        if (!isNew && currentTenant === hadTenantBefore) continue;
        console.error(`[TENANT_GUARD] persistência bloqueada em "${collectionName}" com tenant_id órfão`, { collectionName, id: rowId, tenant_id: currentTenant });
        try {
          window.dispatchEvent(new CustomEvent('tenant:invalid', { detail: { tenantId: currentTenant, collection: collectionName } }));
        } catch (_) { /* ignore */ }
        const error = new Error(`TENANT_INVALID: tenant_id "${currentTenant}" não existe em tenants.`);
        error.code = 'TENANT_INVALID';
        throw error;
      }
    }
  }
}

/**
 * Runtime singleton em globalThis.
 * HMR/Vite pode remountar este módulo enquanto services antigos ainda importam outra
 * instância — sem singleton, generatedContracts "some" entre imports.
 */
const DB_RUNTIME_KEY = '__LOVE_ODONTO_DB_RUNTIME_V1__';
function getDbRuntime() {
  const root = typeof globalThis !== 'undefined' ? globalThis : {};
  if (!root[DB_RUNTIME_KEY]) {
    root[DB_RUNTIME_KEY] = {
      cachedDb: null,
      initDbPromise: null,
      loadDbWorker: null,
      saveEpoch: 0,
      lastCommittedEpoch: 0,
      persistenceGeneration: 0,
      latestPersistPayload: null,
      flushChain: Promise.resolve(),
      flushInFlight: null,
      lastPersistError: null,
      withDbDepth: 0,
      activeWriteDb: null,
    };
  }
  const runtime = root[DB_RUNTIME_KEY];
  if (typeof runtime.lastCommittedEpoch !== 'number') runtime.lastCommittedEpoch = 0;
  if (!Object.prototype.hasOwnProperty.call(runtime, 'lastPersistError')) runtime.lastPersistError = null;
  return runtime;
}
const rt = () => getDbRuntime();

function snapshotPersistError(cause, epoch, generation) {
  const name = cause?.name || 'PersistError';
  const message = String(cause?.message || cause || 'IndexedDB persistence failed');
  return {
    name,
    message,
    timestamp: new Date().toISOString(),
    epoch,
    generation,
  };
}

function toPersistError(cause, epoch, generation) {
  const info = snapshotPersistError(cause, epoch, generation);
  const error = new Error(info.message);
  error.name = info.name === 'Error' ? 'PersistError' : info.name;
  error.persistDiagnostics = info;
  if (cause && cause !== error) error.cause = cause;
  return error;
}

/**
 * Diagnóstico de durabilidade — sem payload/PII.
 * dirty = memória à frente do último commit IDB comprovado.
 */
export function getDbPersistenceStatus() {
  const r = rt();
  const lastError = r.lastPersistError;
  return {
    saveEpoch: r.saveEpoch,
    lastCommittedEpoch: r.lastCommittedEpoch || 0,
    persistenceGeneration: r.persistenceGeneration,
    pending: r.latestPersistPayload != null,
    inFlight: r.flushInFlight != null,
    dirty: r.saveEpoch > (r.lastCommittedEpoch || 0) || r.latestPersistPayload != null,
    lastPersistError: lastError
      ? {
          name: lastError.name,
          message: lastError.message,
          timestamp: lastError.timestamp,
          epoch: lastError.epoch,
          generation: lastError.generation,
        }
      : null,
  };
}

const getLoadDbWorker = () => {
  const r = rt();
  if (!r.loadDbWorker) {
    r.loadDbWorker = new Worker(new URL('./loadDb.worker.js', import.meta.url), { type: 'module' });
  }
  return r.loadDbWorker;
};

/**
 * Agenda persistência IDB serializada e coalescida.
 * O payload pendente só sai da fila após commit comprovado.
 * Falha rejeita a cadeia e reenfileira o latest (nunca um snapshot mais velho).
 */
function scheduleIdbFlush() {
  if (rt().flushInFlight) return rt().flushInFlight;
  const genAtSchedule = rt().persistenceGeneration;

  const work = async () => {
    try {
      while (rt().latestPersistPayload && genAtSchedule === rt().persistenceGeneration) {
        const payload = rt().latestPersistPayload;
        const epochAtStart = rt().saveEpoch;
        if (rt().latestPersistPayload === payload) {
          rt().latestPersistPayload = null;
        }
        const defaultState = defaultDbState();
        if (typeof window !== 'undefined' && import.meta?.env?.DEV) {
          try {
            const n = Array.isArray(payload?.generatedContracts) ? payload.generatedContracts.length : 0;
            window.__STAGING_DB_TRACE__ = window.__STAGING_DB_TRACE__ || [];
            window.__STAGING_DB_TRACE__.push({
              t: Date.now(),
              op: 'idb_flush',
              epoch: epochAtStart,
              generatedContracts: n,
            });
            if (window.__STAGING_DB_TRACE__.length > 80) window.__STAGING_DB_TRACE__.shift();
          } catch (_) { /* ignore */ }
        }
        try {
          await idb.saveFullDb(payload, defaultState);
        } catch (err) {
          if (rt().saveEpoch === epochAtStart && rt().latestPersistPayload == null) {
            rt().latestPersistPayload = payload;
          }
          const persistErr = toPersistError(err, epochAtStart, genAtSchedule);
          rt().lastPersistError = persistErr.persistDiagnostics;
          console.error('Erro ao persistir no IndexedDB:', persistErr);
          throw persistErr;
        }
        if (genAtSchedule !== rt().persistenceGeneration) return;
        if ((rt().lastCommittedEpoch || 0) < epochAtStart) {
          rt().lastCommittedEpoch = epochAtStart;
        }
        rt().lastPersistError = null;
        if (rt().saveEpoch === epochAtStart && !rt().latestPersistPayload) break;
      }
    } finally {
      rt().flushInFlight = null;
    }
  };

  const next = Promise.resolve(rt().flushChain).catch(() => undefined).then(work);
  rt().flushChain = next;
  rt().flushInFlight = next;
  return next;
}

/**
 * Barreira de durabilidade.
 * Resolve somente após commit IDB. Rejeita se a transação falhar/abortar.
 */
export function flushDbPersistence() {
  if (rt().latestPersistPayload) scheduleIdbFlush();
  if (rt().flushInFlight) return rt().flushInFlight.then(() => undefined);
  return Promise.resolve();
}


function applyPostMigrationFixes(migrated) {
  if (!migrated.clinicalAppointments) migrated.clinicalAppointments = [];
  if (!migrated.clinicalEvents) migrated.clinicalEvents = [];
  if (!migrated.patientJourneyEntries) migrated.patientJourneyEntries = [];
  if (!Array.isArray(migrated.cashRegisters)) migrated.cashRegisters = [];
  if (!Array.isArray(migrated.expenseCategories)) migrated.expenseCategories = [];
  if (migrated.expenseCategories.length === 0) {
    const now = new Date().toISOString();
    migrated.expenseCategories = DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({
      id: `exp-cat-${i + 1}`,
      name,
      status: 'active',
      created_at: now,
      updated_at: now,
    }));
  }
  if (!Array.isArray(migrated.expenseSuppliers)) migrated.expenseSuppliers = [];
  if (!Array.isArray(migrated.payables)) migrated.payables = [];
  if (!Array.isArray(migrated.cashTransactions)) migrated.cashTransactions = [];
  if (!Array.isArray(migrated.accountsReceivable)) migrated.accountsReceivable = [];
  if (!Array.isArray(migrated.receivablePayments)) migrated.receivablePayments = [];
  if (!Array.isArray(migrated.receivableCharges)) migrated.receivableCharges = [];
  if (!Array.isArray(migrated.financings)) migrated.financings = [];
  if (!Array.isArray(migrated.financialPartners)) migrated.financialPartners = [];
  if (!Array.isArray(migrated.financingInstallments)) migrated.financingInstallments = [];
  if (!Array.isArray(migrated.boletoCharges)) migrated.boletoCharges = [];
  if (!Array.isArray(migrated.financingEvents)) migrated.financingEvents = [];
  if (!Array.isArray(migrated.boletoReminderEvents)) migrated.boletoReminderEvents = [];
  if (!Array.isArray(migrated.financingRenegotiations)) migrated.financingRenegotiations = [];
  if (!Array.isArray(migrated.financingPaymentAllocations)) migrated.financingPaymentAllocations = [];
  if (!Array.isArray(migrated.boletoChargeStatusHistory)) migrated.boletoChargeStatusHistory = [];
  if (migrated.version >= 21) {
    if (!migrated.crmTags || migrated.crmTags.length === 0) {
      migrated.crmTags = getSeedCrmTags(createId, migrated.clinicProfile?.id || 'clinic-1', new Date().toISOString());
    }
    if (!migrated.leadTags) migrated.leadTags = [];
  }
  if (migrated.version >= 22 && !Array.isArray(migrated.crmTasks)) migrated.crmTasks = [];
  if (migrated.version >= 30 && !Array.isArray(migrated.supportTickets)) migrated.supportTickets = [];
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
 * Aplica estado hidratado somente se o cache vivo ainda estiver vazio.
 * Nunca sobrescreve generatedContracts / dados clínicos já escritos durante o await.
 */
function adoptHydratedDbIfCacheEmpty(hydrated) {
  if (rt().cachedDb !== null) {
    // Cache vivo venceu a corrida (save durante init). Garante flush do vivo.
    scheduleIdbFlush();
    return rt().cachedDb;
  }
  rt().cachedDb = applyPostMigrationFixes(hydrated);
  return rt().cachedDb;
}

/**
 * Inicializa o banco: migra do localStorage (se existir) para IndexedDB e carrega em cache.
 * Deve ser await antes de qualquer loadDb() no app.
 * Idempotente: não sobrescreve cache vivo; aguarda flush pendente antes de ler IDB.
 */
export async function initDb() {
  if (rt().cachedDb !== null) return rt().cachedDb;
  if (rt().initDbPromise) {
    await rt().initDbPromise;
    // HMR pode restaurar promise já resolvida sem rt().cachedDb — re-hidrata se necessário.
    if (rt().cachedDb !== null) return rt().cachedDb;
    rt().initDbPromise = null;
  }
  if (rt().cachedDb !== null) return rt().cachedDb;
  if (rt().initDbPromise) return rt().initDbPromise;

  const defaultState = defaultDbState();

  rt().initDbPromise = (async () => {
    // Drena writes pendentes (ex.: HMR) antes de hidratar do IDB.
    await flushDbPersistence();
    if (rt().cachedDb !== null) return rt().cachedDb;

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
              adoptHydratedDbIfCacheEmpty(dbFromWorker);
              resolve(rt().cachedDb);
            }).catch(reject);
          } else {
            try {
              const parsed = JSON.parse(raw);
              const migrated = migrateDb(parsed);
              idb.saveFullDb(migrated, defaultState).then(() => {
                try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
                adoptHydratedDbIfCacheEmpty(migrated);
                resolve(rt().cachedDb);
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
              adoptHydratedDbIfCacheEmpty(migrated);
              resolve(rt().cachedDb);
            }).catch(reject);
          } catch (err) {
            reject(err);
          }
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ raw });
      });
    }

    const db = await idb.getFullDb(defaultState);
    if (rt().cachedDb !== null) {
      scheduleIdbFlush();
      return rt().cachedDb;
    }
    const hadEmptyCategories = !Array.isArray(db.expenseCategories) || db.expenseCategories.length === 0;
    adoptHydratedDbIfCacheEmpty(db);
    if (hadEmptyCategories && rt().cachedDb) saveDb(rt().cachedDb);
    return rt().cachedDb;
  })();

  try {
    return await rt().initDbPromise;
  } catch (err) {
    rt().initDbPromise = null;
    throw err;
  }
}

/**
 * Carrega o DB de forma assíncrona (garante init e retorna clone do cache).
 */
export function loadDbAsync() {
  return initDb().then(() => clone(rt().cachedDb));
}

/** Leitura sem clone. Só para caminhos read-only (RBAC). Não mutar o retorno. */
export const peekDb = () => {
  if (rt().cachedDb !== null) return rt().cachedDb;
  return loadDb();
};

export const loadDb = () => {
  if (rt().cachedDb !== null) return clone(rt().cachedDb);
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
  // Cache síncrono primeiro — leitores imediatos veem o contrato.
  rt().cachedDb = db;
  rt().latestPersistPayload = db;
  rt().saveEpoch += 1;
  scheduleIdbFlush();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('db:updated'));
  }
  return db;
};

export const resetDb = () => {
  // Invalida flushes in-flight para não regravar snapshot velho após clear.
  rt().persistenceGeneration += 1;
  rt().latestPersistPayload = null;
  rt().flushInFlight = null;
  rt().flushChain = Promise.resolve();
  rt().lastPersistError = null;
  rt().lastCommittedEpoch = 0;
  idb.clearIdb().catch(() => {});
  if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }
  rt().cachedDb = null;
  rt().initDbPromise = null;
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
      rhCategoria: 'Diretoria e Gestão',
      cargo: 'Gestor Geral',
      rhFuncaoDescricao: '',
      conselhoNome: '',
      conselhoUf: '',
      tipoVinculo: 'CLT',
      setor: 'Gestão',
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
  // Reentrância: nested withDb (ex.: registerEvent dentro de createContractDraft)
  // deve mutar o mesmo draft e NÃO gravar snapshot intermediário/stale.
  if (rt().withDbDepth > 0 && rt().activeWriteDb) {
    return mutator(rt().activeWriteDb);
  }

  // Sempre partir do cache vivo quando existir (evita snapshot ephemeral de defaults
  // sobrescrever coleções após HMR/null cache parcial).
  const base = rt().cachedDb !== null ? clone(rt().cachedDb) : loadDb();
  const cloned = clone(base);
  rt().withDbDepth += 1;
  rt().activeWriteDb = cloned;
  try {
    const result = mutator(cloned);
    const next = result && typeof result === 'object' && !Array.isArray(result) && 'patients' in result
      ? result
      : cloned;
    validateTenantIntegrityOnWrite(base, next);
    saveDb(next);
    return result;
  } finally {
    rt().withDbDepth -= 1;
    if (rt().withDbDepth <= 0) {
      rt().withDbDepth = 0;
      rt().activeWriteDb = null;
    }
  }
};
