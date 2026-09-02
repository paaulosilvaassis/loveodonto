/**
 * PERF/IDB.BOOT.1 — recuperação segura de object store `data` ausente.
 * Sem deleteDatabase, sem reset destrutivo, sem regravação de registros.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as idb from '../db/idbStorage.js';
import { DB_META_KEY, createRevisionMeta, IDB_STALE_SNAPSHOT } from '../db/idbRevision.js';

const DB_NAME = 'appgestaoodonto';
const DATA_STORE = 'data';
const LEGACY_EXTRA_STORE = 'legacy_extra';

/**
 * Fake IndexedDB versionado o suficiente para testar open/upgrade/transaction.
 * Não usa deleteDatabase automático.
 */
function createVersionedFakeIndexedDb() {
  /** @type {Map<string, { version: number, stores: Map<string, Map<any, any>>, connections: Set<any> }>} */
  const databases = new Map();

  function getOrInit(name) {
    if (!databases.has(name)) {
      databases.set(name, { version: 0, stores: new Map(), connections: new Set() });
    }
    return databases.get(name);
  }

  function makeObjectStoreNames(storeMap) {
    const names = [...storeMap.keys()];
    return {
      contains: (n) => storeMap.has(n),
      length: names.length,
      item: (i) => names[i],
      [Symbol.iterator]: function* () { yield* names; },
    };
  }

  function makeDbHandle(name, state) {
    const handle = {
      name,
      version: state.version,
      objectStoreNames: makeObjectStoreNames(state.stores),
      onversionchange: null,
      close() {
        state.connections.delete(handle);
      },
      createObjectStore(storeName, _opts) {
        if (state.stores.has(storeName)) {
          throw Object.assign(new Error(`store exists: ${storeName}`), { name: 'ConstraintError' });
        }
        state.stores.set(storeName, new Map());
        handle.objectStoreNames = makeObjectStoreNames(state.stores);
        return {};
      },
      deleteObjectStore(storeName) {
        state.stores.delete(storeName);
        handle.objectStoreNames = makeObjectStoreNames(state.stores);
      },
      transaction(storeName, _mode) {
        if (!state.stores.has(storeName)) {
          throw Object.assign(
            new Error(`One of the specified object stores was not found.`),
            { name: 'NotFoundError' },
          );
        }
        const storeData = state.stores.get(storeName);
        let pending = 0;
        let settled = false;
        const tx = {
          error: null,
          oncomplete: null,
          onerror: null,
          onabort: null,
          objectStore() {
            return {
              get(key) {
                const req = { result: undefined, error: null, onsuccess: null, onerror: null };
                pending += 1;
                queueMicrotask(() => {
                  try {
                    if (storeData.has(key)) {
                      const v = storeData.get(key);
                      req.result = { k: key, v };
                    }
                    req.onsuccess?.();
                  } finally {
                    pending -= 1;
                    maybeComplete();
                  }
                });
                return req;
              },
              put(row) {
                const req = { error: null, onsuccess: null, onerror: null };
                pending += 1;
                queueMicrotask(() => {
                  try {
                    storeData.set(row.k, row.v);
                    req.onsuccess?.();
                  } finally {
                    pending -= 1;
                    maybeComplete();
                  }
                });
                return req;
              },
              clear() {
                const req = { onsuccess: null, onerror: null };
                pending += 1;
                queueMicrotask(() => {
                  try {
                    storeData.clear();
                    req.onsuccess?.();
                  } finally {
                    pending -= 1;
                    maybeComplete();
                  }
                });
                return req;
              },
            };
          },
        };
        function maybeComplete() {
          queueMicrotask(() => {
            if (pending > 0 || settled) return;
            settled = true;
            tx.oncomplete?.();
          });
        }
        queueMicrotask(() => { if (pending === 0) maybeComplete(); });
        return tx;
      },
    };
    state.connections.add(handle);
    return handle;
  }

  const indexedDB = {
    open(name, version) {
      const req = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        try {
          const state = getOrInit(name);
          const oldVersion = state.version;
          const requested = Number(version) || oldVersion || 1;

          if (requested < oldVersion) {
            req.error = Object.assign(new Error('VersionError'), { name: 'VersionError' });
            req.onerror?.();
            return;
          }

          if (requested > oldVersion) {
            for (const conn of [...state.connections]) {
              if (typeof conn.onversionchange === 'function') conn.onversionchange();
              else conn.close?.();
            }
            // Simula blocked se ainda houver conexões abertas
            const stillOpen = [...state.connections].filter((c) => state.connections.has(c));
            if (stillOpen.length > 0) {
              req.onblocked?.();
              for (const conn of stillOpen) conn.close?.();
            }

            const upgradeEvent = {
              oldVersion,
              newVersion: requested,
              target: req,
            };
            state.version = requested;
            req.result = makeDbHandle(name, state);
            req.onupgradeneeded?.(upgradeEvent);
          } else {
            req.result = makeDbHandle(name, state);
          }
          req.onsuccess?.();
        } catch (err) {
          req.error = err;
          req.onerror?.();
        }
      });
      return req;
    },
  };

  return {
    indexedDB,
    databases,
    /** Seed helper: cria DB v1 com stores/registros arbitrários (bypass openDb app). */
    seedDatabase(name, { version = 1, stores = {} } = {}) {
      const state = getOrInit(name);
      state.version = version;
      state.stores.clear();
      for (const [storeName, records] of Object.entries(stores)) {
        const map = new Map();
        for (const [k, v] of Object.entries(records)) map.set(k, v);
        state.stores.set(storeName, map);
      }
    },
    readStore(name, storeName) {
      const state = databases.get(name);
      if (!state?.stores.has(storeName)) return null;
      return new Map(state.stores.get(storeName));
    },
    listStores(name) {
      const state = databases.get(name);
      return state ? [...state.stores.keys()] : [];
    },
    getVersion(name) {
      return databases.get(name)?.version ?? 0;
    },
  };
}

const defaultState = {
  patients: [],
  appointments: [],
  generatedContracts: [],
};

describe('PERF/IDB.BOOT.1 — missing object store safe recovery', () => {
  let previousIndexedDb;
  let fake;

  beforeEach(() => {
    previousIndexedDb = globalThis.indexedDB;
    fake = createVersionedFakeIndexedDb();
    globalThis.indexedDB = fake.indexedDB;
    idb.resetIdbConnection();
  });

  afterEach(async () => {
    idb.resetIdbConnection();
    if (previousIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDb;
  });

  it('A — banco novo: cria data e boot PASS', async () => {
    const db = await idb.openDb();
    expect(db.objectStoreNames.contains(DATA_STORE)).toBe(true);
    expect(fake.getVersion(DB_NAME)).toBe(idb.IDB_SCHEMA_VERSION);

    const snap = await idb.getFullDbSnapshot(defaultState);
    expect(snap.revision).toBe(0);
    expect(snap.db.patients).toEqual([]);
  });

  it('B — v1 válido: preserva registro após upgrade para v2', async () => {
    const marker = [{ id: 'patient-keep', name: 'Preservado' }];
    const meta = createRevisionMeta(7);
    fake.seedDatabase(DB_NAME, {
      version: 1,
      stores: {
        [DATA_STORE]: {
          patients: marker,
          [DB_META_KEY]: meta,
        },
      },
    });

    const db = await idb.openDb();
    expect(fake.getVersion(DB_NAME)).toBe(2);
    expect(db.objectStoreNames.contains(DATA_STORE)).toBe(true);

    const before = fake.readStore(DB_NAME, DATA_STORE);
    expect(before.get('patients')).toEqual(marker);
    expect(before.get(DB_META_KEY)).toBe(meta);

    const snap = await idb.getFullDbSnapshot(defaultState);
    expect(snap.revision).toBe(7);
    expect(snap.db.patients).toEqual(marker);
  });

  it('C — v1 sem data: cria store; preserva outros stores', async () => {
    fake.seedDatabase(DB_NAME, {
      version: 1,
      stores: {
        [LEGACY_EXTRA_STORE]: { leftover: { ok: true } },
      },
    });
    expect(fake.listStores(DB_NAME)).toEqual([LEGACY_EXTRA_STORE]);

    const db = await idb.openDb();
    expect(fake.getVersion(DB_NAME)).toBe(2);
    expect(db.objectStoreNames.contains(DATA_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(LEGACY_EXTRA_STORE)).toBe(true);
    expect(fake.listStores(DB_NAME).sort()).toEqual([DATA_STORE, LEGACY_EXTRA_STORE].sort());
    expect(fake.readStore(DB_NAME, LEGACY_EXTRA_STORE).get('leftover')).toEqual({ ok: true });

    const snap = await idb.getFullDbSnapshot(defaultState);
    expect(snap.revision).toBe(0);
  });

  it('D — v2 válido: abre normalmente', async () => {
    fake.seedDatabase(DB_NAME, {
      version: 2,
      stores: {
        [DATA_STORE]: {
          appointments: [{ id: 'a1' }],
          [DB_META_KEY]: createRevisionMeta(3),
        },
      },
    });
    const db = await idb.openDb();
    expect(db.version).toBe(2);
    const snap = await idb.getFullDbSnapshot(defaultState);
    expect(snap.revision).toBe(3);
    expect(snap.db.appointments).toEqual([{ id: 'a1' }]);
  });

  it('E — schema inesperado após open: erro explícito, sem NotFoundError cru', async () => {
    // Abre com versão já em 2 sem store e sem disparar upgrade (simula corrupt).
    fake.seedDatabase(DB_NAME, { version: 2, stores: {} });
    idb.resetIdbConnection();

    await expect(idb.openDb()).rejects.toMatchObject({ name: idb.IDB_SCHEMA_MISSING_STORE });

    await expect(idb.getFullDbSnapshot(defaultState)).rejects.toMatchObject({
      name: idb.IDB_SCHEMA_MISSING_STORE,
    });
  });

  it('F — revision/CAS preservados após upgrade v1→v2', async () => {
    fake.seedDatabase(DB_NAME, {
      version: 1,
      stores: {
        [DATA_STORE]: {
          patients: [{ id: 'p1' }],
          [DB_META_KEY]: createRevisionMeta(4),
        },
      },
    });

    const snap = await idb.getFullDbSnapshot(defaultState);
    expect(snap.revision).toBe(4);

    await expect(
      idb.saveFullDb(
        { ...defaultState, patients: [{ id: 'p1' }, { id: 'p2' }] },
        defaultState,
        { expectedRevision: 3 },
      ),
    ).rejects.toMatchObject({ name: IDB_STALE_SNAPSHOT });

    const committed = await idb.saveFullDb(
      { ...defaultState, patients: [{ id: 'p1' }, { id: 'p2' }] },
      defaultState,
      { expectedRevision: 4 },
    );
    expect(committed.revision).toBe(5);

    const after = await idb.getFullDbSnapshot(defaultState);
    expect(after.revision).toBe(5);
    expect(after.db.patients.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(fake.getVersion(DB_NAME)).toBe(2);
  });

  it('não usa deleteDatabase / reset destrutivo no módulo', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../db/idbStorage.js', import.meta.url), 'utf8'),
    );
    expect(src).not.toMatch(/deleteDatabase\s*\(/);
    expect(src).toMatch(/DB_VERSION\s*=\s*2/);
    expect(src).toMatch(/onversionchange/);
    expect(src).toMatch(/onblocked/);
  });
});
