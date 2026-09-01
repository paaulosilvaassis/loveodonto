/**
 * Persistência do banco em IndexedDB (em vez de localStorage) para evitar quota (~5MB).
 * Nunca salvar o banco inteiro como um único JSON no localStorage.
 * Cada chave de primeiro nível é gravada como registro separado no IndexedDB.
 * Em ambiente sem IndexedDB (ex.: Node em testes), usa apenas memória (fallback).
 *
 * B.2U: commit full-snapshot usa CAS de revision no mesmo readwrite transaction.
 */

import {
  DB_META_KEY,
  createRevisionMeta,
  createStaleSnapshotError,
  parsePersistedRevision,
} from './idbRevision.js';

const DB_NAME = 'appgestaoodonto';
const STORE_NAME = 'data';
const DB_VERSION = 1;

let dbInstance = null;
const memoryFallback = new Map();
let memoryWriteChain = Promise.resolve();

function hasIdb() {
  return typeof indexedDB !== 'undefined';
}

function openDb() {
  if (!hasIdb()) return Promise.resolve(null);
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'k' });
      }
    };
  });
}

function getTopLevelKeys(defaultState) {
  return Object.keys(defaultState || {}).filter((key) => key !== DB_META_KEY);
}

function unwrapRecord(rec) {
  if (!rec || rec.v === undefined) return undefined;
  try {
    return typeof rec.v === 'string' ? JSON.parse(rec.v) : rec.v;
  } catch {
    return rec.v;
  }
}

function readMemorySnapshot(defaultState) {
  const keys = getTopLevelKeys(defaultState);
  const db = { ...defaultState };
  keys.forEach((key) => {
    if (!memoryFallback.has(key)) return;
    try {
      const raw = memoryFallback.get(key);
      db[key] = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      db[key] = defaultState[key];
    }
  });
  return {
    db,
    revision: parsePersistedRevision(memoryFallback.get(DB_META_KEY)),
  };
}

function withMemoryWriteLock(work) {
  const next = memoryWriteChain.then(work, work);
  memoryWriteChain = next.then(() => undefined, () => undefined);
  return next;
}

/**
 * Carrega snapshot + revision na mesma transação readonly (ou no fallback).
 */
export async function getFullDbSnapshot(defaultState) {
  const keys = getTopLevelKeys(defaultState);
  const result = { ...defaultState };

  if (!hasIdb()) {
    return readMemorySnapshot(defaultState);
  }

  const idb = await openDb();
  if (!idb) return { db: result, revision: 0 };

  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    let revision = 0;
    let pending = keys.length + 1;
    let settled = false;

    const finish = () => {
      pending -= 1;
      if (pending === 0 && !settled) {
        settled = true;
        resolve({ db: result, revision });
      }
    };

    tx.onerror = () => {
      if (settled) return;
      settled = true;
      reject(tx.error || new Error('IndexedDB read failed'));
    };

    const metaReq = store.get(DB_META_KEY);
    metaReq.onsuccess = () => {
      revision = parsePersistedRevision(unwrapRecord(metaReq.result));
      finish();
    };
    metaReq.onerror = () => finish();

    if (keys.length === 0) return;

    keys.forEach((key) => {
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.v !== undefined) {
          try {
            result[key] = typeof req.result.v === 'string' ? JSON.parse(req.result.v) : req.result.v;
          } catch {
            result[key] = defaultState[key];
          }
        }
        finish();
      };
      req.onerror = () => finish();
    });
  });
}

/**
 * Compat: só o snapshot. Preferir getFullDbSnapshot no boot.
 */
export async function getFullDb(defaultState) {
  const snap = await getFullDbSnapshot(defaultState);
  return snap.db;
}

export async function readPersistedRevisionMeta() {
  if (!hasIdb()) {
    const raw = memoryFallback.get(DB_META_KEY);
    return raw && typeof raw === 'object' ? { ...raw } : null;
  }
  const idb = await openDb();
  if (!idb) return null;
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(DB_META_KEY);
    req.onsuccess = () => {
      const value = unwrapRecord(req.result);
      resolve(value && typeof value === 'object' ? { ...value } : null);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB meta read failed'));
  });
}

function writeSnapshotToMemory(db, defaultState, expectedRevision) {
  const actualRevision = parsePersistedRevision(memoryFallback.get(DB_META_KEY));
  if (actualRevision !== expectedRevision) {
    throw createStaleSnapshotError({ expectedRevision, actualRevision });
  }
  const keys = getTopLevelKeys(defaultState);
  keys.forEach((key) => {
    const value = db[key];
    memoryFallback.set(key, value === undefined ? defaultState[key] : value);
  });
  const committedRevision = actualRevision + 1;
  memoryFallback.set(DB_META_KEY, createRevisionMeta(committedRevision));
  return { revision: committedRevision };
}

/**
 * Persiste o banco no IndexedDB por chave, com CAS de revision.
 * Resolve só em tx.oncomplete. Retorna { revision }.
 */
export async function saveFullDb(db, defaultState, options = {}) {
  if (!db || typeof db !== 'object') throw new Error('Banco inválido para persistência');
  const expectedRevision = Number.isFinite(Number(options.expectedRevision))
    ? Number(options.expectedRevision)
    : 0;
  const keys = getTopLevelKeys(defaultState);

  if (!hasIdb()) {
    return withMemoryWriteLock(() => writeSnapshotToMemory(db, defaultState, expectedRevision));
  }

  const idb = await openDb();
  if (!idb) {
    const error = new Error('IndexedDB unavailable');
    error.name = 'IDB_UNAVAILABLE';
    throw error;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (cause) => {
      if (settled) return;
      settled = true;
      const error = cause instanceof Error ? cause : new Error(String(cause || 'IndexedDB transaction failed'));
      reject(error);
    };

    let tx;
    try {
      tx = idb.transaction(STORE_NAME, 'readwrite');
    } catch (err) {
      fail(err);
      return;
    }

    const store = tx.objectStore(STORE_NAME);
    let committedRevision = null;

    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve({ revision: committedRevision });
    };
    tx.onerror = () => {
      if (settled) return;
      fail(tx.error || new Error('IndexedDB transaction error'));
    };
    tx.onabort = () => {
      if (settled) return;
      fail(tx.error || new Error('IndexedDB transaction aborted'));
    };

    const metaReq = store.get(DB_META_KEY);
    metaReq.onerror = () => fail(metaReq.error || new Error('IndexedDB meta read failed'));
    metaReq.onsuccess = () => {
      if (settled) return;
      const actualRevision = parsePersistedRevision(unwrapRecord(metaReq.result));
      if (actualRevision !== expectedRevision) {
        const stale = createStaleSnapshotError({ expectedRevision, actualRevision });
        try { tx.abort(); } catch (_) { /* already failing */ }
        fail(stale);
        return;
      }

      try {
        keys.forEach((key) => {
          const value = db[key];
          const toStore = value === undefined ? defaultState[key] : value;
          const req = store.put({ k: key, v: toStore });
          req.onerror = () => fail(req.error || new Error('IndexedDB put failed'));
        });
        committedRevision = actualRevision + 1;
        const metaPut = store.put({ k: DB_META_KEY, v: createRevisionMeta(committedRevision) });
        metaPut.onerror = () => fail(metaPut.error || new Error('IndexedDB meta put failed'));
      } catch (err) {
        try { tx.abort(); } catch (_) { /* abort already failing */ }
        fail(err);
      }
    };
  });
}

/**
 * Migração única: lê do localStorage e grava no IndexedDB; remove do localStorage.
 */
export async function migrateFromLocalStorage(storageKey, defaultState, migrateDb) {
  if (typeof localStorage === 'undefined') return false;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return false;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  let migrated = parsed;
  if (typeof migrateDb === 'function' && Number(parsed.version) < (defaultState.version || 0)) {
    try {
      migrated = migrateDb(parsed);
    } catch (e) {
      console.warn('[idb] Migração falhou, usando estado legado:', e);
    }
  }

  await saveFullDb(migrated, defaultState, { expectedRevision: 0 });
  try {
    localStorage.removeItem(storageKey);
  } catch (e) {
    console.warn('[idb] Não foi possível remover chave legada do localStorage:', e);
  }
  return true;
}

/**
 * Remove todos os dados do banco no IndexedDB (ou do fallback em memória).
 */
export async function clearIdb() {
  memoryFallback.clear();
  if (!hasIdb()) {
    dbInstance = null;
    return;
  }
  const idb = await openDb();
  dbInstance = null;
  if (!idb) return;
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export { openDb };
