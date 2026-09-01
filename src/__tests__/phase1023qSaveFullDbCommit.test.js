/**
 * PATCH B.2Q — saveFullDb resolve/reject only after transaction terminal state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function createFakeIndexedDb({ mode = 'complete' } = {}) {
  const storeData = new Map();
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore() {
          return {
            put(row) {
              const req = { error: null, onerror: null, onsuccess: null };
              queueMicrotask(() => {
                if (mode === 'put-error') {
                  req.error = Object.assign(new Error('put failed'), { name: 'UnknownError' });
                  tx.error = req.error;
                  if (typeof req.onerror === 'function') req.onerror();
                  if (typeof tx.onerror === 'function') tx.onerror();
                  return;
                }
                storeData.set(row.k, row.v);
                if (typeof req.onsuccess === 'function') req.onsuccess();
                queueMicrotask(() => {
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
                  if (typeof tx.oncomplete === 'function') tx.oncomplete();
                });
              });
              return req;
            },
          };
        },
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
    await saveFullDb({ patients: [{ id: 'p1' }], generatedContracts: [] }, defaultState);
    expect(fake.storeData.get('patients')).toEqual([{ id: 'p1' }]);
  });

  it('rejects on transaction onerror', async () => {
    globalThis.indexedDB = createFakeIndexedDb({ mode: 'error' }).indexedDB;
    const saveFullDb = await loadSaveFullDb();
    await expect(
      saveFullDb({ patients: [], generatedContracts: [] }, { patients: [], generatedContracts: [] }),
    ).rejects.toMatchObject({ message: 'tx failed' });
  });

  it('rejects on transaction onabort', async () => {
    globalThis.indexedDB = createFakeIndexedDb({ mode: 'abort' }).indexedDB;
    const saveFullDb = await loadSaveFullDb();
    await expect(
      saveFullDb({ patients: [], generatedContracts: [] }, { patients: [], generatedContracts: [] }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects on request-level put error', async () => {
    globalThis.indexedDB = createFakeIndexedDb({ mode: 'put-error' }).indexedDB;
    const saveFullDb = await loadSaveFullDb();
    await expect(
      saveFullDb({ patients: [], generatedContracts: [] }, { patients: [], generatedContracts: [] }),
    ).rejects.toMatchObject({ message: 'put failed' });
  });
});
