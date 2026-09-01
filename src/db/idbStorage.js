/**
 * Persistência do banco em IndexedDB (em vez de localStorage) para evitar quota (~5MB).
 * Nunca salvar o banco inteiro como um único JSON no localStorage.
 * Cada chave de primeiro nível é gravada como registro separado no IndexedDB.
 * Em ambiente sem IndexedDB (ex.: Node em testes), usa apenas memória (fallback).
 */

const DB_NAME = 'appgestaoodonto';
const STORE_NAME = 'data';
const DB_VERSION = 1;

let dbInstance = null;
const memoryFallback = new Map();

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

/**
 * Retorna todas as chaves de primeiro nível que existem no estado padrão do DB.
 */
function getTopLevelKeys(defaultState) {
  return Object.keys(defaultState);
}

/**
 * Carrega o banco completo a partir do IndexedDB (um registro por chave).
 * Sem IndexedDB: lê do fallback em memória.
 */
export async function getFullDb(defaultState) {
  const keys = getTopLevelKeys(defaultState);
  const result = { ...defaultState };

  if (!hasIdb()) {
    keys.forEach((key) => {
      if (memoryFallback.has(key)) {
        try {
          result[key] = typeof memoryFallback.get(key) === 'string' ? JSON.parse(memoryFallback.get(key)) : memoryFallback.get(key);
        } catch {
          result[key] = defaultState[key];
        }
      }
    });
    return result;
  }

  const db = await openDb();
  if (!db) return result;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    let pending = keys.length;
    if (pending === 0) {
      resolve(result);
      return;
    }

    const onDone = () => {
      pending -= 1;
      if (pending === 0) resolve(result);
    };

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
        onDone();
      };
      req.onerror = () => onDone();
    });
  });
}

/**
 * Persiste o banco no IndexedDB por chave (não um JSON único).
 * Sem IndexedDB: grava no fallback em memória.
 */
export async function saveFullDb(db, defaultState) {
  if (!db || typeof db !== 'object') throw new Error('Banco inválido para persistência');
  const keys = getTopLevelKeys(defaultState);

  if (!hasIdb()) {
    keys.forEach((key) => {
      const value = db[key];
      const toStore = value === undefined ? defaultState[key] : value;
      memoryFallback.set(key, toStore);
    });
    return;
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
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    tx.onerror = () => fail(tx.error || new Error('IndexedDB transaction error'));
    tx.onabort = () => fail(tx.error || new Error('IndexedDB transaction aborted'));

    try {
      keys.forEach((key) => {
        const value = db[key];
        const toStore = value === undefined ? defaultState[key] : value;
        const req = store.put({ k: key, v: toStore });
        req.onerror = () => fail(req.error || new Error('IndexedDB put failed'));
      });
    } catch (err) {
      try { tx.abort(); } catch (_) { /* abort already failing */ }
      fail(err);
    }
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

  await saveFullDb(migrated, defaultState);
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
