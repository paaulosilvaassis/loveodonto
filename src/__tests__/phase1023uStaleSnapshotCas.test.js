/**
 * PATCH B.2U — Cross-tab stale snapshot CAS (U01–U16).
 * Dois runtimes simulados compartilham o mesmo backend IndexedDB/memória.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as idb from '../db/idbStorage.js';
import { DB_META_KEY, IDB_STALE_SNAPSHOT } from '../db/idbRevision.js';
import {
  createEmptyDbRuntime,
  useDbRuntime,
  resetDb,
  withDb,
  saveDb,
  loadDb,
  flushDbPersistence,
  getDbPersistenceStatus,
  reloadDbFromPersistence,
} from '../db/index.js';

function createSerializedFakeIndexedDb({ failPuts = false, abortAfterPuts = false } = {}) {
  const committed = new Map();
  let rwTail = Promise.resolve();

  const db = {
    objectStoreNames: { contains: () => true },
    transaction(_name, mode) {
      let startTx;
      const started = new Promise((resolve) => { startTx = resolve; });
      if (mode === 'readwrite') {
        const prev = rwTail;
        let release = () => {};
        rwTail = new Promise((resolve) => { release = resolve; });
        prev.then(() => startTx()).finally(() => {});
        var releaseRw = release;
      } else {
        startTx();
        var releaseRw = () => {};
      }

      const overlay = new Map();
      let pending = 0;
      let settled = false;
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
              const req = { result: undefined, error: null, onsuccess: null, onerror: null };
              enqueue(() => {
                if (tx.aborted) return;
                const raw = overlay.has(key) ? overlay.get(key) : committed.get(key);
                if (raw !== undefined) req.result = { k: key, v: raw };
                req.onsuccess?.();
              });
              return req;
            },
            put(row) {
              const req = { error: null, onsuccess: null, onerror: null };
              enqueue(() => {
                if (failPuts) {
                  req.error = Object.assign(new Error('put failed'), { name: 'UnknownError' });
                  tx.error = req.error;
                  req.onerror?.();
                  tx.onerror?.();
                  settled = true;
                  releaseRw();
                  return;
                }
                overlay.set(row.k, row.v);
                req.onsuccess?.();
              });
              return req;
            },
            clear() {
              const req = { onsuccess: null, onerror: null };
              enqueue(() => {
                overlay.clear();
                committed.clear();
                req.onsuccess?.();
              });
              return req;
            },
          };
        },
      };

      function enqueue(fn) {
        pending += 1;
        started.then(() => {
          queueMicrotask(() => {
            try { fn(); } finally {
              pending -= 1;
              maybeComplete();
            }
          });
        });
      }

      function maybeComplete() {
        queueMicrotask(() => {
          queueMicrotask(() => {
            if (pending > 0 || settled) return;
            settled = true;
            if (tx.aborted || abortAfterPuts) {
              if (abortAfterPuts && !tx.error) {
                tx.error = Object.assign(new Error('aborted'), { name: 'AbortError' });
              }
              tx.onabort?.();
              releaseRw();
              return;
            }
            overlay.forEach((value, key) => committed.set(key, value));
            tx.oncomplete?.();
            releaseRw();
          });
        });
      }

      queueMicrotask(() => {
        started.then(() => {
          queueMicrotask(() => { if (pending === 0) maybeComplete(); });
        });
      });

      return tx;
    },
  };

  return {
    committed,
    indexedDB: {
      open() {
        const req = { result: db, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    },
  };
}

async function activate(runtime) {
  useDbRuntime(runtime);
  return runtime;
}

async function hydrate(runtime) {
  await activate(runtime);
  await reloadDbFromPersistence({ discardLocalRuntime: true });
  return runtime;
}

function mutateCollection(collection, id) {
  return withDb((db) => {
    db[collection] = Array.isArray(db[collection]) ? db[collection] : [];
    db[collection] = [...db[collection], { id, tenant_id: 'tenant-1', created_at: '2026-09-01T00:00:00.000Z' }];
    return db;
  });
}

function collectionIds(db, collection) {
  return (db?.[collection] || []).map((row) => row.id);
}

async function persistedSnapshot() {
  return idb.getFullDbSnapshot({
    patients: [],
    appointments: [],
    generatedContracts: [],
    financialPartners: [],
    expenseCategories: [],
  });
}

describe('PHASE_10.23U — stale snapshot CAS', () => {
  let previousIndexedDb;
  let tabA;
  let tabB;

  beforeEach(async () => {
    previousIndexedDb = globalThis.indexedDB;
    delete globalThis.indexedDB;
    await idb.clearIdb();
    tabA = createEmptyDbRuntime();
    tabB = createEmptyDbRuntime();
    useDbRuntime(createEmptyDbRuntime());
    resetDb();
    await idb.clearIdb();
  });

  afterEach(async () => {
    useDbRuntime(createEmptyDbRuntime());
    resetDb();
    await idb.clearIdb();
    if (previousIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDb;
    vi.restoreAllMocks();
  });

  it('U01 Tab B commit from expected 0 rejects after A committed revision 1', async () => {
    await hydrate(tabA);
    await hydrate(tabB);
    expect(tabA.basePersistedRevision).toBe(0);
    expect(tabB.basePersistedRevision).toBe(0);

    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    await flushDbPersistence();
    expect(getDbPersistenceStatus().lastCommittedRevision).toBe(1);

    await activate(tabB);
    mutateCollection('appointments', 'appt-b');
    await expect(flushDbPersistence()).rejects.toMatchObject({ name: IDB_STALE_SNAPSHOT });
  });

  it('U02 stale rejection changes ZERO application records', async () => {
    await hydrate(tabA);
    await hydrate(tabB);
    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    await flushDbPersistence();
    const before = await persistedSnapshot();

    await activate(tabB);
    mutateCollection('appointments', 'appt-b');
    await expect(flushDbPersistence()).rejects.toMatchObject({ name: IDB_STALE_SNAPSHOT });

    const after = await persistedSnapshot();
    expect(collectionIds(after.db, 'patients')).toEqual(collectionIds(before.db, 'patients'));
    expect(collectionIds(after.db, 'appointments')).toEqual(collectionIds(before.db, 'appointments'));
    expect(after.revision).toBe(before.revision);
    expect(collectionIds(after.db, 'appointments')).not.toContain('appt-b');
  });

  it('U03 stale rejection does not advance B basePersistedRevision', async () => {
    await hydrate(tabA);
    await hydrate(tabB);
    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    await flushDbPersistence();

    await activate(tabB);
    const before = tabB.basePersistedRevision;
    mutateCollection('appointments', 'appt-b');
    await expect(flushDbPersistence()).rejects.toBeTruthy();
    expect(tabB.basePersistedRevision).toBe(before);
    expect(tabB.basePersistedRevision).toBe(0);
    expect(tabB.lastCommittedRevision).toBe(0);
  });

  it('U04 stale rejection is observable in persistence status', async () => {
    await hydrate(tabA);
    await hydrate(tabB);
    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    await flushDbPersistence();

    await activate(tabB);
    mutateCollection('appointments', 'appt-b');
    await expect(flushDbPersistence()).rejects.toBeTruthy();
    const status = getDbPersistenceStatus();
    expect(status.stale).toBe(true);
    expect(status.dirty).toBe(true);
    expect(status.lastPersistError?.name).toBe(IDB_STALE_SNAPSHOT);
    expect(status.lastPersistError?.expectedRevision).toBe(0);
    expect(status.lastPersistError?.actualRevision).toBe(1);
    expect(JSON.stringify(status.lastPersistError)).not.toMatch(/full_name|cpf|email/i);
  });

  it('U05 stale payload is not automatically retried indefinitely', async () => {
    const saveSpy = vi.spyOn(idb, 'saveFullDb');
    await hydrate(tabA);
    await hydrate(tabB);
    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    await flushDbPersistence();
    const afterA = saveSpy.mock.calls.length;

    await activate(tabB);
    mutateCollection('appointments', 'appt-b');
    await expect(flushDbPersistence()).rejects.toMatchObject({ name: IDB_STALE_SNAPSHOT });
    const afterReject = saveSpy.mock.calls.length;
    expect(afterReject).toBeGreaterThan(afterA);

    await expect(flushDbPersistence()).rejects.toMatchObject({ name: IDB_STALE_SNAPSHOT });
    expect(saveSpy.mock.calls.length).toBe(afterReject);
    expect(getDbPersistenceStatus().pending).toBe(false);
    expect(getDbPersistenceStatus().stale).toBe(true);
  });

  it('U06 fresh reload at revision 1 can commit revision 2', async () => {
    await hydrate(tabA);
    await hydrate(tabB);
    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    await flushDbPersistence();

    await activate(tabB);
    mutateCollection('appointments', 'stale-b');
    await expect(flushDbPersistence()).rejects.toBeTruthy();
    await reloadDbFromPersistence({ discardLocalRuntime: true });
    expect(getDbPersistenceStatus().stale).toBe(false);
    expect(getDbPersistenceStatus().basePersistedRevision).toBe(1);
    mutateCollection('appointments', 'appt-b2');
    await flushDbPersistence();
    expect(getDbPersistenceStatus().lastCommittedRevision).toBe(2);
    const snap = await persistedSnapshot();
    expect(collectionIds(snap.db, 'patients')).toContain('patient-a');
    expect(collectionIds(snap.db, 'appointments')).toContain('appt-b2');
    expect(collectionIds(snap.db, 'appointments')).not.toContain('stale-b');
  });

  it('U07 sequential fresh writes succeed when each rebased correctly', async () => {
    await hydrate(tabA);
    await hydrate(tabB);
    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    await flushDbPersistence();

    await hydrate(tabB);
    expect(tabB.basePersistedRevision).toBe(1);
    mutateCollection('appointments', 'appt-b');
    await flushDbPersistence();
    expect(getDbPersistenceStatus().lastCommittedRevision).toBe(2);

    await hydrate(tabA);
    mutateCollection('patients', 'patient-a2');
    await flushDbPersistence();
    expect(getDbPersistenceStatus().lastCommittedRevision).toBe(3);
    const snap = await persistedSnapshot();
    expect(collectionIds(snap.db, 'patients')).toEqual(expect.arrayContaining(['patient-a', 'patient-a2']));
    expect(collectionIds(snap.db, 'appointments')).toContain('appt-b');
  });

  it('U08 automatic writer on stale tab cannot overwrite newer data', async () => {
    await hydrate(tabA);
    await hydrate(tabB);
    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    await flushDbPersistence();

    await activate(tabB);
    mutateCollection('appointments', 'appt-b');
    await expect(flushDbPersistence()).rejects.toMatchObject({ name: IDB_STALE_SNAPSHOT });

    withDb((db) => {
      db.financialPartners = [{ id: 'auto-seed', name: 'Auto', tenant_id: 'tenant-1' }];
      return db;
    });
    await expect(flushDbPersistence()).rejects.toMatchObject({ name: IDB_STALE_SNAPSHOT });
    const snap = await persistedSnapshot();
    expect((snap.db.financialPartners || []).map((p) => p.id)).not.toContain('auto-seed');
    expect(collectionIds(snap.db, 'patients')).toContain('patient-a');
    expect(snap.revision).toBe(1);
  });

  it('U09 two unrelated collection mutations cannot lost-update each other silently', async () => {
    await hydrate(tabA);
    await hydrate(tabB);
    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    await flushDbPersistence();

    await activate(tabB);
    mutateCollection('appointments', 'appt-b');
    const result = await flushDbPersistence().then(
      () => 'committed',
      (err) => err.name,
    );
    expect(result).toBe(IDB_STALE_SNAPSHOT);
    const snap = await persistedSnapshot();
    expect(collectionIds(snap.db, 'patients')).toContain('patient-a');
    expect(collectionIds(snap.db, 'appointments')).not.toContain('appt-b');
  });

  it('U10 metadata revision increments only on transaction commit', async () => {
    const fake = createSerializedFakeIndexedDb();
    globalThis.indexedDB = fake.indexedDB;
    await idb.clearIdb();
    await hydrate(tabA);
    expect(fake.committed.get(DB_META_KEY)?.revision).toBeUndefined();

    await activate(tabA);
    mutateCollection('patients', 'patient-a');
    const flushP = flushDbPersistence();
    expect(fake.committed.get(DB_META_KEY)?.revision).not.toBe(1);
    await flushP;
    expect(fake.committed.get(DB_META_KEY)?.revision).toBe(1);
    expect(getDbPersistenceStatus().lastCommittedRevision).toBe(1);
  });

  it('U11 transaction abort/error does not advance revision', async () => {
    const fake = createSerializedFakeIndexedDb({ abortAfterPuts: true });
    globalThis.indexedDB = fake.indexedDB;
    await idb.clearIdb();
    await hydrate(tabA);
    await activate(tabA);
    mutateCollection('patients', 'patient-abort');
    await expect(flushDbPersistence()).rejects.toBeTruthy();
    expect(fake.committed.get(DB_META_KEY)?.revision).toBeUndefined();
    expect(tabA.basePersistedRevision).toBe(0);
    expect(tabA.stale).toBe(false);
    expect(getDbPersistenceStatus().pending).toBe(true);
  });

  it('U12 B.2Q lost-payload protections still work', async () => {
    const realSave = idb.saveFullDb;
    let failOnce = true;
    vi.spyOn(idb, 'saveFullDb').mockImplementation(async (...args) => {
      if (failOnce) {
        failOnce = false;
        const error = new Error('transaction failed');
        error.name = 'UnknownError';
        throw error;
      }
      return realSave(...args);
    });

    await hydrate(tabA);
    await activate(tabA);
    mutateCollection('patients', 'patient-q');
    await expect(flushDbPersistence()).rejects.toMatchObject({ name: 'UnknownError' });
    expect(getDbPersistenceStatus().pending).toBe(true);
    expect(getDbPersistenceStatus().stale).toBe(false);
    expect(loadDb().patients.some((p) => p.id === 'patient-q')).toBe(true);

    await flushDbPersistence();
    expect(getDbPersistenceStatus().dirty).toBe(false);
    const snap = await persistedSnapshot();
    expect(collectionIds(snap.db, 'patients')).toContain('patient-q');
  });

  it('U13 new save arriving during an in-flight valid commit remains safe', async () => {
    const realSave = idb.saveFullDb;
    let releaseFirst;
    let calls = 0;
    vi.spyOn(idb, 'saveFullDb').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 1) {
        await new Promise((resolve) => { releaseFirst = resolve; });
      }
      return realSave(...args);
    });

    await hydrate(tabA);
    await activate(tabA);
    mutateCollection('patients', 'patient-old');
    const firstFlush = flushDbPersistence();
    await vi.waitFor(() => { expect(releaseFirst).toBeTypeOf('function'); });
    mutateCollection('patients', 'patient-new');
    expect(getDbPersistenceStatus().pending).toBe(true);
    releaseFirst();
    await firstFlush;
    await flushDbPersistence();
    const snap = await persistedSnapshot();
    expect(collectionIds(snap.db, 'patients')).toEqual(expect.arrayContaining(['patient-old', 'patient-new']));
    expect(getDbPersistenceStatus().lastCommittedRevision).toBe(2);
  });

  it('U14 revision metadata contains no PII', async () => {
    await hydrate(tabA);
    await activate(tabA);
    withDb((db) => {
      db.patients = [{
        id: 'patient-pii',
        full_name: 'Adilson Julio Xavier',
        cpf: '12345678901',
        email: 'secret@example.com',
        tenant_id: 'tenant-1',
      }];
      return db;
    });
    await flushDbPersistence();
    const meta = await idb.readPersistedRevisionMeta();
    expect(meta).toEqual({
      revision: 1,
      committedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(Object.keys(meta).sort()).toEqual(['committedAt', 'revision']);
    expect(JSON.stringify(meta)).not.toMatch(/Adilson|12345678901|secret@example|patient-pii/i);
    const status = getDbPersistenceStatus();
    expect(JSON.stringify(status)).not.toMatch(/Adilson|12345678901|secret@example/i);
  });

  it('U15 legacy database with no metadata bootstraps deterministically', async () => {
    await hydrate(tabA);
    expect(tabA.basePersistedRevision).toBe(0);
    const snap = await persistedSnapshot();
    expect(snap.revision).toBe(0);
    await activate(tabA);
    mutateCollection('patients', 'patient-legacy');
    await flushDbPersistence();
    expect(getDbPersistenceStatus().lastCommittedRevision).toBe(1);
    const after = await persistedSnapshot();
    expect(after.revision).toBe(1);
  });

  it('U16 two tabs racing first metadata bootstrap cannot both commit revision 1', async () => {
    await hydrate(tabA);
    await hydrate(tabB);
    await activate(tabA);
    mutateCollection('patients', 'patient-race-a');
    const flushA = flushDbPersistence();
    await activate(tabB);
    mutateCollection('appointments', 'appt-race-b');
    const flushB = flushDbPersistence();
    const settled = await Promise.allSettled([flushA, flushB]);
    const fulfilled = settled.filter((item) => item.status === 'fulfilled');
    const rejected = settled.filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason?.name).toBe(IDB_STALE_SNAPSHOT);
    const snap = await persistedSnapshot();
    expect(snap.revision).toBe(1);
    const patientWon = collectionIds(snap.db, 'patients').includes('patient-race-a');
    const apptWon = collectionIds(snap.db, 'appointments').includes('appt-race-b');
    expect(patientWon !== apptWon).toBe(true);
  });

  it('reload without discard is blocked when local edits are uncommitted', async () => {
    await hydrate(tabA);
    await activate(tabA);
    mutateCollection('patients', 'patient-keep');
    await expect(reloadDbFromPersistence()).rejects.toMatchObject({ name: 'IDB_RELOAD_BLOCKED' });
    expect(loadDb().patients.some((p) => p.id === 'patient-keep')).toBe(true);
  });
});
