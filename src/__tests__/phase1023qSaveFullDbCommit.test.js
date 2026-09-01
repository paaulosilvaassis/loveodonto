/**
 * PATCH B.2Q — saveFullDb resolve/reject only after transaction terminal state.
 * PATCH B.2U — get() de metadata no mesmo readwrite transaction.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function createFakeIndexedDb({ mode = 'complete' } = {}) {
  const storeData = new Map();
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const pending = [];
      let requestCount = 0;
      const tx = {
        error: null,
        aborted: false,
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort() {
          this.aborted = true;
          this.error = this.error || Object.assign(new Error('aborted'), { name: 'AbortError' });
        },
        objectStore() {
          return {
            get(key) {
              const req = { result: undefined, error: null, onerror: null, onsuccess: null };
              requestCount += 1;
              queueMicrotask(() => {
                if (tx.aborted) return;
                if (storeData.has(key)) req.result = { k: key, v: storeData.get(key) };
                if (typeof req.onsuccess === 'function') req.onsuccess();
                finishRequest();
              });
              return req;
            },
            put(row) {
              const req = { error: null, onerror: null, onsuccess: null };
              requestCount += 1;
              queueMicrotask(() => {
                if (mode === 'put-error') {
                  req.error = Object.assign(new Error('put failed'), { name: 'UnknownError' });
                  tx.error = req.error;
                  if (typeof req.onerror === 'function') req.onerror();
                  if (typeof tx.onerror === 'function') tx.onerror();
                  return;
                }
                pending.push(row);
                if (typeof req.onsuccess === 'function') req.onsuccess();
                finishRequest();
              });
              return req;
            },
          };
        },
      };

      const finishRequest = () => {
        requestCount -= 1;
        queueMicrotask(() => {
          queueMicrotask(() => {
            if (requestCount > 0 || tx.settled) return;
            tx.settled = true;
            if (tx.aborted) {
              if (typeof tx.onabort === 'function') tx.onabort();
              return;
            }
            if (mode === 'abort') {
              tx.error = Object.assign(new Error('aborted'), { name: 'AbortError' });
              if (typeof tx.onabort === 'function') tx.onabort();
              return;
            }
            if (mode === 'error') {
              tx.error = Object.assign(new Error('tx failed'), { name: 'UnknownError' });
              if (typeof tx.onerror === 'function') tx.onerror();
              return;
            }
            pending.forEach((row) => storeData.set(row.k, row.v));
            if (typeof tx.oncomplete === 'function') tx.oncomplete();
          });
        });
      };

      return tx;
    },
  };

  return {
    storeData,
    indexedDB: {
      open() {
        const req = { result: db, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          if (typeof req.onsuccess === 'function') req.onsuccess();
        });
        return req;
      },
    },
  };
}

describe('PHASE_10.23Q — saveFullDb transaction completion', () => {
  let previousIndexedDb;

  beforeEach(() => {
    previousIndexedDb = globalThis.indexedDB;
  });

  afterEach(() => {
    if (previousIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDb;
    vi.resetModules();
  });

  async function loadSaveFullDb() {
    vi.resetModules();
    const mod = await import('../db/idbStorage.js');
    await mod.clearIdb().catch(() => {});
    return mod.saveFullDb;
  }

  it('resolves only after transaction oncomplete', async () => {
    const fake = createFakeIndexedDb({ mode: 'complete' });
    globalThis.indexedDB = fake.indexedDB;
    const saveFullDb = await loadSaveFullDb();
    const defaultState = { patients: [], generatedContracts: [] };
    await saveFullDb({ patients: [{ id: 'p1' }], generatedContracts: [] }, defaultState, {
      expectedRevision: 0,
    });
    expect(fake.storeData.get('patients')).toEqual([{ id: 'p1' }]);
    expect(fake.storeData.get('__db_meta__')?.revision).toBe(1);
  });

  it('rejects on transaction onerror', async () => {
    globalThis.indexedDB = createFakeIndexedDb({ mode: 'error' }).indexedDB;
    const saveFullDb = await loadSaveFullDb();
    await expect(
      saveFullDb({ patients: [], generatedContracts: [] }, { patients: [], generatedContracts: [] }, {
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ message: 'tx failed' });
  });

  it('rejects on transaction onabort', async () => {
    globalThis.indexedDB = createFakeIndexedDb({ mode: 'abort' }).indexedDB;
    const saveFullDb = await loadSaveFullDb();
    await expect(
      saveFullDb({ patients: [], generatedContracts: [] }, { patients: [], generatedContracts: [] }, {
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects on request-level put error', async () => {
    globalThis.indexedDB = createFakeIndexedDb({ mode: 'put-error' }).indexedDB;
    const saveFullDb = await loadSaveFullDb();
    await expect(
      saveFullDb({ patients: [], generatedContracts: [] }, { patients: [], generatedContracts: [] }, {
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ message: 'put failed' });
  });
});
